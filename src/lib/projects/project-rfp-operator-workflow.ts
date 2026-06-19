/**
 * Pure UI-facing RFP operator workflow / readiness helper (Stage 4.5).
 *
 * Turns lean RFP artifact-list summaries plus persisted evidence counts into a
 * single operator workflow model: per-stage active/current artifacts, collapsed
 * review history, automatic generation inputs (artifact ids for API calls
 * only), the one next operator action, and a duplicate-draft guard per review
 * stage.
 *
 * PURE: the only import is the type-only canonical artifact-status union. It
 * reads nothing, writes nothing, and makes no runtime authority decision (no
 * AI, no lookups, no rule checks) - it only derives a view over the lean
 * inputs it is handed. Artifacts are ordered by version; the operator never
 * picks an artifact id - the model derives the latest approved upstream ids by
 * itself so future UI can call generation routes without a selection model.
 */
import type { ProjectArtifactStatus } from "@/types/project";

/** Statuses still open to a human review decision (a reviewable draft). */
const REVIEWABLE_STATUSES: readonly ProjectArtifactStatus[] = [
  "needs_review",
  "generated",
];

/** Lean artifact-list summary the helper needs: id, status, version only. */
export interface RfpArtifactSummaryInput {
  id: string;
  status: ProjectArtifactStatus;
  version: number;
}

/** Extraction-delta summary adds the review tallies from its payload summary. */
export interface RfpExtractionDeltaSummaryInput extends RfpArtifactSummaryInput {
  payloadSummary?: {
    candidateCount?: number;
    pendingCount?: number;
    acceptedCount?: number;
    rejectedCount?: number;
    waivedCount?: number;
  };
}

/** Persisted evidence counts from the read-only evidence list. */
export interface RfpPersistedEvidenceInput {
  evidenceCount?: number;
  textChunkCount?: number;
  tableEvidenceCount?: number;
}

/** All lean inputs; every list defaults to empty when omitted. */
export interface RfpOperatorWorkflowInput {
  /** Files staged for the first input package (no input package yet). */
  uploadedFileCount?: number;
  inputPackages?: readonly RfpArtifactSummaryInput[];
  extractionDeltas?: readonly RfpExtractionDeltaSummaryInput[];
  evidencePackages?: readonly RfpArtifactSummaryInput[];
  requirementsBaselines?: readonly RfpArtifactSummaryInput[];
  complianceMatrices?: readonly RfpArtifactSummaryInput[];
  configurationExpansions?: readonly RfpArtifactSummaryInput[];
  evidence?: RfpPersistedEvidenceInput;
}

/** Why an artifact sits in collapsed review history, not the active flow. */
export type RfpHistoryReason =
  | "older"
  | "stale"
  | "rejected"
  | "failed"
  | "not_applicable"
  | "superseded_approved";

/** Extraction-delta accepted/rejected/waived tallies for history visibility. */
export interface RfpExtractionDeltaReviewCounts {
  candidateCount: number;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  waivedCount: number;
}

/** One artifact version's resolved workflow state. */
export interface RfpArtifactState {
  id: string;
  version: number;
  status: ProjectArtifactStatus;
  reviewable: boolean;
  approved: boolean;
  /** Stays true after approval so it remains inspectable, never hidden. */
  inspectable: boolean;
  /** Extraction-delta review tallies; undefined for other artifact types. */
  reviewCounts?: RfpExtractionDeltaReviewCounts;
}

/** A history entry: an artifact state plus why it left the active flow. */
export interface RfpArtifactHistoryEntry extends RfpArtifactState {
  reason: RfpHistoryReason;
}

/** Duplicate-draft guard: continue an open draft vs start a new one. */
export type RfpPrimaryActionHint = "continue_review" | "create_draft";

