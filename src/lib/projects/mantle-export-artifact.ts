/**
 * Narrow Project-domain service: generate a Mantle Price Estimate workbook from an
 * APPROVED priced_boq artifact and persist an export_package artifact for the
 * export_approval stage (Section 10 Priced Output Contract; Section 19 task 8k).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (section 14, 15, 16).
 *
 * COMPOSES the artifact repository (read exactly one APPROVED priced_boq artifact,
 * persist one new export_package version), the pure Mantle price-estimate model
 * mapper, and the Mantle workbook writer. It reads ONLY the priced_boq artifact - it
 * never reloads normalized_boq/sku_resolution/configuration_expansion artifacts, the
 * catalog, or any rule pack; never re-prices, resolves SKUs, or infers categories from
 * descriptions/relationshipType/SKU text (the split comes only from the explicit caller
 * map, defaulting unmapped priced rows to product via the existing model warning). It
 * runs no AI, creates no approval record, and updates no stage status, and imports no
 * engines, coordinator, API/UI, AI, DB schema/index, catalog, SKU/config-expansion
 * service, or pricing helper. The model/writer behavior is unchanged - their errors
 * bubble before any artifact exists. The export package is created `needs_review`. It
 * never mutates its inputs.
 */
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import { buildMantlePriceEstimateModel } from "@/lib/projects/mantle-price-estimate-model";
import { writeMantlePriceEstimateWorkbook } from "@/lib/projects/mantle-workbook-writer";
import type {
  MantleLineCategory,
  MantlePriceEstimateModel,
  MantlePriceEstimateTotals,
} from "@/lib/projects/mantle-price-estimate-model";
import type { PricedBoqArtifactPayload } from "@/lib/projects/priced-boq-artifact";
import type { ProjectArtifact } from "@/types/project";

// Exact guard messages; consumers may assert on these verbatim.
const MISSING_PRICED_BOQ_MESSAGE = "Priced BoQ artifact not found.";
const WRONG_PRICED_BOQ_TYPE_MESSAGE = "Artifact is not a priced_boq artifact.";
const PRICED_BOQ_NOT_APPROVED_MESSAGE = "Priced BoQ artifact must be approved before export.";
const INVALID_PRICED_BOQ_PAYLOAD_MESSAGE = "Priced BoQ artifact payload is invalid.";

/** Discriminator recorded on the export payload. */
const MANTLE_EXPORT_TYPE = "mantle_price_estimate_workbook" as const;

/**
 * JSONB payload stored on the `export_package` artifact. A type alias (not an
 * interface) so it carries an implicit index signature assignable to the repository
 * payload. Provenance is echoed from the priced_boq payload; rowCount/totals/warnings
 * from the Mantle model; workbook metadata and the category map from the caller.
 */
export type MantleExportArtifactPayload = {
  exportType: typeof MANTLE_EXPORT_TYPE;
  sourcePricedBoqArtifactId: string;
  sourcePricedBoqArtifactVersion: number;
  sourceConfigurationExpansionArtifactId: string;
  sourceConfigurationExpansionArtifactVersion: number;
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  sourceFileIds: string[];
  /** The generated workbook path returned by the writer; mirrors the artifact filePath. */
  workbookFilePath: string;
  projectIdLabel?: string;
  dealId?: string;
  priceList?: string;
  categoryByAcceptedSku?: Record<string, MantleLineCategory>;
  rowCount: number;
  totals: MantlePriceEstimateTotals;
  warnings: string[];
};

/** Input for {@link createMantleExportArtifact}. */
export interface CreateMantleExportArtifactInput {
  tenantId: string;
  projectId: string;
  pricedBoqArtifactId: string;
  /** Where the generated workbook is written; the writer returns the final path. */
  outputPath: string;
  templatePath?: string;
  /** Value for the workbook Project ID summary cell; distinct from the scoping projectId. */
  projectIdLabel?: string;
  dealId?: string;
  priceList?: string;
  /** Explicit Mantle line category per accepted SKU. Passed through to the model unchanged. */
  categoryByAcceptedSku?: Readonly<Record<string, MantleLineCategory>>;
  /**
   * Optional Mantle export presentation row order (SKU occurrence sequence). Passed
   * through to the model to re-order workbook rows only; it is not stored on the
   * export payload and changes no pricing, totals, or category. Absent -> model keeps
   * the priced_boq line order.
   */
  rowOrderSkuSequence?: readonly string[];
}

