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
  type RfpHldDesignModelRebuildRequestStatus,
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

/**
 * Request ROW statuses that are still open/consumable, so a request is
 * executable-active and worth listing for discovery. Mirrors the execute
 * service's claimable set; any retired or otherwise non-open row is omitted.
 */
const OPEN_REQUEST_ROW_STATUSES: ReadonlySet<ProjectArtifactStatus> = new Set<ProjectArtifactStatus>([
  "generated",
  "needs_review",
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

/**
 * Lean provenance projection over an already-validated active rebuild-request
 * payload. Carries ONLY the ids/timestamp/status the UI needs to match a request
 * to its design model and advisory review - never the reason, instructions, or
 * requestedBy body.
 */
export interface RfpHldDesignModelRebuildRequestPayloadSummary {
  payloadKind: typeof RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND;
  sourceHldDesignModelArtifactId: string;
  sourceReviewArtifactId: string;
  requestedAt: string;
  status: RfpHldDesignModelRebuildRequestStatus;
  /** Optional OpenAI-forced redo-policy metadata, surfaced only when present. */
  requestSource?: RfpHldDesignModelRebuildRequestPayload["requestSource"];
  redoPhase?: RfpHldDesignModelRebuildRequestPayload["redoPhase"];
  redoAttempt?: number;
  maxRedoAttempts?: RfpHldDesignModelRebuildRequestPayload["maxRedoAttempts"];
  sourceHldSourceBundleArtifactId?: string;
}

/** A listed executable-active request: the artifact summary plus lean provenance. */
export interface RfpHldDesignModelRebuildRequestListedArtifactSummary
  extends RfpHldDesignModelRebuildRequestArtifactSummary {
  payloadSummary: RfpHldDesignModelRebuildRequestPayloadSummary;
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
  | {
      status: "redo_limit_exhausted";
      phase: "initial_openai_gate";
      maxRedoAttempts: 1;
      attemptCount: number;
    }
  | { status: "invalid_request_payload"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpHldDesignModelRebuildRequestArtifactSummary;
    };

export interface ListRfpHldDesignModelRebuildRequestsInput {
  tenantId: string;
  projectId: string;
}

export type ListRfpHldDesignModelRebuildRequestsResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDesignModelRebuildRequestProjectSummary }
  | {
      status: "ok";
      artifactCount: number;
      artifacts: RfpHldDesignModelRebuildRequestListedArtifactSummary[];
    };

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * The bounded OpenAI-forced redo directive carried by a blocking `ai_advisory`
 * review, or null when the review does not force a redo. A review forces an initial
 * OpenAI redo when it is `ai_advisory`, carries at least one `blocking` finding, and
 * carries valid boundedRebuildInstructions plus a source-bundle id to key the
 * budget. The summary/instructions become the persisted authority; caller-supplied
 * reason/instructions are transport text only on this path.
 */
function readOpenAiForcedRedo(reviewPayload: unknown): {
  sourceHldSourceBundleArtifactId: string;
  reason: string;
  instructions: string;
} | null {
  const p = asRecord(reviewPayload);
  if (!p) return null;
  const reviewer = asRecord(p.reviewer);
  if (!reviewer || reviewer.type !== "ai_advisory") return null;
  const findings = Array.isArray(p.findings) ? p.findings : [];
  const hasBlocking = findings.some((f) => asRecord(f)?.severity === "blocking");
  if (!hasBlocking) return null;
  const bri = asRecord(p.boundedRebuildInstructions);
  if (!bri) return null;
  const reason = str(bri.summary).trim();
  const instructions = str(bri.instructions).trim();
  if (reason === "" || instructions === "") return null;
  const bundleId = str(p.sourceHldSourceBundleArtifactId).trim();
  if (bundleId === "") return null;
  return { sourceHldSourceBundleArtifactId: bundleId, reason, instructions };
}

/**
 * Count prior valid `initial_openai_gate` OpenAI-forced requests for the SAME source
 * bundle whose row is not rejected. A rejected redo does not consume the budget; any
 * other non-rejected row (open, retired, or approved) does. This bounds the initial
 * OpenAI gate to at most one forced Claude rebuild per source bundle.
 */
function countInitialOpenAiRequests(
  artifacts: readonly ProjectArtifact[],
  bundleId: string
): number {
  let count = 0;
  for (const a of artifacts) {
    if (a.type !== REQUEST_TYPE) continue;
    if (a.status === "rejected") continue;
    if (!validateRfpHldDesignModelRebuildRequestPayload(a.payload).valid) continue;
    const p = a.payload;
    if (p.requestSource !== "openai_advisory") continue;
    if (p.redoPhase !== "initial_openai_gate") continue;
    if (str(p.sourceHldSourceBundleArtifactId) !== bundleId) continue;
    count += 1;
  }
  return count;
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

/**
 * True if `artifact` is an executable-ACTIVE rebuild request worth listing: the
 * right type and HLD stage, an open/consumable row status, a payload that passes
 * the bounded contract, and an `active` payload status. Discovery only - it does
 * NOT re-load or re-gate the source model/review; the execute service performs
 * those hard gates.
 */
function isExecutableActiveRequest(artifact: ProjectArtifact): boolean {
  return (
    artifact.type === REQUEST_TYPE &&
    artifact.stageId === HLD_STAGE &&
    OPEN_REQUEST_ROW_STATUSES.has(artifact.status) &&
    validateRfpHldDesignModelRebuildRequestPayload(artifact.payload).valid &&
    artifact.payload.status === "active"
  );
}

/** Project an executable-active request to its listed summary (no payload body). */
function toListedArtifactSummary(
  artifact: ProjectArtifact
): RfpHldDesignModelRebuildRequestListedArtifactSummary {
  const payload = artifact.payload as unknown as RfpHldDesignModelRebuildRequestPayload;
  return {
    ...toArtifactSummary(artifact),
    payloadSummary: {
      payloadKind: RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
      sourceHldDesignModelArtifactId: payload.sourceHldDesignModelArtifactId,
      sourceReviewArtifactId: payload.sourceReviewArtifactId,
      requestedAt: payload.requestedAt,
      status: payload.status,
      // Optional OpenAI-forced redo-policy metadata: surfaced only when present, so
      // a historical/engineer request keeps an identical lean summary.
      ...(payload.requestSource !== undefined ? { requestSource: payload.requestSource } : {}),
      ...(payload.redoPhase !== undefined ? { redoPhase: payload.redoPhase } : {}),
      ...(payload.redoAttempt !== undefined ? { redoAttempt: payload.redoAttempt } : {}),
      ...(payload.maxRedoAttempts !== undefined
        ? { maxRedoAttempts: payload.maxRedoAttempts }
        : {}),
      ...(payload.sourceHldSourceBundleArtifactId !== undefined
        ? { sourceHldSourceBundleArtifactId: payload.sourceHldSourceBundleArtifactId }
        : {}),
    },
  };
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

  // A blocking ai_advisory review with valid bounded instructions forces an initial
  // OpenAI redo: the review's bounded summary/instructions and source bundle become
  // the persisted authority, and caller-supplied reason/instructions are ignored.
  const forced = readOpenAiForcedRedo(review!.payload);

  const artifacts = await listProjectArtifacts(tenantId, projectId);

  // At most one active rebuild request per source model. Preserve this existing
  // duplicate-request behavior before applying any OpenAI-forced redo budget result.
  const active = findActiveRequest(artifacts, modelId);
  if (active !== null) {
    return { status: "active_request_exists", artifact: toArtifactSummary(active) };
  }

  // Initial OpenAI-forced budget: at most one non-rejected forced redo per source
  // bundle. Once exhausted, write nothing and let the approval gate proceed.
  if (forced !== null) {
    const attemptCount = countInitialOpenAiRequests(
      artifacts,
      forced.sourceHldSourceBundleArtifactId
    );
    if (attemptCount >= 1) {
      return {
        status: "redo_limit_exhausted",
        phase: "initial_openai_gate",
        maxRedoAttempts: 1,
        attemptCount,
      };
    }
  }

  const requestedAt = (input.requestedAt ?? new Date()).toISOString();
  const payload: RfpHldDesignModelRebuildRequestPayload = {
    payloadKind: RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
    sourceArtifactIds: [modelId, reviewId],
    sourceHldDesignModelArtifactId: modelId,
    sourceReviewArtifactId: reviewId,
    requestedBy,
    requestedAt,
    reason: forced !== null ? forced.reason : reason,
    instructions: forced !== null ? forced.instructions : instructions,
    status: "active",
    ...(forced !== null
      ? {
          requestSource: "openai_advisory" as const,
          redoPhase: "initial_openai_gate" as const,
          redoAttempt: 1,
          maxRedoAttempts: 1 as const,
          sourceHldSourceBundleArtifactId: forced.sourceHldSourceBundleArtifactId,
        }
      : // Human/SE-directed request: mark it engineer-sourced and carry NO OpenAI
        // redo-policy fields. The contract's <=250-word engineer instruction cap is
        // hard-gated below before any persistence.
        { requestSource: "engineer" as const }),
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

/**
 * List the executable-ACTIVE `hld_design_model_rebuild_request` artifacts for an
 * RFP project, tenant-scoped, as lean summaries the UI can use to discover which
 * request to execute. Returns not_found / wrong_mode like the create service, or
 * ok with artifactCount and the filtered artifacts. Read-only discovery: it loads
 * the project's artifacts once, filters to executable-active requests, and never
 * re-loads a source model/review, prices, resolves SKUs, or makes any
 * catalog/configuration/design decision. Never returns a raw payload body or the
 * tenant id; the execute route/service still performs the hard execution gates.
 */
export async function listRfpHldDesignModelRebuildRequests(
  input: ListRfpHldDesignModelRebuildRequestsInput
): Promise<ListRfpHldDesignModelRebuildRequestsResult> {
  const { tenantId, projectId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifacts = await listProjectArtifacts(tenantId, projectId);
  const artifactSummaries = artifacts
    .filter(isExecutableActiveRequest)
    .map(toListedArtifactSummary);

  return {
    status: "ok",
    artifactCount: artifactSummaries.length,
    artifacts: artifactSummaries,
  };
}
