/**
 * Narrow Project-domain service: persist a reviewed/accepted configuration
 * expansion as a new `configuration_expansion` artifact for the
 * `configuration_expansion_review` stage (Section 19 task 8i).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (section 3, 11A, 14, 15, 16).
 *
 * Only COMPOSES the artifact repository (read one `normalized_boq` + one
 * `sku_resolution` artifact, persist one new version) and the pure engineer-review
 * helper. It does NO catalog lookup, pricing, SKU replacement, validation, rule-pack
 * loading, AI decision, stage-status update, staleness propagation, or export work,
 * and imports no engines/schema/AI/pricing/catalog/API/UI code. Only an APPROVED rule
 * pack may be persisted (runtime expansion uses approved rules only); candidate or
 * rejected packs are rejected. The source `sku_resolution` artifact must itself be
 * approved (section 16) before an accepted expansion is persisted - configuration
 * expansion depends on human-accepted SKU decisions. Review-helper errors bubble with
 * no artifact created; inputs/sources are never mutated; no pricing fields are added.
 * The artifact is created `needs_review`, NOT approved - approval stays the canonical
 * Project flow. Optional source-draft provenance (the persisted
 * `configuration_expansion` DRAFT artifact id/version this reviewed artifact was
 * produced from) may be supplied: the id is appended as a third sourceArtifactIds
 * entry and, with its version, echoed onto the payload. It never adds a `payloadKind`
 * marker, so a reviewed artifact stays approvable through the generic approval path.
 */
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import {
  applyConfigurationExpansionReview,
  type ConfigurationExpansionReviewDecision,
  type ConfigurationExpansionReviewResult,
} from "@/lib/projects/config-expansion-review";
import type {
  ConfigExpansionRulePackStatus,
  ConfigurationExpansionArtifactPayload,
  ConfigurationExpansionDraftLine,
} from "@/lib/projects/config-expansion-types";
import type { ProjectArtifact } from "@/types/project";

// Exact guard messages; consumers may assert on these verbatim.
const MISSING_NORMALIZED_MESSAGE = "Normalized BoQ artifact not found.";
const WRONG_NORMALIZED_TYPE_MESSAGE = "Artifact is not a normalized_boq artifact.";
const MISSING_SKU_MESSAGE = "SKU resolution artifact not found.";
const WRONG_SKU_TYPE_MESSAGE = "Artifact is not a sku_resolution artifact.";
const INVALID_SKU_PAYLOAD_MESSAGE = "SKU resolution artifact payload is invalid.";
const MISMATCH_MESSAGE = "SKU resolution artifact does not match the normalized BoQ artifact.";
// Distinct gates: this proves Project approval of the source sku_resolution
// artifact version (section 16); RULE_PACK_NOT_APPROVED proves rule authority
// (section 11A).
const SKU_NOT_APPROVED_MESSAGE = "SKU resolution artifact must be approved before configuration expansion.";
const RULE_PACK_NOT_APPROVED_MESSAGE = "Configuration expansion artifact requires an approved rule pack.";

/** Input for {@link createConfigurationExpansionArtifact}. Lines/decisions are read-only. */
export interface CreateConfigurationExpansionArtifactInput {
  tenantId: string;
  projectId: string;
  normalizedBoqArtifactId: string;
  skuResolutionArtifactId: string;
  rulePackId: string;
  rulePackVersion: string;
  rulePackStatus: ConfigExpansionRulePackStatus;
  /** Flat configuration-expansion draft: customer lines and auto-added expansion lines. */
  lines: readonly ConfigurationExpansionDraftLine[];
  /** Explicit accept/reject decisions; exactly one per expansion line. */
  decisions: readonly ConfigurationExpansionReviewDecision[];
  /** Optional reviewer identity/timestamp, persisted only when supplied (never generated here). */
  reviewedBy?: string;
  reviewedAt?: string;
  /**
   * Optional provenance of the configuration_expansion DRAFT artifact this reviewed
   * artifact is produced from (the explicit per-line review path). When the id is
   * supplied it is appended as a third sourceArtifactIds entry; when both id and
   * version are supplied they are echoed onto the reviewed payload.
   */
  sourceConfigurationExpansionDraftArtifactId?: string;
  sourceConfigurationExpansionDraftArtifactVersion?: number;
}

