/**
 * RFP HLD intake-questionnaire inspection read model (Stage 6H-0E-C).
 * Source of truth: the MVP canonical project state and active HLD agentic
 * authority-chain roadmap (Stage 6 HLD readiness).
 *
 * Read-only engineer inspection over `hld_intake_questionnaire` artifact versions.
 * The list returns lean artifact summaries plus provenance/count payload summaries
 * (never question text or answers). The detail returns one exact artifact version
 * with whitelisted CANDIDATE question fields and the embedded validation summary -
 * candidate question text and rationale MAY show (they are review input, not
 * authority), but answers, raw source bodies, provider output, hidden prompts, and
 * final-authority claims never do. The questionnaire is candidate/review input:
 * this module writes nothing, approves nothing, reads no file/evidence stores, runs
 * no AI, makes no SKU/pricing/catalog/config/design decision, and never surfaces
 * tenant ids, file paths, or storage paths.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
  validateRfpHldIntakeQuestionnairePayload,
  type RfpHldIntakeQuestionnairePayload,
  type RfpHldIntakeQuestionnaireQuestion,
  type RfpHldIntakeQuestionnaireSourceRef,
  type RfpHldIntakeQuestionnaireValidationSummary,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire";
import type { Project, ProjectArtifact } from "@/types/project";

const QUESTIONNAIRE_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "hld_intake_questionnaire";
const QUESTIONNAIRE_STAGE_ID: ProjectArtifact["stageId"] =
  "hld_design_delta_review";

export interface RfpHldIntakeQuestionnaireInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldIntakeQuestionnaireInspectionArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  version: number;
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lean payload summary: provenance and counts only, never question text/answers. */
export interface RfpHldIntakeQuestionnaireInspectionPayloadSummary {
  payloadKind: string;
  createdBy: string;
  createdAt: string;
  questionCount: number;
  sourceArtifactCount: number;
  sourceRefCount: number;
  validationStatus: string;
  validationFindingCount: number;
  payloadValid: boolean;
}

export interface RfpHldIntakeQuestionnaireInspectionListItem
  extends RfpHldIntakeQuestionnaireInspectionArtifactSummary {
  payloadSummary: RfpHldIntakeQuestionnaireInspectionPayloadSummary;
}

export interface LoadRfpHldIntakeQuestionnaireListInput {
  tenantId: string;
  projectId: string;
}

export type LoadRfpHldIntakeQuestionnaireListResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpHldIntakeQuestionnaireInspectionProjectSummary;
    }
  | {
      status: "ok";
      project: RfpHldIntakeQuestionnaireInspectionProjectSummary;
      artifacts: RfpHldIntakeQuestionnaireInspectionListItem[];
      artifactCount: number;
    };

/** Sanitized candidate question (whitelisted fields only; never an answer). */
export interface RfpHldIntakeQuestionnaireInspectionQuestion {
  questionId: string;
  order: number;
  domain: string;
  questionText: string;
  whyAsked: string;
  answerType: string;
  required: boolean;
  sourceRefIds: string[];
  allowedOptions?: string[];
  requiredInputIds?: string[];
}

/** Sanitized closed source ref (provenance catalog projection). */
export interface RfpHldIntakeQuestionnaireInspectionSourceRef {
  refId: string;
  artifactId: string;
  artifactType: string;
  stageId: string;
  status: "approved";
  version: number;
  payloadKind: string;
  label: string;
}

export interface RfpHldIntakeQuestionnaireInspectionValidation {
  status: string;
  checkedAt: string;
  findingCount: number;
  findings: RfpHldIntakeQuestionnaireValidationSummary["findings"];
}

export interface RfpHldIntakeQuestionnaireInspectionDetailPayload {
  payloadKind: string;
  createdBy: string;
  createdAt: string;
  sourceArtifactIds: string[];
  sourceRefs: RfpHldIntakeQuestionnaireInspectionSourceRef[];
  questions: RfpHldIntakeQuestionnaireInspectionQuestion[];
  validation: RfpHldIntakeQuestionnaireInspectionValidation;
}

export interface LoadRfpHldIntakeQuestionnaireDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

