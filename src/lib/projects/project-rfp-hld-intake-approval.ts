/**
 * RFP HLD intake review/approval service (Stage 6.2b).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Records one approve/reject decision against the EXACT `hld_intake` artifact
 * version named by the caller. It loads the Project and the exact artifact, gates
 * on rfp mode, the hld_intake type within the hld_design_delta_review stage, and
 * reviewable status, then persists exactly one approval via createProjectApproval
 * (its only mutation; it never creates an artifact version).
 *
 * Because the approved intake becomes design-readiness authority, APPROVAL also
 * re-validates the exact persisted payload before recording - manual_override
 * against the local field catalog, questionnaire_assisted against its persisted
 * source/review audit block and answer correspondence. Checking artifact
 * type/status is not enough. A REJECTION may be recorded even when the payload is
 * malformed (rejecting bad intake is the point). This service runs no AI and makes
 * no SKU/pricing/catalog/validation/config/design decision: it imports the project
 * store, the artifact store, the approval store, the pure approval helper, and the
 * local HLD intake contract only - no file/evidence store, no fs/path, no route or
 * UI module. Summaries are lean and serializable (ISO dates, copied arrays, no
 * payload, no tenantId).
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import {
  RFP_HLD_INTAKE_FIELDS,
  RFP_HLD_INTAKE_PAYLOAD_KIND,
} from "@/lib/projects/project-rfp-hld-intake";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

/** The only artifact type / stage this RFP review path may approve or reject. */
const HLD_INTAKE_ARTIFACT_TYPE: ProjectArtifact["type"] = "hld_intake";
const HLD_INTAKE_STAGE_ID: ProjectArtifact["stageId"] =
  "hld_design_delta_review";
const HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND = "rfp_hld_intake_questionnaire";

/** The exact keys a normalized persisted payload / answer may carry. */
const ALLOWED_PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  "payloadKind",
  "createdBy",
  "createdAt",
  "sourceMode",
  "manualOverrideReason",
  "sourceQuestionnaireArtifactId",
  "questionnaireReview",
  "answers",
  "answerCount",
  "statusCounts",
]);
const ALLOWED_ANSWER_KEYS: ReadonlySet<string> = new Set([
  "fieldId",
  "label",
  "status",
  "value",
  "notes",
]);

/** Closed-shape key sets and vocabularies for the questionnaire audit block. */
const ALLOWED_REVIEW_KEYS: ReadonlySet<string> = new Set([
  "sourceQuestionnaireArtifactId",
  "sourceQuestionnaireVersion",
  "questionnairePayloadKind",
  "reviewedQuestions",
  "counts",
]);
const ALLOWED_REVIEWED_QUESTION_KEYS: ReadonlySet<string> = new Set([
  "questionId",
  "action",
  "sourceQuestionId",
  "order",
  "questionText",
  "whyAsked",
  "answerType",
  "required",
  "sourceRefIds",
  "allowedOptions",
  "waiverReason",
]);
const ALLOWED_COUNTS_KEYS: readonly string[] = [
  "accepted",
  "edited",
  "added",
  "removed",
  "waived",
  "active",
];
const REVIEW_ACTIONS: ReadonlySet<string> = new Set([
  "accepted",
  "edited",
  "added",
  "removed",
  "waived",
]);
const ACTIVE_REVIEW_ACTIONS: ReadonlySet<string> = new Set([
  "accepted",
  "edited",
  "added",
]);
const QUESTIONNAIRE_ANSWER_TYPES: ReadonlySet<string> = new Set([
  "free_text",
  "single_select",
  "multi_select",
  "boolean",
  "number",
]);
const SELECT_ANSWER_TYPES: ReadonlySet<string> = new Set([
  "single_select",
  "multi_select",
]);

/** Input for {@link reviewRfpHldIntakeArtifact}. */
export interface ReviewRfpHldIntakeArtifactInput {
  tenantId: string;
  projectId: string;
  /** The exact artifact version under review; identity is this id only. */
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  /** Defaults to now downstream (via the materializer) when omitted. */
  decidedAt?: Date;
  note?: string;
}