/** The created export artifact, the source priced_boq artifact, payload, model, and path. */
export interface CreateMantleExportArtifactResult {
  artifact: ProjectArtifact;
  pricedBoqArtifact: ProjectArtifact;
  payload: MantleExportArtifactPayload;
  model: MantlePriceEstimateModel;
  workbookFilePath: string;
}

/** Read-only inputs for {@link buildMantleExportArtifactPayload}. */
export interface BuildMantleExportArtifactPayloadInput {
  pricedBoqArtifact: ProjectArtifact;
  /** The validated priced_boq payload; provenance ids/versions are echoed from it. */
  pricedPayload: PricedBoqArtifactPayload;
  model: MantlePriceEstimateModel;
  workbookFilePath: string;
  projectIdLabel?: string;
  dealId?: string;
  priceList?: string;
  categoryByAcceptedSku?: Readonly<Record<string, MantleLineCategory>>;
}

/** True for a non-null, non-array object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate a priced_boq payload enough to safely call buildMantlePriceEstimateModel,
 * throwing the exact invalid-payload message otherwise: provenance ids are strings,
 * provenance versions are numbers, `lines` is an array, and `summary` carries a
 * `totals` object. The payload is returned narrowed to {@link PricedBoqArtifactPayload}.
 */
function parsePricedBoqPayload(payload: Record<string, unknown>): PricedBoqArtifactPayload {
  const {
    sourceConfigurationExpansionArtifactId,
    sourceConfigurationExpansionArtifactVersion,
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion,
    lines,
    summary,
  } = payload;
  if (
    typeof sourceConfigurationExpansionArtifactId !== "string" ||
    typeof sourceConfigurationExpansionArtifactVersion !== "number" ||
    typeof sourceNormalizedBoqArtifactId !== "string" ||
    typeof sourceNormalizedBoqArtifactVersion !== "number" ||
    typeof sourceSkuResolutionArtifactId !== "string" ||
    typeof sourceSkuResolutionArtifactVersion !== "number" ||
    !Array.isArray(lines) ||
    !isPlainObject(summary)
  ) {
    throw new Error(INVALID_PRICED_BOQ_PAYLOAD_MESSAGE);
  }
  if (!isPlainObject(summary.totals)) {
    throw new Error(INVALID_PRICED_BOQ_PAYLOAD_MESSAGE);
  }
  return payload as unknown as PricedBoqArtifactPayload;
}

/**
 * Build the `export_package` payload. Pure: echoes the priced_boq artifact id/version
 * and the config/normalized/sku provenance from the validated priced payload, copies
 * the priced_boq artifact's source file ids, the workbook metadata supplied by the
 * caller, and the explicit category map, and copies rowCount/totals/warnings from the
 * Mantle model. Arrays/objects are fresh-copied so the caller cannot mutate the
 * payload through its inputs. No DB, no file write, no writer call.
 */
