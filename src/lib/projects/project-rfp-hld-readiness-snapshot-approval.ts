/**
 * RFP HLD readiness snapshot review/approval service (Stage 6.4b-2).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Records one approve/reject decision against the EXACT `hld_readiness_snapshot`
 * artifact version named by the caller. It loads the Project and the exact
 * artifact, gates on rfp mode, the hld_readiness_snapshot type within the
 * hld_design_delta_review stage, and reviewable status, then persists exactly
 * one approval via createProjectApproval (its only mutation; it never creates an
 * artifact version).
 *
 * Because the approved snapshot becomes HLD design-readiness authority, APPROVAL
 * also re-validates the exact persisted payload against the snapshot contract
 * before recording - confirming payloadKind, readiness="ready", ordered source ids,
 * required named sources, empty missingInputs, valid domain arrays, valid
 * assumptions, HLD intake source-mode provenance, and non-empty
 * validationMessages. A REJECTION may be recorded even when the payload is
 * malformed. This service runs no AI and makes no SKU/pricing/catalog/config/
 * design decision: it imports exactly the project store, the artifact store, the
 * approval store, the pure approval helper, the snapshot payload kind, and the HLD
 * domain definitions - no file/evidence store, no fs/path, no route or UI module.
 * Summaries are lean and serializable (ISO dates, copied arrays, no payload, no
 * tenantId).
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import { RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-readiness-snapshot";
import {
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS,
  type RfpHldDesignDomain,
} from "@/lib/projects/project-rfp-hld-domain-readiness";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";

const HLD_READINESS_SNAPSHOT_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "hld_readiness_snapshot";
const HLD_READINESS_SNAPSHOT_STAGE_ID: ProjectArtifact["stageId"] =
  "hld_design_delta_review";

const KNOWN_DOMAINS: ReadonlySet<string> = new Set(
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.map((d) => d.domain)
);

const ALLOWED_PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  "payloadKind", "createdBy", "createdAt", "readinessStatus",
  "sourceArtifactIds", "sourceEvidencePackageArtifactId",
  "sourceRequirementsBaselineArtifactId", "sourceComplianceMatrixArtifactId",
  "sourceConfigurationArtifactId", "sourceHldIntakeArtifactId",
  "hldIntakeSource", "coveredDomains", "excludedDomains", "domainReadiness",
  "assumptions", "missingInputs", "validationMessages",
]);

const ALLOWED_DOMAIN_READINESS_KEYS: ReadonlySet<string> = new Set([
  "claimedDomains", "coveredDomains", "excludedDomains",
  "requiredKnowledgePackDomains", "missingKnowledgePackDomains",
]);

const ALLOWED_ASSUMPTION_KEYS: ReadonlySet<string> = new Set([
  "fieldId", "label", "status", "note",
]);

const MANUAL_HLD_INTAKE_SOURCE_KEYS: ReadonlySet<string> = new Set([
  "sourceMode", "manualOverrideReason",
]);

const QUESTIONNAIRE_HLD_INTAKE_SOURCE_KEYS: ReadonlySet<string> = new Set([
  "sourceMode", "sourceQuestionnaireArtifactId",
]);

const REQUIRED_SOURCE_FIELDS = [
  "sourceEvidencePackageArtifactId",
  "sourceRequirementsBaselineArtifactId",
  "sourceComplianceMatrixArtifactId",
  "sourceConfigurationArtifactId",
  "sourceHldIntakeArtifactId",
] as const;

export interface ReviewRfpHldReadinessSnapshotArtifactInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  decidedAt?: Date;
  note?: string;
}

export interface RfpHldReadinessSnapshotReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldReadinessSnapshotReviewArtifactSummary {
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

export type ReviewRfpHldReadinessSnapshotArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldReadinessSnapshotReviewProjectSummary }
  | { status: "artifact_not_found" }
  | { status: "artifact_not_hld_readiness_snapshot"; artifact: RfpHldReadinessSnapshotReviewArtifactSummary }
  | { status: "artifact_not_reviewable"; artifact: RfpHldReadinessSnapshotReviewArtifactSummary }
  | { status: "invalid_hld_readiness_snapshot_payload"; artifact: RfpHldReadinessSnapshotReviewArtifactSummary }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      artifact: RfpHldReadinessSnapshotReviewArtifactSummary;
    };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonblankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isDomainArray(value: unknown): value is RfpHldDesignDomain[] {
  if (!Array.isArray(value)) return false;
  for (const d of value) {
    if (!KNOWN_DOMAINS.has(d)) return false;
  }
  return true;
}

function keysEqual(keys: readonly string[], allowed: ReadonlySet<string>): boolean {
  if (keys.length !== allowed.size) return false;
  for (const key of keys) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

function isHldIntakeSourceValid(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  if (value.sourceMode === "manual_override") {
    return keysEqual(keys, MANUAL_HLD_INTAKE_SOURCE_KEYS)
      && isNonblankString(value.manualOverrideReason);
  }
  if (value.sourceMode === "questionnaire_assisted") {
    return keysEqual(keys, QUESTIONNAIRE_HLD_INTAKE_SOURCE_KEYS)
      && isNonblankString(value.sourceQuestionnaireArtifactId);
  }
  return false;
}

function toProjectSummary(project: Project): RfpHldReadinessSnapshotReviewProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(artifact: ProjectArtifact): RfpHldReadinessSnapshotReviewArtifactSummary {
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

function isPersistedSnapshotPayloadValid(
  payload: unknown,
  artifactSourceArtifactIds: readonly string[]
): boolean {
  if (!isPlainRecord(payload)) return false;
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) return false;
  }
  if (payload.payloadKind !== RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND) return false;
  if (payload.readinessStatus !== "ready") return false;

  const srcIds = payload.sourceArtifactIds;
  if (!Array.isArray(srcIds) || srcIds.length === 0) return false;
  if (srcIds.length !== artifactSourceArtifactIds.length) return false;
  for (let i = 0; i < srcIds.length; i++) {
    if (srcIds[i] !== artifactSourceArtifactIds[i]) return false;
  }
  const srcSet = new Set<unknown>(srcIds);
  for (const field of REQUIRED_SOURCE_FIELDS) {
    if (!isNonblankString(payload[field])) return false;
    if (!srcSet.has(payload[field])) return false;
  }

  if (!isHldIntakeSourceValid(payload.hldIntakeSource)) return false;

  const mi = payload.missingInputs;
  if (!Array.isArray(mi) || mi.length !== 0) return false;

  if (!isDomainArray(payload.coveredDomains)) return false;
  if (!isDomainArray(payload.excludedDomains)) return false;

  const dr = payload.domainReadiness;
  if (!isPlainRecord(dr)) return false;
  const drKeys = Object.keys(dr);
  if (drKeys.length !== ALLOWED_DOMAIN_READINESS_KEYS.size) return false;
  for (const key of drKeys) {
    if (!ALLOWED_DOMAIN_READINESS_KEYS.has(key)) return false;
  }
  if (!isDomainArray(dr["claimedDomains"])) return false;
  if (!isDomainArray(dr["coveredDomains"])) return false;
  if (!isDomainArray(dr["excludedDomains"])) return false;
  if (!isDomainArray(dr["requiredKnowledgePackDomains"])) return false;
  if (!isDomainArray(dr["missingKnowledgePackDomains"])) return false;
  if ((dr["missingKnowledgePackDomains"] as unknown[]).length !== 0) return false;

  const assumptions = payload.assumptions;
  if (!Array.isArray(assumptions)) return false;
  for (const a of assumptions) {
    if (!isPlainRecord(a)) return false;
    for (const key of Object.keys(a)) {
      if (!ALLOWED_ASSUMPTION_KEYS.has(key)) return false;
    }
    if (!isNonblankString(a.fieldId)) return false;
    if (typeof a.label !== "string") return false;
    if (a.status !== "unknown" && a.status !== "not_applicable") return false;
    if ("note" in a && !isNonblankString(a.note)) return false;
  }

  const vm = payload.validationMessages;
  if (!Array.isArray(vm) || vm.length === 0) return false;
  for (const msg of vm) {
    if (typeof msg !== "string") return false;
  }

  return true;
}

/**
 * Review (approve/reject) one EXACT hld_readiness_snapshot artifact version,
 * tenant scoped on every store call. Validates nonblank artifactId then decidedBy
 * before any store call. Gates in order: project existence, rfp mode, exact
 * artifact existence, hld_readiness_snapshot type in hld_design_delta_review stage,
 * reviewable status. An APPROVAL additionally re-validates the exact persisted
 * payload (blocking with invalid_hld_readiness_snapshot_payload, content never
 * leaked); a REJECTION skips that gate so malformed snapshots can still be
 * rejected. On a passing path it persists exactly one approval (the only mutation)
 * and returns the approval, the post-decision artifact/stage statuses, and the
 * pre-approval artifact summary. Unexpected errors bubble; only a null
 * createProjectApproval maps to approval_failed.
 */
export async function reviewRfpHldReadinessSnapshotArtifact(
  input: ReviewRfpHldReadinessSnapshotArtifactInput
): Promise<ReviewRfpHldReadinessSnapshotArtifactResult> {
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
  if (artifact === null) return { status: "artifact_not_found" };
  if (
    artifact.type !== HLD_READINESS_SNAPSHOT_ARTIFACT_TYPE ||
    artifact.stageId !== HLD_READINESS_SNAPSHOT_STAGE_ID
  ) {
    return { status: "artifact_not_hld_readiness_snapshot", artifact: toArtifactSummary(artifact) };
  }
  if (!isArtifactReviewable(artifact)) {
    return { status: "artifact_not_reviewable", artifact: toArtifactSummary(artifact) };
  }

  if (
    decision === "approved" &&
    !isPersistedSnapshotPayloadValid(artifact.payload, artifact.sourceArtifactIds)
  ) {
    return { status: "invalid_hld_readiness_snapshot_payload", artifact: toArtifactSummary(artifact) };
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
