/**
 * Quick BoM BoQ upload service: store an uploaded BoQ as a Project-owned file
 * record. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Scope (Prompt 86) is the single product step "create Project -> upload BoQ".
 * It verifies the Project, validates the upload extension/size against the two
 * locked BoQ input formats (.xlsx / .csv only, section 6), writes the bytes to a
 * local temp Project upload folder for MVP, and records one project_files row
 * with fileRole "boq" and one-year retention (section 4, 5). It does NOT
 * normalize or parse the BoQ, resolve SKUs, expand configuration, price, create
 * artifacts/approvals/evidence, export, or touch any runner/coordinator/engine/
 * adapter/catalog path or AI SDK. Pricing authority and configuration authority
 * stay out of this module entirely (section 9, 11A). The uploaded filename is
 * reduced to a safe basename before storage; tenantId is never surfaced in the
 * returned file summary, and the input object/bytes are never mutated.
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

/** Input for {@link uploadQuickBomBoqFile}. bytes is the raw uploaded payload. */
export interface UploadQuickBomBoqFileInput {
  tenantId: string;
  projectId: string;
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
  bytes: Uint8Array;
}

/**
 * Serializable Project file summary: ISO date strings, and tenantId is never
 * surfaced (the canonical ProjectFile already drops it).
 */
export interface QuickBomBoqFileSummary {
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
export interface QuickBomBoqProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Discriminated result of {@link uploadQuickBomBoqFile}. */
export type UploadQuickBomBoqFileResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: QuickBomBoqProjectSummary }
  | { status: "invalid_file"; reason: string }
  | { status: "ok"; file: QuickBomBoqFileSummary };

/** Reduce an uploaded filename to a safe basename (no separators/control chars). */
function safeBasename(name: string): string {
  return basename(name).replace(/[\x00-\x1f<>:"/\\|?*]/g, "_");
}

/** Lean wrong-mode project projection; tenantId is not surfaced. */
function toProjectSummary(project: Project): QuickBomBoqProjectSummary {
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
function toFileSummary(file: ProjectFile): QuickBomBoqFileSummary {
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
 * Store an uploaded BoQ as a Project-owned file record. Verifies the Project
 * (not_found / wrong_mode) BEFORE any file validation, then rejects unsupported
 * extensions, blank names, invalid sizes, or byte/size mismatches as invalid_file
 * WITHOUT writing or recording anything. On success it writes the bytes under a
 * local temp Project upload folder and records one project_files row (fileRole
 * "boq"). If the record insert fails after the write, the stored file is removed
 * best-effort before the error is rethrown. Inputs are never mutated; no BoQ
 * parsing, normalization, pricing, configuration expansion, or export occurs.
 */
export async function uploadQuickBomBoqFile(
  input: UploadQuickBomBoqFileInput
): Promise<UploadQuickBomBoqFileResult> {
  const { tenantId, projectId, mimeType, sizeBytes, bytes } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "quick_bom") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const trimmedName =
    typeof input.fileName === "string" ? input.fileName.trim() : "";
  if (trimmedName === "") {
    return { status: "invalid_file", reason: "blank_filename" };
  }
  const safeName = safeBasename(trimmedName);
  const ext = extname(safeName).toLowerCase();
  if (ext !== ".xlsx" && ext !== ".csv") {
    return { status: "invalid_file", reason: "unsupported_extension" };
  }
  if (!(bytes instanceof Uint8Array)) {
    return { status: "invalid_file", reason: "invalid_bytes" };
  }
  // sizeBytes must be a positive integer; a zero-byte BoQ is not a valid upload.
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return { status: "invalid_file", reason: "invalid_size" };
  }
  if (bytes.length !== sizeBytes) {
    return { status: "invalid_file", reason: "size_mismatch" };
  }

  // Local temp Project upload folder for MVP only; the path carries the tenant
  // id, project id, and a generated id. projectId is a real DB-issued id here
  // because getProjectById already matched it within the tenant above.
  const uploadDir = join(
    tmpdir(),
    "bomatic-project-uploads",
    tenantId,
    projectId,
    randomUUID()
  );
  await mkdir(uploadDir, { recursive: true });
  const storagePath = join(uploadDir, safeName);
  await writeFile(storagePath, bytes);

  let file: ProjectFile;
  try {
    file = await createProjectFileRecord({
      tenantId,
      projectId,
      fileRole: "boq",
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
