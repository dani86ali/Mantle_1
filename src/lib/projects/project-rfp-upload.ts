/**
 * RFP package file intake upload service: store one uploaded RFP package file
 * as a Project-owned project_files row with an explicit file role.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Scope (Prompt 174) is RFP-mode source-file intake only: verify the Project,
 * validate the explicit file role and the .pdf/.docx/.xlsx/.csv extension and
 * size, write the bytes to a local temp Project upload folder for MVP, and
 * record one project_files row carrying the caller's explicit fileRole.
 * Multiple RFP files are allowed (fileRole is a label, not a single-file
 * slot), so existing Project files are never read and role uniqueness is
 * never enforced. It does NOT parse PDF/DOCX/XLSX/CSV content, validate BoQ
 * formats, extract text, create input_package artifacts/approvals/evidence,
 * generate requirements, run AI, price, export, or touch any runner/
 * coordinator/engine/adapter/catalog path. Pricing authority and
 * configuration authority stay out of this module entirely. The uploaded
 * filename is reduced to a safe basename before storage; tenantId is never
 * surfaced in the returned file summary; inputs/bytes are never mutated.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { getProjectById } from "@/lib/db/project-store";
import { createProjectFileRecord } from "@/lib/db/project-file-store";
import type {
  Project,
  ProjectFile,
  ProjectFileRole,
  ProjectMode,
} from "@/types/project";

/** Re-exported so the route can name the role type without extra imports. */
export type { ProjectFileRole } from "@/types/project";

/** File roles accepted for RFP package intake (the full canonical role set). */
const RFP_INTAKE_FILE_ROLES: readonly ProjectFileRole[] = [
  "rfp", "boq", "scope_of_work", "compliance", "addendum", "other",
];

/** Extensions accepted for RFP package intake. No .doc/.xls/.txt/extensionless. */
const RFP_INTAKE_EXTENSIONS: readonly string[] = [".pdf", ".docx", ".xlsx", ".csv"];

/** Input for {@link uploadRfpProjectFile}. bytes is the raw uploaded payload. */
export interface UploadRfpProjectFileInput {
  tenantId: string;
  projectId: string;
  fileName: string;
  fileRole: ProjectFileRole;
  mimeType?: string;
  sizeBytes: number;
  bytes: Uint8Array;
}

/**
 * Serializable Project file summary: ISO date strings, and tenantId is never
 * surfaced (the canonical ProjectFile already drops it).
 */
export interface RfpProjectFileSummary {
  id: string;
  projectId: string;
  fileRole: ProjectFileRole;
  fileName: string;
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt: string;
  retainUntil: string;
  roleCorrectedBy?: string;
}

/** Lean serializable project projection returned on a wrong-mode upload. */
export interface RfpUploadProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Discriminated result of {@link uploadRfpProjectFile}. */
export type UploadRfpProjectFileResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpUploadProjectSummary }
  | { status: "invalid_file"; reason: string }
  | { status: "ok"; file: RfpProjectFileSummary };

/** Reduce an uploaded filename to a safe basename (no separators/control chars). */
function safeBasename(name: string): string {
  return basename(name).replace(/[\x00-\x1f<>:"/\\|?*]/g, "_");
}

/** Lean wrong-mode project projection; tenantId is not surfaced. */
function toProjectSummary(project: Project): RfpUploadProjectSummary {
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

/** Map the stored ProjectFile to its serializable summary (ISO dates). */
function toFileSummary(file: ProjectFile): RfpProjectFileSummary {
  return {
    id: file.id,
    projectId: file.projectId,
    fileRole: file.fileRole,
    fileName: file.fileName,
    storagePath: file.storagePath,
    ...(file.mimeType !== undefined ? { mimeType: file.mimeType } : {}),
    ...(file.sizeBytes !== undefined ? { sizeBytes: file.sizeBytes } : {}),
    uploadedAt: file.uploadedAt.toISOString(),
    retainUntil: file.retainUntil.toISOString(),
    ...(file.roleCorrectedBy !== undefined
      ? { roleCorrectedBy: file.roleCorrectedBy }
      : {}),
  };
}

/**
 * Store one uploaded RFP package file as a Project-owned file record. Verifies
 * the Project (not_found / wrong_mode) BEFORE any file validation, then
 * rejects blank names, unknown roles, unsupported extensions, invalid bytes,
 * bad sizes, or byte/size mismatches as invalid_file WITHOUT writing anything.
 * On success it writes the bytes under a local temp Project upload folder and
 * records one project_files row with the explicit fileRole; if the record
 * insert fails after the write, the stored file is removed best-effort before
 * the error is rethrown.
 */
export async function uploadRfpProjectFile(
  input: UploadRfpProjectFileInput
): Promise<UploadRfpProjectFileResult> {
  const { tenantId, projectId, fileRole, mimeType, sizeBytes, bytes } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const trimmedName =
    typeof input.fileName === "string" ? input.fileName.trim() : "";
  if (trimmedName === "") {
    return { status: "invalid_file", reason: "blank_filename" };
  }
  if (!RFP_INTAKE_FILE_ROLES.includes(fileRole)) {
    return { status: "invalid_file", reason: "invalid_role" };
  }
  const safeName = safeBasename(trimmedName);
  // extname keeps only the final extension, so a disguised .csv.zip is .zip.
  const ext = extname(safeName).toLowerCase();
  if (!RFP_INTAKE_EXTENSIONS.includes(ext)) {
    return { status: "invalid_file", reason: "unsupported_extension" };
  }
  if (!(bytes instanceof Uint8Array)) {
    return { status: "invalid_file", reason: "invalid_bytes" };
  }
  // sizeBytes must be a positive integer; a zero-byte upload is not valid.
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return { status: "invalid_file", reason: "invalid_size" };
  }
  if (bytes.length !== sizeBytes) {
    return { status: "invalid_file", reason: "size_mismatch" };
  }

  // Local temp Project upload folder for MVP only. projectId is a real
  // DB-issued id here: getProjectById already matched it within the tenant.
  const uploadDir = join(
    tmpdir(), "bomatic-project-uploads", tenantId, projectId, randomUUID()
  );
  await mkdir(uploadDir, { recursive: true });
  const storagePath = join(uploadDir, safeName);
  await writeFile(storagePath, bytes);

  let file: ProjectFile;
  try {
    file = await createProjectFileRecord({
      tenantId,
      projectId,
      fileRole,
      fileName: safeName,
      storagePath,
      ...(mimeType !== undefined ? { mimeType } : {}),
      sizeBytes,
    });
  } catch (error) {
    await rm(storagePath, { force: true }).catch(() => {});
    throw error;
  }

  return { status: "ok", file: toFileSummary(file) };
}