/** The created artifact, both source artifacts, the exact payload, and the review result. */
export interface CreateConfigurationExpansionArtifactResult {
  artifact: ProjectArtifact;
  normalizedBoqArtifact: ProjectArtifact;
  skuResolutionArtifact: ProjectArtifact;
  payload: ConfigurationExpansionArtifactPayload;
  reviewResult: ConfigurationExpansionReviewResult;
}

/** Read-only inputs for {@link buildConfigurationExpansionArtifactPayload}. */
export interface BuildConfigurationExpansionArtifactPayloadInput {
  normalizedBoqArtifact: ProjectArtifact;
  skuResolutionArtifact: ProjectArtifact;
  rulePackId: string;
  rulePackVersion: string;
  rulePackStatus: ConfigExpansionRulePackStatus;
  reviewResult: ConfigurationExpansionReviewResult;
  /** Optional source-draft provenance; echoed onto the payload only when both are supplied. */
  sourceConfigurationExpansionDraftArtifactId?: string;
  sourceConfigurationExpansionDraftArtifactVersion?: number;
}

/** The `sku_resolution` provenance fields this service requires to verify the chain. */
interface ParsedSkuProvenance {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
}

/** Unique source file ids across both artifacts, in first-seen order. */
function unionSourceFileIds(first: readonly string[], second: readonly string[]): string[] {
  const ids: string[] = [];
  for (const id of [...first, ...second]) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Deep-copy the only nested mutable fields so the payload never aliases a review-result line. */
function copyLine(line: ConfigurationExpansionDraftLine): ConfigurationExpansionDraftLine {
  return {
    ...line,
    ...(line.originalCells !== undefined ? { originalCells: { ...line.originalCells } } : {}),
    ...(line.evidence !== undefined ? { evidence: line.evidence.map((citation) => ({ ...citation })) } : {}),
  };
}

/** Validate and narrow a `sku_resolution` payload to its provenance fields. */
function parseSkuProvenance(payload: Record<string, unknown>): ParsedSkuProvenance {
  const { sourceNormalizedBoqArtifactId, sourceNormalizedBoqArtifactVersion } = payload;
  if (
    typeof sourceNormalizedBoqArtifactId !== "string" ||
    typeof sourceNormalizedBoqArtifactVersion !== "number"
  ) {
    throw new Error(INVALID_SKU_PAYLOAD_MESSAGE);
  }
  return { sourceNormalizedBoqArtifactId, sourceNormalizedBoqArtifactVersion };
}

/**
 * Build the `configuration_expansion` payload. Rejects any non-`approved` rule pack so
 * the exported builder cannot bypass the rule-authority gate. Pure: copies accepted and
 * rejected lines fresh (originalCells/evidence), the review summary, and the unioned
 * source file ids; provenance/rule-pack coordinates are echoed; reviewedBy/reviewedAt
 * appear only when supplied; lineCount equals acceptedLines.length. No pricing fields.
 */
export function buildConfigurationExpansionArtifactPayload(
  input: BuildConfigurationExpansionArtifactPayloadInput
): ConfigurationExpansionArtifactPayload {
  const {
    normalizedBoqArtifact,
    skuResolutionArtifact,
    rulePackId,
    rulePackVersion,
    rulePackStatus,
    reviewResult,
    sourceConfigurationExpansionDraftArtifactId,
    sourceConfigurationExpansionDraftArtifactVersion,
  } = input;
  if (rulePackStatus !== "approved") throw new Error(RULE_PACK_NOT_APPROVED_MESSAGE);
  const acceptedLines = reviewResult.acceptedLines.map(copyLine);
  return {
    sourceNormalizedBoqArtifactId: normalizedBoqArtifact.id,
    sourceNormalizedBoqArtifactVersion: normalizedBoqArtifact.version,
    sourceSkuResolutionArtifactId: skuResolutionArtifact.id,
    sourceSkuResolutionArtifactVersion: skuResolutionArtifact.version,
    // Echo source-draft provenance only when BOTH coordinates are supplied; a
    // reviewed artifact built without a source draft carries neither field.
    ...(sourceConfigurationExpansionDraftArtifactId !== undefined &&
    sourceConfigurationExpansionDraftArtifactVersion !== undefined
      ? {
          sourceConfigurationExpansionDraftArtifactId,
          sourceConfigurationExpansionDraftArtifactVersion,
        }
      : {}),
    sourceFileIds: unionSourceFileIds(
      normalizedBoqArtifact.sourceFileIds,
      skuResolutionArtifact.sourceFileIds
    ),
    rulePackId,
    rulePackVersion,
    rulePackStatus,
    lineCount: acceptedLines.length,
    acceptedLines,
    rejectedLines: reviewResult.rejectedLines.map(copyLine),
    summary: { ...reviewResult.summary },
    ...(reviewResult.reviewedBy !== undefined ? { reviewedBy: reviewResult.reviewedBy } : {}),
    ...(reviewResult.reviewedAt !== undefined ? { reviewedAt: reviewResult.reviewedAt } : {}),
  };
}

/**
 * Persist a reviewed/accepted configuration expansion as a new `configuration_expansion`
 * artifact version: load+validate the normalized BoQ and `sku_resolution` artifacts (exact
 * messages, incl. provenance mismatch), require the source `sku_resolution` artifact to be
 * approved in the Project model (section 16) AND require an approved rule pack (section 11A)
 * - two distinct gates - apply accept/reject decisions (review-helper errors bubble first),
 * and create one `needs_review` artifact.
 */
export async function createConfigurationExpansionArtifact(
  input: CreateConfigurationExpansionArtifactInput
): Promise<CreateConfigurationExpansionArtifactResult> {
  const { tenantId, projectId, rulePackId, rulePackVersion, rulePackStatus, lines, decisions, reviewedBy, reviewedAt } = input;

  const normalizedBoqArtifact = await getProjectArtifactById(tenantId, projectId, input.normalizedBoqArtifactId);
  if (!normalizedBoqArtifact) throw new Error(MISSING_NORMALIZED_MESSAGE);
  if (normalizedBoqArtifact.type !== "normalized_boq") throw new Error(WRONG_NORMALIZED_TYPE_MESSAGE);

  const skuResolutionArtifact = await getProjectArtifactById(tenantId, projectId, input.skuResolutionArtifactId);
  if (!skuResolutionArtifact) throw new Error(MISSING_SKU_MESSAGE);
  if (skuResolutionArtifact.type !== "sku_resolution") throw new Error(WRONG_SKU_TYPE_MESSAGE);
  // Project-approval gate: configuration expansion depends on human-accepted SKU
  // decisions, so the source sku_resolution artifact version must be approved
  // (section 16). Separate from the rule-pack gate (section 11A) below.
  if (skuResolutionArtifact.status !== "approved") throw new Error(SKU_NOT_APPROVED_MESSAGE);
  const provenance = parseSkuProvenance(skuResolutionArtifact.payload);

  if (
    provenance.sourceNormalizedBoqArtifactId !== normalizedBoqArtifact.id ||
    provenance.sourceNormalizedBoqArtifactVersion !== normalizedBoqArtifact.version
  ) {
    throw new Error(MISMATCH_MESSAGE);
  }
  if (rulePackStatus !== "approved") throw new Error(RULE_PACK_NOT_APPROVED_MESSAGE);

  const reviewResult = applyConfigurationExpansionReview({ lines, decisions, reviewedBy, reviewedAt });
  const payload = buildConfigurationExpansionArtifactPayload({
    normalizedBoqArtifact,
    skuResolutionArtifact,
    rulePackId,
    rulePackVersion,
    rulePackStatus,
    reviewResult,
    sourceConfigurationExpansionDraftArtifactId: input.sourceConfigurationExpansionDraftArtifactId,
    sourceConfigurationExpansionDraftArtifactVersion: input.sourceConfigurationExpansionDraftArtifactVersion,
  });

  // Source artifacts in [normalized, sku] order; when this reviewed artifact was
  // produced from a persisted draft, that draft id is appended as a third entry.
  const sourceArtifactIds = [normalizedBoqArtifact.id, skuResolutionArtifact.id];
  if (input.sourceConfigurationExpansionDraftArtifactId !== undefined) {
    sourceArtifactIds.push(input.sourceConfigurationExpansionDraftArtifactId);
  }

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "needs_review",
    payload,
    sourceFileIds: [...payload.sourceFileIds],
    sourceArtifactIds,
  });

  return { artifact, normalizedBoqArtifact, skuResolutionArtifact, payload, reviewResult };
}
