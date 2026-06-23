/**
 * RFP HLD intake inspection read model (Stage 6.2b).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Read-only engineer inspection over `hld_intake` artifact versions. The list
 * returns lean artifact summaries plus identifier/count payload summaries (never
 * answer values or notes). The detail returns one exact artifact version with
 * whitelisted answer fields - and unlike raw-document read models it MAY show the
 * answer value/notes, because intake is engineer-authored design context, not raw
 * RFP document text. It writes nothing, approves nothing, reads no file/evidence
 * stores, runs no AI, makes no SKU/pricing/catalog/config/design decision, and
 * never surfaces tenant ids, file paths, storage paths, or raw source bodies.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import type { Project, ProjectArtifact } from "@/types/project";
import {
  RFP_HLD_INTAKE_PAYLOAD_KIND,
  type RfpHldIntakeAnswerStatus,
  type RfpHldIntakeStatusCounts,
} from "@/lib/projects/project-rfp-hld-intake";

const HLD_INTAKE_ARTIFACT_TYPE: ProjectArtifact["type"] = "hld_intake";
const HLD_INTAKE_STAGE_ID: ProjectArtifact["stageId"] =
  "hld_design_delta_review";

const HLD_INTAKE_ANSWER_STATUSES: readonly RfpHldIntakeAnswerStatus[] = [
  "answered",
  "unknown",
  "not_applicable",
];

export interface RfpHldIntakeInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldIntakeInspectionArtifactSummary {
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

/** Lean payload summary: provenance and counts only, never answer values/notes. */
export interface RfpHldIntakeInspectionPayloadSummary {
  payloadKind: string;
  createdBy: string;
  createdAt: string;
  answerCount: number;
  statusCounts: RfpHldIntakeStatusCounts;
  fieldIds: string[];
}

export interface RfpHldIntakeInspectionListItem
  extends RfpHldIntakeInspectionArtifactSummary {
  payloadSummary: RfpHldIntakeInspectionPayloadSummary;
}

export interface LoadRfpHldIntakeListInput {
  tenantId: string;
  projectId: string;
}

export type LoadRfpHldIntakeListResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldIntakeInspectionProjectSummary }
  | {
      status: "ok";
      project: RfpHldIntakeInspectionProjectSummary;
      artifacts: RfpHldIntakeInspectionListItem[];
      artifactCount: number;
    };

/**
 * Sanitized intake answer for detail: only the whitelisted fields are copied;
 * value/notes are surfaced because intake is engineer-authored context. Status
 * is whitelisted to the known dispositions; a malformed stored status is dropped
 * to undefined rather than echoed.
 */
export interface RfpHldIntakeInspectionAnswer {
  fieldId: string;
  label: string;
  status?: RfpHldIntakeAnswerStatus;
  value?: string;
  notes?: string;
}

export interface RfpHldIntakeInspectionDetailPayload {
  payloadKind: string;
  createdBy: string;
  createdAt: string;
  answerCount: number;
  statusCounts: RfpHldIntakeStatusCounts;
  answers: RfpHldIntakeInspectionAnswer[];
}

export interface LoadRfpHldIntakeDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

export type LoadRfpHldIntakeDetailResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldIntakeInspectionProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_intake";
      artifact: RfpHldIntakeInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpHldIntakeInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpHldIntakeInspectionProjectSummary;
      artifact: RfpHldIntakeInspectionArtifactSummary;
      intake: RfpHldIntakeInspectionDetailPayload;
    };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNonblankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function asAnswerStatus(value: unknown): RfpHldIntakeAnswerStatus | undefined {
  return typeof value === "string" &&
    (HLD_INTAKE_ANSWER_STATUSES as readonly string[]).includes(value)
    ? (value as RfpHldIntakeAnswerStatus)
    : undefined;
}

function emptyStatusCounts(): RfpHldIntakeStatusCounts {
  return { answered: 0, unknown: 0, not_applicable: 0 };
}

