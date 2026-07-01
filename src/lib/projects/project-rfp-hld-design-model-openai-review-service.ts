/**
 * Tenant-scoped RFP HLD design-model OpenAI ADVISORY quality-review service
 * (Stage 6H-0H-A).
 *
 * Produces exactly ONE advisory, reviewable (`needs_review`)
 * `hld_design_model_review` artifact on the existing `hld_design_delta_review`
 * stage, wrapping the CANDIDATE findings of an INJECTED OpenAI advisory review
 * executor. OpenAI review is a mandatory internal advisory gate, not final design
 * authority: the produced review never approves the model, always precedes the
 * human engineer gate, and carries no SKU/pricing/catalog/configuration/design
 * authority. The candidate output stays untrusted - the executor boundary wraps
 * and HARD-GATES it with the Stage 6E-B-001 validator before it is persisted.
 *
 * The flow is fail-closed: verify the project within its tenant, load the exact
 * artifact, gate on rfp mode / `hld_design_model` type on the right stage /
 * reviewable status, re-validate the persisted model payload, resolve the CURRENT
 * approved source bundle and confirm the model row/source compatibility is still
 * current, and only then invoke the injected executor. A null/absent executor
 * yields a stable `unavailable` result and writes nothing; a failed/invalid
 * candidate review writes nothing and returns a deterministic status. Only lean,
 * serializable summaries are returned - never the model body, the review body, or
 * the tenant id.
 *
 * The configured factory is a safe null seam: this stage makes NO live OpenAI env,
 * package, or model decision. It reads only Project state through the
 * project/artifact stores, constructs NO provider adapter, imports NO provider SDK,
 * reads NO raw RFP/PDF/DOCX/XLSX file, and makes NO pricing/SKU/catalog/config
 * decision. It adds no route, UI, approval-gate, or final-output behavior.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import {
  validateRfpHldDesignModelPayload,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import {
  getRfpHldDesignModelReadinessReport,
  validateRfpHldDesignModelSourceCompatibility,
} from "@/lib/projects/project-rfp-hld-design-model-readiness";
import {
  validateRfpHldSourceBundlePayload,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import type {
  RfpHldDesignModelReviewPayload,
  RfpHldDesignModelReviewRecommendation,
} from "@/lib/projects/project-rfp-hld-design-model-review";
import {
  reviewRfpHldDesignModelOpenAiCandidate,
  type RfpHldDesignModelOpenAiReviewExecutor,
} from "@/lib/projects/project-rfp-hld-design-model-openai-review-executor";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

const HLD_STAGE: ProjectStageId = "hld_design_delta_review";
const MODEL_TYPE: ProjectArtifactType = "hld_design_model";
const SOURCE_BUNDLE_TYPE: ProjectArtifactType = "hld_source_bundle";
const REVIEW_TYPE: ProjectArtifactType = "hld_design_model_review";

export interface RfpHldDesignModelOpenAiReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDesignModelOpenAiReviewArtifactSummary {
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

export interface RfpHldDesignModelOpenAiReviewSeverityCounts {
  blocking: number;
  warning: number;
  suggestion: number;
}

/** Stable sub-reason for a stale model (never leaks the payload body). */
export type RfpHldDesignModelOpenAiReviewStaleCode =
  | "source_readiness_blocked"
  | "source_bundle_not_found"
  | "source_bundle_payload_invalid"
  | "source_artifact_ids_mismatch"
  | "source_compatibility_mismatch";

export interface CreateRfpHldDesignModelOpenAiReviewInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
  reviewedBy: string;
  /** Optional fixed timestamp for deterministic callers/tests; defaults to now. */
  reviewedAt?: Date;
  /** Injected advisory executor; null/absent yields a stable unavailable result. */
  executor?: RfpHldDesignModelOpenAiReviewExecutor | null;
}

