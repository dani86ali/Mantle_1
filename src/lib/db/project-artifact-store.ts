/**
 * Narrow Project artifact repository: create + read versioned artifacts.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shape: src/types/project.ts. Versioning: src/lib/projects/artifacts.ts.
 *
 * Scope is intentionally minimal: insert a new versioned artifact row, read
 * artifacts back, and narrowly retire one exact version (status-only flip to
 * "stale"/"failed", no staleness propagation), all tenant/project scoped. It does
 * NOT wire BoQ loading, resolve SKUs, price, export, or run approvals (later
 * prompts). It DOES, on create,
 * propagate staleness to the latest downstream artifact versions per the pure
 * planner (Prompt 133): immutable history is preserved - the new row and every
 * non-latest/upstream/unrelated row are never mutated, and a propagated update
 * touches only status (-> "stale") and updatedAt, never content.
 *
 * Versioning is per (projectId, type): the next version is computed by passing
 * the existing same-tenant/project/type rows to the pure materializer, so
 * approved/rejected/stale prior versions still count (versions are immutable
 * history). Tenant scoping is enforced on every read; the canonical tables
 * duplicate tenant_id per row, but `ProjectArtifact` does not surface it -
 * {@link toProjectArtifact} projects it out and maps DB nulls/odd JSONB safely.
 */
import { and, asc, eq } from "drizzle-orm";
import { withTenantDb } from "./index";
import { projectArtifacts } from "./schema";
import { materializeProjectArtifactVersion } from "@/lib/projects/artifacts";
import { planStaleArtifactUpdates } from "@/lib/projects/staleness";
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
 * materializer, insert exactly one new row, then - in the same tenant-scoped
 * transaction - apply the pure planner's downstream stale updates to the latest
 * eligible version of each downstream type. Returns the new row (without
 * tenantId). The new row and all upstream/non-latest/unrelated rows stay
 * immutable; a stale update writes only status and updatedAt.
 */
export async function createProjectArtifactVersion(
  input: CreateProjectArtifactVersionInput
): Promise<ProjectArtifact> {
  return withTenantDb(input.tenantId, async (tx) => {
    const existing = await tx
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

    const [row] = await tx.insert(projectArtifacts).values(record).returning();

    // Propagate staleness: plan against every tenant/project-scoped artifact
    // (the new row included; the planner excludes it by id), then apply the
    // status-only updates the planner returns - one per latest eligible
    // downstream type. Immutable history is preserved by the planner's
    // latest-version + eligibility rules; we never re-derive them here.
    const candidates = await tx
      .select()
      .from(projectArtifacts)
      .where(
        and(
          eq(projectArtifacts.tenantId, input.tenantId),
          eq(projectArtifacts.projectId, input.projectId)
        )
      );

    const updates = planStaleArtifactUpdates({
      changedArtifact: {
        id: row.id,
        projectId: row.projectId,
        type: row.type as ProjectArtifactType,
        version: row.version,
        status: row.status as ProjectArtifactStatus,
      },
      artifacts: candidates.map((c) => ({
        id: c.id,
        projectId: c.projectId,
        type: c.type as ProjectArtifactType,
        version: c.version,
        status: c.status as ProjectArtifactStatus,
      })),
    });

    for (const update of updates) {
      await tx
        .update(projectArtifacts)
        .set({ status: update.nextStatus, updatedAt: update.updatedAt })
        .where(
          and(
            eq(projectArtifacts.tenantId, input.tenantId),
            eq(projectArtifacts.projectId, input.projectId),
            eq(projectArtifacts.id, update.artifactId)
          )
        );
    }

    return toProjectArtifact(row);
  });
}

/** Input for {@link retireProjectArtifactVersion}. */
export interface RetireProjectArtifactVersionInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
  /** The exact version the caller observed; the claim matches it. */
  expectedVersion: number;
  /** The exact status the caller observed; the claim matches it. */
  expectedStatus: ProjectArtifactStatus;
  /** The terminal status to flip to. Only "stale" or "failed" are allowed. */
  retiredStatus: "stale" | "failed";
}

/**
 * Atomically retire ONE exact artifact version: flip its status to "stale" or
 * "failed", scoped to (tenant, project, id, expectedVersion, expectedStatus) and
 * touching ONLY status and updatedAt. Returns the updated ProjectArtifact (no
 * tenantId), or null when no row matches that exact version+status - e.g. a
 * concurrent caller already claimed it, or the version/status moved on. This is a
 * narrow optimistic claim, NOT the staleness planner: it propagates no downstream
 * staleness and never mutates payload, filePath, sourceFileIds, sourceArtifactIds,
 * createdAt, stageId, type, or version. Callers use the null result to fail closed
 * so a single bounded request is consumed at most once.
 */
export async function retireProjectArtifactVersion(
  input: RetireProjectArtifactVersionInput
): Promise<ProjectArtifact | null> {
  return withTenantDb(input.tenantId, async (tx) => {
    const [row] = await tx
      .update(projectArtifacts)
      .set({ status: input.retiredStatus, updatedAt: new Date() })
      .where(
        and(
          eq(projectArtifacts.tenantId, input.tenantId),
          eq(projectArtifacts.projectId, input.projectId),
          eq(projectArtifacts.id, input.artifactId),
          eq(projectArtifacts.version, input.expectedVersion),
          eq(projectArtifacts.status, input.expectedStatus)
        )
      )
      .returning();
    return row ? toProjectArtifact(row) : null;
  });
}

/**
 * List a Project's artifacts, tenant/project scoped, ordered by type ascending
 * then version ascending.
 */
export async function listProjectArtifacts(
  tenantId: string,
  projectId: string
): Promise<ProjectArtifact[]> {
  return withTenantDb(tenantId, async (tx) => {
    const rows = await tx
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
  });
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
  return withTenantDb(tenantId, async (tx) => {
    const rows = await tx
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
  });
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
  return withTenantDb(tenantId, async (tx) => {
    const [row] = await tx
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
  });
}
