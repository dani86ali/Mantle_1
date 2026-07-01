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
 * re-validates the exact persisted payload against the local field catalog before
 * recording - checking artifact type/status is not enough. A REJECTION may be
 * recorded even when the payload is malformed (rejecting bad intake is the point).
 * This service runs no AI and makes no SKU/pricing/catalog/validation/config/
 * design decision: it imports the project store, the artifact store, the approval
 * store, the pure approval helper, and the local HLD intake contract only - no
 * file/evidence store, no fs/path, no route or UI module. Summaries are lean and
 * serializable (ISO dates, copied arrays, no payload, no tenantId).
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

/** The exact keys a normalized persisted payload / answer may carry. */
const ALLOWED_PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  "payloadKind",
  "createdBy",
  "createdAt",
  "sourceMode",
  "manualOverrideReason",
  "sourceQuestionnaireArtifactId",
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

/**
 * Re-validate the EXACT persisted payload against the local field catalog: the
 * normalized shape produced by the creation contract is the only acceptable
 * input for an approval. Returns false (deterministic, content never leaked) on
 * any deviation - tampered, reordered, mislabeled, miscounted, or carrying
 * unexpected keys. This is the design-authority gate, not a type check.
 */
function isPersistedHldIntakePayloadValid(payload: unknown): boolean {
  if (!isPlainRecord(payload)) return false;
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) return false;
  }
  if (payload.payloadKind !== RFP_HLD_INTAKE_PAYLOAD_KIND) return false;

  // Source-mode contract: the approved intake must record how it was sourced, and
  // the matching source field must be present with no cross-mode field leaking in.
  const sourceMode = payload.sourceMode;
  if (sourceMode === "manual_override") {
    if (!isNonblankString(payload.manualOverrideReason)) return false;
    if ("sourceQuestionnaireArtifactId" in payload) return false;
  } else if (sourceMode === "questionnaire_assisted") {
    if (!isNonblankString(payload.sourceQuestionnaireArtifactId)) return false;
    if ("manualOverrideReason" in payload) return false;
  } else {
    return false;
  }

  const answers = payload.answers;
  if (!Array.isArray(answers)) return false;
  if (answers.length !== RFP_HLD_INTAKE_FIELDS.length) return false;
  if (payload.answerCount !== RFP_HLD_INTAKE_FIELDS.length) return false;

  const counts = { answered: 0, unknown: 0, not_applicable: 0 };
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i];
    if (!isPlainRecord(answer)) return false;
    for (const key of Object.keys(answer)) {
      if (!ALLOWED_ANSWER_KEYS.has(key)) return false;
    }
    // Canonical order also proves every catalog field appears exactly once.
    const field = RFP_HLD_INTAKE_FIELDS[i];
    if (answer.fieldId !== field.fieldId) return false;
    if (answer.label !== field.label) return false;

    const status = answer.status;
    if (
      status !== "answered" &&
      status !== "unknown" &&
      status !== "not_applicable"
    ) {
      return false;
    }
    if (status === "answered") {
      if (!isNonblankString(answer.value)) return false;
    } else if ("value" in answer) {
      return false;
    }
    if ("notes" in answer && !isNonblankString(answer.notes)) return false;
    counts[status] += 1;
  }

  const statusCounts = payload.statusCounts;
  if (!isPlainRecord(statusCounts)) return false;
  if (Object.keys(statusCounts).length !== 3) return false;
  if (statusCounts.answered !== counts.answered) return false;
  if (statusCounts.unknown !== counts.unknown) return false;
  if (statusCounts.not_applicable !== counts.not_applicable) return false;

  return true;
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
    !isPersistedHldIntakePayloadValid(artifact.payload)
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
