/**
 * Narrow Project-domain service: persist a priced BoQ as a new `priced_boq`
 * artifact for the `boq_pricing_review` stage.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (section 8, 9, 10, 14, 15).
 *
 * Only COMPOSES the artifact repository (read one `normalized_boq` and one reviewed
 * `sku_resolution` artifact, persist one new version) and the pure priced-BoQ helper.
 * It does NO catalog lookup, USD-to-SAR conversion, pricing approval, stage-status
 * update, staleness propagation, or export work, and imports no engines, schema, AI,
 * or API/UI code. Pricing helper errors bubble unchanged with no artifact created. It
 * never mutates its inputs or the source artifacts.
 */
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import {
  buildPricedBoqDraft,
  type ExplicitSarUnitPrice,
  type PricedBoqDraft,
  type PricedBoqDraftLine,
  type PricedBoqDraftSummary,
} from "@/lib/projects/priced-boq";
import type {
  CanonicalBoqLine,
  ProjectArtifact,
  ProjectPricingConfig,
  SkuResolutionDecision,
} from "@/types/project";

// Exact guard messages; consumers may assert on these verbatim.
const MISSING_NORMALIZED_MESSAGE = "Normalized BoQ artifact not found.";
const WRONG_NORMALIZED_TYPE_MESSAGE = "Artifact is not a normalized_boq artifact.";
const INVALID_NORMALIZED_PAYLOAD_MESSAGE = "Normalized BoQ artifact payload is invalid.";
const MISSING_SKU_MESSAGE = "SKU resolution artifact not found.";
const WRONG_SKU_TYPE_MESSAGE = "Artifact is not a sku_resolution artifact.";
const INVALID_SKU_PAYLOAD_MESSAGE = "SKU resolution artifact payload is invalid.";
const MISMATCH_MESSAGE = "SKU resolution artifact does not match the normalized BoQ artifact.";

/**
 * JSONB payload stored on the `priced_boq` artifact. A type alias (not an interface)
 * so it carries an implicit index signature assignable to the repository payload.
 */
export type PricedBoqArtifactPayload = {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  sourceFileIds: string[];
  pricingConfig: ProjectPricingConfig;
  /** Only the SAR prices applied to priced lines, keyed by accepted SKU. */
  unitListPriceSarBySku: Record<string, ExplicitSarUnitPrice>;
  lineCount: number;
  lines: PricedBoqDraftLine[];
  summary: PricedBoqDraftSummary;
};

/** Input for {@link createPricedBoqArtifact}. */
export interface CreatePricedBoqArtifactInput {
  tenantId: string;
  projectId: string;
  normalizedBoqArtifactId: string;
  skuResolutionArtifactId: string;
  pricingConfig: ProjectPricingConfig;
  /** Explicit SAR unit price per accepted SKU. NOT catalog listPrice. */
  unitListPriceSarBySku: Readonly<Record<string, ExplicitSarUnitPrice>>;
}

/** The created artifact, both source artifacts, the exact payload, and the draft. */
export interface CreatePricedBoqArtifactResult {
  artifact: ProjectArtifact;
  normalizedBoqArtifact: ProjectArtifact;
  skuResolutionArtifact: ProjectArtifact;
  payload: PricedBoqArtifactPayload;
  draft: PricedBoqDraft;
}

/** Read-only inputs for {@link buildPricedBoqArtifactPayload}. */
export interface BuildPricedBoqArtifactPayloadInput {
  normalizedBoqArtifact: ProjectArtifact;
  skuResolutionArtifact: ProjectArtifact;
  pricingConfig: ProjectPricingConfig;
  unitListPriceSarBySku: Readonly<Record<string, ExplicitSarUnitPrice>>;
  draft: PricedBoqDraft;
}

