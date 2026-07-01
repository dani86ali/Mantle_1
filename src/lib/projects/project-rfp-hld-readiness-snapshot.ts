/**
 * Deterministic RFP HLD readiness snapshot draft service (Stage 6.4a).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Persists ONE reviewable `hld_readiness_snapshot` artifact (status
 * `needs_review`) on the existing `hld_design_delta_review` stage, and ONLY when
 * the pure readiness report is ready. The snapshot is a REVIEWABLE record of which
 * approved authorities are in place - it is NOT final HLD authority (human approval
 * comes in the next slice) and it generates no HLD model, diagram, document, or
 * proposal. The artifact references its approved upstream authorities through
 * sourceArtifactIds; it reads no raw RFP file (sourceFileIds is empty).
 *
 * This service runs no AI and makes no SKU/pricing/catalog/validation/configuration
 * decision: it reads approved Project artifacts, delegates the gate to the pure
 * readiness report, and writes. It imports exactly the project store, the file
 * store, the artifact store, the pure readiness report, and canonical project
 * types - no fs/path, no pricing/SKU/catalog/config authority, no AI/provider, no
 * route or UI module.
 */
import { getProjectById } from "@/lib/db/project-store";
import { listProjectFiles } from "@/lib/db/project-file-store";
import {
  createProjectArtifactVersion,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";
import {
  getRfpHldReadinessReport,
  type RfpHldReadinessReport,
} from "@/lib/projects/project-rfp-hld-readiness";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

/** Stable discriminator for the persisted `hld_readiness_snapshot` payload. */
export const RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND =
  "rfp_hld_readiness_snapshot" as const;

/** Input for {@link createRfpHldReadinessSnapshotDraft}. */
export interface CreateRfpHldReadinessSnapshotDraftInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  /** Optional fixed timestamp for deterministic tests; defaults to now. */
  createdAt?: Date;
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
export interface RfpHldReadinessSnapshotProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload body. */
export interface RfpHldReadinessSnapshotArtifactSummary {
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

/** Lean payload summary: provenance and counts only, never raw text/paths. */
export interface RfpHldReadinessSnapshotPayloadSummary {
  payloadKind: typeof RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  readinessStatus: RfpHldReadinessReport["status"];
  sourceArtifactCount: number;
  assumptionCount: number;
}

/** The persisted `hld_readiness_snapshot` payload (reviewable, no raw docs/paths). */
type RfpHldReadinessSnapshotPayload = {
  payloadKind: typeof RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  readinessStatus: RfpHldReadinessReport["status"];
  sourceArtifactIds: string[];
  sourceEvidencePackageArtifactId?: string;
  sourceRequirementsBaselineArtifactId?: string;
  sourceComplianceMatrixArtifactId?: string;
  sourceConfigurationArtifactId?: string;
  sourceHldIntakeArtifactId?: string;
  /** Corrected HLD intake source-mode/provenance; present only when valid. */
  hldIntakeSource?: RfpHldReadinessReport["hldIntakeSource"];
  coveredDomains: RfpHldReadinessReport["coveredDomains"];
  excludedDomains: RfpHldReadinessReport["excludedDomains"];
  domainReadiness: RfpHldReadinessReport["domainReadiness"];
  assumptions: RfpHldReadinessReport["assumptions"];
  missingInputs: RfpHldReadinessReport["missingInputs"];
  validationMessages: string[];
};

/** Discriminated result of {@link createRfpHldReadinessSnapshotDraft}. */
export type CreateRfpHldReadinessSnapshotDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldReadinessSnapshotProjectSummary }
  | { status: "blocked"; readiness: RfpHldReadinessReport }
  | {
      status: "ok";
      artifact: RfpHldReadinessSnapshotArtifactSummary;
      payloadSummary: RfpHldReadinessSnapshotPayloadSummary;
      readiness: RfpHldReadinessReport;
    };

/** Trim a value to a string, or "" when it is not a string. */
function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): RfpHldReadinessSnapshotProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Project an artifact to a serializable summary; source arrays copied, payload dropped. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpHldReadinessSnapshotArtifactSummary {
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

/** Build the reviewable snapshot payload from the ready readiness report. */
function buildPayload(
  report: RfpHldReadinessReport,
  createdBy: string,
  createdAt: string
): RfpHldReadinessSnapshotPayload {
  return {
    payloadKind: RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND,
    createdBy,
    createdAt,
    readinessStatus: report.status,
    sourceArtifactIds: [...report.sourceArtifactIds],
    ...(report.sourceEvidencePackageArtifactId !== undefined
      ? { sourceEvidencePackageArtifactId: report.sourceEvidencePackageArtifactId }
      : {}),
    ...(report.sourceRequirementsBaselineArtifactId !== undefined
      ? { sourceRequirementsBaselineArtifactId: report.sourceRequirementsBaselineArtifactId }
      : {}),
    ...(report.sourceComplianceMatrixArtifactId !== undefined
      ? { sourceComplianceMatrixArtifactId: report.sourceComplianceMatrixArtifactId }
      : {}),
    ...(report.sourceConfigurationArtifactId !== undefined
      ? { sourceConfigurationArtifactId: report.sourceConfigurationArtifactId }
      : {}),
    ...(report.sourceHldIntakeArtifactId !== undefined
      ? { sourceHldIntakeArtifactId: report.sourceHldIntakeArtifactId }
      : {}),
    ...(report.hldIntakeSource !== undefined
      ? { hldIntakeSource: report.hldIntakeSource }
      : {}),
    coveredDomains: [...report.coveredDomains],
    excludedDomains: [...report.excludedDomains],
    domainReadiness: report.domainReadiness,
    assumptions: report.assumptions,
    missingInputs: [...report.missingInputs],
    validationMessages: [...report.validationMessages],
  };
}

/** Project the payload to a lean summary: provenance and counts only. */
function toPayloadSummary(
  payload: RfpHldReadinessSnapshotPayload
): RfpHldReadinessSnapshotPayloadSummary {
  return {
    payloadKind: payload.payloadKind,
    createdBy: payload.createdBy,
    createdAt: payload.createdAt,
    readinessStatus: payload.readinessStatus,
    sourceArtifactCount: payload.sourceArtifactIds.length,
    assumptionCount: payload.assumptions.length,
  };
}

/**
 * Create ONE `needs_review` `hld_readiness_snapshot` on `hld_design_delta_review`,
 * but only when the pure readiness report is ready. Blank identifiers are rejected
 * before any store call. The project is verified within its tenant
 * (not_found / wrong_mode, lean summary that never leaks tenantId). A blocked
 * report returns `{ status: "blocked", readiness }` and writes nothing. When ready,
 * exactly one artifact is written, sourced from the approved upstream authorities
 * (empty sourceFileIds - no raw RFP file is read). Returns lean summaries plus the
 * readiness report; the full payload body stays in the persisted artifact.
 */
export async function createRfpHldReadinessSnapshotDraft(
  input: CreateRfpHldReadinessSnapshotDraftInput
): Promise<CreateRfpHldReadinessSnapshotDraftResult> {
  const projectId = asTrimmed(input.projectId);
  const createdBy = asTrimmed(input.createdBy);
  if (projectId === "") throw new Error("HLD readiness snapshot requires a projectId.");
  if (createdBy === "") throw new Error("HLD readiness snapshot requires a createdBy.");

  const project = await getProjectById(input.tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const [files, artifacts] = await Promise.all([
    listProjectFiles(input.tenantId, projectId),
    listProjectArtifacts(input.tenantId, projectId),
  ]);

  const readiness = getRfpHldReadinessReport({ projectId, files, artifacts });
  if (!readiness.canCreateReadinessSnapshot) {
    return { status: "blocked", readiness };
  }

  const createdAt = (input.createdAt ?? new Date()).toISOString();
  const payload = buildPayload(readiness, createdBy, createdAt);

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId: input.tenantId,
    stageId: "hld_design_delta_review",
    type: "hld_readiness_snapshot",
    status: "needs_review",
    payload,
    sourceFileIds: [],
    sourceArtifactIds: readiness.sourceArtifactIds,
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(payload),
    readiness,
  };
}