/** One review stage: featured current/approved artifacts plus its history. */
export interface RfpArtifactTrack {
  /** Highest-version reviewable draft (needs_review or generated). */
  current?: RfpArtifactState;
  /** Highest-version approved artifact. */
  latestApproved?: RfpArtifactState;
  /** The artifact to act on: current, else latest approved. */
  active?: RfpArtifactState;
  /** Older, stale, rejected, failed, not_applicable, superseded versions. */
  history: RfpArtifactHistoryEntry[];
  /** Continue the open draft rather than create a duplicate when one exists. */
  primaryActionHint: RfpPrimaryActionHint;
}

/** Automatic requirements-generation inputs (ids for the API call only). */
export interface RfpRequirementsGenerationInputs {
  evidencePackageArtifactId?: string;
  ready: boolean;
}

/** Automatic compliance-generation inputs (ids for the API call only). */
export interface RfpComplianceGenerationInputs {
  requirementsBaselineArtifactId?: string;
  evidencePackageArtifactId?: string;
  configurationExpansionArtifactId?: string;
  ready: boolean;
}

/** All automatic generation inputs; never an engineer-facing selection model. */
export interface RfpGenerationInputs {
  requirementsBaseline: RfpRequirementsGenerationInputs;
  complianceMatrix: RfpComplianceGenerationInputs;
}

/** Persisted evidence readiness derived from the evidence list counts. */
export interface RfpPersistedEvidenceStatus {
  evidenceCount: number;
  textChunkCount: number;
  tableEvidenceCount: number;
  hasPersistedEvidence: boolean;
}

/** Operator-facing stage grouping for the next action. */
export type RfpOperatorStage =
  | "input_package"
  | "evidence"
  | "requirements"
  | "compliance"
  | "stage_5";

/** Stable next-action identifiers across the RFP operator flow. */
export type RfpNextActionId =
  | "upload_files"
  | "create_input_package"
  | "review_input_package"
  | "prepare_evidence_review"
  | "review_evidence_package"
  | "generate_requirements_baseline"
  | "review_requirements_baseline"
  | "generate_compliance_matrix"
  | "review_compliance_matrix"
  | "stage_5_ready";

/** The single next operator action; operator-facing, never id-facing. */
export interface RfpOperatorNextAction {
  id: RfpNextActionId;
  stage: RfpOperatorStage;
  label: string;
  reason: string;
}

/** The full operator workflow model future RFP UI prompts render. */
export interface RfpOperatorWorkflow {
  inputPackage: RfpArtifactTrack;
  extractionDelta: RfpArtifactTrack;
  evidencePackage: RfpArtifactTrack;
  requirementsBaseline: RfpArtifactTrack;
  complianceMatrix: RfpArtifactTrack;
  configurationExpansion?: RfpArtifactTrack;
  evidence: RfpPersistedEvidenceStatus;
  generationInputs: RfpGenerationInputs;
  nextAction: RfpOperatorNextAction;
}

function isReviewable(status: ProjectArtifactStatus): boolean {
  return REVIEWABLE_STATUSES.includes(status);
}

/** Highest-version item matching the predicate, or undefined. */
function highestVersion<T extends RfpArtifactSummaryInput>(
  items: readonly T[],
  predicate: (item: T) => boolean
): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    if (!predicate(item)) continue;
    if (best === undefined || item.version > best.version) best = item;
  }
  return best;
}

/** Extraction-delta tallies when the summary carries them; else undefined. */
function toReviewCounts(
  item: RfpArtifactSummaryInput
): RfpExtractionDeltaReviewCounts | undefined {
  const summary = (item as RfpExtractionDeltaSummaryInput).payloadSummary;
  if (summary === undefined) return undefined;
  return {
    candidateCount: summary.candidateCount ?? 0,
    pendingCount: summary.pendingCount ?? 0,
    acceptedCount: summary.acceptedCount ?? 0,
    rejectedCount: summary.rejectedCount ?? 0,
    waivedCount: summary.waivedCount ?? 0,
  };
}

