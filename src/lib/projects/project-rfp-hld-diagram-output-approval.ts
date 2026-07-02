/**
 * RFP HLD diagram-output review/approval service (Stage 6I-B).
 *
 * Records one approve/reject decision against the EXACT internal `hld_diagram_output`
 * artifact version named by the caller, on the `hld_design_delta_review` stage. It
 * loads the Project and the exact artifact, gates on rfp mode, the hld_diagram_output
 * type within the hld_design_delta_review stage, and reviewable status, then persists
 * exactly one approval through createProjectApproval (its only mutation).
 *
 * Because an approved diagram output becomes reviewed engineer material, APPROVAL
 * additionally fails closed unless the persisted output is still sound: the output
 * payload re-validates against the Stage 6I-A contract, the artifact row source ids and
 * the payload source ids both equal exactly [sourceHldDiagramArtifactId], the source
 * `hld_diagram` still resolves as approved on the HLD stage at the recorded version
 * with a valid payload, and the full bundle/model/review chain behind that diagram
 * still ties together with valid payloads. A malformed output payload is invalid; a
 * broken source chain is stale - either records nothing. A REJECTION skips every output
 * payload and source-chain check so a malformed or stale draft can still be retired.
 *
 * The `hld_diagram_output` is internal/reviewable only; it is NOT final HLD authority.
 * The service reads only Project state through the project/artifact stores, makes no
 * pricing/SKU/catalog/configuration decision, and never leaks a payload body or the
 * tenant id.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import { validateRfpHldSourceBundlePayload } from "@/lib/projects/project-rfp-hld-source-bundle";
import { validateRfpHldDesignModelPayload } from "@/lib/projects/project-rfp-hld-design-model";
import { validateRfpHldDesignModelReviewPayload } from "@/lib/projects/project-rfp-hld-design-model-review";
import {
  validateRfpHldDiagramDraftPayload,
  type RfpHldDiagramDraftPayload,
} from "@/lib/projects/project-rfp-hld-diagram";
import {
  validateRfpHldDiagramOutputPayload,
  type RfpHldDiagramOutputPayload,
} from "@/lib/projects/project-rfp-hld-diagram-output";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

const OUTPUT_TYPE: ProjectArtifact["type"] = "hld_diagram_output";
const HLD_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";
const DIAGRAM_TYPE: ProjectArtifact["type"] = "hld_diagram";
const MODEL_TYPE: ProjectArtifact["type"] = "hld_design_model";
const SOURCE_BUNDLE_TYPE: ProjectArtifact["type"] = "hld_source_bundle";
const REVIEW_TYPE: ProjectArtifact["type"] = "hld_design_model_review";

const ACTIVE_REVIEW_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review", "approved"]);

export interface ReviewRfpHldDiagramOutputArtifactInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  decidedAt?: Date;
  note?: string;
}

export interface RfpHldDiagramOutputReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDiagramOutputReviewArtifactSummary {
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

/** Stable sub-reason for a stale source-chain approval block (never leaks payload). */
export type RfpHldDiagramOutputStaleCode =
  | "source_artifact_ids_mismatch"
  | "source_diagram_unavailable"
  | "source_diagram_version_mismatch"
  | "source_diagram_invalid"
  | "source_model_unavailable"
  | "source_bundle_unavailable"
  | "source_review_unavailable"
  | "source_upstream_invalid"
  | "source_chain_mismatch";

export type ReviewRfpHldDiagramOutputArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDiagramOutputReviewProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_diagram_output";
      artifact: RfpHldDiagramOutputReviewArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: RfpHldDiagramOutputReviewArtifactSummary;
    }
  | {
      status: "invalid_hld_diagram_output_payload";
      artifact: RfpHldDiagramOutputReviewArtifactSummary;
    }
  | {
      status: "stale_hld_diagram_output_source_chain";
      artifact: RfpHldDiagramOutputReviewArtifactSummary;
      staleCode: RfpHldDiagramOutputStaleCode;
      messages?: string[];
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      artifact: RfpHldDiagramOutputReviewArtifactSummary;
    };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function sameOrdered(a: readonly unknown[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function toProjectSummary(project: Project): RfpHldDiagramOutputReviewProjectSummary {
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
): RfpHldDiagramOutputReviewArtifactSummary {
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

function staleResult(
  artifact: ProjectArtifact,
  staleCode: RfpHldDiagramOutputStaleCode,
  messages: string[]
): ReviewRfpHldDiagramOutputArtifactResult {
  return {
    status: "stale_hld_diagram_output_source_chain",
    artifact: toArtifactSummary(artifact),
    staleCode,
    messages,
  };
}

function isApprovedTypeOnStage(
  artifact: ProjectArtifact | null,
  projectId: string,
  type: ProjectArtifact["type"]
): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === type &&
    artifact.stageId === HLD_STAGE &&
    artifact.status === "approved"
  );
}

function isActiveReviewOnStage(artifact: ProjectArtifact | null, projectId: string): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === REVIEW_TYPE &&
    artifact.stageId === HLD_STAGE &&
    ACTIVE_REVIEW_STATUSES.has(artifact.status)
  );
}