export type LoadRfpHldIntakeQuestionnaireDetailResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpHldIntakeQuestionnaireInspectionProjectSummary;
    }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_questionnaire";
      artifact: RfpHldIntakeQuestionnaireInspectionArtifactSummary;
    }
  | {
      status: "invalid_questionnaire_payload";
      artifact: RfpHldIntakeQuestionnaireInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpHldIntakeQuestionnaireInspectionProjectSummary;
      artifact: RfpHldIntakeQuestionnaireInspectionArtifactSummary;
      questionnaire: RfpHldIntakeQuestionnaireInspectionDetailPayload;
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

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function toProjectSummary(
  project: Project
): RfpHldIntakeQuestionnaireInspectionProjectSummary {
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
): RfpHldIntakeQuestionnaireInspectionArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/** Lean payload summary: provenance/counts and validity only, never question text. */
function toPayloadSummary(
  payload: unknown
): RfpHldIntakeQuestionnaireInspectionPayloadSummary {
  const record = toRecord(payload);
  const questions = record.questions;
  const sourceArtifactIds = record.sourceArtifactIds;
  const sourceRefs = record.sourceRefs;
  const validation = toRecord(record.validation);
  return {
    payloadKind: asString(record.payloadKind),
    createdBy: asString(record.createdBy),
    createdAt: asString(record.createdAt),
    questionCount: Array.isArray(questions) ? questions.length : 0,
    sourceArtifactCount: Array.isArray(sourceArtifactIds)
      ? sourceArtifactIds.length
      : 0,
    sourceRefCount: Array.isArray(sourceRefs) ? sourceRefs.length : 0,
    validationStatus: asString(validation.status),
    validationFindingCount: asCount(validation.findingCount),
    payloadValid: validateRfpHldIntakeQuestionnairePayload(payload).valid,
  };
}

function toListItem(
  artifact: ProjectArtifact
): RfpHldIntakeQuestionnaireInspectionListItem {
  return {
    ...toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(artifact.payload),
  };
}

/** Copy only the whitelisted candidate question fields (never any answer). */
function toQuestion(
  question: RfpHldIntakeQuestionnaireQuestion
): RfpHldIntakeQuestionnaireInspectionQuestion {
  return {
    questionId: question.questionId,
    order: question.order,
    domain: question.domain,
    questionText: question.questionText,
    whyAsked: question.whyAsked,
    answerType: question.answerType,
    required: question.required,
    sourceRefIds: question.sourceRefIds.slice(),
    ...(question.allowedOptions !== undefined
      ? { allowedOptions: question.allowedOptions.slice() }
      : {}),
    ...(question.requiredInputIds !== undefined
      ? { requiredInputIds: question.requiredInputIds.slice() }
      : {}),
  };
}

/** Copy only the closed source-ref fields into the sanitized projection. */
function toSourceRef(
  ref: RfpHldIntakeQuestionnaireSourceRef
): RfpHldIntakeQuestionnaireInspectionSourceRef {
  return {
    refId: ref.refId,
    artifactId: ref.artifactId,
    artifactType: ref.artifactType,
    stageId: ref.stageId,
    status: ref.status,
    version: ref.version,
    payloadKind: ref.payloadKind,
    label: ref.label,
  };
}

export async function loadRfpHldIntakeQuestionnaireList(
  input: LoadRfpHldIntakeQuestionnaireListInput
): Promise<LoadRfpHldIntakeQuestionnaireListResult> {
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
    QUESTIONNAIRE_ARTIFACT_TYPE
  );
  const artifacts = rows
    .filter(
      (row) =>
        row.type === QUESTIONNAIRE_ARTIFACT_TYPE &&
        row.stageId === QUESTIONNAIRE_STAGE_ID &&
        row.projectId === projectId
    )
    .map((row) => toListItem(row));

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifacts,
    artifactCount: artifacts.length,
  };
}

export async function loadRfpHldIntakeQuestionnaireDetail(
  input: LoadRfpHldIntakeQuestionnaireDetailInput
): Promise<LoadRfpHldIntakeQuestionnaireDetailResult> {
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
    artifact.type !== QUESTIONNAIRE_ARTIFACT_TYPE ||
    artifact.stageId !== QUESTIONNAIRE_STAGE_ID
  ) {
    return {
      status: "artifact_not_questionnaire",
      artifact: toArtifactSummary(artifact),
    };
  }

  if (!validateRfpHldIntakeQuestionnairePayload(artifact.payload).valid) {
    return {
      status: "invalid_questionnaire_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  const payload = artifact.payload as unknown as RfpHldIntakeQuestionnairePayload;
  const questions = payload.questions
    .map((question) => toQuestion(question))
    .sort((a, b) => a.order - b.order);
  const validation = payload.validation;

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    questionnaire: {
      payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
      createdBy: payload.createdBy,
      createdAt: payload.createdAt,
      sourceArtifactIds: payload.sourceArtifactIds.slice(),
      sourceRefs: payload.sourceRefs.map((ref) => toSourceRef(ref)),
      questions,
      validation: {
        status: validation.status,
        checkedAt: validation.checkedAt,
        findingCount: validation.findingCount,
        findings: validation.findings.map((finding) => ({ ...finding })),
      },
    },
  };
}