export function buildMantleExportArtifactPayload(
  input: BuildMantleExportArtifactPayloadInput
): MantleExportArtifactPayload {
  const { pricedBoqArtifact, pricedPayload, model, workbookFilePath } = input;
  return {
    exportType: MANTLE_EXPORT_TYPE,
    sourcePricedBoqArtifactId: pricedBoqArtifact.id,
    sourcePricedBoqArtifactVersion: pricedBoqArtifact.version,
    sourceConfigurationExpansionArtifactId: pricedPayload.sourceConfigurationExpansionArtifactId,
    sourceConfigurationExpansionArtifactVersion:
      pricedPayload.sourceConfigurationExpansionArtifactVersion,
    sourceNormalizedBoqArtifactId: pricedPayload.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion: pricedPayload.sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId: pricedPayload.sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion: pricedPayload.sourceSkuResolutionArtifactVersion,
    sourceFileIds: [...pricedBoqArtifact.sourceFileIds],
    workbookFilePath,
    rowCount: model.rows.length,
    totals: { ...model.totals },
    warnings: [...model.warnings],
    ...(input.projectIdLabel !== undefined ? { projectIdLabel: input.projectIdLabel } : {}),
    ...(input.dealId !== undefined ? { dealId: input.dealId } : {}),
    ...(input.priceList !== undefined ? { priceList: input.priceList } : {}),
    ...(input.categoryByAcceptedSku !== undefined
      ? { categoryByAcceptedSku: { ...input.categoryByAcceptedSku } }
      : {}),
  };
}

/**
 * Generate the Mantle workbook and persist a new `export_package` artifact version:
 * load exactly one priced_boq artifact (exact missing/wrong-type/not-approved/invalid
 * messages), require it approved, validate its payload, build the Mantle model
 * (passing the explicit category map and optional export row-order sequence through),
 * write the workbook (writer errors
 * bubble before any artifact exists), and create exactly one `needs_review`
 * export_package at `export_approval` whose single source artifact is the priced_boq
 * artifact and whose filePath is the writer's returned path. No mutation.
 */
export async function createMantleExportArtifact(
  input: CreateMantleExportArtifactInput
): Promise<CreateMantleExportArtifactResult> {
  const { tenantId, projectId, outputPath, categoryByAcceptedSku, rowOrderSkuSequence } = input;

  const pricedBoqArtifact = await getProjectArtifactById(
    tenantId,
    projectId,
    input.pricedBoqArtifactId
  );
  if (!pricedBoqArtifact) throw new Error(MISSING_PRICED_BOQ_MESSAGE);
  if (pricedBoqArtifact.type !== "priced_boq") throw new Error(WRONG_PRICED_BOQ_TYPE_MESSAGE);
  if (pricedBoqArtifact.status !== "approved") throw new Error(PRICED_BOQ_NOT_APPROVED_MESSAGE);

  const pricedPayload = parsePricedBoqPayload(pricedBoqArtifact.payload);

  const model = buildMantlePriceEstimateModel({
    payload: pricedPayload,
    ...(categoryByAcceptedSku !== undefined ? { categoryByAcceptedSku } : {}),
    ...(rowOrderSkuSequence !== undefined ? { rowOrderSkuSequence } : {}),
  });

  const workbookFilePath = await writeMantlePriceEstimateWorkbook({
    model,
    outputPath,
    ...(input.templatePath !== undefined ? { templatePath: input.templatePath } : {}),
    ...(input.projectIdLabel !== undefined ? { projectId: input.projectIdLabel } : {}),
    ...(input.dealId !== undefined ? { dealId: input.dealId } : {}),
    ...(input.priceList !== undefined ? { priceList: input.priceList } : {}),
  });

  const payload = buildMantleExportArtifactPayload({
    pricedBoqArtifact,
    pricedPayload,
    model,
    workbookFilePath,
    ...(input.projectIdLabel !== undefined ? { projectIdLabel: input.projectIdLabel } : {}),
    ...(input.dealId !== undefined ? { dealId: input.dealId } : {}),
    ...(input.priceList !== undefined ? { priceList: input.priceList } : {}),
    ...(categoryByAcceptedSku !== undefined ? { categoryByAcceptedSku } : {}),
  });

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: "export_approval",
    type: "export_package",
    status: "needs_review",
    payload,
    filePath: workbookFilePath,
    sourceFileIds: [...pricedBoqArtifact.sourceFileIds],
    sourceArtifactIds: [pricedBoqArtifact.id],
  });

  return { artifact, pricedBoqArtifact, payload, model, workbookFilePath };
}
