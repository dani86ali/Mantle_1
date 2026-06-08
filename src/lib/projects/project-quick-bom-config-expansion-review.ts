/**
 * Quick BoM configuration-expansion REVIEW service: apply EXPLICIT per-line human
 * accept/reject decisions to one already-persisted `configuration_expansion` DRAFT
 * artifact (Prompt 90's `payloadKind: "configuration_expansion_draft"` payload),
 * persisting the reviewed/accepted expansion as a new, non-draft
 * `configuration_expansion` artifact. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 11, 11A).
 * Canonical shapes: src/types/project.ts.
 *
 * Scope (Prompt 91) is the single product step "review a configuration_expansion
 * draft". It verifies the Project (not_found / wrong_mode) and the EXACT draft
 * artifact (existence / configuration_expansion type / draft marker / needs_review
 * status / draft-payload shape), then delegates the per-line review and the new
 * artifact version to the existing deterministic
 * {@link createConfigurationExpansionArtifact}. That delegate re-loads and
 * re-validates the normalized_boq and sku_resolution sources, enforces the
 * sku-approval and approved-rule-pack gates, and applies the pure engineer-review
 * helper (which never auto-accepts: every expansion line needs an explicit
 * decision). The reviewer identity is this wrapper's sole authority (`reviewedBy`
 * from its input); a review timestamp is never settable by a caller and is never
 * generated here. It carries the loaded draft's id/version to the reviewed artifact
 * as source-draft provenance.
 *
 * It does NO catalog/pricing/SKU acceptance/rule-pack work of its own and never
 * imports the artifact-write helper, the draft service, the approval/evidence
 * stores, the raw BoQ loader, pricing, mantle/export, any runner/coordinator/engine/
 * adapter path, or an AI/catalog SDK. It translates the delegate's known failures
 * into discriminated statuses without leaking internal/stack detail, re-throws
 * anything unexpected for the route to map to a safe 500, and returns serializable,
 * lean summaries only (no full lines, acceptedLines, rejectedLines, evidence,
 * originalCells, or full artifact payload). It never mutates its input, the draft
 * artifact, its payload arrays, the decisions, or the delegate's result.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import {
  createConfigurationExpansionArtifact,
  type CreateConfigurationExpansionArtifactResult,
} from "@/lib/projects/config-expansion-artifact";
import type {
  ConfigExpansionRulePackStatus,
  ConfigurationAuthorityTrace,
  ConfigurationExpansionArtifactPayload,
  ConfigurationExpansionDraftLine,
} from "@/lib/projects/config-expansion-types";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

// The decision contract is re-exported so the POST route can stay import-pure
// (Next.js primitives + requireAuth + this wrapper only) while still typing a body.
export type { ConfigurationExpansionReviewDecision } from "@/lib/projects/config-expansion-review";
import type { ConfigurationExpansionReviewDecision } from "@/lib/projects/config-expansion-review";

/** Draft discriminator written by the Prompt 90 draft service. */
const DRAFT_PAYLOAD_KIND = "configuration_expansion_draft";

/**
 * Exact messages thrown by {@link createConfigurationExpansionArtifact} and the
 * pure engineer-review helper it composes. They are private to those modules, so
 * this wrapper mirrors the literals deliberately to translate them into safe
 * statuses without importing or editing them.
 */
const MISSING_NORMALIZED_MESSAGE = "Normalized BoQ artifact not found.";
const WRONG_NORMALIZED_TYPE_MESSAGE = "Artifact is not a normalized_boq artifact.";
const MISSING_SKU_MESSAGE = "SKU resolution artifact not found.";
const WRONG_SKU_TYPE_MESSAGE = "Artifact is not a sku_resolution artifact.";
const INVALID_SKU_PAYLOAD_MESSAGE = "SKU resolution artifact payload is invalid.";
const MISMATCH_MESSAGE = "SKU resolution artifact does not match the normalized BoQ artifact.";
const SKU_NOT_APPROVED_MESSAGE = "SKU resolution artifact must be approved before configuration expansion.";
const RULE_PACK_NOT_APPROVED_MESSAGE = "Configuration expansion artifact requires an approved rule pack.";
const DUPLICATE_DECISION_MESSAGE = "Configuration expansion review has a duplicate decision for a lineId.";
const UNKNOWN_LINE_MESSAGE = "Configuration expansion review decision references an unknown lineId.";
const CUSTOMER_LINE_DECISION_MESSAGE = "Configuration expansion review decision must not target a customer line.";
const MISSING_DECISION_MESSAGE = "Configuration expansion review requires a decision for every expansion line.";
const INVALID_ACTION_MESSAGE = "Configuration expansion review decision action must be accept or reject.";
const ACCEPTED_NO_RULE_MESSAGE = "Accepted configuration expansion line must carry a sourceRuleId.";
const ACCEPTED_NO_EVIDENCE_MESSAGE = "Accepted configuration expansion line must carry evidence.";

