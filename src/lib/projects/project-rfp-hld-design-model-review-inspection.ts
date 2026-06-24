/**
 * RFP HLD design-model REVIEW inspection read model (Stage 6E-B-003).
 *
 * Read-only list/detail over advisory `hld_design_model_review` artifacts on the
 * `hld_design_delta_review` stage. The review is quality metadata about a
 * candidate `hld_design_model`, checked against its approved `hld_source_bundle`.
 * It is advisory only: this surface never approves a model, runs no rebuild,
 * renders no document/diagram, and carries no SKU/pricing/catalog/configuration/AI
 * authority. List returns lean artifact summaries plus counts-only payload
 * summaries. Detail validates the persisted payload with the Stage 6E-B-001
 * fail-closed contract validator and returns a sanitized whitelist of the review
 * contract fields only.
 *
 * It never surfaces tenant ids, raw file refs, file/storage paths, raw
 * document/evidence text, model payload bodies, or source-bundle payload bodies.
 * Imports exactly: the project + artifact stores, the review contract, and
 * canonical project types - no provider/AI adapter, raw file/evidence loader,
 * catalog/pricing/SKU/config service, UI/route, or approval service.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import {
  validateRfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewRecommendation,
  type RfpHldDesignModelReviewReviewerType,
} from "@/lib/projects/project-rfp-hld-design-model-review";
import type { Project, ProjectArtifact } from "@/types/project";

const REVIEW_TYPE: ProjectArtifact["type"] = "hld_design_model_review";
const REVIEW_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";

// ---- project + artifact summaries ------------------------------------------

export interface RfpHldDesignModelReviewInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Lean artifact metadata: no payload body and no source-file refs. */
export interface RfpHldDesignModelReviewInspectionArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDesignModelReviewSeverityCounts {
  blocking: number;
  warning: number;
  suggestion: number;
}

// ---- list payload summary (counts/provenance only, no body) ----------------

export interface RfpHldDesignModelReviewInspectionPayloadSummary {
  payloadKind: string;
  reviewedAt: string;
  reviewerType: string;
  sourceHldDesignModelArtifactId: string;
  sourceHldSourceBundleArtifactId: string;
  findingCount: number;
  findingCountsBySeverity: RfpHldDesignModelReviewSeverityCounts;
  recommendation: string;
  hasBoundedRebuildInstructions: boolean;
}

export interface RfpHldDesignModelReviewInspectionListItem
  extends RfpHldDesignModelReviewInspectionArtifactSummary {
  payloadSummary: RfpHldDesignModelReviewInspectionPayloadSummary;
}

// ---- detail (sanitized whitelist of the contract fields only) --------------

export type RfpHldDesignModelReviewInspectionDetail =
  RfpHldDesignModelReviewPayload;

// ---- list result -----------------------------------------------------------

export interface LoadRfpHldDesignModelReviewListInput {
  tenantId: string;
  projectId: string;
}

export type LoadRfpHldDesignModelReviewListResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpHldDesignModelReviewInspectionProjectSummary;
    }
  | {
      status: "ok";
      project: RfpHldDesignModelReviewInspectionProjectSummary;
      artifacts: RfpHldDesignModelReviewInspectionListItem[];
      artifactCount: number;
    };

// ---- detail result ---------------------------------------------------------

export interface LoadRfpHldDesignModelReviewDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

export type LoadRfpHldDesignModelReviewDetailResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpHldDesignModelReviewInspectionProjectSummary;
    }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_design_model_review";
      artifact: RfpHldDesignModelReviewInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpHldDesignModelReviewInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpHldDesignModelReviewInspectionProjectSummary;
      artifact: RfpHldDesignModelReviewInspectionArtifactSummary;
      review: RfpHldDesignModelReviewInspectionDetail;
    };

// ---- helpers ---------------------------------------------------------------

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function toProjectSummary(
  project: Project
): RfpHldDesignModelReviewInspectionProjectSummary {
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
): RfpHldDesignModelReviewInspectionArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/** Count findings by severity from an untrusted payload (list path). */
function countFindingsBySeverity(
  findings: unknown
): RfpHldDesignModelReviewSeverityCounts {
  const counts: RfpHldDesignModelReviewSeverityCounts = {
    blocking: 0,
    warning: 0,
    suggestion: 0,
  };
  if (!Array.isArray(findings)) return counts;
  for (const f of findings) {
    const severity = asString(toRecord(f).severity);
    if (severity === "blocking" || severity === "warning" || severity === "suggestion") {
      counts[severity] += 1;
    }
  }
  return counts;
}

/**
 * Lean list summary: counts + provenance ids only, never a payload body, raw
 * finding messages, or rebuild instruction text.
 */