/** Tally only known statuses; malformed/unknown stored statuses are ignored. */
function tallyStatusCounts(answers: unknown): RfpHldIntakeStatusCounts {
  const counts = emptyStatusCounts();
  if (!Array.isArray(answers)) return counts;
  for (const entry of answers) {
    if (!isPlainRecord(entry)) continue;
    const status = asAnswerStatus(entry.status);
    if (status !== undefined) counts[status] += 1;
  }
  return counts;
}

function toFieldIds(answers: unknown): string[] {
  if (!Array.isArray(answers)) return [];
  return answers.map((entry) =>
    isPlainRecord(entry) ? asString(entry.fieldId) : ""
  );
}

function toProjectSummary(
  project: Project
): RfpHldIntakeInspectionProjectSummary {
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
): RfpHldIntakeInspectionArtifactSummary {
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

/** Lean payload summary: counts and field ids only, never answer values/notes. */
function toPayloadSummary(
  payload: unknown
): RfpHldIntakeInspectionPayloadSummary {
  const record = toRecord(payload);
  const answers = record.answers;
  return {
    payloadKind: asString(record.payloadKind),
    createdBy: asString(record.createdBy),
    createdAt: asString(record.createdAt),
    answerCount: Array.isArray(answers) ? answers.length : 0,
    statusCounts: tallyStatusCounts(answers),
    fieldIds: toFieldIds(answers),
  };
}

function toListItem(
  artifact: ProjectArtifact
): RfpHldIntakeInspectionListItem {
  return {
    ...toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(artifact.payload),
  };
}

/**
 * Copy only the whitelisted answer fields, dropping any arbitrary extra keys
 * (e.g. tenantId, storagePath, rawText, sourcePath). value/notes are surfaced
 * only when nonblank strings; status only when a known disposition.
 */
function toAnswer(entry: unknown): RfpHldIntakeInspectionAnswer {
  const record = toRecord(entry);
  const status = asAnswerStatus(record.status);
  const value = asNonblankString(record.value);
  const notes = asNonblankString(record.notes);
  return {
    fieldId: asString(record.fieldId),
    label: asString(record.label),
    ...(status !== undefined ? { status } : {}),
    ...(value !== undefined ? { value } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

export async function loadRfpHldIntakeList(
  input: LoadRfpHldIntakeListInput
): Promise<LoadRfpHldIntakeListResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const rows = await listProjectArtifactsByType(
    tenantId,
    projectId,
    HLD_INTAKE_ARTIFACT_TYPE
  );
  const artifacts = rows
    .filter((row) => row.type === HLD_INTAKE_ARTIFACT_TYPE)
    .map((row) => toListItem(row));

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifacts,
    artifactCount: artifacts.length,
  };
}

export async function loadRfpHldIntakeDetail(
  input: LoadRfpHldIntakeDetailInput
): Promise<LoadRfpHldIntakeDetailResult> {
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
  if (artifact === null) return { status: "artifact_not_found" };
  if (
    artifact.type !== HLD_INTAKE_ARTIFACT_TYPE ||
    artifact.stageId !== HLD_INTAKE_STAGE_ID
  ) {
    return {
      status: "artifact_not_hld_intake",
      artifact: toArtifactSummary(artifact),
    };
  }

  const payload = toRecord(artifact.payload);
  const answers = payload.answers;
  if (
    payload.payloadKind !== RFP_HLD_INTAKE_PAYLOAD_KIND ||
    !Array.isArray(answers) ||
    answers.some((entry) => !isPlainRecord(entry))
  ) {
    return {
      status: "invalid_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  const sanitized = answers.map((entry) => toAnswer(entry));
  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    intake: {
      payloadKind: RFP_HLD_INTAKE_PAYLOAD_KIND,
      createdBy: asString(payload.createdBy),
      createdAt: asString(payload.createdAt),
      answerCount: sanitized.length,
      statusCounts: tallyStatusCounts(answers),
      answers: sanitized,
    },
  };
}
