/**
 * Pure Project file-record materialization + retention helpers.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (section 4, 5).
 *
 * This module is PURE: it returns insert-ready plain objects shaped for the
 * Drizzle `project_files` table and computes evidence retention dates. It does
 * NOT import Drizzle, query the database, write rows, read file contents, parse
 * or validate BoQ formats, or mutate its inputs. File contents/blobs are never
 * carried here - only metadata and a `storagePath` reference.
 *
 * Retention: original uploaded files must be retained for at least one year, so
 * `retainUntil = uploadedAt + 1 year`. Automatic deletion is deferred. (section 4)
 */
import type { ProjectFileRole } from "@/types/project";

/**
 * One-year evidence retention: returns a NEW Date one calendar year after
 * `uploadedAt`. Does not mutate the input. (section 4)
 */
export function calculateRetainUntil(uploadedAt: Date): Date {
  const retainUntil = new Date(uploadedAt.getTime());
  retainUntil.setFullYear(retainUntil.getFullYear() + 1);
  return retainUntil;
}

/** Input for {@link materializeProjectFileRecord}. */
export interface MaterializeProjectFileRecordInput {
  projectId: string;
  tenantId: string;
  fileRole: ProjectFileRole;
  fileName: string;
  /** Object-storage reference or path; file contents are never stored inline. */
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
  /** Defaults to `new Date()` when omitted. */
  uploadedAt?: Date;
}

/**
 * Insert-ready row shaped for the Drizzle `project_files` table. The `id`,
 * `createdAt`, and other DB-generated columns are omitted; tenant id is carried
 * explicitly (the table duplicates it per row). Metadata only - no blob. Not a
 * DB call.
 */
export interface MaterializedProjectFileRecord {
  projectId: string;
  tenantId: string;
  fileRole: ProjectFileRole;
  fileName: string;
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt: Date;
  retainUntil: Date;
}

/**
 * Build an insert-ready file-metadata row. Defaults `uploadedAt` to now and
 * derives `retainUntil` from it. Absent optional fields are omitted rather than
 * set to null. Records only metadata - never file contents.
 */
export function materializeProjectFileRecord(
  input: MaterializeProjectFileRecordInput
): MaterializedProjectFileRecord {
  const { projectId, tenantId, fileRole, fileName, storagePath, mimeType, sizeBytes } =
    input;
  const uploadedAt = input.uploadedAt ?? new Date();
  const retainUntil = calculateRetainUntil(uploadedAt);
  return {
    projectId,
    tenantId,
    fileRole,
    fileName,
    storagePath,
    ...(mimeType !== undefined ? { mimeType } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    uploadedAt,
    retainUntil,
  };
}
