/**
 * Narrow Project artifact repository: create + read versioned artifacts.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shape: src/types/project.ts. Versioning: src/lib/projects/artifacts.ts.
 *
 * Scope (Prompt 12) is intentionally minimal: insert a new versioned artifact
 * row and read artifacts back, tenant/project scoped. It does NOT wire BoQ
 * loading, resolve SKUs, price, export, run approvals, propagate staleness, or
 * update prior artifact statuses (later prompts); prior rows are never mutated.
 *
 * Versioning is per (projectId, type): the next version is computed by passing
 * the existing same-tenant/project/type rows to the pure materializer, so
 * approved/rejected/stale prior versions still count (versions are immutable
 * history). Tenant scoping is enforced on every read; the canonical tables
 * duplicate tenant_id per row, but `ProjectArtifact` does not surface it -
 * {@link toProjectArtifact} projects it out and maps DB nulls/odd JSONB safely.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "./index";
import { projectArtifacts } from "./schema";
import { materializeProjectArtifactVersion } from "@/lib/projects/artifacts";
import type {
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

type ProjectArtifactRow = typeof projectArtifacts.$inferSelect;

/** Input for {@link createProjectArtifactVersion}. */
export interface CreateProjectArtifactVersionInput {
  projectId: string;
  tenantId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  /** Creation status; defaults to `generated` via the materializer. */
  status?: ProjectArtifactStatus;
  payload?: Record<string, unknown>;
  filePath?: string;
  sourceFileIds?: string[];
  sourceArtifactIds?: string[];
}

/** A JSONB value as string[], or [] when it is not an array. */
function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

/** A JSONB value as a plain record, or {} when it is not a plain object. */
function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Map a DB artifact row to a ProjectArtifact: drop tenantId, preserve Dates,
 * cast union columns, null filePath -> undefined, JSONB columns map defensively.
 */
function toProjectArtifact(row: ProjectArtifactRow): ProjectArtifact {
  return {
    id: row.id,
    projectId: row.projectId,
    stageId: row.stageId as ProjectStageId,
    type: row.type as ProjectArtifactType,
    status: row.status as ProjectArtifactStatus,
    version: row.version,
    payload: toRecord(row.payload),
    filePath: row.filePath ?? undefined,
    sourceFileIds: toStringArray(row.sourceFileIds),
    sourceArtifactIds: toStringArray(row.sourceArtifactIds),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Create the next version of a Project artifact: load the existing
 * same-tenant/project/type rows, compute the next version through the pure
 * materializer, insert exactly one new row, return it (without tenantId). Never
 * updates prior rows; never marks downstream artifacts stale.
 */
export async function createProjectArtifactVersion(
  input: CreateProjectArtifactVersionInput
): Promise<ProjectArtifact> {
  const existing = await db
    .select()
    .from(projectArtifacts)
    .where(
      and(
        eq(projectArtifacts.tenantId, input.tenantId),
        eq(projectArtifacts.projectId, input.projectId),
        eq(projectArtifacts.type, input.type)
      )
    );

  const record = materializeProjectArtifactVersion({
    projectId: input.projectId,
    tenantId: input.tenantId,
    stageId: input.stageId,
    type: input.type,
    status: input.status,
    payload: input.payload,
    filePath: input.filePath,
    sourceFileIds: input.sourceFileIds,
    sourceArtifactIds: input.sourceArtifactIds,
    existingArtifacts: existing.map((row) => ({
      projectId: row.projectId,
      type: row.type as ProjectArtifactType,
      version: row.version,
      status: row.status as ProjectArtifactStatus,
    })),
  });

  const [row] = await db.insert(projectArtifacts).values(record).returning();
  return toProjectArtifact(row);
}

/**
 * List a Project's artifacts, tenant/project scoped, ordered by type ascending
 * then version ascending.
 */
export async function listProjectArtifacts(
  tenantId: string,
  projectId: string
): Promise<ProjectArtifact[]> {
  const rows = await db
    .select()
    .from(projectArtifacts)
    .where(
      and(
        eq(projectArtifacts.tenantId, tenantId),
        eq(projectArtifacts.projectId, projectId)
      )
    )
    .orderBy(asc(projectArtifacts.type), asc(projectArtifacts.version));
  return rows.map(toProjectArtifact);
}

/**
 * List one artifact type for a Project, tenant/project/type scoped, ordered by
 * version ascending.
 */
export async function listProjectArtifactsByType(
  tenantId: string,
  projectId: string,
  type: ProjectArtifactType
): Promise<ProjectArtifact[]> {
  const rows = await db
    .select()
    .from(projectArtifacts)
    .where(
      and(
        eq(projectArtifacts.tenantId, tenantId),
        eq(projectArtifacts.projectId, projectId),
        eq(projectArtifacts.type, type)
      )
    )
    .orderBy(asc(projectArtifacts.version));
  return rows.map(toProjectArtifact);
}

/**
 * The highest-version artifact of a type for a Project, tenant/project/type
 * scoped, or null when none exist.
 */
export async function getLatestProjectArtifactVersion(
  tenantId: string,
  projectId: string,
  type: ProjectArtifactType
): Promise<ProjectArtifact | null> {
  // listProjectArtifactsByType orders by version ascending, so the last row is
  // the highest version for the type.
  const artifacts = await listProjectArtifactsByType(tenantId, projectId, type);
  return artifacts.at(-1) ?? null;
}

/**
 * Load one artifact by id, scoped to its tenant and project. Returns null when
 * no matching (tenant, project, artifact) triple exists.
 */
export async function getProjectArtifactById(
  tenantId: string,
  projectId: string,
  artifactId: string
): Promise<ProjectArtifact | null> {
  const [row] = await db
    .select()
    .from(projectArtifacts)
    .where(
      and(
        eq(projectArtifacts.tenantId, tenantId),
        eq(projectArtifacts.projectId, projectId),
        eq(projectArtifacts.id, artifactId)
      )
    )
    .limit(1);
  return row ? toProjectArtifact(row) : null;
}