/** Lean serializable project projection returned on wrong_mode; no tenantId. */
export interface RfpHldIntakeReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpHldIntakeReviewArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Discriminated result of {@link reviewRfpHldIntakeArtifact}. */
export type ReviewRfpHldIntakeArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldIntakeReviewProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_intake";
      artifact: RfpHldIntakeReviewArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: RfpHldIntakeReviewArtifactSummary;
    }
  | {
      status: "invalid_hld_intake_payload";
      artifact: RfpHldIntakeReviewArtifactSummary;
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      /** Pre-approval summary of the exact reviewed artifact version. */
      artifact: RfpHldIntakeReviewArtifactSummary;
    };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonblankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function toProjectSummary(project: Project): RfpHldIntakeReviewProjectSummary {
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

function toArtifactSummary(
  artifact: ProjectArtifact
): RfpHldIntakeReviewArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: artifact.sourceFileIds.slice(),
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** Validate one persisted answer's closed shape and status/value/notes rules. */
function isValidAnswerShape(answer: unknown): answer is Record<string, unknown> {
  if (!isPlainRecord(answer)) return false;
  for (const key of Object.keys(answer)) {
    if (!ALLOWED_ANSWER_KEYS.has(key)) return false;
  }
  const status = answer.status;
  if (status !== "answered" && status !== "unknown" && status !== "not_applicable") {
    return false;
  }
  if (status === "answered") {
    if (!isNonblankString(answer.value)) return false;
  } else if ("value" in answer) {
    return false;
  }
  if ("notes" in answer && !isNonblankString(answer.notes)) return false;
  return true;
}

/** A persisted array of unique nonblank strings; nonempty unless allowed empty. */
function isValidStringArray(raw: unknown, allowEmpty: boolean): boolean {
  if (!Array.isArray(raw)) return false;
  if (!allowEmpty && raw.length === 0) return false;
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isNonblankString(item) || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

/**
 * Re-validate a persisted manual_override payload against the local field
 * catalog: the normalized shape produced by the creation contract is the only
 * acceptable input for an approval. Returns false on any deviation.
 */
function isValidManualPayload(payload: Record<string, unknown>): boolean {
  if (!isNonblankString(payload.manualOverrideReason)) return false;
  if ("sourceQuestionnaireArtifactId" in payload) return false;
  if ("questionnaireReview" in payload) return false;

  const answers = payload.answers;
  if (!Array.isArray(answers)) return false;
  if (answers.length !== RFP_HLD_INTAKE_FIELDS.length) return false;
  if (payload.answerCount !== RFP_HLD_INTAKE_FIELDS.length) return false;

  const counts = { answered: 0, unknown: 0, not_applicable: 0 };
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i];
    if (!isValidAnswerShape(answer)) return false;
    // Canonical order also proves every catalog field appears exactly once.
    const field = RFP_HLD_INTAKE_FIELDS[i];
    if (answer.fieldId !== field.fieldId) return false;
    if (answer.label !== field.label) return false;
    counts[answer.status as keyof typeof counts] += 1;
  }

  return statusCountsMatch(payload.statusCounts, counts);
}

/** The persisted statusCounts object exactly matches the recomputed tally. */
function statusCountsMatch(
  statusCounts: unknown,
  counts: { answered: number; unknown: number; not_applicable: number }
): boolean {
  if (!isPlainRecord(statusCounts)) return false;
  if (Object.keys(statusCounts).length !== 3) return false;
  return (
    statusCounts.answered === counts.answered &&
    statusCounts.unknown === counts.unknown &&
    statusCounts.not_applicable === counts.not_applicable
  );
}

/**
 * Re-validate a persisted questionnaire_assisted payload's internal consistency:
 * the source id / audit block / reviewed decisions / counts and the answers'
 * correspondence to the active reviewed questions. This does NOT re-load the
 * source questionnaire; it checks only that the persisted block is self-consistent
 * and that sourceArtifactIds is exactly the recorded source id.
 */
