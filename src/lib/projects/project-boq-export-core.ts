/**
 * Shared Project BoQ export-package CREATION core: create ONE Mantle `export_package`
 * artifact (status `needs_review`) from ONE already-APPROVED `priced_boq` artifact.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (section 10 Priced Output Contract; section 19 task 8k). Canonical shapes:
 * src/types/project.ts.
 *
 * This is the lane-agnostic core behind the Quick BoM and RFP BoQ export step. RFP and
 * Quick BoM priced_boq artifacts are produced by the SAME deterministic pricing core, so
 * they share this identical export-creation path - only the mode gate and the generated
 * workbook filename prefix differ per lane, both pinned by the caller through the lane
 * config (`expectedMode`, `fileNamePrefix`). This is export package CREATION only - not
 * download/serve and not export approval. It verifies the Project (not_found / wrong_mode
 * against the caller-supplied `expectedMode`) BEFORE generating a path or loading the demo
 * fixture maps, generates a server-side workbook output path, and delegates the
 * load+map+write+persist to the existing deterministic {@link createMantleExportArtifact}.
 * That delegate reads exactly one approved priced_boq artifact, builds the pure Mantle
 * price-estimate model, writes the workbook, and persists ONE `needs_review`
 * `export_package` at `export_approval`.
 *
 * AUTHORITY BOUNDARY: export consumes only an approved priced_boq artifact. It never
 * re-prices, re-resolves SKUs, re-expands configuration, infers categories from SKU
 * text/description, or reads normalized_boq/sku_resolution/configuration_expansion
 * directly. For this MVP demo wiring only, the committed Honeywell demo fixture supplies
 * the ONLY categoryByAcceptedSku source (via {@link getHoneywellDemoMantleCategoryByAcceptedSku})
 * AND the ONLY Mantle export presentation row-order source (via
 * {@link getHoneywellDemoMantleRowOrderSkuSequence}, which orders the generated workbook
 * rows to the approved CCW benchmark). That fixture is TEMPORARY demo category/export-bucket
 * and export-ordering metadata only: not pricing authority, not configuration authority,
 * not production Cisco authority, not catalog lookup, not runtime AI, not replacement
 * authority, and it authorizes no silent SKU substitution or re-resolution. Missing
 * categories stay the lower Mantle model's warning/default behavior; this core infers no
 * categories and re-orders nothing itself.
 *
 * The workbook output path is always generated here under the OS temp dir with a unique
 * id - never accepted from caller input or a request body. The caller supplies no
 * outputPath, filePath, category map, pricing/config authority, approver, or export
 * approval field: every authority is the tenant session, the route params, the Project,
 * or the committed fixture. It runs no AI, creates no approval, updates no stage status,
 * streams no workbook bytes, and imports no artifact/approval store, DB schema/index,
 * pricing math, catalog, config-expansion/priced-boq/Mantle model/writer helper,
 * runner, engine, coordinator, adapter, or AI module. It translates the delegate's
 * known failures into discriminated statuses, re-throwing anything unexpected for the
 * route to map to a safe 500, returns lean serializable summaries only (never the
 * workbook bytes, the priced_boq payload, priced lines, amounts, the category map, or the
 * workbook label metadata), and never mutates its input, the Project, the fixture map, or
 * the delegate result.
 *
 * The ONLY lane-specific behavior is the `project.mode !== expectedMode` gate and the
 * generated filename prefix, so each lane (Quick BoM, RFP BoQ) keeps its own surface and
 * filename while sharing this deterministic core. The result status names are kept
 * verbatim for the existing route API contract even though the core is now generic.
 */
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProjectById } from "@/lib/db/project-store";
import { createMantleExportArtifact } from "@/lib/projects/mantle-export-artifact";
import {
  getHoneywellDemoMantleCategoryByAcceptedSku,
  getHoneywellDemoMantleRowOrderSkuSequence,
} from "@/lib/projects/honeywell-demo-pricing-fixture";
import type {
  CreateMantleExportArtifactResult,
  MantleExportArtifactPayload,
} from "@/lib/projects/mantle-export-artifact";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

/**
 * Exact messages thrown by {@link createMantleExportArtifact}, the pure Mantle model,
 * and the workbook writer it composes. They are private to those modules, so this
 * core mirrors the literals deliberately to translate them into safe statuses without
 * importing or editing them.
 */
const MISSING_PRICED_BOQ_MESSAGE = "Priced BoQ artifact not found.";
const WRONG_PRICED_BOQ_TYPE_MESSAGE = "Artifact is not a priced_boq artifact.";
const PRICED_BOQ_NOT_APPROVED_MESSAGE = "Priced BoQ artifact must be approved before export.";
const INVALID_PRICED_BOQ_PAYLOAD_MESSAGE = "Priced BoQ artifact payload is invalid.";
// The writer rejects an empty model; for an approved priced_boq that means its payload
// carries no priceable rows, so it is surfaced as an invalid priced_boq payload.
const EMPTY_ROWS_MESSAGE = "Mantle workbook requires at least one row.";
// The output path is always generated server-side, so a blank-path writer fault is a
// server-side export failure, distinct from the route catch-all.
const BLANK_OUTPUT_MESSAGE = "Mantle workbook output path is required.";

