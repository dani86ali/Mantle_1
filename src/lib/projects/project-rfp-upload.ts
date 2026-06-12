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
 * Upload hardening (RFP Stage 1A) adds a deterministic filename/role lock:
 * the safe basename's role tokens must single out exactly the explicit
 * fileRole (filename detection only assists the engineer's role choice and
 * never auto-assigns one), and fileRole "boq" is restricted to .xlsx/.csv as
 * a file-type guard for the later Quick BoM lane -- BoQ workbook content is
 * never read, parsed, or normalized here.
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

/** Workbook extensions required when fileRole is "boq" (file-type guard only). */
const RFP_BOQ_INTAKE_EXTENSIONS: readonly string[] = [".xlsx", ".csv"];

/**
 * Filename role tokens matched against the lowercased safe basename, with
 * punctuation/whitespace/hyphens/underscores as token separators. Detection
 * assists role assignment; the engineer's explicit fileRole stays the input.
 */
const RFP_FILE_NAME_ROLE_TOKENS: ReadonlyArray<{
  role: ProjectFileRole;
  tokens: readonly string[];
}> = [
  { role: "rfp", tokens: ["rfp", "tender"] },
  { role: "scope_of_work", tokens: ["sow", "scope", "scopeofwork"] },
  { role: "boq", tokens: ["boq", "bom"] },
  { role: "compliance", tokens: ["compliance", "matrix"] },
  {
    role: "addendum",
    tokens: ["addendum", "clarification", "clarifications", "corrigendum"],
  },
  { role: "other", tokens: ["proposal", "response", "other"] },
];

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

/** Lowercased alphanumeric tokens of the safe basename. */
function fileNameRoleTokens(fileName: string): string[] {
  return safeBasename(fileName.trim())
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token !== "");
}

/** Distinct roles whose tokens appear in the filename, in canonical order. */
function detectRfpFileNameRoles(fileName: string): ProjectFileRole[] {
  const tokens = fileNameRoleTokens(fileName);
  return RFP_FILE_NAME_ROLE_TOKENS.filter((group) =>
    group.tokens.some((token) => tokens.includes(token))
  ).map((group) => group.role);
}

/**
 * Suggest a Project file role from the filename's role tokens. Returns the
 * role only when exactly one distinct role is detected; null when no token
 * or more than one role is present. Assists the engineer's role choice and
 * never replaces the explicit fileRole.
 */
export function suggestRfpProjectFileRoleFromFileName(
  fileName: string
): ProjectFileRole | null {
  const roles = detectRfpFileNameRoles(fileName);
  return roles.length === 1 ? roles[0] : null;
}

/** Reasons {@link validateRfpProjectFileNameRoleLock} rejects a filename. */
export type RfpFileNameRoleLockReason =
  | "filename_role_token_missing"
  | "ambiguous_filename_role"
  | "filename_role_mismatch";

/** Result of {@link validateRfpProjectFileNameRoleLock}. */
export type RfpFileNameRoleLockResult =
  | { ok: true }
  | { ok: false; reason: RfpFileNameRoleLockReason };

/**
 * Lock the explicit fileRole to the filename: the safe basename must carry
 * role tokens for exactly one role and that role must equal fileRole.
 */
export function validateRfpProjectFileNameRoleLock(
  fileName: string,
  fileRole: ProjectFileRole
): RfpFileNameRoleLockResult {
  const roles = detectRfpFileNameRoles(fileName);
  if (roles.length === 0) {
    return { ok: false, reason: "filename_role_token_missing" };
  }
  if (roles.length > 1) {
    return { ok: false, reason: "ambiguous_filename_role" };
  }
  if (roles[0] !== fileRole) {
    return { ok: false, reason: "filename_role_mismatch" };
  }
  return { ok: true };
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
 * rejects blank names, unknown roles, unsupported extensions, non-workbook
 * boq uploads, filenames whose role tokens are missing, ambiguous, or in
 * conflict with the explicit fileRole, invalid bytes, bad sizes, or byte/size
 * mismatches as invalid_file WITHOUT writing anything.
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
  // BoQ files ride along for the later Quick BoM lane: workbook types only.
  // File-type guard only; workbook content is never read or validated here.
  if (fileRole === "boq" && !RFP_BOQ_INTAKE_EXTENSIONS.includes(ext)) {
    return { status: "invalid_file", reason: "unsupported_boq_extension" };
  }
  const roleLock = validateRfpProjectFileNameRoleLock(safeName, fileRole);
  if (!roleLock.ok) {
    return { status: "invalid_file", reason: roleLock.reason };
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