function isValidQuestionnairePayload(
  payload: Record<string, unknown>,
  sourceArtifactIds: readonly string[]
): boolean {
  const sourceId = payload.sourceQuestionnaireArtifactId;
  if (!isNonblankString(sourceId)) return false;
  if ("manualOverrideReason" in payload) return false;
  if (sourceArtifactIds.length !== 1 || sourceArtifactIds[0] !== sourceId) {
    return false;
  }

  const review = payload.questionnaireReview;
  if (!isPlainRecord(review)) return false;
  for (const key of Object.keys(review)) {
    if (!ALLOWED_REVIEW_KEYS.has(key)) return false;
  }
  if (review.sourceQuestionnaireArtifactId !== sourceId) return false;
  if (
    typeof review.sourceQuestionnaireVersion !== "number" ||
    !Number.isInteger(review.sourceQuestionnaireVersion) ||
    review.sourceQuestionnaireVersion < 1
  ) {
    return false;
  }
  if (review.questionnairePayloadKind !== HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND) {
    return false;
  }

  const reviewedQuestions = review.reviewedQuestions;
  if (!Array.isArray(reviewedQuestions) || reviewedQuestions.length === 0) {
    return false;
  }

  const seenQuestionIds = new Set<string>();
  const seenSourceIds = new Set<string>();
  const activeOrders = new Set<number>();
  const activeText = new Map<string, string>();
  const tally: Record<string, number> = {
    accepted: 0,
    edited: 0,
    added: 0,
    removed: 0,
    waived: 0,
    active: 0,
  };

  for (const q of reviewedQuestions) {
    if (!isPlainRecord(q)) return false;
    for (const key of Object.keys(q)) {
      if (!ALLOWED_REVIEWED_QUESTION_KEYS.has(key)) return false;
    }
    const questionId = q.questionId;
    if (!isNonblankString(questionId) || seenQuestionIds.has(questionId)) {
      return false;
    }
    seenQuestionIds.add(questionId);

    const action = q.action;
    if (typeof action !== "string" || !REVIEW_ACTIONS.has(action)) return false;
    if (!isNonblankString(q.questionText)) return false;
    if (!isNonblankString(q.whyAsked)) return false;
    const answerType = q.answerType;
    if (typeof answerType !== "string" || !QUESTIONNAIRE_ANSWER_TYPES.has(answerType)) {
      return false;
    }
    if (typeof q.required !== "boolean") return false;

    const isAdded = action === "added";
    if (isAdded) {
      if ("sourceQuestionId" in q) return false;
    } else {
      const sourceQuestionId = q.sourceQuestionId;
      if (!isNonblankString(sourceQuestionId) || seenSourceIds.has(sourceQuestionId)) {
        return false;
      }
      seenSourceIds.add(sourceQuestionId);
    }

    if (!isValidStringArray(q.sourceRefIds, isAdded)) return false;

    if (SELECT_ANSWER_TYPES.has(answerType)) {
      if (!isValidStringArray(q.allowedOptions, false)) return false;
    } else if ("allowedOptions" in q) {
      return false;
    }

    const isActive = ACTIVE_REVIEW_ACTIONS.has(action);
    if (isActive) {
      if (!isPositiveInteger(q.order) || activeOrders.has(q.order)) return false;
      activeOrders.add(q.order);
      if ("waiverReason" in q) return false;
      activeText.set(questionId, q.questionText);
    } else {
      if ("order" in q) return false;
      if (action === "waived") {
        if (!isNonblankString(q.waiverReason)) return false;
      } else if ("waiverReason" in q) {
        return false;
      }
    }

    tally[action] += 1;
    if (isActive) tally.active += 1;
  }

  const counts = review.counts;
  if (!isPlainRecord(counts)) return false;
  if (Object.keys(counts).length !== ALLOWED_COUNTS_KEYS.length) return false;
  for (const key of ALLOWED_COUNTS_KEYS) {
    if (counts[key] !== tally[key]) return false;
  }

  // Answers must be a bijection onto the active reviewed questions.
  const answers = payload.answers;
  if (!Array.isArray(answers)) return false;
  if (answers.length !== activeText.size) return false;
  if (payload.answerCount !== answers.length) return false;

  const seenAnswerIds = new Set<string>();
  const statusCounts = { answered: 0, unknown: 0, not_applicable: 0 };
  for (const answer of answers) {
    if (!isValidAnswerShape(answer)) return false;
    const fieldId = answer.fieldId;
    if (!isNonblankString(fieldId) || seenAnswerIds.has(fieldId)) return false;
    const label = activeText.get(fieldId);
    if (label === undefined) return false; // not an active reviewed question
    if (answer.label !== label) return false;
    seenAnswerIds.add(fieldId);
    statusCounts[answer.status as keyof typeof statusCounts] += 1;
  }

  return statusCountsMatch(payload.statusCounts, statusCounts);
}