function toState(item: RfpArtifactSummaryInput): RfpArtifactState {
  const reviewCounts = toReviewCounts(item);
  return {
    id: item.id,
    version: item.version,
    status: item.status,
    reviewable: isReviewable(item.status),
    approved: item.status === "approved",
    inspectable: item.status !== "missing",
    ...(reviewCounts !== undefined ? { reviewCounts } : {}),
  };
}

function historyReason(status: ProjectArtifactStatus): RfpHistoryReason {
  if (status === "approved") return "superseded_approved";
  if (status === "stale") return "stale";
  if (status === "rejected") return "rejected";
  if (status === "failed") return "failed";
  if (status === "not_applicable") return "not_applicable";
  return "older";
}

/**
 * Resolve one artifact type's summaries into a track. The featured current
 * (highest reviewable) and latest approved versions are surfaced separately;
 * everything else falls to collapsed history, newest version first. Approved
 * versions stay inspectable so they are never hidden once the flow moves on.
 */
function buildTrack(items: readonly RfpArtifactSummaryInput[]): RfpArtifactTrack {
  const current = highestVersion(items, (i) => isReviewable(i.status));
  const latestApproved = highestVersion(items, (i) => i.status === "approved");
  const featured = new Set<string>();
  if (current !== undefined) featured.add(current.id);
  if (latestApproved !== undefined) featured.add(latestApproved.id);
  const history = items
    .filter((i) => !featured.has(i.id))
    .slice()
    .sort((a, b) => b.version - a.version)
    .map((i) => ({ ...toState(i), reason: historyReason(i.status) }));
  const active = current ?? latestApproved;
  return {
    ...(current !== undefined ? { current: toState(current) } : {}),
    ...(latestApproved !== undefined
      ? { latestApproved: toState(latestApproved) }
      : {}),
    ...(active !== undefined ? { active: toState(active) } : {}),
    history,
    primaryActionHint:
      current !== undefined ? "continue_review" : "create_draft",
  };
}

/**
 * Derive automatic generation inputs. Requirements drafting auto-uses the
 * latest approved evidence package; compliance drafting auto-uses the latest
 * approved requirements baseline and evidence package, plus the optional
 * approved configuration expansion. These ids feed API calls only.
 */
function buildGenerationInputs(
  evidencePackage: RfpArtifactTrack,
  requirementsBaseline: RfpArtifactTrack,
  configurationExpansion: RfpArtifactTrack | undefined
): RfpGenerationInputs {
  const evidenceId = evidencePackage.latestApproved?.id;
  const requirementsId = requirementsBaseline.latestApproved?.id;
  const configId = configurationExpansion?.latestApproved?.id;
  return {
    requirementsBaseline: {
      ...(evidenceId !== undefined
        ? { evidencePackageArtifactId: evidenceId }
        : {}),
      ready: evidenceId !== undefined,
    },
    complianceMatrix: {
      ...(requirementsId !== undefined
        ? { requirementsBaselineArtifactId: requirementsId }
        : {}),
      ...(evidenceId !== undefined
        ? { evidencePackageArtifactId: evidenceId }
        : {}),
      ...(configId !== undefined
        ? { configurationExpansionArtifactId: configId }
        : {}),
      ready: requirementsId !== undefined && evidenceId !== undefined,
    },
  };
}

/**
 * The single next operator action. Each stage prefers reviewing an open draft,
 * then advancing once the prior gate is approved. A reviewable draft is always
 * "continue review", never "create another".
 */