/** The export type discriminator echoed onto the lean payload summary. */
export type ProjectBoqExportType = MantleExportArtifactPayload["exportType"];

/** The Mantle total-bucket roll-up echoed onto the summaries (no per-line detail). */
export type ProjectBoqExportTotals = MantleExportArtifactPayload["totals"];

/**
 * Category-source boundary block surfaced on every export payload summary. It records
 * that the Mantle line categories came from the TEMPORARY Honeywell MVP demo fixture
 * and carry demo authority only - never pricing, configuration, production, AI,
 * catalog, or replacement authority.
 */
const CATEGORY_SOURCE = {
  source: "honeywell_mvp_demo_mantle_category_fixture",
  scope: "honeywell_mvp_demo_only",
  demoFixtureAuthority: true,
  productionPricingAuthority: false,
  configurationAuthority: false,
  runtimeAi: false,
  runtimeCatalogLookup: false,
  replacementAuthority: false,
  silentSkuSubstitution: false,
} as const;

/** Caller-facing export request shared by every BoQ export lane (no lane config). */
export interface ProjectBoqExportPackageRequest {
  tenantId: string;
  projectId: string;
  /** The exact already-approved priced_boq artifact to export. */
  pricedBoqArtifactId: string;
}

/** Full core input: the caller request plus the two values a lane wrapper pins. */
export interface CreateProjectBoqExportPackageCoreInput extends ProjectBoqExportPackageRequest {
  /** Project.mode this lane operates on; any mismatch yields wrong_mode. */
  expectedMode: ProjectMode;
  /**
   * Lane-pinned generated workbook filename prefix (e.g. "bomatic-quick-bom-export" or
   * "bomatic-rfp-boq-export"). Trusted lane config, never a caller body field; the
   * project/priced-boq id segments appended after it are still sanitized.
   */
  fileNamePrefix: string;
}

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export interface ProjectBoqExportProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface ProjectBoqExportArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** The category-source boundary block carried on the payload summary. */
export type ProjectBoqExportCategorySourceSummary = typeof CATEGORY_SOURCE;

/**
 * Serializable export-payload summary: the export type, provenance ids/versions, the
 * copied source file ids, the generated workbook path, the row count, a fresh copy of
 * the Mantle totals and warnings, and the category-source boundary. The full priced_boq
 * payload, priced lines, amounts, unit price maps, and the categoryByAcceptedSku map are
 * never surfaced.
 */
export interface ProjectBoqExportPayloadSummary {
  exportType: ProjectBoqExportType;
  sourcePricedBoqArtifactId: string;
  sourcePricedBoqArtifactVersion: number;
  sourceConfigurationExpansionArtifactId: string;
  sourceConfigurationExpansionArtifactVersion: number;
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  sourceFileIds: string[];
  workbookFilePath: string;
  rowCount: number;
  totals: ProjectBoqExportTotals;
  warnings: string[];
  categorySource: ProjectBoqExportCategorySourceSummary;
}

/** Lean export roll-up: row count, totals, warnings, and the generated workbook path. */
export interface ProjectBoqExportSummary {
  rowCount: number;
  totals: ProjectBoqExportTotals;
  warnings: string[];
  workbookFilePath: string;
}

/** Discriminated result of {@link createProjectBoqExportPackageCore}. */
export type CreateProjectBoqExportPackageResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: ProjectBoqExportProjectSummary }
  | { status: "priced_boq_not_found" }
  | { status: "artifact_not_priced_boq" }
  | { status: "priced_boq_not_approved" }
  | { status: "invalid_priced_boq_payload" }
  | { status: "export_workbook_failed" }
  | {
      status: "ok";
      artifact: ProjectBoqExportArtifactSummary;
      payloadSummary: ProjectBoqExportPayloadSummary;
      exportSummary: ProjectBoqExportSummary;
    };

/** Replace any character outside [A-Za-z0-9._-] with "_" for a safe ASCII path segment. */
function safePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

/**
 * Generate a unique server-side workbook output path under the OS temp dir. The path is
 * never derived from caller input or a request body; the lane-pinned prefix labels the
 * file, the project/priced-boq ids are only sanitized for readability, and a randomUUID()
 * guarantees uniqueness. tmpdir() already exists, so no directory is created.
 */
function generateOutputPath(
  fileNamePrefix: string,
  projectId: string,
  pricedBoqArtifactId: string
): string {
  const fileName = `${safePathSegment(fileNamePrefix)}-${safePathSegment(projectId)}-${safePathSegment(
    pricedBoqArtifactId
  )}-${randomUUID()}.xlsx`;
  return join(tmpdir(), fileName);
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): ProjectBoqExportProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Project an artifact to a serializable summary; source arrays copied, payload dropped. */
function toArtifactSummary(artifact: ProjectArtifact): ProjectBoqExportArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: [...artifact.sourceFileIds],
    sourceArtifactIds: [...artifact.sourceArtifactIds],
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/**
 * Project the export payload to a lean summary: the export type, provenance ids/
 * versions, the copied source file ids, the workbook path, the row count, a fresh copy
 * of the Mantle totals and warnings, and a fresh category-source boundary block. The
 * categoryByAcceptedSku map and any workbook label metadata are never surfaced.
 */
