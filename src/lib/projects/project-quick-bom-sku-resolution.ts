/**
 * Quick BoM SKU resolution draft service: turn one already-recorded
 * normalized_boq artifact into a versioned sku_resolution draft for the Quick BoM
 * sku_resolution stage. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Scope (Prompt 88) is the single product step "normalize uploaded BoQ -> create
 * SKU resolution draft". It verifies the Project (not_found / wrong_mode) and the
 * exact source artifact (normalized_boq_not_found / artifact_not_normalized_boq /
 * normalized_boq_not_ready), then delegates the draft + artifact creation to the
 * existing deterministic SKU resolution artifact service, which owns the catalog
 * lookup and the artifact write. This wrapper does NO catalog/pricing/SKU
 * acceptance of its own and never imports the artifact-write helper, the approval/
 * evidence stores, the raw BoQ loader, pricing, configuration expansion, export,
 * any runner/coordinator/engine/adapter path, or an AI/catalog SDK. It translates
 * the lower-level service's known failures into discriminated statuses without
 * leaking internal/stack detail, re-throws anything unexpected for the route to
 * map to a safe 500, and returns serializable, lean summaries only (no artifact
 * payload, no decisions, no pricing, no storage paths). It never mutates its input
 * or the lower-level result arrays/summary.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import {
  createSkuResolutionArtifact,
  type SkuResolutionArtifactPayload,
} from "@/lib/projects/sku-resolution-artifact";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

/**
 * Exact messages thrown by the lower-level SKU resolution artifact service for
 * its source-artifact guards. They are private to that module, so this wrapper
 * mirrors the literals deliberately to translate them into safe statuses without
 * importing or editing it.
 */
const MISSING_ARTIFACT_MESSAGE = "Normalized BoQ artifact not found.";
const WRONG_TYPE_MESSAGE = "Artifact is not a normalized_boq artifact.";
const INVALID_PAYLOAD_MESSAGE = "Normalized BoQ artifact payload is invalid.";

/**
 * Source normalized_boq statuses that may seed a SKU resolution draft. Allowlist
 * (fail-closed): generated is the normalizer's fresh output and approved is the
 * human-blessed version; every other status (stale/failed/missing/rejected/
 * not_applicable, and any future status) is treated as not ready.
 */
const READY_SOURCE_STATUSES: ProjectArtifactStatus[] = ["generated", "approved"];

/** Input for {@link createProjectQuickBomSkuResolutionDraft}. */
export interface CreateProjectQuickBomSkuResolutionDraftInput {
  tenantId: string;
  projectId: string;
  normalizedBoqArtifactId: string;
}

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export interface QuickBomSkuResolutionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface QuickBomSkuResolutionArtifactSummary {
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

/** Serializable payload summary: counts/summary only, never decisions/pricing/paths. */
export interface QuickBomSkuResolutionPayloadSummary {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceFileIds: string[];
  lineCount: number;
  summary: SkuResolutionArtifactPayload["summary"];
}

/** Discriminated result of {@link createProjectQuickBomSkuResolutionDraft}. */
export type CreateProjectQuickBomSkuResolutionDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: QuickBomSkuResolutionProjectSummary }
  | { status: "normalized_boq_not_found" }
  | {
      status: "artifact_not_normalized_boq";
      artifact?: QuickBomSkuResolutionArtifactSummary;
    }
  | {
      status: "normalized_boq_not_ready";
      artifact: QuickBomSkuResolutionArtifactSummary;
    }
  | { status: "invalid_normalized_boq_payload" }
  | {
      status: "ok";
      artifact: QuickBomSkuResolutionArtifactSummary;
      payloadSummary: QuickBomSkuResolutionPayloadSummary;
    };

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): QuickBomSkuResolutionProjectSummary {
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
): QuickBomSkuResolutionArtifactSummary {
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

/** Project the created payload to a lean summary; decisions/pricing/paths are dropped. */
function toPayloadSummary(
  payload: SkuResolutionArtifactPayload
): QuickBomSkuResolutionPayloadSummary {
  return {
    sourceNormalizedBoqArtifactId: payload.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion:
      payload.sourceNormalizedBoqArtifactVersion,
    sourceFileIds: [...payload.sourceFileIds],
    lineCount: payload.lineCount,
    summary: { ...payload.summary },
  };
}

/**
 * Create a SKU resolution draft for one already-recorded Quick BoM normalized_boq
 * artifact. Verifies the Project within its tenant first: a missing project
 * returns not_found and a non-quick_bom project returns wrong_mode (lean summary);
 * neither loads the artifact or creates a draft. It then loads the exact source
 * artifact, returning normalized_boq_not_found when absent,
 * artifact_not_normalized_boq when it is the wrong type, and
 * normalized_boq_not_ready when its status is outside the fail-closed allowlist;
 * none create a draft. For a ready normalized_boq it delegates to
 * {@link createSkuResolutionArtifact}, translating that service's known failures
 * into safe discriminated statuses and re-throwing anything unexpected. On success
 * it returns lean, serializable summaries of the created artifact and its payload
 * (no full payload, no decisions, no pricing). Inputs and the lower-level result
 * arrays/summary are never mutated.
 */
export async function createProjectQuickBomSkuResolutionDraft(
  input: CreateProjectQuickBomSkuResolutionDraftInput
): Promise<CreateProjectQuickBomSkuResolutionDraftResult> {
  const { tenantId, projectId, normalizedBoqArtifactId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "quick_bom") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const sourceArtifact = await getProjectArtifactById(
    tenantId,
    projectId,
    normalizedBoqArtifactId
  );
  if (sourceArtifact === null) return { status: "normalized_boq_not_found" };
  if (sourceArtifact.type !== "normalized_boq") {
    return {
      status: "artifact_not_normalized_boq",
      artifact: toArtifactSummary(sourceArtifact),
    };
  }
  if (!READY_SOURCE_STATUSES.includes(sourceArtifact.status)) {
    return {
      status: "normalized_boq_not_ready",
      artifact: toArtifactSummary(sourceArtifact),
    };
  }

  let result;
  try {
    result = await createSkuResolutionArtifact({
      tenantId,
      projectId,
      normalizedBoqArtifactId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === MISSING_ARTIFACT_MESSAGE) {
      return { status: "normalized_boq_not_found" };
    }
    if (message === WRONG_TYPE_MESSAGE) {
      return { status: "artifact_not_normalized_boq" };
    }
    if (message === INVALID_PAYLOAD_MESSAGE) {
      return { status: "invalid_normalized_boq_payload" };
    }
    throw error;
  }

  return {
    status: "ok",
    artifact: toArtifactSummary(result.artifact),
    payloadSummary: toPayloadSummary(result.payload),
  };
}
