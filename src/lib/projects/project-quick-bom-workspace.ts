/** Read-only Quick BoM workspace read model: no mutation, pricing, export, runner, catalog, or AI. */
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
  ProjectPricingConfig,
  ProjectStage,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";

export interface ProjectSummary {
  id: string;
  tenantId: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  pricingConfig?: ProjectPricingConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStageSummary {
  id: string;
  stageId: ProjectStageId;
  order: number;
  status: ProjectStageStatus;
  createdAt: string;
  updatedAt: string;
}

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

export interface QuickBomSpineArtifacts {
  normalized_boq: ProjectArtifactSummary | null;
  sku_resolution: ProjectArtifactSummary | null;
  configuration_expansion: ProjectArtifactSummary | null;
  priced_boq: ProjectArtifactSummary | null;
  export_package: ProjectArtifactSummary | null;
}

export interface ProjectQuickBomWorkspace {
  project: ProjectSummary;
  stages: ProjectStageSummary[];
  artifacts: ProjectArtifactSummary[];
  spineArtifacts: QuickBomSpineArtifacts;
  approvals: ProjectApprovalSummary[];
  readiness: QuickBomReadinessReport;
}

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
    tenantId: project.tenantId,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    ...(project.pricingConfig !== undefined
      ? { pricingConfig: { ...project.pricingConfig } }
      : {}),
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