function toPayloadSummary(payload: MantleExportArtifactPayload): ProjectBoqExportPayloadSummary {
  return {
    exportType: payload.exportType,
    sourcePricedBoqArtifactId: payload.sourcePricedBoqArtifactId,
    sourcePricedBoqArtifactVersion: payload.sourcePricedBoqArtifactVersion,
    sourceConfigurationExpansionArtifactId: payload.sourceConfigurationExpansionArtifactId,
    sourceConfigurationExpansionArtifactVersion: payload.sourceConfigurationExpansionArtifactVersion,
    sourceNormalizedBoqArtifactId: payload.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion: payload.sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId: payload.sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion: payload.sourceSkuResolutionArtifactVersion,
    sourceFileIds: [...payload.sourceFileIds],
    workbookFilePath: payload.workbookFilePath,
    rowCount: payload.rowCount,
    totals: { ...payload.totals },
    warnings: [...payload.warnings],
    categorySource: { ...CATEGORY_SOURCE },
  };
}

/** Lean export roll-up from the payload: a fresh totals copy and warnings copy. */
function toExportSummary(payload: MantleExportArtifactPayload): ProjectBoqExportSummary {
  return {
    rowCount: payload.rowCount,
    totals: { ...payload.totals },
    warnings: [...payload.warnings],
    workbookFilePath: payload.workbookFilePath,
  };
}

/** Translate a known delegate/model/writer error into a safe status, or null if unexpected. */
function translateDelegateError(
  message: string
): CreateProjectBoqExportPackageResult | null {
  if (message === MISSING_PRICED_BOQ_MESSAGE) return { status: "priced_boq_not_found" };
  if (message === WRONG_PRICED_BOQ_TYPE_MESSAGE) return { status: "artifact_not_priced_boq" };
  if (message === PRICED_BOQ_NOT_APPROVED_MESSAGE) return { status: "priced_boq_not_approved" };
  if (message === INVALID_PRICED_BOQ_PAYLOAD_MESSAGE) return { status: "invalid_priced_boq_payload" };
  if (message === EMPTY_ROWS_MESSAGE) return { status: "invalid_priced_boq_payload" };
  if (message === BLANK_OUTPUT_MESSAGE) return { status: "export_workbook_failed" };
  return null;
}

/**
 * Create a Mantle `export_package` artifact from one already-approved `priced_boq`
 * artifact, tenant-scoped on every store/service call. It verifies the Project within its
 * tenant (not_found / wrong_mode against the caller-supplied `expectedMode`, lean summary)
 * BEFORE generating a path or loading the demo category fixture, then generates a unique
 * server-side workbook output path (labelled with the lane-pinned `fileNamePrefix`) and
 * delegates the load+map+write+persist to {@link createMantleExportArtifact} - passing the
 * committed Honeywell MVP demo Mantle category map and export row order as the only such
 * sources. If the delegate throws after a workbook may have been written, the generated
 * path is removed best-effort (never masking the original error) before the known failure
 * is translated into a safe status or anything unexpected is re-thrown. On success it
 * returns lean, serializable summaries of the created artifact (no payload), its payload
 * (no priced lines, amounts, or category map), and the export roll-up. The input, Project,
 * fixture map, and delegate result are never mutated.
 */
export async function createProjectBoqExportPackageCore(
  input: CreateProjectBoqExportPackageCoreInput
): Promise<CreateProjectBoqExportPackageResult> {
  const { tenantId, projectId, pricedBoqArtifactId, expectedMode, fileNamePrefix } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== expectedMode) {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  // The workbook path is generated server-side (never from input/body); the demo
  // fixture getters each return a fresh copy and are the ONLY source of the Mantle
  // category map and the Mantle export presentation row order (order evidence only).
  const outputPath = generateOutputPath(fileNamePrefix, projectId, pricedBoqArtifactId);
  const categoryByAcceptedSku = getHoneywellDemoMantleCategoryByAcceptedSku();
  const rowOrderSkuSequence = getHoneywellDemoMantleRowOrderSkuSequence();

  let result: CreateMantleExportArtifactResult;
  try {
    result = await createMantleExportArtifact({
      tenantId,
      projectId,
      pricedBoqArtifactId,
      outputPath,
      categoryByAcceptedSku,
      rowOrderSkuSequence,
    });
  } catch (error) {
    // Best-effort cleanup of a possibly-written workbook; it must never mask the
    // original delegate error, so any cleanup fault is swallowed.
    try {
      await rm(outputPath, { force: true });
    } catch {
      // ignore - cleanup is best-effort only
    }
    const message = error instanceof Error ? error.message : "";
    const translated = translateDelegateError(message);
    if (translated) return translated;
    throw error;
  }

  return {
    status: "ok",
    artifact: toArtifactSummary(result.artifact),
    payloadSummary: toPayloadSummary(result.payload),
    exportSummary: toExportSummary(result.payload),
  };
}