/** Unique source file ids across both artifacts, in first-seen order. */
function unionSourceFileIds(first: readonly string[], second: readonly string[]): string[] {
  const ids: string[] = [];
  for (const id of [...first, ...second]) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** A fresh copy of only the SAR price entries applied to priced lines. */
function usedSarPrices(
  draft: PricedBoqDraft,
  unitListPriceSarBySku: Readonly<Record<string, ExplicitSarUnitPrice>>
): Record<string, ExplicitSarUnitPrice> {
  const used: Record<string, ExplicitSarUnitPrice> = {};
  for (const line of draft.lines) {
    if (line.status !== "priced" || line.acceptedSku === undefined) continue;
    if (used[line.acceptedSku] === undefined) {
      used[line.acceptedSku] = { ...unitListPriceSarBySku[line.acceptedSku] };
    }
  }
  return used;
}

/** A fresh draft line, with fresh originalCells and a fresh amounts object when present. */
function copyDraftLine(line: PricedBoqDraftLine): PricedBoqDraftLine {
  return {
    ...line,
    originalCells: { ...line.originalCells },
    ...(line.amounts !== undefined ? { amounts: { ...line.amounts } } : {}),
  };
}

/**
 * Build the `priced_boq` payload. Pure: copies the config, the SAR prices actually
 * used, every draft line (fresh originalCells/amounts), and the summary totals, and
 * unions the artifacts' source file ids; provenance ids/versions from the artifacts.
 */
export function buildPricedBoqArtifactPayload(
  input: BuildPricedBoqArtifactPayloadInput
): PricedBoqArtifactPayload {
  const { normalizedBoqArtifact, skuResolutionArtifact, pricingConfig, draft } = input;
  return {
    sourceNormalizedBoqArtifactId: normalizedBoqArtifact.id,
    sourceNormalizedBoqArtifactVersion: normalizedBoqArtifact.version,
    sourceSkuResolutionArtifactId: skuResolutionArtifact.id,
    sourceSkuResolutionArtifactVersion: skuResolutionArtifact.version,
    sourceFileIds: unionSourceFileIds(
      normalizedBoqArtifact.sourceFileIds,
      skuResolutionArtifact.sourceFileIds
    ),
    pricingConfig: { ...pricingConfig },
    unitListPriceSarBySku: usedSarPrices(draft, input.unitListPriceSarBySku),
    lineCount: draft.lines.length,
    lines: draft.lines.map(copyDraftLine),
    summary: { ...draft.summary, totals: { ...draft.summary.totals } },
  };
}

/** The reviewed SKU-resolution payload fields this service consumes. */
interface ParsedSkuPayload {
  decisions: SkuResolutionDecision[];
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
}

/** Validate and narrow a `sku_resolution` payload, throwing the exact message otherwise. */
function parseSkuPayload(payload: Record<string, unknown>): ParsedSkuPayload {
  const { decisions, sourceNormalizedBoqArtifactId, sourceNormalizedBoqArtifactVersion } = payload;
  if (
    !Array.isArray(decisions) ||
    typeof sourceNormalizedBoqArtifactId !== "string" ||
    typeof sourceNormalizedBoqArtifactVersion !== "number"
  ) {
    throw new Error(INVALID_SKU_PAYLOAD_MESSAGE);
  }
  return {
    decisions: decisions as SkuResolutionDecision[],
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
  };
}

/**
 * Persist a priced BoQ as a new `priced_boq` artifact version: load the normalized
 * BoQ and reviewed SKU resolution artifacts (exact missing/wrong-type/invalid-payload
 * messages), ensure the SKU artifact points to this exact normalized id and version,
 * build the priced draft (bubbling pricing helper errors unchanged, before any
 * artifact exists), and create exactly one `needs_review` artifact. No mutation.
 */
export async function createPricedBoqArtifact(
  input: CreatePricedBoqArtifactInput
): Promise<CreatePricedBoqArtifactResult> {
  const { tenantId, projectId, pricingConfig, unitListPriceSarBySku } = input;
  const normalizedBoqArtifact = await getProjectArtifactById(tenantId, projectId, input.normalizedBoqArtifactId);
  if (!normalizedBoqArtifact) throw new Error(MISSING_NORMALIZED_MESSAGE);
  if (normalizedBoqArtifact.type !== "normalized_boq") throw new Error(WRONG_NORMALIZED_TYPE_MESSAGE);
  if (!Array.isArray(normalizedBoqArtifact.payload.lines)) throw new Error(INVALID_NORMALIZED_PAYLOAD_MESSAGE);
  const normalizedLines = normalizedBoqArtifact.payload.lines as CanonicalBoqLine[];

  const skuResolutionArtifact = await getProjectArtifactById(tenantId, projectId, input.skuResolutionArtifactId);
  if (!skuResolutionArtifact) throw new Error(MISSING_SKU_MESSAGE);
  if (skuResolutionArtifact.type !== "sku_resolution") throw new Error(WRONG_SKU_TYPE_MESSAGE);
  const skuPayload = parseSkuPayload(skuResolutionArtifact.payload);

  if (
    skuPayload.sourceNormalizedBoqArtifactId !== normalizedBoqArtifact.id ||
    skuPayload.sourceNormalizedBoqArtifactVersion !== normalizedBoqArtifact.version
  ) {
    throw new Error(MISMATCH_MESSAGE);
  }

  const draft = buildPricedBoqDraft({
    lines: normalizedLines,
    decisions: skuPayload.decisions,
    pricingConfig,
    unitListPriceSarBySku,
  });
  const payload = buildPricedBoqArtifactPayload({
    normalizedBoqArtifact,
    skuResolutionArtifact,
    pricingConfig,
    unitListPriceSarBySku,
    draft,
  });
  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: "boq_pricing_review",
    type: "priced_boq",
    status: "needs_review",
    payload,
    sourceFileIds: [...payload.sourceFileIds],
    sourceArtifactIds: [normalizedBoqArtifact.id, skuResolutionArtifact.id],
  });

  return { artifact, normalizedBoqArtifact, skuResolutionArtifact, payload, draft };
}