export type CreateRfpHldDesignModelOpenAiReviewResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDesignModelOpenAiReviewProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_design_model";
      artifact: RfpHldDesignModelOpenAiReviewArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: RfpHldDesignModelOpenAiReviewArtifactSummary;
    }
  | {
      status: "invalid_hld_design_model_payload";
      artifact: RfpHldDesignModelOpenAiReviewArtifactSummary;
    }
  | {
      status: "stale_hld_design_model_payload";
      artifact: RfpHldDesignModelOpenAiReviewArtifactSummary;
      staleCode: RfpHldDesignModelOpenAiReviewStaleCode;
      messages?: string[];
      errors?: string[];
    }
  | { status: "unavailable" }
  | { status: "review_failed"; error: "hld_quality_review_failed" }
  | { status: "invalid_candidate_output"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpHldDesignModelOpenAiReviewArtifactSummary;
      recommendation: RfpHldDesignModelReviewRecommendation;
      findingCount: number;
      findingCountsBySeverity: RfpHldDesignModelOpenAiReviewSeverityCounts;
    };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toProjectSummary(project: Project): RfpHldDesignModelOpenAiReviewProjectSummary {
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
): RfpHldDesignModelOpenAiReviewArtifactSummary {
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

function countBySeverity(
  payload: RfpHldDesignModelReviewPayload
): RfpHldDesignModelOpenAiReviewSeverityCounts {
  const counts: RfpHldDesignModelOpenAiReviewSeverityCounts = {
    blocking: 0,
    warning: 0,
    suggestion: 0,
  };
  for (const f of payload.findings) counts[f.severity] += 1;
  return counts;
}

/**
 * Currency gate mirroring the approval service: re-validate the persisted model,
 * resolve the CURRENT approved source bundle via the Stage 6C readiness helper,
 * confirm the model row ties to exactly that bundle, and re-run source
 * compatibility. Reads stores but mutates nothing and never leaks a payload body.
 */
type CurrencyOutcome =
  | { block: CreateRfpHldDesignModelOpenAiReviewResult }
  | { block: null; sourceBundle: ProjectArtifact };

async function evaluateModelCurrency(
  tenantId: string,
  projectId: string,
  artifact: ProjectArtifact
): Promise<CurrencyOutcome> {
  if (!validateRfpHldDesignModelPayload(artifact.payload).valid) {
    return {
      block: {
        status: "invalid_hld_design_model_payload",
        artifact: toArtifactSummary(artifact),
      },
    };
  }

  const artifacts = await listProjectArtifacts(tenantId, projectId);
  const readiness = getRfpHldDesignModelReadinessReport({ projectId, artifacts });
  if (readiness.status !== "ready" || readiness.sourceBundle === undefined) {
    return {
      block: {
        status: "stale_hld_design_model_payload",
        artifact: toArtifactSummary(artifact),
        staleCode: "source_readiness_blocked",
        messages: [...readiness.messages],
      },
    };
  }

  const sourceBundle = await getProjectArtifactById(
    tenantId,
    projectId,
    readiness.sourceBundle.artifactId
  );
  if (
    sourceBundle === null ||
    sourceBundle.projectId !== projectId ||
    sourceBundle.type !== SOURCE_BUNDLE_TYPE ||
    sourceBundle.stageId !== HLD_STAGE ||
    sourceBundle.status !== "approved"
  ) {
    return {
      block: {
        status: "stale_hld_design_model_payload",
        artifact: toArtifactSummary(artifact),
        staleCode: "source_bundle_not_found",
        messages: ["The current approved hld_source_bundle could not be resolved."],
      },
    };
  }

  if (!validateRfpHldSourceBundlePayload(sourceBundle.payload).valid) {
    return {
      block: {
        status: "stale_hld_design_model_payload",
        artifact: toArtifactSummary(artifact),
        staleCode: "source_bundle_payload_invalid",
        messages: ["The current approved hld_source_bundle payload is invalid."],
      },
    };
  }

  if (
    artifact.sourceArtifactIds.length !== 1 ||
    artifact.sourceArtifactIds[0] !== sourceBundle.id
  ) {
    return {
      block: {
        status: "stale_hld_design_model_payload",
        artifact: toArtifactSummary(artifact),
        staleCode: "source_artifact_ids_mismatch",
        messages: [
          "The artifact sourceArtifactIds no longer equals the current source bundle id.",
        ],
      },
    };
  }

  const compatibility = validateRfpHldDesignModelSourceCompatibility({
    payload: artifact.payload,
    sourceBundleArtifact: sourceBundle,
  });
  if (!compatibility.valid) {
    return {
      block: {
        status: "stale_hld_design_model_payload",
        artifact: toArtifactSummary(artifact),
        staleCode: "source_compatibility_mismatch",
        errors: compatibility.errors.slice(),
      },
    };
  }

  return { block: null, sourceBundle };
}

/**
 * Create exactly ONE advisory `needs_review` `hld_design_model_review` on the
 * `hld_design_delta_review` stage, tenant-scoped, only after every gate passes and
 * the injected OpenAI executor returns a valid candidate review. Throws on blank
 * artifactId or reviewedBy before any store call. A null/absent executor returns a
 * stable `unavailable` and writes nothing; a failed/invalid candidate review
 * writes nothing and returns a deterministic status. Returns lean summaries plus
 * the recommendation and finding counts; never the model/review body or tenant id.
 */
export async function createRfpHldDesignModelOpenAiReview(
  input: CreateRfpHldDesignModelOpenAiReviewInput
): Promise<CreateRfpHldDesignModelOpenAiReviewResult> {
  const artifactId = str(input.artifactId).trim();
  const reviewedBy = str(input.reviewedBy).trim();
  if (artifactId === "") throw new Error("HLD design-model review requires an artifactId.");
  if (reviewedBy === "") throw new Error("HLD design-model review requires a reviewedBy.");

  const { tenantId, projectId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const model = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (model === null || model.projectId !== projectId) {
    return { status: "artifact_not_found" };
  }
  if (model.type !== MODEL_TYPE || model.stageId !== HLD_STAGE) {
    return { status: "artifact_not_hld_design_model", artifact: toArtifactSummary(model) };
  }
  if (!isArtifactReviewable(model)) {
    return { status: "artifact_not_reviewable", artifact: toArtifactSummary(model) };
  }

  const currency = await evaluateModelCurrency(tenantId, projectId, model);
  if (currency.block !== null) return currency.block;
  const sourceBundle = currency.sourceBundle;

  const reviewedAt = (input.reviewedAt ?? new Date()).toISOString();

  const outcome = await reviewRfpHldDesignModelOpenAiCandidate({
    reviewInput: {
      model: {
        id: model.id,
        version: model.version,
        payload: model.payload as unknown as RfpHldDesignModelPayload,
      },
      sourceBundle: {
        id: sourceBundle.id,
        version: sourceBundle.version,
        payload: sourceBundle.payload as unknown as RfpHldSourceBundlePayload,
      },
      reviewedBy,
      reviewedAt,
    },
    executor: input.executor,
  });

  if (outcome.status === "unavailable") return { status: "unavailable" };
  if (outcome.status === "review_failed") {
    return { status: "review_failed", error: "hld_quality_review_failed" };
  }
  if (outcome.status === "invalid_candidate_output") {
    return { status: "invalid_candidate_output", errors: outcome.errors.slice() };
  }

  const payload = outcome.review;
  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: HLD_STAGE,
    type: REVIEW_TYPE,
    status: "needs_review",
    payload: payload as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [model.id, sourceBundle.id],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    recommendation: payload.recommendation,
    findingCount: payload.findings.length,
    findingCountsBySeverity: countBySeverity(payload),
  };
}

/**
 * The configured OpenAI advisory review executor for this stage: intentionally
 * always null.
 *
 * Stage 6H-0H-A deliberately makes NO live OpenAI env, package, or model decision:
 * there is no provider wiring seam here yet. This function reads no environment,
 * constructs no adapter, and returns null so callers treat OpenAI advisory HLD
 * quality review as unavailable until a later explicit env/package/config decision
 * wires a real executor in.
 */
export function getConfiguredRfpHldDesignModelOpenAiReviewExecutor(): null {
  return null;
}
