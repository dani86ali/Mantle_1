/**
 * Narrow Project evidence-item repository: create + read extracted evidence.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shape: src/types/project.ts. Materialization: src/lib/projects/evidence.ts.
 *
 * Scope (Prompt 11) is intentionally minimal: record evidence extracted from a
 * source file as Project state with one-year retention metadata, and list/read
 * it. It does NOT wire BoQ loading to evidence, produce normalized_boq
 * artifacts, parse or validate BoQ formats, or hydrate evidence into Project
 * aggregates - those belong to later prompts.
 *
 * Tenant scoping is enforced on every read; the canonical tables duplicate
 * tenant_id per row, but the TS `ProjectEvidenceItem` shape does not surface it
 * - {@link toProjectEvidenceItem} projects it out.
 */
import { and, asc, eq } from "drizzle-orm";
import { withTenantDb } from "./index";
import { projectEvidenceItems } from "./schema";
import { materializeProjectEvidenceItem } from "@/lib/projects/evidence";
import type { ProjectEvidenceItem } from "@/types/project";

type ProjectEvidenceItemRow = typeof projectEvidenceItems.$inferSelect;

/** Input for {@link createProjectEvidenceItem}. */
export interface CreateProjectEvidenceItemInput {
  projectId: string;
  tenantId: string;
  sourceFileId: string;
  kind: string;
  content: Record<string, unknown>;
  /** Defaults to `new Date()` when omitted. */
  extractedAt?: Date;
}

/**
 * Map a DB evidence row to a ProjectEvidenceItem: tenantId is dropped (not on
 * the canonical child shape); Date instances are preserved as-is and `content`
 * is surfaced as a Record<string, unknown>.
 */
function toProjectEvidenceItem(row: ProjectEvidenceItemRow): ProjectEvidenceItem {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceFileId: row.sourceFileId,
    kind: row.kind,
    content: row.content as Record<string, unknown>,
    extractedAt: row.extractedAt,
    retainUntil: row.retainUntil,
  };
}

/**
 * Record one extracted evidence item as Project state. Materializes the insert
 * row (defaulting extractedAt, deriving retainUntil = extractedAt + 1 year) and
 * inserts it. Returns the stored ProjectEvidenceItem (without tenantId).
 */
export async function createProjectEvidenceItem(
  input: CreateProjectEvidenceItemInput
): Promise<ProjectEvidenceItem> {
  const record = materializeProjectEvidenceItem(input);
  return withTenantDb(input.tenantId, async (tx) => {
    const [row] = await tx
      .insert(projectEvidenceItems)
      .values(record)
      .returning();
    return toProjectEvidenceItem(row);
  });
}

/**
 * List a Project's evidence items, tenant/project scoped, ordered by
 * extractedAt ascending.
 */
export async function listProjectEvidenceItems(
  tenantId: string,
  projectId: string
): Promise<ProjectEvidenceItem[]> {
  return withTenantDb(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(projectEvidenceItems)
      .where(
        and(
          eq(projectEvidenceItems.tenantId, tenantId),
          eq(projectEvidenceItems.projectId, projectId)
        )
      )
      .orderBy(asc(projectEvidenceItems.extractedAt));
    return rows.map(toProjectEvidenceItem);
  });
}

/**
 * List evidence extracted from one source file, tenant/project/source-file
 * scoped, ordered by extractedAt ascending.
 */
export async function listProjectEvidenceForFile(
  tenantId: string,
  projectId: string,
  sourceFileId: string
): Promise<ProjectEvidenceItem[]> {
  return withTenantDb(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(projectEvidenceItems)
      .where(
        and(
          eq(projectEvidenceItems.tenantId, tenantId),
          eq(projectEvidenceItems.projectId, projectId),
          eq(projectEvidenceItems.sourceFileId, sourceFileId)
        )
      )
      .orderBy(asc(projectEvidenceItems.extractedAt));
    return rows.map(toProjectEvidenceItem);
  });
}

/**
 * Load one evidence item by id, scoped to its tenant and project. Returns null
 * when no matching (tenant, project, evidence-item) triple exists.
 */
export async function getProjectEvidenceItemById(
  tenantId: string,
  projectId: string,
  evidenceItemId: string
): Promise<ProjectEvidenceItem | null> {
  return withTenantDb(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(projectEvidenceItems)
      .where(
        and(
          eq(projectEvidenceItems.tenantId, tenantId),
          eq(projectEvidenceItems.projectId, projectId),
          eq(projectEvidenceItems.id, evidenceItemId)
        )
      )
      .limit(1);
    return row ? toProjectEvidenceItem(row) : null;
  });
}