function buildNextAction(
  inputPackage: RfpArtifactTrack,
  evidencePackage: RfpArtifactTrack,
  requirementsBaseline: RfpArtifactTrack,
  complianceMatrix: RfpArtifactTrack,
  uploadedFileCount: number
): RfpOperatorNextAction {
  if (inputPackage.current !== undefined) {
    return {
      id: "review_input_package",
      stage: "input_package",
      label: "Review input package",
      reason: "An input package draft is awaiting your review.",
    };
  }
  if (inputPackage.latestApproved === undefined) {
    if (uploadedFileCount > 0) {
      return {
        id: "create_input_package",
        stage: "input_package",
        label: "Create input package",
        reason: "Uploaded files are ready to assemble into an input package.",
      };
    }
    return {
      id: "upload_files",
      stage: "input_package",
      label: "Upload RFP files",
      reason: "Upload the RFP documents to begin.",
    };
  }
  if (evidencePackage.current !== undefined) {
    return {
      id: "review_evidence_package",
      stage: "evidence",
      label: "Review evidence package",
      reason: "A final evidence package draft is awaiting your review.",
    };
  }
  if (evidencePackage.latestApproved === undefined) {
    return {
      id: "prepare_evidence_review",
      stage: "evidence",
      label: "Prepare evidence review",
      reason: "Extract and assemble the evidence package for review.",
    };
  }
  if (requirementsBaseline.current !== undefined) {
    return {
      id: "review_requirements_baseline",
      stage: "requirements",
      label: "Review requirements baseline",
      reason: "A requirements baseline draft is awaiting your review.",
    };
  }
  if (requirementsBaseline.latestApproved === undefined) {
    return {
      id: "generate_requirements_baseline",
      stage: "requirements",
      label: "Generate requirements baseline",
      reason: "Draft the requirements baseline from the approved evidence package.",
    };
  }
  if (complianceMatrix.current !== undefined) {
    return {
      id: "review_compliance_matrix",
      stage: "compliance",
      label: "Review compliance matrix",
      reason: "A compliance matrix draft is awaiting your review.",
    };
  }
  if (complianceMatrix.latestApproved === undefined) {
    return {
      id: "generate_compliance_matrix",
      stage: "compliance",
      label: "Generate compliance matrix",
      reason: "Draft the compliance matrix from the approved baseline and evidence.",
    };
  }
  return {
    id: "stage_5_ready",
    stage: "stage_5",
    label: "Ready for Stage 5",
    reason: "All RFP review gates are approved.",
  };
}

/**
 * Build the operator workflow model from lean RFP list/readiness inputs. Pure:
 * derives active/current state, collapsed history, automatic generation inputs,
 * and the next action without reading or writing anything.
 */
export function buildRfpOperatorWorkflow(
  input: RfpOperatorWorkflowInput
): RfpOperatorWorkflow {
  const inputPackage = buildTrack(input.inputPackages ?? []);
  const extractionDelta = buildTrack(input.extractionDeltas ?? []);
  const evidencePackage = buildTrack(input.evidencePackages ?? []);
  const requirementsBaseline = buildTrack(input.requirementsBaselines ?? []);
  const complianceMatrix = buildTrack(input.complianceMatrices ?? []);
  const configurationExpansion =
    input.configurationExpansions !== undefined
      ? buildTrack(input.configurationExpansions)
      : undefined;

  const evidenceCount = input.evidence?.evidenceCount ?? 0;
  const evidence: RfpPersistedEvidenceStatus = {
    evidenceCount,
    textChunkCount: input.evidence?.textChunkCount ?? 0,
    tableEvidenceCount: input.evidence?.tableEvidenceCount ?? 0,
    hasPersistedEvidence: evidenceCount > 0,
  };

  return {
    inputPackage,
    extractionDelta,
    evidencePackage,
    requirementsBaseline,
    complianceMatrix,
    ...(configurationExpansion !== undefined ? { configurationExpansion } : {}),
    evidence,
    generationInputs: buildGenerationInputs(
      evidencePackage,
      requirementsBaseline,
      configurationExpansion
    ),
    nextAction: buildNextAction(
      inputPackage,
      evidencePackage,
      requirementsBaseline,
      complianceMatrix,
      input.uploadedFileCount ?? 0
    ),
  };
}