/** Input for {@link reviewProjectQuickBomConfigurationExpansionDraft}. */
export interface ReviewProjectQuickBomConfigurationExpansionDraftInput {
  tenantId: string;
  projectId: string;
  /** The exact persisted configuration_expansion DRAFT artifact to review. */
  configurationExpansionDraftArtifactId: string;
  /** Required human reviewer; the sole authority for the reviewed artifact's reviewer. */
  reviewedBy: string;
  /** Explicit accept/reject decisions; exactly one per expansion line, none for customer lines. */
  decisions: readonly ConfigurationExpansionReviewDecision[];
}

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export interface QuickBomConfigExpansionReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface QuickBomConfigExpansionReviewArtifactSummary {
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

/** Serializable reviewed-payload summary: provenance ids/versions, rule-pack metadata, counts; never the lines. */
export interface QuickBomConfigExpansionReviewPayloadSummary {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  sourceConfigurationExpansionDraftArtifactId: string;
  sourceConfigurationExpansionDraftArtifactVersion: number;
  sourceFileIds: string[];
  rulePackId: string;
  rulePackVersion: string;
  rulePackStatus: "approved";
  lineCount: number;
  summary: ConfigurationExpansionArtifactPayload["summary"];
  /** Inherited configuration-authority trace; present when the reviewed payload carries one. (Prompt 118) */
  configurationAuthority?: ConfigurationAuthorityTrace;
}

/** Deterministic review roll-up counts surfaced to the caller. */
export type QuickBomConfigExpansionReviewSummary = ConfigurationExpansionArtifactPayload["summary"];

/** Discriminated result of {@link reviewProjectQuickBomConfigurationExpansionDraft}. */
export type ReviewProjectQuickBomConfigurationExpansionDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: QuickBomConfigExpansionReviewProjectSummary }
  | { status: "configuration_expansion_draft_not_found" }
  | {
      status: "artifact_not_configuration_expansion";
      artifact: QuickBomConfigExpansionReviewArtifactSummary;
    }
  | {
      status: "configuration_expansion_not_draft";
      artifact: QuickBomConfigExpansionReviewArtifactSummary;
    }
  | {
      status: "configuration_expansion_draft_not_reviewable";
      artifact: QuickBomConfigExpansionReviewArtifactSummary;
    }
  | { status: "invalid_configuration_expansion_draft_payload" }
  | { status: "normalized_boq_not_found" }
  | { status: "artifact_not_normalized_boq" }
  | { status: "sku_resolution_not_found" }
  | { status: "artifact_not_sku_resolution" }
  | { status: "invalid_sku_resolution_payload" }
  | { status: "sku_resolution_normalized_boq_mismatch" }
  | { status: "sku_resolution_not_approved" }
  | { status: "rule_pack_not_approved" }
  | { status: "duplicate_decision" }
  | { status: "decision_target_not_found" }
  | { status: "customer_line_decision" }
  | { status: "missing_expansion_decision" }
  | { status: "invalid_decision_action" }
  | { status: "accepted_line_not_traceable" }
  | {
      status: "ok";
      artifact: QuickBomConfigExpansionReviewArtifactSummary;
      payloadSummary: QuickBomConfigExpansionReviewPayloadSummary;
      reviewSummary: QuickBomConfigExpansionReviewSummary;
    };

/** The draft-payload fields this wrapper requires before delegating the review. */
interface ParsedDraftPayload {
  sourceNormalizedBoqArtifactId: string;
  sourceSkuResolutionArtifactId: string;
  rulePackId: string;
  rulePackVersion: string;
  rulePackStatus: ConfigExpansionRulePackStatus;
  lines: ConfigurationExpansionDraftLine[];
  /** Present when the draft payload carried a valid configuration-authority trace. */
  configurationAuthority?: ConfigurationAuthorityTrace;
}

