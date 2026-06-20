/** Read-only RFP BoQ workspace read model: no mutation, pricing, SKU/config/export, runner, catalog, or AI; summaries omit tenantId, payload, filePath, storagePath; readiness via the pure RFP BoQ helper. */
import { getProjectById } from "@/lib/db/project-store";
import { listProjectFiles } from "@/lib/db/project-file-store";
import { listProjectArtifacts } from "@/lib/db/project-artifact-store";
import { listProjectApprovals } from "@/lib/db/project-approval-store";
import { getRfpBoqReadinessReport, type RfpBoqFileSummary, type RfpBoqReadinessReport } from "@/lib/projects/project-rfp-boq-readiness";
import type {
  Project, ProjectApproval, ProjectArtifact, ProjectArtifactStatus, ProjectArtifactType,
  ProjectFile, ProjectFileRole, ProjectMode, ProjectPricingConfig, ProjectStage,
  ProjectStageId, ProjectStageStatus,
} from "@/types/project";

export interface RfpBoqProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  pricingConfig?: ProjectPricingConfig;
  /** Soft archive timestamp (QBM-LOG-006); absent when active. */
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RfpBoqStageSummary {
  id: string;
  stageId: ProjectStageId;
  order: number;
  status: ProjectStageStatus;
  createdAt: string;
  updatedAt: string;
}

/** Lean artifact summary: identity, lineage, lifecycle only - no payload, no filePath. */
export interface RfpBoqArtifactSummary {
  id: string;
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
 * Lean, serializable summary of one uploaded project file for the operator page,
 * covering every role - not just BoQ. Deliberately omits storagePath, retainUntil,
 * tenantId, payload, and any raw storage handle: this is a UI shape, not a storage
 * reference.
 */
export interface RfpUploadedFileSummary {
  id: string;
  fileName: string;
  fileRole: ProjectFileRole;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt: string;
  roleCorrectedBy?: string;
}

export interface RfpBoqApprovalSummary {
  id: string;
  stageId: ProjectStageId;
  artifactId: string;
  artifactVersion: number;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  decidedAt: string;
  note?: string;
}

export interface RfpBoqSpineArtifacts {
  normalized_boq: RfpBoqArtifactSummary | null;
  sku_resolution: RfpBoqArtifactSummary | null;
  configuration_expansion: RfpBoqArtifactSummary | null;
  priced_boq: RfpBoqArtifactSummary | null;
  export_package: RfpBoqArtifactSummary | null;
}

export interface ProjectRfpBoqWorkspace {
  project: RfpBoqProjectSummary;
  stages: RfpBoqStageSummary[];
  /** BoQ files from the readiness helper (storagePath already stripped). */
  boqFiles: RfpBoqFileSummary[];
  /** All uploaded files (every role), lean and UI-safe; no storage paths. */
  uploadedFiles: RfpUploadedFileSummary[];
  artifacts: RfpBoqArtifactSummary[];
  spineArtifacts: RfpBoqSpineArtifacts;
  approvals: RfpBoqApprovalSummary[];
  readiness: RfpBoqReadinessReport;
}

export type LoadProjectRfpBoqWorkspaceResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpBoqProjectSummary }
  | { status: "ok"; workspace: ProjectRfpBoqWorkspace };

function iso(value: Date): string {
  return value.toISOString();
}

function toProjectSummary(project: Project): RfpBoqProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    ...(project.pricingConfig !== undefined ? { pricingConfig: { ...project.pricingConfig } } : {}),
    ...(project.archivedAt !== undefined ? { archivedAt: iso(project.archivedAt) } : {}),
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
  };
}

function toStageSummary(stage: ProjectStage): RfpBoqStageSummary {
  return {
    id: stage.id,
    stageId: stage.stageId,
    order: stage.order,
    status: stage.status,
    createdAt: iso(stage.createdAt),
    updatedAt: iso(stage.updatedAt),
  };
}

function toArtifactSummary(artifact: ProjectArtifact): RfpBoqArtifactSummary {
  return {
    id: artifact.id,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: artifact.sourceFileIds.slice(),
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: iso(artifact.createdAt),
    updatedAt: iso(artifact.updatedAt),
  };
}

// Lean UI summary of one uploaded file; omits storagePath, retainUntil, tenantId.
function toUploadedFileSummary(file: ProjectFile): RfpUploadedFileSummary {
  return {
    id: file.id,
    fileName: file.fileName,
    fileRole: file.fileRole,
    ...(file.mimeType !== undefined ? { mimeType: file.mimeType } : {}),
    ...(file.sizeBytes !== undefined ? { sizeBytes: file.sizeBytes } : {}),
    uploadedAt: iso(file.uploadedAt),
    ...(file.roleCorrectedBy !== undefined ? { roleCorrectedBy: file.roleCorrectedBy } : {}),
  };
}

function toApprovalSummary(approval: ProjectApproval): RfpBoqApprovalSummary {
  return {
    id: approval.id,
    stageId: approval.stageId,
    artifactId: approval.artifactId,
    artifactVersion: approval.artifactVersion,
    decision: approval.decision,
    decidedBy: approval.decidedBy,
    decidedAt: iso(approval.decidedAt),
    ...(approval.note !== undefined ? { note: approval.note } : {}),
  };
}

// Highest-version artifact of `type` (by version, not array order); undefined when none.
function latestByType(
  artifacts: readonly ProjectArtifact[],
  type: ProjectArtifactType
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const artifact of artifacts) {
    if (artifact.type !== type) continue;
    if (latest === undefined || artifact.version > latest.version) latest = artifact;
  }
  return latest;
}

function spineSummary(
  artifacts: readonly ProjectArtifact[],
  type: ProjectArtifactType
): RfpBoqArtifactSummary | null {
  const latest = latestByType(artifacts, type);
  return latest === undefined ? null : toArtifactSummary(latest);
}

/**
 * Load the read-only RFP BoQ workspace, tenant-scoped. `not_found` when absent;
 * `wrong_mode` (lean summary, no files/artifacts/approvals loaded) when not RFP;
 * else `ok` with the serializable workspace and pure readiness report.
 */
export async function loadProjectRfpBoqWorkspace(
  tenantId: string,
  projectId: string
): Promise<LoadProjectRfpBoqWorkspaceResult> {
  // Read-only inspection loader: archived Projects stay openable (QBM-LOG-006).
  const project = await getProjectById(tenantId, projectId, { includeArchived: true });
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const [files, artifacts, approvals] = await Promise.all([
    listProjectFiles(tenantId, projectId),
    listProjectArtifacts(tenantId, projectId),
    listProjectApprovals(tenantId, projectId),
  ]);

  const readiness = getRfpBoqReadinessReport({ projectId, files, artifacts });

  const workspace: ProjectRfpBoqWorkspace = {
    project: toProjectSummary(project),
    stages: project.stages.map(toStageSummary),
    boqFiles: readiness.boqFiles,
    uploadedFiles: files.map(toUploadedFileSummary),
    artifacts: artifacts.map(toArtifactSummary),
    spineArtifacts: {
      normalized_boq: spineSummary(artifacts, "normalized_boq"),
      sku_resolution: spineSummary(artifacts, "sku_resolution"),
      configuration_expansion: spineSummary(artifacts, "configuration_expansion"),
      priced_boq: spineSummary(artifacts, "priced_boq"),
      export_package: spineSummary(artifacts, "export_package"),
    },
    approvals: approvals.map(toApprovalSummary),
    readiness,
  };

  return { status: "ok", workspace };
}
