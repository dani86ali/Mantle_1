/**
 * RFP input-package draft service: package a Project's already-recorded file
 * records into one reviewable input_package artifact version for the RFP
 * intake_package_review stage. Canonical shapes: src/types/project.ts.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * The deterministic payload is built from file RECORD metadata only, in
 * file-store order - never file contents or storage paths: no PDF/DOCX/XLSX/
 * CSV parsing, no evidence, no approvals, and no parser/loader, approval/
 * evidence store, pricing, configuration-expansion, export, runner/
 * coordinator/engine/adapter, AI, or catalog imports (pricing authority and
 * configuration authority stay separate). Roles are labels, not single-file
 * slots: multiple files per role are valid; a missing boq is only a payload
 * warning. Summaries are lean and serializable (ISO dates, copied arrays, no
 * tenantId, no storage paths); inputs and file records are never mutated.
 */
import { getProjectById } from "@/lib/db/project-store";
import { listProjectFiles } from "@/lib/db/project-file-store";
import { createProjectArtifactVersion } from "@/lib/db/project-artifact-store";
import type {
  Project,
  ProjectArtifact,
  ProjectFile,
  ProjectFileRole,
} from "@/types/project";

/** Stable payload marker and the advisory missing-boq warning literal. */
export const RFP_INPUT_PACKAGE_PAYLOAD_KIND = "rfp_input_package";
export const BOQ_FILE_NOT_PRESENT_WARNING = "boq_file_not_present";

/** Input for {@link createRfpInputPackageDraft}. */
export interface CreateRfpInputPackageDraftInput {
  tenantId: string;
  projectId: string;
}

/** One packaged file record: metadata only, never storagePath or contents. */
export type RfpInputPackageFileSummary = {
  fileId: string;
  fileRole: ProjectFileRole;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt: string;
  retainUntil: string;
  roleCorrectedBy?: string;
};

/** Deterministic input_package payload; roleCounts covers every canonical role. */
export type RfpInputPackageArtifactPayload = {
  payloadKind: typeof RFP_INPUT_PACKAGE_PAYLOAD_KIND;
  fileCount: number;
  roleCounts: Record<ProjectFileRole, number>;
  files: RfpInputPackageFileSummary[];
  warnings: string[];
};

/** Lean serializable project projection returned on wrong_mode; no tenantId. */
export interface RfpInputPackageProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpInputPackageArtifactSummary {
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

/** Discriminated result of {@link createRfpInputPackageDraft}. */
export type CreateRfpInputPackageDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpInputPackageProjectSummary }
  | { status: "no_files" }
  | { status: "missing_rfp_file" }
  | {
      status: "ok";
      artifact: RfpInputPackageArtifactSummary;
      /** Lean payload projection: counts and warnings, per-file rows dropped. */
      payloadSummary: Omit<RfpInputPackageArtifactPayload, "files">;
    };

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): RfpInputPackageProjectSummary {
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

/** Project one file record to payload metadata; storagePath never crosses. */
function toFileSummary(file: ProjectFile): RfpInputPackageFileSummary {
  return {
    fileId: file.id,
    fileRole: file.fileRole,
    fileName: file.fileName,
    ...(file.mimeType !== undefined ? { mimeType: file.mimeType } : {}),
    ...(file.sizeBytes !== undefined ? { sizeBytes: file.sizeBytes } : {}),
    uploadedAt: file.uploadedAt.toISOString(),
    retainUntil: file.retainUntil.toISOString(),
    ...(file.roleCorrectedBy !== undefined
      ? { roleCorrectedBy: file.roleCorrectedBy }
      : {}),
  };
}

/** Project the created artifact to a serializable summary; arrays are copied. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpInputPackageArtifactSummary {
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

/**
 * Create one reviewable input_package draft from the Project's recorded
 * files: verify the Project within its tenant (not_found / wrong_mode -
 * neither lists files); require one+ recorded file and one+ rfp-role file
 * (no_files / missing_rfp_file - neither creates an artifact); then create
 * exactly one needs_review input_package version for intake_package_review
 * whose sourceFileIds are every listed file id in file-store order.
 */
export async function createRfpInputPackageDraft(
  input: CreateRfpInputPackageDraftInput
): Promise<CreateRfpInputPackageDraftResult> {
  const project = await getProjectById(input.tenantId, input.projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const files = await listProjectFiles(input.tenantId, input.projectId);
  if (files.length === 0) return { status: "no_files" };
  if (!files.some((file) => file.fileRole === "rfp")) {
    return { status: "missing_rfp_file" };
  }

  const roleCounts: Record<ProjectFileRole, number> = {
    rfp: 0, boq: 0, scope_of_work: 0, compliance: 0, addendum: 0, other: 0,
  };
  for (const file of files) roleCounts[file.fileRole] += 1;
  const payload: RfpInputPackageArtifactPayload = {
    payloadKind: RFP_INPUT_PACKAGE_PAYLOAD_KIND,
    fileCount: files.length,
    roleCounts,
    files: files.map(toFileSummary),
    warnings: roleCounts.boq === 0 ? [BOQ_FILE_NOT_PRESENT_WARNING] : [],
  };

  const artifact = await createProjectArtifactVersion({
    tenantId: input.tenantId,
    projectId: input.projectId,
    stageId: "intake_package_review",
    type: "input_package",
    status: "needs_review",
    payload,
    sourceFileIds: files.map((file) => file.id),
    sourceArtifactIds: [],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: {
      payloadKind: payload.payloadKind,
      fileCount: payload.fileCount,
      roleCounts: { ...payload.roleCounts },
      warnings: [...payload.warnings],
    },
  };
}
