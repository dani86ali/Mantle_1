/**
 * Shared Project BoQ exact-artifact approval core (section 16).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Gates and records ONE approve/reject decision against an EXACT BoQ artifact via
 * createProjectApproval (its only mutation; never a new artifact version), then
 * reloads a caller-injected read model. It never prices, expands configuration,
 * resolves SKUs, exports, runs the runner, calls AI, or looks up a catalog.
 * Tenant-scoped; approval is per exact artifact id only; lanes (e.g. Quick BoM)
 * pin expectedMode and loadWorkspace.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageStatus,
} from "@/types/project";

/** Approval-gated BoQ artifact types (section 11, 11A); excludes normalized_boq. */
export const CANONICAL_BOQ_APPROVAL_GATED_ARTIFACT_TYPES: readonly ProjectArtifactType[] =
  ["sku_resolution", "configuration_expansion", "priced_boq", "export_package"];

/** Payload-free project projection returned by mode-gate failures. */
export interface ProjectBoqApprovalProjectSummary {
  id: string;
  tenantId: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  pricingConfig?: Project["pricingConfig"];
  createdAt: string;
  updatedAt: string;
}

/** Payload-free artifact projection returned by artifact-gate failures. */
export interface ProjectBoqApprovalArtifactSummary {
  id: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  filePath?: string;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Caller-facing approval request shared by every BoQ approval lane. */
export interface ReviewProjectBoqArtifactRequest {
  tenantId: string;
  projectId: string;
  /** The exact artifact version under review; identity is this id only. */
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  /** Defaults to now downstream (via the materializer) when omitted. */
  decidedAt?: Date;
  note?: string;
  /**
   * Optional narrower allowlist; INTERSECTED with the canonical set so it can only
   * narrow, never widen (a non-canonical type is dropped -> artifact_not_quick_bom,
   * and it never makes a config-expansion draft approvable).
   */
  allowedArtifactTypes?: readonly ProjectArtifactType[];
}

/** Full core input: the request plus the two values a lane wrapper pins. W is opaque. */
export interface ReviewProjectBoqArtifactCoreInput<W>
  extends ReviewProjectBoqArtifactRequest {
  /** Project.mode this lane requires; any mismatch yields wrong_mode. */
  expectedMode: ProjectMode;
  /** Lane read-model loader, tenant-scoped, run only after approval succeeds. */
  loadWorkspace: (tenantId: string, projectId: string) => Promise<W>;
}

/** Discriminated result of {@link reviewProjectBoqArtifact}, generic over read model W. */
export type ReviewProjectBoqArtifactCoreResult<W> =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: ProjectBoqApprovalProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_quick_bom";
      artifact: ProjectBoqApprovalArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: ProjectBoqApprovalArtifactSummary;
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      workspace: W;
    };

function iso(value: Date): string {
  return value.toISOString();
}

/** Payload-free project projection mirroring the workspace read model. */
function toProjectSummary(project: Project): ProjectBoqApprovalProjectSummary {
  return {
    id: project.id,
    tenantId: project.tenantId,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    ...(project.pricingConfig !== undefined ? { pricingConfig: { ...project.pricingConfig } } : {}),
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
  };
}

/**
 * True for a persisted config-expansion DRAFT (payload marker
 * "configuration_expansion_draft"): never approvable here; no config-expansion import.
 */
function isConfigurationExpansionDraftArtifact(
  artifact: ProjectArtifact
): boolean {
  return (
    artifact.type === "configuration_expansion" &&
    artifact.payload.payloadKind === "configuration_expansion_draft"
  );
}

/** Payload-free artifact projection; the payload must never leak into a response. */
function toArtifactSummary(
  artifact: ProjectArtifact
): ProjectBoqApprovalArtifactSummary {
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

/**
 * Review (approve/reject) one EXACT BoQ artifact version, tenant-scoped. Gates in
 * order: nonblank artifactId/decidedBy, project, expectedMode, exact artifact,
 * approval-gated type (narrowed by allowedArtifactTypes), config-expansion draft,
 * reviewability; then persists one approval and returns the injected read model.
 * Errors bubble; only a null createProjectApproval maps to approval_failed.
 */
export async function reviewProjectBoqArtifact<W>(
  input: ReviewProjectBoqArtifactCoreInput<W>
): Promise<ReviewProjectBoqArtifactCoreResult<W>> {
  if (!input.artifactId || input.artifactId.trim() === "") {
    throw new Error("artifactId is required.");
  }
  if (!input.decidedBy || input.decidedBy.trim() === "") {
    throw new Error("decidedBy is required.");
  }

  const { tenantId, projectId, artifactId, decision, decidedBy, expectedMode } = input;
  // Intersection with the canonical set: callers can only narrow, never widen.
  const allowedArtifactTypes =
    input.allowedArtifactTypes === undefined
      ? CANONICAL_BOQ_APPROVAL_GATED_ARTIFACT_TYPES
      : input.allowedArtifactTypes.filter((type) =>
          CANONICAL_BOQ_APPROVAL_GATED_ARTIFACT_TYPES.includes(type)
        );

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== expectedMode) {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) return { status: "artifact_not_found" };
  if (!allowedArtifactTypes.includes(artifact.type)) {
    return {
      status: "artifact_not_quick_bom",
      artifact: toArtifactSummary(artifact),
    };
  }
  // A draft is created `needs_review` (otherwise reviewable), so only the marker keeps it out.
  if (isConfigurationExpansionDraftArtifact(artifact)) {
    return {
      status: "artifact_not_reviewable",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (!isArtifactReviewable(artifact)) {
    return {
      status: "artifact_not_reviewable",
      artifact: toArtifactSummary(artifact),
    };
  }

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

  const workspace = await input.loadWorkspace(tenantId, projectId);

  return {
    status: "ok",
    approval: created.approval,
    artifactStatus: created.artifactStatus,
    stageStatus: created.stageStatus,
    workspace,
  };
}
