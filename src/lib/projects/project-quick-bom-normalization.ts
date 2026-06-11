/**
 * Quick BoM BoQ normalization service: turn one already-recorded Project BoQ
 * file into a versioned normalized_boq artifact for the Quick BoM
 * boq_format_validation stage. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Scope (Prompt 87) is the single product step "upload BoQ -> normalize uploaded
 * BoQ". It verifies the Project (not_found / wrong_mode), then delegates the
 * actual parse + artifact creation to the existing deterministic normalizer
 * (boq-normalization.ts), which owns the locked parsers and artifact store. This
 * wrapper adds NO parsing of its own and never imports the artifact/approval/
 * evidence stores, the raw BoQ loader, pricing, configuration expansion, export,
 * any runner/coordinator/engine/adapter path, or an AI/catalog SDK. It translates
 * the normalizer's known failures into discriminated statuses without leaking
 * internal/stack details, re-throws anything unexpected for the route to map to a
 * safe 500, and returns serializable, lean summaries only (no artifact payload,
 * no BoQ lines, no storage paths). It never mutates its input or the normalizer's
 * result arrays.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  normalizeProjectBoqFile,
  type NormalizedBoqArtifactPayload,
} from "@/lib/projects/boq-normalization";
import { INVALID_BOQ_FORMAT_MESSAGE } from "@/lib/projects/boq-formats";
import type {
  BoqInputFormat,
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

/**
 * Exact messages thrown by {@link normalizeProjectBoqFile} for the two recorded-
 * file guards. They are private to boq-normalization.ts, so this wrapper mirrors
 * the literals deliberately (the canonical state locks them) to translate them
 * into safe statuses without importing or editing the normalizer.
 */
const MISSING_FILE_MESSAGE = "Project BoQ file not found.";
const NON_BOQ_ROLE_MESSAGE = "Project file is not recorded as a BoQ/BoM file.";

/** Input for {@link normalizeProjectQuickBomBoqFile}. */
export interface NormalizeProjectQuickBomBoqFileInput {
  tenantId: string;
  projectId: string;
  fileId: string;
}

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export interface QuickBomNormalizationProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface NormalizedBoqArtifactSummary {
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

/** Serializable payload summary: counts/formats only, never lines or storage paths. */
export interface NormalizedBoqPayloadSummary {
  sourceFileId: string;
  sourceFileName: string;
  sourceSheetName?: string;
  lineCount: number;
  sourceFormats: BoqInputFormat[];
}

/** Discriminated result of {@link normalizeProjectQuickBomBoqFile}. */
export type NormalizeProjectQuickBomBoqFileResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: QuickBomNormalizationProjectSummary }
  | { status: "file_not_found" }
  | { status: "file_not_boq" }
  | { status: "invalid_format"; message: string }
  | {
      status: "ok";
      artifact: NormalizedBoqArtifactSummary;
      payloadSummary: NormalizedBoqPayloadSummary;
    };

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): QuickBomNormalizationProjectSummary {
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

/** Project the created artifact to a serializable summary; source arrays are copied. */
function toArtifactSummary(
  artifact: ProjectArtifact
): NormalizedBoqArtifactSummary {
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

/** Project the normalized payload to a lean summary; lines/storage are dropped, formats copied. */
function toPayloadSummary(
  payload: NormalizedBoqArtifactPayload
): NormalizedBoqPayloadSummary {
  return {
    sourceFileId: payload.sourceFileId,
    sourceFileName: payload.sourceFileName,
    ...(payload.sourceSheetName !== undefined
      ? { sourceSheetName: payload.sourceSheetName }
      : {}),
    lineCount: payload.lineCount,
    sourceFormats: [...payload.sourceFormats],
  };
}

/**
 * Normalize one already-recorded Quick BoM BoQ file. Verifies the Project within
 * its tenant first: a missing project returns not_found and a non-quick_bom
 * project returns wrong_mode (with a lean summary) - neither normalizes. For a
 * Quick BoM project it delegates to {@link normalizeProjectBoqFile}, translating
 * the recorded-file/role guards and the locked invalid-format message into safe
 * discriminated statuses and re-throwing anything unexpected. On success it
 * returns lean, serializable summaries of the created artifact and its payload
 * (no full payload, no BoQ lines, no storage paths). Inputs and the normalizer's
 * result arrays are never mutated.
 */
export async function normalizeProjectQuickBomBoqFile(
  input: NormalizeProjectQuickBomBoqFileInput
): Promise<NormalizeProjectQuickBomBoqFileResult> {
  const { tenantId, projectId, fileId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "quick_bom") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  let result;
  try {
    result = await normalizeProjectBoqFile({ tenantId, projectId, fileId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === MISSING_FILE_MESSAGE) return { status: "file_not_found" };
    if (message === NON_BOQ_ROLE_MESSAGE) return { status: "file_not_boq" };
    if (message === INVALID_BOQ_FORMAT_MESSAGE) {
      return { status: "invalid_format", message: INVALID_BOQ_FORMAT_MESSAGE };
    }
    throw error;
  }

  return {
    status: "ok",
    artifact: toArtifactSummary(result.artifact),
    payloadSummary: toPayloadSummary(result.payload),
  };
}