/**
 * Re-validate the EXACT persisted payload before an approval. Dispatches on the
 * recorded sourceMode: manual_override checks the fixed field catalog;
 * questionnaire_assisted checks the audit block and answer correspondence, keyed
 * to the artifact's sourceArtifactIds. Returns false (deterministic, content
 * never leaked) on any deviation. This is the design-authority gate, not a type
 * check.
 */
function isPersistedHldIntakePayloadValid(
  payload: unknown,
  sourceArtifactIds: readonly string[]
): boolean {
  if (!isPlainRecord(payload)) return false;
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) return false;
  }
  if (payload.payloadKind !== RFP_HLD_INTAKE_PAYLOAD_KIND) return false;

  const sourceMode = payload.sourceMode;
  if (sourceMode === "manual_override") return isValidManualPayload(payload);
  if (sourceMode === "questionnaire_assisted") {
    return isValidQuestionnairePayload(payload, sourceArtifactIds);
  }
  return false;
}

/**
 * Review (approve/reject) one EXACT hld_intake artifact version, tenant scoped on
 * every store call. Validates nonblank artifactId then decidedBy before any store
 * call. Gates in order: project existence, rfp mode, exact artifact existence,
 * hld_intake type in the hld_design_delta_review stage, reviewable status. An
 * APPROVAL additionally re-validates the exact persisted payload (blocking with
 * invalid_hld_intake_payload, content never leaked); a REJECTION skips that gate
 * so malformed intake can still be rejected. On a passing path it persists
 * exactly one approval (the only mutation) and returns the approval, the
 * post-decision artifact/stage statuses, and the pre-approval artifact summary.
 * Unexpected errors bubble; only a null createProjectApproval maps to
 * approval_failed.
 */
export async function reviewRfpHldIntakeArtifact(
  input: ReviewRfpHldIntakeArtifactInput
): Promise<ReviewRfpHldIntakeArtifactResult> {
  if (!input.artifactId || input.artifactId.trim() === "") {
    throw new Error("artifactId is required.");
  }
  if (!input.decidedBy || input.decidedBy.trim() === "") {
    throw new Error("decidedBy is required.");
  }

  const { tenantId, projectId, artifactId, decision, decidedBy } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) return { status: "artifact_not_found" };
  if (
    artifact.type !== HLD_INTAKE_ARTIFACT_TYPE ||
    artifact.stageId !== HLD_INTAKE_STAGE_ID
  ) {
    return {
      status: "artifact_not_hld_intake",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (!isArtifactReviewable(artifact)) {
    return {
      status: "artifact_not_reviewable",
      artifact: toArtifactSummary(artifact),
    };
  }

  // Approving promotes the intake to design-readiness authority, so the exact
  // persisted payload must re-validate. Rejection needs no such gate.
  if (
    decision === "approved" &&
    !isPersistedHldIntakePayloadValid(artifact.payload, artifact.sourceArtifactIds)
  ) {
    return {
      status: "invalid_hld_intake_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  // Captured before the approval transitions statuses.
  const artifactSummary = toArtifactSummary(artifact);

  const created = await createProjectApproval({
    tenantId,
    projectId,
    artifactId: artifact.id,
    decision,
    decidedBy,
    ...(input.decidedAt !== undefined ? { decidedAt: input.decidedAt } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  });
  if (created === null) return { status: "approval_failed" };

  return {
    status: "ok",
    approval: created.approval,
    artifactStatus: created.artifactStatus,
    stageStatus: created.stageStatus,
    artifact: artifactSummary,
  };
}
