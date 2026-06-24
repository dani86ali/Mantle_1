/**
 * RFP HLD source-bundle inspection read model (Stage 6B-003A).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Read-only inspection over `hld_source_bundle` artifacts on
 * `hld_design_delta_review`. List returns lean counts-only summaries plus a
 * read-only source-bundle readiness probe (the pure Stage 6B-002 assembler,
 * summarized to counts/provenance only - never a full payload body). Detail
 * validates the persisted payload with the Stage 6B-001 contract and returns a
 * sanitized whitelist of the source-bundle contract fields only. It writes
 * nothing, creates no artifact or approval, runs no AI, prices nothing, resolves
 * no SKU/catalog, makes no configuration/design decision, and never surfaces
 * tenant ids, file paths, storage paths, raw document text, or upstream payload
 * bodies. Imports exactly: project/file/artifact stores, canonical project types,
 * the Stage 6B-001 contract, and the pure Stage 6B-002 assembler - nothing else.
 */
import { getProjectById } from "@/lib/db/project-store";
import { listProjectFiles } from "@/lib/db/project-file-store";
import {
  getProjectArtifactById,
  listProjectArtifacts,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import type { Project, ProjectArtifact } from "@/types/project";
import {
  validateRfpHldSourceBundlePayload,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  buildRfpHldSourceBundleDraft,
  type RfpHldSourceBundleBlockedCode,
} from "@/lib/projects/project-rfp-hld-source-bundle-assembler";

const BUNDLE_TYPE: ProjectArtifact["type"] = "hld_source_bundle";
const BUNDLE_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";

/**
 * Non-persisted, non-leaking actor for the read-only readiness probe. The pure
 * assembler requires a non-blank createdBy to validate a ready payload; this
 * value is never written and never surfaced - the readiness summary exposes
 * counts/provenance only, never createdBy.
 */
const READINESS_PROBE_CREATED_BY = "rfp-hld-source-bundle-readiness-probe";

// ---- project + artifact summaries ------------------------------------------

export interface RfpHldSourceBundleInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Lean artifact metadata: no payload body and no source arrays. */
export interface RfpHldSourceBundleInspectionArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ---- list payload summary (counts only, no source arrays, no body) ---------

export interface RfpHldSourceBundleInspectionPayloadSummary {
  payloadKind: string;
  createdBy: string;
  createdAt: string;
  sourceArtifactCount: number;
  designKnowledgePackCount: number;
  coveredDomainCount: number;
  missingDomainCount: number;
  excludedDomainCount: number;
  assumptionCount: number;
  constraintCount: number;
  warningCount: number;
  blockerCount: number;
}

export interface RfpHldSourceBundleInspectionListItem
  extends RfpHldSourceBundleInspectionArtifactSummary {
  payloadSummary: RfpHldSourceBundleInspectionPayloadSummary;
}

// ---- readiness probe (counts/provenance only, never a payload body) --------

export interface RfpHldSourceBundleReadinessSummary {
  compiledFromReadinessSnapshotArtifactId: string;
  sourceArtifactCount: number;
  designKnowledgePackCount: number;
  coveredDomainCount: number;
  missingDomainCount: number;
  excludedDomainCount: number;
  assumptionCount: number;
  constraintCount: number;
  warningCount: number;
  blockerCount: number;
}

export type RfpHldSourceBundleReadiness =
  | { status: "ready"; summary: RfpHldSourceBundleReadinessSummary }
  | { status: "blocked"; code: RfpHldSourceBundleBlockedCode; messages: string[] }
  | { status: "invalid_payload"; errors: string[] };

// ---- detail (sanitized whitelist of the contract fields only) --------------

export type RfpHldSourceBundleDetail = RfpHldSourceBundlePayload;

// ---- list result -----------------------------------------------------------

export interface LoadRfpHldSourceBundleListInput {
  tenantId: string;
  projectId: string;
}

export type LoadRfpHldSourceBundleListResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldSourceBundleInspectionProjectSummary }
  | {
      status: "ok";
      project: RfpHldSourceBundleInspectionProjectSummary;
      artifacts: RfpHldSourceBundleInspectionListItem[];
      artifactCount: number;
      sourceBundleReadiness: RfpHldSourceBundleReadiness;
    };

// ---- detail result ---------------------------------------------------------

export interface LoadRfpHldSourceBundleDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

export type LoadRfpHldSourceBundleDetailResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldSourceBundleInspectionProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_source_bundle";
      artifact: RfpHldSourceBundleInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpHldSourceBundleInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpHldSourceBundleInspectionProjectSummary;
      artifact: RfpHldSourceBundleInspectionArtifactSummary;
      sourceBundle: RfpHldSourceBundleDetail;
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
): RfpHldSourceBundleInspectionProjectSummary {
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
): RfpHldSourceBundleInspectionArtifactSummary {
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

function toListPayloadSummary(
  payload: unknown
): RfpHldSourceBundleInspectionPayloadSummary {
  const r = toRecord(payload);
  return {
    payloadKind: asString(r.payloadKind),
    createdBy: asString(r.createdBy),
    createdAt: asString(r.createdAt),
    sourceArtifactCount: countArray(r.sourceArtifactIds),
    designKnowledgePackCount: countArray(r.designKnowledgePackRefs),
    coveredDomainCount: countArray(r.coveredDomains),
    missingDomainCount: countArray(r.missingDomains),
    excludedDomainCount: countArray(r.excludedDomains),
    assumptionCount: countArray(r.assumptions),
    constraintCount: countArray(r.constraints),
    warningCount: countArray(r.warnings),
    blockerCount: countArray(r.blockers),
  };
}

function toReadinessSummary(
  payload: RfpHldSourceBundlePayload
): RfpHldSourceBundleReadinessSummary {
  return {
    compiledFromReadinessSnapshotArtifactId:
      payload.lineage.compiledFromReadinessSnapshotArtifactId,
    sourceArtifactCount: payload.sourceArtifactIds.length,
    designKnowledgePackCount: payload.designKnowledgePackRefs.length,
    coveredDomainCount: payload.coveredDomains.length,
    missingDomainCount: payload.missingDomains.length,
    excludedDomainCount: payload.excludedDomains.length,
    assumptionCount: payload.assumptions.length,
    constraintCount: payload.constraints.length,
    warningCount: payload.warnings.length,
    blockerCount: payload.blockers.length,
  };
}

/**
 * Reconstruct a clean detail by explicitly picking only the whitelisted contract
 * fields, dropping any arbitrary/leakable extra keys. Validation has already
 * proven the contract shape; every nested object here is a pure reference
 * (artifact id + metadata), never a tenant id, file path, or upstream body.
 */
function toSourceBundleDetail(
  p: RfpHldSourceBundlePayload
): RfpHldSourceBundleDetail {
  return {
    payloadKind: p.payloadKind,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    sourceArtifactIds: [...p.sourceArtifactIds],
    lineage: {
      compiledFromReadinessSnapshotArtifactId:
        p.lineage.compiledFromReadinessSnapshotArtifactId,
      compiledArtifactIds: [...p.lineage.compiledArtifactIds],
    },
    authorities: {
      evidencePackage: { ...p.authorities.evidencePackage },
      requirementsBaseline: { ...p.authorities.requirementsBaseline },
      complianceMatrix: { ...p.authorities.complianceMatrix },
      configurationAuthority: { ...p.authorities.configurationAuthority },
      hldIntake: { ...p.authorities.hldIntake },
      hldReadinessSnapshot: { ...p.authorities.hldReadinessSnapshot },
    },
    designKnowledgePackRefs: p.designKnowledgePackRefs.map((ref) => ({ ...ref })),
    coveredDomains: [...p.coveredDomains],
    missingDomains: [...p.missingDomains],
    excludedDomains: [...p.excludedDomains],
    assumptions: p.assumptions.map((e) => ({ ...e })),
    constraints: p.constraints.map((e) => ({ ...e })),
    warnings: p.warnings.map((f) => ({ ...f })),
    blockers: p.blockers.map((f) => ({ ...f })),
    validation: { ...p.validation },
  };
}

// ---- public API ------------------------------------------------------------

/**
 * List `hld_source_bundle` artifacts (lean, counts-only) for a tenant's RFP
 * project, plus a read-only readiness probe over the pure assembler. Reads only;
 * creates no artifact or approval and never surfaces a full payload body.
 */
export async function loadRfpHldSourceBundleList(
  input: LoadRfpHldSourceBundleListInput
): Promise<LoadRfpHldSourceBundleListResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const [bundleRows, allArtifacts, files] = await Promise.all([
    listProjectArtifactsByType(tenantId, projectId, BUNDLE_TYPE),
    listProjectArtifacts(tenantId, projectId),
    listProjectFiles(tenantId, projectId),
  ]);

  const artifacts = bundleRows
    .filter(
      (row) =>
        row.projectId === projectId &&
        row.type === BUNDLE_TYPE &&
        row.stageId === BUNDLE_STAGE
    )
    .map((row) => ({
      ...toArtifactSummary(row),
      payloadSummary: toListPayloadSummary(row.payload),
    }));

  const built = buildRfpHldSourceBundleDraft({
    projectId,
    files,
    artifacts: allArtifacts,
    createdBy: READINESS_PROBE_CREATED_BY,
  });
  let sourceBundleReadiness: RfpHldSourceBundleReadiness;
  if (built.status === "blocked") {
    sourceBundleReadiness = {
      status: "blocked",
      code: built.code,
      messages: [...built.messages],
    };
  } else if (built.status === "invalid_payload") {
    sourceBundleReadiness = {
      status: "invalid_payload",
      errors: [...built.errors],
    };
  } else {
    sourceBundleReadiness = {
      status: "ready",
      summary: toReadinessSummary(built.payload),
    };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifacts,
    artifactCount: artifacts.length,
    sourceBundleReadiness,
  };
}

/**
 * Read the EXACT `hld_source_bundle` artifact named by id for engineer
 * inspection. Tenant/project scoped at the store boundary; the payload is gated
 * by the Stage 6B-001 validator and returned as a sanitized whitelist only.
 */
export async function loadRfpHldSourceBundleDetail(
  input: LoadRfpHldSourceBundleDetailInput
): Promise<LoadRfpHldSourceBundleDetailResult> {
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
  if (artifact.type !== BUNDLE_TYPE || artifact.stageId !== BUNDLE_STAGE) {
    return {
      status: "artifact_not_hld_source_bundle",
      artifact: toArtifactSummary(artifact),
    };
  }

  const validation = validateRfpHldSourceBundlePayload(artifact.payload);
  if (!validation.valid) {
    return { status: "invalid_payload", artifact: toArtifactSummary(artifact) };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    sourceBundle: toSourceBundleDetail(
      artifact.payload as unknown as RfpHldSourceBundlePayload
    ),
  };
}
