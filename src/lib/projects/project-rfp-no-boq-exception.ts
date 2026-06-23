/**
 * RFP no-BoQ / service-only exception creation service.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (sections 5, 7, 11, 12).
 *
 * Records ONE explicit, human-requested "this RFP package has no BoQ - it is
 * service only" exception as a single `needs_review` `configuration_expansion`
 * artifact on the `configuration_expansion_review` stage, carrying the stable
 * payload kind below. It is the only artifact that can later (once approved
 * through the existing approvals path) clear the configuration gate when no BoQ
 * file was uploaded. This service never approves the artifact itself, never
 * inspects file contents, and never reads or writes a BoQ line. After writing it
 * reloads files and artifacts and returns the pure read-only readiness report.
 */
import { getProjectById } from "@/lib/db/project-store";
import { listProjectFiles } from "@/lib/db/project-file-store";
import {
  createProjectArtifactVersion,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";
import {
  getRfpBoqReadinessReport,
  type RfpBoqReadinessReport,
} from "@/lib/projects/project-rfp-boq-readiness";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectMode,
  ProjectStageId,
  ProjectArtifactType,
} from "@/types/project";

/** Stable payload kind marking the human-requested no-BoQ / service-only exception. */
export const RFP_NO_BOQ_SERVICE_ONLY_EXCEPTION_PAYLOAD_KIND =
  "rfp_no_boq_service_only_exception";

/** Stage and type the exception artifact is recorded under. */
const EXCEPTION_STAGE_ID: ProjectStageId = "configuration_expansion_review";
const EXCEPTION_ARTIFACT_TYPE: ProjectArtifactType = "configuration_expansion";

/**
 * Statuses that mean a prior exception still stands and must not be duplicated.
 * A `rejected` or `stale` exception may be superseded by a fresh request.
 */
const BLOCKING_EXCEPTION_STATUSES: readonly ProjectArtifactStatus[] = [
  "generated",
  "needs_review",
  "approved",
];

/** Input for {@link createRfpNoBoqServiceOnlyException}. */
export interface CreateRfpNoBoqServiceOnlyExceptionInput {
  tenantId: string;
  projectId: string;
  reason: string;
  requestedBy: string;
  /** Defaults to now when omitted; stored as an ISO string. */
  requestedAt?: Date;
}

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export interface RfpNoBoqExceptionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpNoBoqExceptionArtifactSummary {
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

/** Serializable payload summary: provenance fields only; never line content. */
export interface RfpNoBoqExceptionPayloadSummary {
  payloadKind: typeof RFP_NO_BOQ_SERVICE_ONLY_EXCEPTION_PAYLOAD_KIND;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  acceptedLineCount: 0;
}

/** Discriminated result of {@link createRfpNoBoqServiceOnlyException}. */
export type CreateRfpNoBoqServiceOnlyExceptionResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpNoBoqExceptionProjectSummary }
  | { status: "boq_files_present" }
  | {
      status: "exception_already_exists";
      artifact: RfpNoBoqExceptionArtifactSummary;
    }
  | {
      status: "ok";
      artifact: RfpNoBoqExceptionArtifactSummary;
      payloadSummary: RfpNoBoqExceptionPayloadSummary;
      workspace: RfpBoqReadinessReport;
    };

function iso(value: Date): string {
  return value.toISOString();
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): RfpNoBoqExceptionProjectSummary {
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

/** Project an artifact to a serializable summary; source arrays are copied, payload dropped. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpNoBoqExceptionArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: [...artifact.sourceFileIds],
    sourceArtifactIds: [...artifact.sourceArtifactIds],
    createdAt: iso(artifact.createdAt),
    updatedAt: iso(artifact.updatedAt),
  };
}

/** True for a no-BoQ exception artifact: matching stage, type, and payload kind. */
function isNoBoqExceptionArtifact(artifact: ProjectArtifact): boolean {
  if (
    artifact.type !== EXCEPTION_ARTIFACT_TYPE ||
    artifact.stageId !== EXCEPTION_STAGE_ID
  ) {
    return false;
  }
  return (
    artifact.payload.payloadKind ===
    RFP_NO_BOQ_SERVICE_ONLY_EXCEPTION_PAYLOAD_KIND
  );
}

/** Highest-version no-BoQ exception for `projectId`; undefined when none. */
function latestNoBoqException(
  artifacts: readonly ProjectArtifact[],
  projectId: string
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const artifact of artifacts) {
    if (artifact.projectId !== projectId) continue;
    if (!isNoBoqExceptionArtifact(artifact)) continue;
    if (latest === undefined || artifact.version > latest.version) {
      latest = artifact;
    }
  }
  return latest;
}

/**
 * Record one no-BoQ / service-only exception for an RFP project. Gates in order:
 * nonblank reason/requestedBy (thrown programmer errors before any store call),
 * project exists, mode is rfp, no BoQ file is present, and no standing exception
 * already blocks a duplicate. On success it writes a single `needs_review`
 * exception artifact, then reloads files and artifacts and returns the pure
 * readiness report. It never approves the artifact and never touches line content.
 */
export async function createRfpNoBoqServiceOnlyException(
  input: CreateRfpNoBoqServiceOnlyExceptionInput
): Promise<CreateRfpNoBoqServiceOnlyExceptionResult> {
  const { tenantId, projectId } = input;
  const reason = input.reason;
  const requestedBy = input.requestedBy;

  if (typeof reason !== "string" || reason.trim() === "") {
    throw new Error("reason is required.");
  }
  if (typeof requestedBy !== "string" || requestedBy.trim() === "") {
    throw new Error("requestedBy is required.");
  }

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const files = await listProjectFiles(tenantId, projectId);
  if (files.some((file) => file.fileRole === "boq")) {
    return { status: "boq_files_present" };
  }

  const existingArtifacts = await listProjectArtifacts(tenantId, projectId);
  const standing = latestNoBoqException(existingArtifacts, projectId);
  if (standing !== undefined && BLOCKING_EXCEPTION_STATUSES.includes(standing.status)) {
    return {
      status: "exception_already_exists",
      artifact: toArtifactSummary(standing),
    };
  }

  const requestedAt = iso(input.requestedAt ?? new Date());
  const created = await createProjectArtifactVersion({
    tenantId,
    projectId,
    stageId: EXCEPTION_STAGE_ID,
    type: EXCEPTION_ARTIFACT_TYPE,
    status: "needs_review",
    sourceFileIds: [],
    sourceArtifactIds: [],
    payload: {
      payloadKind: RFP_NO_BOQ_SERVICE_ONLY_EXCEPTION_PAYLOAD_KIND,
      reason,
      requestedBy,
      requestedAt,
      acceptedLines: [],
      rejectedLines: [],
      lineCount: 0,
      summary: {
        acceptedLineCount: 0,
        rejectedLineCount: 0,
        lineCount: 0,
      },
    },
  });

  const [files2, artifacts2] = await Promise.all([
    listProjectFiles(tenantId, projectId),
    listProjectArtifacts(tenantId, projectId),
  ]);
  const workspace = getRfpBoqReadinessReport({
    projectId,
    files: files2,
    artifacts: artifacts2,
  });

  const payloadSummary: RfpNoBoqExceptionPayloadSummary = {
    payloadKind: RFP_NO_BOQ_SERVICE_ONLY_EXCEPTION_PAYLOAD_KIND,
    reason,
    requestedBy,
    requestedAt,
    acceptedLineCount: 0,
  };

  return {
    status: "ok",
    artifact: toArtifactSummary(created),
    payloadSummary,
    workspace,
  };
}
