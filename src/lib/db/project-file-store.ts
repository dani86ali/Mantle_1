/**
 * Narrow Project file-record repository: the first Controlled BoQ intake step.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts. Materialization: src/lib/projects/files.ts.
 *
 * Scope (Prompt 8) is intentionally minimal: record uploaded source files as
 * Project state with one-year retention metadata, list/read them, and correct a
 * misclassified file role during Intake review (section 5). It does NOT parse or
 * validate BoQ formats, write file contents, delete files, or run automatic
 * retention cleanup - those belong to later prompts.
 *
 * Tenant scoping is enforced on every read/update; the canonical tables
 * duplicate tenant_id per row, but the TS `ProjectFile` shape does not surface
 * it - {@link toProjectFile} projects it out and maps DB nulls to undefined.
 */
import { and, asc, eq } from "drizzle-orm";
import { withTenantDb } from "./index";
import { projectFiles } from "./schema";
import { materializeProjectFileRecord } from "@/lib/projects/files";
import type { ProjectFile, ProjectFileRole } from "@/types/project";

type ProjectFileRow = typeof projectFiles.$inferSelect;

/** Input for {@link createProjectFileRecord}. */
export interface CreateProjectFileRecordInput {
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

/** Input for {@link correctProjectFileRole}. A correction always records who did it. */
export interface CorrectProjectFileRoleInput {
  tenantId: string;
  projectId: string;
  fileId: string;
  fileRole: ProjectFileRole;
  roleCorrectedBy: string;
}

/**
 * Map a DB file row to a ProjectFile: tenantId and createdAt are dropped (not on
 * the canonical child shape), and nullable optional columns map to undefined.
 */
function toProjectFile(row: ProjectFileRow): ProjectFile {
  return {
    id: row.id,
    projectId: row.projectId,
    fileRole: row.fileRole as ProjectFileRole,
    fileName: row.fileName,
    storagePath: row.storagePath,
    mimeType: row.mimeType ?? undefined,
    sizeBytes: row.sizeBytes ?? undefined,
    uploadedAt: row.uploadedAt,
    retainUntil: row.retainUntil,
    roleCorrectedBy: row.roleCorrectedBy ?? undefined,
  };
}

/**
 * Record one uploaded source file as Project state. Materializes the insert row
 * (defaulting uploadedAt, deriving retainUntil = uploadedAt + 1 year) and
 * inserts it. Returns the stored ProjectFile (without tenantId).
 */
export async function createProjectFileRecord(
  input: CreateProjectFileRecordInput
): Promise<ProjectFile> {
  const record = materializeProjectFileRecord(input);
  return withTenantDb(input.tenantId, async (tx) => {
    const [row] = await tx.insert(projectFiles).values(record).returning();
    return toProjectFile(row);
  });
}

/**
 * List a Project's files, tenant/project scoped, ordered by uploadedAt then
 * fileName ascending.
 */
export async function listProjectFiles(
  tenantId: string,
  projectId: string
): Promise<ProjectFile[]> {
  return withTenantDb(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(projectFiles)
      .where(
        and(
          eq(projectFiles.tenantId, tenantId),
          eq(projectFiles.projectId, projectId)
        )
      )
      .orderBy(asc(projectFiles.uploadedAt), asc(projectFiles.fileName));
    return rows.map(toProjectFile);
  });
}

/**
 * Load one Project file by id, scoped to its tenant and project. Returns null
 * when no matching (tenant, project, file) triple exists.
 */
export async function getProjectFileById(
  tenantId: string,
  projectId: string,
  fileId: string
): Promise<ProjectFile | null> {
  return withTenantDb(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(projectFiles)
      .where(
        and(
          eq(projectFiles.tenantId, tenantId),
          eq(projectFiles.projectId, projectId),
          eq(projectFiles.id, fileId)
        )
      )
      .limit(1);
    return row ? toProjectFile(row) : null;
  });
}

/**
 * Correct a misclassified file role during Intake review (section 5). Updates
 * fileRole and records roleCorrectedBy, scoped to the tenant/project/file.
 * Returns the updated ProjectFile, or null when no matching file exists.
 */
export async function correctProjectFileRole(
  input: CorrectProjectFileRoleInput
): Promise<ProjectFile | null> {
  const { tenantId, projectId, fileId, fileRole, roleCorrectedBy } = input;
  return withTenantDb(tenantId, async (tx) => {
    const [row] = await tx
      .update(projectFiles)
      .set({ fileRole, roleCorrectedBy })
      .where(
        and(
          eq(projectFiles.tenantId, tenantId),
          eq(projectFiles.projectId, projectId),
          eq(projectFiles.id, fileId)
        )
      )
      .returning();
    return row ? toProjectFile(row) : null;
  });
}
