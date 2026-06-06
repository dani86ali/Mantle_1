/**
 * Read-only Quick BoM workspace read model.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (sections 2, 3, 11, 11A, 14, 16).
 *
 * Loads one Project plus its artifacts, approvals, and Quick BoM readiness into a
 * fully JSON-serializable read model. It is strictly read-only: it makes no
 * versions, no approvals, no stage transitions; it prices nothing, exports
 * nothing, resolves no SKUs, runs no expansion, invokes no runner, and reads no
 * catalog/AI. Dates are converted to ISO strings at this boundary and full
 * artifact payloads are never surfaced (only summaries).
 */
import { getProjectById } from "@/lib/db/project-store";
import { listProjectArtifacts } from "@/lib/db/project-artifact-store";
import { listProjectApprovals } from "@/lib/db/project-approval-store";
import {
  getQuickBomReadinessReport,
  type QuickBomReadinessReport,
} from "@/lib/projects/quick-bom-readiness";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStage,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";

/** Scalar Project identity for the read model. */
export interface ProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** One materialized stage, ISO-dated. */
export interface ProjectStageSummary {
  id: string;
  stageId: ProjectStageId;
  order: number;
  status: ProjectStageStatus;
  createdAt: string;
  updatedAt: string;
}

/** One artifact version without its payload. */
export interface ProjectArtifactSummary {
  id: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  filePath?: string;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** One approval pointing at an exact artifact version, ISO-dated. */
export interface ProjectApprovalSummary {
  id: string;
  stageId: ProjectStageId;
  artifactId: string;
  artifactVersion: number;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  decidedAt: string;
  note?: string;
}

/** Latest artifact summary per Quick BoM spine type, or null when absent. */
export interface QuickBomSpineArtifacts {
  normalized_boq: ProjectArtifactSummary | null;
  sku_resolution: ProjectArtifactSummary | null;
  configuration_expansion: ProjectArtifactSummary | null;
  priced_boq: ProjectArtifactSummary | null;
  export_package: ProjectArtifactSummary | null;
}

/** The serializable Quick BoM workspace read model. */
export interface ProjectQuickBomWorkspace {
  project: ProjectSummary;
  stages: ProjectStageSummary[];
  artifacts: ProjectArtifactSummary[];
  spineArtifacts: QuickBomSpineArtifacts;
  approvals: ProjectApprovalSummary[];
  readiness: QuickBomReadinessReport;
}

/** Discriminated load outcome. */
export type ProjectQuickBomWorkspaceResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: ProjectSummary }
  | { status: "ok"; workspace: ProjectQuickBomWorkspace };

function iso(value: Date): string {
  return value.toISOString();
}

function toProjectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
  };
}

function toStageSummary(stage: ProjectStage): ProjectStageSummary {
  return {
    id: stage.id,
    stageId: stage.stageId,
    order: stage.order,
    status: stage.status,
    createdAt: iso(stage.createdAt),
    updatedAt: iso(stage.updatedAt),
  };
}

function toArtifactSummary(artifact: ProjectArtifact): ProjectArtifactSummary {
  return {
    id: artifact.id,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    ...(artifact.filePath !== undefined ? { filePath: artifact.filePath } : {}),
    sourceFileIds: artifact.sourceFileIds.slice(),
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: iso(artifact.createdAt),
    updatedAt: iso(artifact.updatedAt),
  };
}

function toApprovalSummary(approval: ProjectApproval): ProjectApprovalSummary {
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

/** Highest-version artifact of `type`; undefined when none. By version, not order. */
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
): ProjectArtifactSummary | null {
  const latest = latestByType(artifacts, type);
  return latest === undefined ? null : toArtifactSummary(latest);
}

/**
 * Load the read-only Quick BoM workspace for one project, tenant-scoped on every
 * store call. Returns `not_found` when the project does not exist, `wrong_mode`
 * (with a project summary, and WITHOUT loading artifacts/approvals) when the
 * project is not a Quick BoM project, else `ok` with the serializable workspace.
 */
export async function loadProjectQuickBomWorkspace(
  tenantId: string,
  projectId: string
): Promise<ProjectQuickBomWorkspaceResult> {
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "quick_bom") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const [artifacts, approvals] = await Promise.all([
    listProjectArtifacts(tenantId, projectId),
    listProjectApprovals(tenantId, projectId),
  ]);

  const workspace: ProjectQuickBomWorkspace = {
    project: toProjectSummary(project),
    stages: project.stages.map(toStageSummary),
    artifacts: artifacts.map(toArtifactSummary),
    spineArtifacts: {
      normalized_boq: spineSummary(artifacts, "normalized_boq"),
      sku_resolution: spineSummary(artifacts, "sku_resolution"),
      configuration_expansion: spineSummary(artifacts, "configuration_expansion"),
      priced_boq: spineSummary(artifacts, "priced_boq"),
      export_package: spineSummary(artifacts, "export_package"),
    },
    approvals: approvals.map(toApprovalSummary),
    readiness: getQuickBomReadinessReport({ projectId, artifacts }),
  };

  return { status: "ok", workspace };
}
