/**
 * Tenant-scoped RFP HLD design-model REBUILD REQUEST service (Stage 6E-B).
 *
 * Creates exactly ONE bounded `hld_design_model_rebuild_request` artifact (status
 * `needs_review`) on the existing `hld_design_delta_review` stage. The request is
 * metadata only: it records an engineer's bounded ask to redraft a candidate
 * `hld_design_model` after its advisory `hld_design_model_review`. It does NOT
 * execute a rebuild, call any provider/model, read any raw RFP/PDF/DOCX/XLSX file
 * or storage path, parse documents, price, resolve SKUs, or make any
 * catalog/configuration/design decision. It carries no design authority.
 *
 * The flow is fail-closed: verify the project within its tenant, load the source
 * model artifact (must be hld_design_model on the right stage and reviewable),
 * load the source review artifact (must be hld_design_model_review on the right
 * stage, validate, and reference the SAME source model), enforce at most one
 * active rebuild request per source model, build the bounded payload from the
 * trusted ids + bounded engineer text, HARD-GATE it with the contract validator
 * BEFORE any write, and persist exactly one artifact. Only lean, serializable
 * summaries are returned - never a payload body or the tenant id.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import { validateRfpHldDesignModelReviewPayload } from "@/lib/projects/project-rfp-hld-design-model-review";
import {
  RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
  validateRfpHldDesignModelRebuildRequestPayload,
  type RfpHldDesignModelRebuildRequestPayload,
} from "@/lib/projects/project-rfp-hld-design-model-rebuild-request";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

const HLD_STAGE: ProjectStageId = "hld_design_delta_review";
const MODEL_TYPE: ProjectArtifactType = "hld_design_model";
const REVIEW_TYPE: ProjectArtifactType = "hld_design_model_review";
const REQUEST_TYPE: ProjectArtifactType = "hld_design_model_rebuild_request";

/** Artifact statuses that retire a prior rebuild request (no longer "active"). */
const RETIRED_REQUEST_STATUSES: ReadonlySet<ProjectArtifactStatus> = new Set<ProjectArtifactStatus>([
  "stale",
  "rejected",
  "failed",
]);

// ---------------------------------------------------------------------------
// Result + summary shapes (lean, serializable, never carry a payload / tenant)
// ---------------------------------------------------------------------------

export interface RfpHldDesignModelRebuildRequestProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDesignModelRebuildRequestArtifactSummary {
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

export interface CreateRfpHldDesignModelRebuildRequestInput {
  tenantId: string;
  projectId: string;
  sourceHldDesignModelArtifactId: string;
  sourceReviewArtifactId: string;
  requestedBy: string;
  reason: string;
  instructions: string;
  /** Optional fixed timestamp for deterministic callers/tests; defaults to now. */
  requestedAt?: Date;
}

export type CreateRfpHldDesignModelRebuildRequestResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDesignModelRebuildRequestProjectSummary }
  | { status: "invalid_source_model" }
  | { status: "invalid_review" }
  | {
      status: "active_request_exists";
      artifact: RfpHldDesignModelRebuildRequestArtifactSummary;
    }
  | { status: "invalid_request_payload"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpHldDesignModelRebuildRequestArtifactSummary;
    };

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toProjectSummary(
  project: Project
): RfpHldDesignModelRebuildRequestProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(
  artifact: ProjectArtifact
): RfpHldDesignModelRebuildRequestArtifactSummary {
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

/** True if `model` is a reviewable source model on the HLD stage of this project. */
function isUsableSourceModel(model: ProjectArtifact | null, projectId: string): boolean {
  return (
    model !== null &&
    model.projectId === projectId &&
    model.type === MODEL_TYPE &&
    model.stageId === HLD_STAGE &&
    isArtifactReviewable(model)
  );
}

/**
 * True if `review` is a valid `hld_design_model_review` on the HLD stage of this
 * project whose payload references the SAME source model.
 */
function isUsableReview(
  review: ProjectArtifact | null,
  projectId: string,
  modelId: string
): boolean {
  if (
    review === null ||
    review.projectId !== projectId ||
    review.type !== REVIEW_TYPE ||
    review.stageId !== HLD_STAGE
  ) {
    return false;
  }
  if (!validateRfpHldDesignModelReviewPayload(review.payload).valid) return false;
  return str(review.payload.sourceHldDesignModelArtifactId) === modelId;
}

/**
 * The existing active rebuild request for this source model, or null. Active =
 * not stale/rejected/failed, with a valid payload whose status is `active` and
 * whose sourceHldDesignModelArtifactId matches.
 */
function findActiveRequest(
  artifacts: readonly ProjectArtifact[],
  modelId: string
): ProjectArtifact | null {
  for (const a of artifacts) {
    if (a.type !== REQUEST_TYPE) continue;
    if (RETIRED_REQUEST_STATUSES.has(a.status)) continue;
    if (!validateRfpHldDesignModelRebuildRequestPayload(a.payload).valid) continue;
    if (a.payload.status !== "active") continue;
    if (str(a.payload.sourceHldDesignModelArtifactId) !== modelId) continue;
    return a;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Create exactly ONE bounded `needs_review` `hld_design_model_rebuild_request` on
 * the `hld_design_delta_review` stage, tenant-scoped, only after every gate passes.
 * Throws on blank required ids/text before any store call. Returns explicit result
 * statuses for not_found, wrong_mode, invalid_source_model, invalid_review,
 * active_request_exists, invalid_request_payload, and ok. Never executes a rebuild.
 */
export async function createRfpHldDesignModelRebuildRequest(
  input: CreateRfpHldDesignModelRebuildRequestInput
): Promise<CreateRfpHldDesignModelRebuildRequestResult> {
  const modelId = str(input.sourceHldDesignModelArtifactId).trim();
  const reviewId = str(input.sourceReviewArtifactId).trim();
  const requestedBy = str(input.requestedBy).trim();
  const reason = str(input.reason).trim();
  const instructions = str(input.instructions).trim();
  if (modelId === "") throw new Error("Rebuild request requires a source model artifact id.");
  if (reviewId === "") throw new Error("Rebuild request requires a source review artifact id.");
  if (requestedBy === "") throw new Error("Rebuild request requires a requestedBy.");
  if (reason === "") throw new Error("Rebuild request requires a reason.");
  if (instructions === "") throw new Error("Rebuild request requires instructions.");
  if (modelId === reviewId) {
    return { status: "invalid_review" };
  }

  const { tenantId, projectId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const model = await getProjectArtifactById(tenantId, projectId, modelId);
  if (!isUsableSourceModel(model, projectId)) {
    return { status: "invalid_source_model" };
  }

  const review = await getProjectArtifactById(tenantId, projectId, reviewId);
  if (!isUsableReview(review, projectId, modelId)) {
    return { status: "invalid_review" };
  }

  // At most one active rebuild request per source model.
  const artifacts = await listProjectArtifacts(tenantId, projectId);
  const active = findActiveRequest(artifacts, modelId);
  if (active !== null) {
    return { status: "active_request_exists", artifact: toArtifactSummary(active) };
  }

  const requestedAt = (input.requestedAt ?? new Date()).toISOString();
  const payload: RfpHldDesignModelRebuildRequestPayload = {
    payloadKind: RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
    sourceArtifactIds: [modelId, reviewId],
    sourceHldDesignModelArtifactId: modelId,
    sourceReviewArtifactId: reviewId,
    requestedBy,
    requestedAt,
    reason,
    instructions,
    status: "active",
  };

  // HARD GATE: the bounded request payload must validate before any persistence.
  const validation = validateRfpHldDesignModelRebuildRequestPayload(payload);
  if (!validation.valid) {
    return { status: "invalid_request_payload", errors: [...validation.errors] };
  }

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: HLD_STAGE,
    type: REQUEST_TYPE,
    status: "needs_review",
    payload: payload as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [modelId, reviewId],
  });

  return { status: "ok", artifact: toArtifactSummary(artifact) };
}