function toListPayloadSummary(
  payload: unknown
): RfpHldDesignModelReviewInspectionPayloadSummary {
  const r = toRecord(payload);
  const rebuild = r.boundedRebuildInstructions;
  return {
    payloadKind: asString(r.payloadKind),
    reviewedAt: asString(r.reviewedAt),
    reviewerType: asString(toRecord(r.reviewer).type),
    sourceHldDesignModelArtifactId: asString(r.sourceHldDesignModelArtifactId),
    sourceHldSourceBundleArtifactId: asString(r.sourceHldSourceBundleArtifactId),
    findingCount: countArray(r.findings),
    findingCountsBySeverity: countFindingsBySeverity(r.findings),
    recommendation: asString(r.recommendation),
    hasBoundedRebuildInstructions:
      rebuild !== undefined && rebuild !== null,
  };
}

/**
 * Reconstruct a clean detail by explicitly picking only the whitelisted review
 * contract fields, dropping any arbitrary/leakable extra keys. Validation has
 * already proven the contract shape; every nested value here is a structured
 * review reference (ids, labels, domains, advisory messages), never a tenant id,
 * file path, model body, or source-bundle body.
 */
function toReviewDetail(
  p: RfpHldDesignModelReviewPayload
): RfpHldDesignModelReviewInspectionDetail {
  return {
    payloadKind: p.payloadKind,
    sourceArtifactIds: [...p.sourceArtifactIds],
    sourceHldDesignModelArtifactId: p.sourceHldDesignModelArtifactId,
    sourceHldSourceBundleArtifactId: p.sourceHldSourceBundleArtifactId,
    reviewedAt: p.reviewedAt,
    reviewer: {
      type: p.reviewer.type as RfpHldDesignModelReviewReviewerType,
      ...(p.reviewer.id !== undefined ? { id: p.reviewer.id } : {}),
      ...(p.reviewer.label !== undefined ? { label: p.reviewer.label } : {}),
    },
    sourceReferences: p.sourceReferences.map((ref) => ({
      id: ref.id,
      artifactId: ref.artifactId,
      ...(ref.domain !== undefined ? { domain: ref.domain } : {}),
      ...(ref.sectionId !== undefined ? { sectionId: ref.sectionId } : {}),
    })),
    findings: p.findings.map((f) => ({
      id: f.id,
      severity: f.severity,
      category: f.category,
      message: f.message,
      sourceReferenceIds: [...f.sourceReferenceIds],
      ...(f.recommendedAction !== undefined
        ? { recommendedAction: f.recommendedAction }
        : {}),
    })),
    recommendation: p.recommendation as RfpHldDesignModelReviewRecommendation,
    ...(p.boundedRebuildInstructions !== undefined
      ? {
          boundedRebuildInstructions: {
            summary: p.boundedRebuildInstructions.summary,
            instructions: p.boundedRebuildInstructions.instructions,
            ...(p.boundedRebuildInstructions.maxAttempts !== undefined
              ? { maxAttempts: p.boundedRebuildInstructions.maxAttempts }
              : {}),
          },
        }
      : {}),
  };
}

// ---- public API ------------------------------------------------------------

/**
 * List advisory `hld_design_model_review` artifacts (lean, counts-only) for a
 * tenant's RFP project. Reads only; creates no artifact or approval and never
 * surfaces a full payload body.
 */
export async function loadRfpHldDesignModelReviewList(
  input: LoadRfpHldDesignModelReviewListInput
): Promise<LoadRfpHldDesignModelReviewListResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const reviewRows = await listProjectArtifactsByType(
    tenantId,
    projectId,
    REVIEW_TYPE
  );

  const artifacts = reviewRows
    .filter(
      (row) =>
        row.projectId === projectId &&
        row.type === REVIEW_TYPE &&
        row.stageId === REVIEW_STAGE
    )
    .map((row) => ({
      ...toArtifactSummary(row),
      payloadSummary: toListPayloadSummary(row.payload),
    }));

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifacts,
    artifactCount: artifacts.length,
  };
}

/**
 * Read the EXACT `hld_design_model_review` artifact named by id for engineer
 * inspection. Tenant/project scoped at the store boundary; the payload is gated
 * by the Stage 6E-B-001 validator and returned as a sanitized whitelist only.
 */
export async function loadRfpHldDesignModelReviewDetail(
  input: LoadRfpHldDesignModelReviewDetailInput
): Promise<LoadRfpHldDesignModelReviewDetailResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (!input.artifactId || input.artifactId.trim() === "") {
    throw new Error("artifactId is required.");
  }

  const { tenantId, projectId, artifactId } = input;
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
  if (artifact.type !== REVIEW_TYPE || artifact.stageId !== REVIEW_STAGE) {
    return {
      status: "artifact_not_hld_design_model_review",
      artifact: toArtifactSummary(artifact),
    };
  }

  const validation = validateRfpHldDesignModelReviewPayload(artifact.payload);
  if (!validation.valid) {
    return { status: "invalid_payload", artifact: toArtifactSummary(artifact) };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    review: toReviewDetail(
      artifact.payload as unknown as RfpHldDesignModelReviewPayload
    ),
  };
}