function isBlank(value: string): boolean {
  return value.trim() === "";
}

/** True for a plain (non-array) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** True for an array whose every element is a string. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): QuickBomConfigExpansionReviewProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Project an artifact to a serializable summary; source arrays copied, payload dropped. */
function toArtifactSummary(
  artifact: ProjectArtifact
): QuickBomConfigExpansionReviewArtifactSummary {
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
 * Project the reviewed payload to a lean summary: provenance ids/versions (incl. the
 * source-draft id/version taken from the loaded draft artifact), rule-pack metadata,
 * the copied source file ids, the line count, and the review summary. The full
 * accepted/rejected lines, evidence, and original cells are never surfaced.
 */
function toPayloadSummary(
  payload: ConfigurationExpansionArtifactPayload,
  draftArtifact: ProjectArtifact
): QuickBomConfigExpansionReviewPayloadSummary {
  const base: QuickBomConfigExpansionReviewPayloadSummary = {
    sourceNormalizedBoqArtifactId: payload.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion: payload.sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId: payload.sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion: payload.sourceSkuResolutionArtifactVersion,
    sourceConfigurationExpansionDraftArtifactId: draftArtifact.id,
    sourceConfigurationExpansionDraftArtifactVersion: draftArtifact.version,
    sourceFileIds: [...payload.sourceFileIds],
    rulePackId: payload.rulePackId,
    rulePackVersion: payload.rulePackVersion,
    rulePackStatus: payload.rulePackStatus,
    lineCount: payload.lineCount,
    summary: { ...payload.summary },
  };
  // Include a deep copy of the trace so mutating the returned summary cannot
  // corrupt the reviewed payload's configurationAuthority.
  if (payload.configurationAuthority !== undefined) {
    base.configurationAuthority = {
      ...payload.configurationAuthority,
      dispositionSummary: { ...payload.configurationAuthority.dispositionSummary },
    };
  }
  return base;
}

/**
 * Validate and narrow the draft payload to the fields needed to delegate the review.
 * Requires the draft marker, both source provenance ids/versions, the copied
 * sourceFileIds, the rule-pack coordinates with an `approved` status and scope, the
 * `lines` array, and a `summary` object; returns null when any is missing or the
 * wrong shape so the caller can fail with invalid_configuration_expansion_draft_payload.
 */
function parseDraftPayload(
  payload: Record<string, unknown>
): ParsedDraftPayload | null {
  const {
    payloadKind,
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion,
    sourceFileIds,
    rulePackId,
    rulePackVersion,
    rulePackStatus,
    rulePackSourceScope,
    lines,
    summary,
    configurationAuthority,
  } = payload;
  if (
    payloadKind !== DRAFT_PAYLOAD_KIND ||
    typeof sourceNormalizedBoqArtifactId !== "string" ||
    typeof sourceNormalizedBoqArtifactVersion !== "number" ||
    typeof sourceSkuResolutionArtifactId !== "string" ||
    typeof sourceSkuResolutionArtifactVersion !== "number" ||
    !isStringArray(sourceFileIds) ||
    typeof rulePackId !== "string" ||
    typeof rulePackVersion !== "string" ||
    rulePackStatus !== "approved" ||
    typeof rulePackSourceScope !== "string" ||
    !Array.isArray(lines) ||
    !isPlainObject(summary)
  ) {
    return null;
  }
  // If present, the trace must be fully valid; a malformed present trace is not
  // backward-compatible - return null to trigger invalid_configuration_expansion_draft_payload.
  if (configurationAuthority !== undefined) {
    const parsedTrace = parseConfigurationAuthorityTrace(configurationAuthority);
    if (parsedTrace === null) return null;
    return {
      sourceNormalizedBoqArtifactId,
      sourceSkuResolutionArtifactId,
      rulePackId,
      rulePackVersion,
      rulePackStatus,
      lines: lines as ConfigurationExpansionDraftLine[],
      configurationAuthority: parsedTrace,
    };
  }
  return {
    sourceNormalizedBoqArtifactId,
    sourceSkuResolutionArtifactId,
    rulePackId,
    rulePackVersion,
    rulePackStatus,
    lines: lines as ConfigurationExpansionDraftLine[],
  };
}

/**
 * Validate a present `configurationAuthority` value from a draft payload. Returns
 * the validated trace (as a `ConfigurationAuthorityTrace`) when the object matches
 * all required shapes, or null when any field is missing or wrong. Called only when
 * the value is not undefined; absence is backward-compatible (returns undefined from
 * `parseDraftPayload`, not null).
 */
function parseConfigurationAuthorityTrace(
  raw: unknown
): ConfigurationAuthorityTrace | null {
  if (!isPlainObject(raw)) return null;
  const {
    scope,
    approvalRecordId,
    rulePackId,
    rulePackVersion,
    rulePackStatus,
    rulePackSourceScope,
    dispositionSummary,
    runtimeAi,
    replacementAuthority,
    skuSubstitutionAuthority,
    unknownRelationshipsDeferred,
    attachesOpticsUnderSwitches,
  } = raw;
  if (
    scope !== "honeywell_mvp_demo_only" ||
    typeof approvalRecordId !== "string" ||
    typeof rulePackId !== "string" ||
    typeof rulePackVersion !== "string" ||
    rulePackStatus !== "approved" ||
    typeof rulePackSourceScope !== "string" ||
    !isPlainObject(dispositionSummary) ||
    typeof dispositionSummary.expandByApprovedRulePackCount !== "number" ||
    typeof dispositionSummary.preserveKnownRulePackChildCount !== "number" ||
    typeof dispositionSummary.preserveStandaloneCustomerLineCount !== "number" ||
    typeof dispositionSummary.deferUnknownRelationshipCount !== "number" ||
    runtimeAi !== false ||
    replacementAuthority !== false ||
    skuSubstitutionAuthority !== false ||
    unknownRelationshipsDeferred !== true ||
    attachesOpticsUnderSwitches !== false
  ) {
    return null;
  }
  return {
    scope,
    approvalRecordId,
    rulePackId,
    rulePackVersion,
    rulePackStatus,
    rulePackSourceScope,
    dispositionSummary: {
      expandByApprovedRulePackCount:
        dispositionSummary.expandByApprovedRulePackCount,
      preserveKnownRulePackChildCount:
        dispositionSummary.preserveKnownRulePackChildCount,
      preserveStandaloneCustomerLineCount:
        dispositionSummary.preserveStandaloneCustomerLineCount,
      deferUnknownRelationshipCount:
        dispositionSummary.deferUnknownRelationshipCount,
    },
    runtimeAi,
    replacementAuthority,
    skuSubstitutionAuthority,
    unknownRelationshipsDeferred,
    attachesOpticsUnderSwitches,
  };
}

/** Translate a known delegate/review error into a safe status, or null if unexpected. */
function translateDelegateError(
  message: string
): ReviewProjectQuickBomConfigurationExpansionDraftResult | null {
  if (message === MISSING_NORMALIZED_MESSAGE) return { status: "normalized_boq_not_found" };
  if (message === WRONG_NORMALIZED_TYPE_MESSAGE) return { status: "artifact_not_normalized_boq" };
  if (message === MISSING_SKU_MESSAGE) return { status: "sku_resolution_not_found" };
  if (message === WRONG_SKU_TYPE_MESSAGE) return { status: "artifact_not_sku_resolution" };
  if (message === INVALID_SKU_PAYLOAD_MESSAGE) return { status: "invalid_sku_resolution_payload" };
  if (message === MISMATCH_MESSAGE) return { status: "sku_resolution_normalized_boq_mismatch" };
  if (message === SKU_NOT_APPROVED_MESSAGE) return { status: "sku_resolution_not_approved" };
  if (message === RULE_PACK_NOT_APPROVED_MESSAGE) return { status: "rule_pack_not_approved" };
  if (message === DUPLICATE_DECISION_MESSAGE) return { status: "duplicate_decision" };
  if (message === UNKNOWN_LINE_MESSAGE) return { status: "decision_target_not_found" };
  if (message === CUSTOMER_LINE_DECISION_MESSAGE) return { status: "customer_line_decision" };
  if (message === MISSING_DECISION_MESSAGE) return { status: "missing_expansion_decision" };
  if (message === INVALID_ACTION_MESSAGE) return { status: "invalid_decision_action" };
  if (message === ACCEPTED_NO_RULE_MESSAGE) return { status: "accepted_line_not_traceable" };
  if (message === ACCEPTED_NO_EVIDENCE_MESSAGE) return { status: "accepted_line_not_traceable" };
  return null;
}

/**
 * Review one persisted Quick BoM configuration_expansion DRAFT artifact, tenant-scoped
 * on every store/service call. `reviewedBy` must be nonblank (a programming invariant;
 * throws "reviewedBy is required." otherwise) before any store call. It verifies the
 * Project within its tenant (not_found / wrong_mode, lean summary) and then the exact
 * draft artifact in order: configuration_expansion_draft_not_found when absent,
 * artifact_not_configuration_expansion when the wrong type, configuration_expansion_not_draft
 * when it lacks the draft marker (a reviewed/non-draft artifact),
 * configuration_expansion_draft_not_reviewable when its status is not needs_review, and
 * invalid_configuration_expansion_draft_payload when the draft payload is malformed; none
 * persist anything. For a valid draft it delegates the per-line review and the new
 * non-draft artifact version to {@link createConfigurationExpansionArtifact} - passing
 * the draft's source ids, rule-pack metadata, lines, the input decisions, reviewedBy,
 * and the loaded draft's id/version as source-draft provenance (never a reviewedAt) -
 * translating that service's known failures into safe statuses and re-throwing anything
 * unexpected. On success it returns lean, serializable summaries of the reviewed
 * artifact, its payload (no lines), and the review counts. Inputs, the draft artifact,
 * the decisions, and the delegate result are never mutated.
 */
export async function reviewProjectQuickBomConfigurationExpansionDraft(
  input: ReviewProjectQuickBomConfigurationExpansionDraftInput
): Promise<ReviewProjectQuickBomConfigurationExpansionDraftResult> {
  const { tenantId, projectId, configurationExpansionDraftArtifactId, reviewedBy, decisions } = input;

  if (isBlank(reviewedBy)) throw new Error("reviewedBy is required.");

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "quick_bom") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const draftArtifact = await getProjectArtifactById(
    tenantId,
    projectId,
    configurationExpansionDraftArtifactId
  );
  if (draftArtifact === null) {
    return { status: "configuration_expansion_draft_not_found" };
  }
  if (draftArtifact.type !== "configuration_expansion") {
    return {
      status: "artifact_not_configuration_expansion",
      artifact: toArtifactSummary(draftArtifact),
    };
  }
  if (draftArtifact.payload.payloadKind !== DRAFT_PAYLOAD_KIND) {
    return {
      status: "configuration_expansion_not_draft",
      artifact: toArtifactSummary(draftArtifact),
    };
  }
  if (draftArtifact.status !== "needs_review") {
    return {
      status: "configuration_expansion_draft_not_reviewable",
      artifact: toArtifactSummary(draftArtifact),
    };
  }

  const parsedDraft = parseDraftPayload(draftArtifact.payload);
  if (parsedDraft === null) {
    return { status: "invalid_configuration_expansion_draft_payload" };
  }

  let result: CreateConfigurationExpansionArtifactResult;
  try {
    result = await createConfigurationExpansionArtifact({
      tenantId,
      projectId,
      normalizedBoqArtifactId: parsedDraft.sourceNormalizedBoqArtifactId,
      skuResolutionArtifactId: parsedDraft.sourceSkuResolutionArtifactId,
      rulePackId: parsedDraft.rulePackId,
      rulePackVersion: parsedDraft.rulePackVersion,
      rulePackStatus: parsedDraft.rulePackStatus,
      lines: parsedDraft.lines,
      decisions,
      reviewedBy,
      sourceConfigurationExpansionDraftArtifactId: draftArtifact.id,
      sourceConfigurationExpansionDraftArtifactVersion: draftArtifact.version,
      ...(parsedDraft.configurationAuthority !== undefined
        ? { configurationAuthority: parsedDraft.configurationAuthority }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const translated = translateDelegateError(message);
    if (translated) return translated;
    throw error;
  }

  return {
    status: "ok",
    artifact: toArtifactSummary(result.artifact),
    payloadSummary: toPayloadSummary(result.payload, draftArtifact),
    reviewSummary: { ...result.reviewResult.summary },
  };
}