/**
 * Approval-only source-chain gate. Returns the invalid/stale result that must
 * short-circuit the approval, or null when the persisted output payload is valid and
 * still ties through the approved diagram and the full model/bundle/review chain. Reads
 * the artifact store but mutates nothing and never leaks a payload body.
 */
async function evaluateOutputSourceChain(
  tenantId: string,
  projectId: string,
  artifact: ProjectArtifact
): Promise<ReviewRfpHldDiagramOutputArtifactResult | null> {
  const validation = validateRfpHldDiagramOutputPayload(artifact.payload);
  if (!validation.ok) {
    return {
      status: "invalid_hld_diagram_output_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  const payload = artifact.payload as unknown as RfpHldDiagramOutputPayload;
  const diagramId = payload.sourceHldDiagramArtifactId;

  // Row-level and payload-level ties: both must equal exactly [diagramId].
  if (!sameOrdered(artifact.sourceArtifactIds, [diagramId])) {
    return staleResult(artifact, "source_artifact_ids_mismatch", [
      "The diagram-output artifact source ids no longer equal [sourceHldDiagramArtifactId].",
    ]);
  }
  if (!sameOrdered(payload.sourceArtifactIds, [diagramId])) {
    return staleResult(artifact, "source_artifact_ids_mismatch", [
      "The diagram-output payload source ids no longer equal [sourceHldDiagramArtifactId].",
    ]);
  }

  const diagram = await getProjectArtifactById(tenantId, projectId, diagramId);
  if (!isApprovedTypeOnStage(diagram, projectId, DIAGRAM_TYPE)) {
    return staleResult(artifact, "source_diagram_unavailable", [
      "The source hld_diagram is not approved on the hld_design_delta_review stage.",
    ]);
  }
  const diagramArtifact = diagram as ProjectArtifact;
  if (diagramArtifact.version !== payload.sourceDiagramVersion) {
    return staleResult(artifact, "source_diagram_version_mismatch", [
      "The source hld_diagram version no longer matches the recorded sourceDiagramVersion.",
    ]);
  }
  if (!validateRfpHldDiagramDraftPayload(diagramArtifact.payload).valid) {
    return staleResult(artifact, "source_diagram_invalid", [
      "The source hld_diagram payload is no longer contract-valid.",
    ]);
  }

  // Re-tie the full bundle/model/review chain behind the diagram.
  const diagramPayload = diagramArtifact.payload as unknown as RfpHldDiagramDraftPayload;
  const modelId = diagramPayload.sourceHldDesignModelArtifactId;
  const bundleId = diagramPayload.sourceHldSourceBundleArtifactId;
  const reviewId = diagramPayload.sourceReviewArtifactId;

  if (!sameOrdered(diagramArtifact.sourceArtifactIds, [modelId, bundleId, reviewId])) {
    return staleResult(artifact, "source_chain_mismatch", [
      "The source hld_diagram source ids no longer equal [model, bundle, review].",
    ]);
  }

  const model = await getProjectArtifactById(tenantId, projectId, modelId);
  if (!isApprovedTypeOnStage(model, projectId, MODEL_TYPE)) {
    return staleResult(artifact, "source_model_unavailable", [
      "The source design model is not approved on the hld_design_delta_review stage.",
    ]);
  }
  const bundle = await getProjectArtifactById(tenantId, projectId, bundleId);
  if (!isApprovedTypeOnStage(bundle, projectId, SOURCE_BUNDLE_TYPE)) {
    return staleResult(artifact, "source_bundle_unavailable", [
      "The source bundle is not approved on the hld_design_delta_review stage.",
    ]);
  }
  const review = await getProjectArtifactById(tenantId, projectId, reviewId);
  if (!isActiveReviewOnStage(review, projectId)) {
    return staleResult(artifact, "source_review_unavailable", [
      "The source review is not an active hld_design_model_review on the hld_design_delta_review stage.",
    ]);
  }

  const modelArtifact = model as ProjectArtifact;
  const bundleArtifact = bundle as ProjectArtifact;
  const reviewArtifact = review as ProjectArtifact;

  if (diagramPayload.sourceModelVersion !== modelArtifact.version) {
    return staleResult(artifact, "source_chain_mismatch", [
      "The source hld_diagram sourceModelVersion no longer equals the approved design model version.",
    ]);
  }

  if (
    !validateRfpHldDesignModelPayload(modelArtifact.payload).valid ||
    !validateRfpHldSourceBundlePayload(bundleArtifact.payload).valid ||
    !validateRfpHldDesignModelReviewPayload(reviewArtifact.payload).valid
  ) {
    return staleResult(artifact, "source_upstream_invalid", [
      "An upstream model/bundle/review payload is no longer contract-valid.",
    ]);
  }

  const modelPayload = rec(modelArtifact.payload);
  const reviewPayload = rec(reviewArtifact.payload);
  const modelSourceIds = Array.isArray(modelPayload.sourceArtifactIds)
    ? (modelPayload.sourceArtifactIds as unknown[])
    : [];
  const reviewSourceIds = Array.isArray(reviewPayload.sourceArtifactIds)
    ? (reviewPayload.sourceArtifactIds as unknown[])
    : [];
  if (
    !sameOrdered(modelArtifact.sourceArtifactIds, [bundleId]) ||
    str(modelPayload.sourceHldSourceBundleArtifactId) !== bundleId ||
    !sameOrdered(modelSourceIds, [bundleId]) ||
    !sameOrdered(reviewArtifact.sourceArtifactIds, [modelId, bundleId]) ||
    !sameOrdered(reviewSourceIds, [modelId, bundleId]) ||
    str(reviewPayload.sourceHldDesignModelArtifactId) !== modelId ||
    str(reviewPayload.sourceHldSourceBundleArtifactId) !== bundleId
  ) {
    return staleResult(artifact, "source_chain_mismatch", [
      "The model/review source ids no longer match the expected [bundle] and [model, bundle] chain.",
    ]);
  }

  return null;
}

/**
 * Review (approve/reject) one EXACT hld_diagram_output artifact version, tenant scoped
 * on every store call. Validates nonblank artifactId then decidedBy before any store
 * call. Gates in order: project existence, rfp mode, exact artifact existence (with a
 * route-project id match), hld_diagram_output type in the hld_design_delta_review
 * stage, reviewable status. An APPROVAL additionally re-validates the persisted output
 * payload and re-ties it through the approved diagram + model/bundle/review source
 * chain (blocking with invalid_hld_diagram_output_payload or
 * stale_hld_diagram_output_source_chain, the payload body never leaked); a REJECTION
 * skips those checks so a malformed/stale draft can still be retired. On a passing path
 * it persists exactly one approval (the only mutation). Only a null
 * createProjectApproval maps to approval_failed; other store errors bubble.
 */
export async function reviewRfpHldDiagramOutputArtifact(
  input: ReviewRfpHldDiagramOutputArtifactInput
): Promise<ReviewRfpHldDiagramOutputArtifactResult> {
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
  // Defense in depth on top of the tenant/project-scoped store lookup.
  if (artifact === null || artifact.projectId !== projectId) {
    return { status: "artifact_not_found" };
  }
  if (artifact.type !== OUTPUT_TYPE || artifact.stageId !== HLD_STAGE) {
    return {
      status: "artifact_not_hld_diagram_output",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (!isArtifactReviewable(artifact)) {
    return {
      status: "artifact_not_reviewable",
      artifact: toArtifactSummary(artifact),
    };
  }

  if (decision === "approved") {
    const blocked = await evaluateOutputSourceChain(tenantId, projectId, artifact);
    if (blocked !== null) return blocked;
  }

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
