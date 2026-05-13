import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import type { TenantConfig } from "@/types/tenant";

// ─── Tenant queries ──────────────────────────────────────────────────────

export async function getTenantById(id: string) {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, id))
    .limit(1);
  return tenant ?? null;
}

export async function getTenantBySlug(slug: string) {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, slug))
    .limit(1);
  return tenant ?? null;
}

export async function getTenantConfig(tenantId: string): Promise<TenantConfig> {
  const [row] = await db
    .select({ tenantConfig: schema.tenants.tenantConfig })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);
  return (row?.tenantConfig as TenantConfig | undefined) ?? {};
}

export async function updateTenantConfig(
  tenantId: string,
  config: Partial<TenantConfig>
): Promise<void> {
  const current = await getTenantConfig(tenantId);
  const merged: TenantConfig = { ...current, ...config };
  await db
    .update(schema.tenants)
    .set({ tenantConfig: merged })
    .where(eq(schema.tenants.id, tenantId));
}

// ─── Intake queries ──────────────────────────────────────────────────────

export async function createIntake(
  data: typeof schema.intakes.$inferInsert
) {
  const [intake] = await db
    .insert(schema.intakes)
    .values(data)
    .returning();
  return intake;
}

export async function getIntakesByTenant(
  tenantId: string,
  status?: string
) {
  const conditions = [eq(schema.intakes.tenantId, tenantId)];
  if (status) {
    conditions.push(eq(schema.intakes.status, status));
  }
  return db
    .select()
    .from(schema.intakes)
    .where(and(...conditions))
    .orderBy(desc(schema.intakes.createdAt));
}

export async function getIntakeById(tenantId: string, id: string) {
  const [intake] = await db
    .select()
    .from(schema.intakes)
    .where(
      and(eq(schema.intakes.id, id), eq(schema.intakes.tenantId, tenantId))
    )
    .limit(1);
  return intake ?? null;
}

export async function updateIntakeStatus(
  tenantId: string,
  id: string,
  status: string
) {
  const [updated] = await db
    .update(schema.intakes)
    .set({ status })
    .where(
      and(eq(schema.intakes.id, id), eq(schema.intakes.tenantId, tenantId))
    )
    .returning();
  return updated ?? null;
}

// ─── Agent run queries ───────────────────────────────────────────────────

export async function createAgentRun(
  data: typeof schema.agentRuns.$inferInsert
) {
  const [run] = await db
    .insert(schema.agentRuns)
    .values(data)
    .returning();
  return run;
}

export async function updateAgentRun(
  id: string,
  data: Partial<typeof schema.agentRuns.$inferInsert>
) {
  const [updated] = await db
    .update(schema.agentRuns)
    .set(data)
    .where(eq(schema.agentRuns.id, id))
    .returning();
  return updated ?? null;
}

// ─── BoM draft queries (with optimistic locking) ─────────────────────────

export async function createBomDraft(
  data: typeof schema.bomDrafts.$inferInsert
) {
  const [draft] = await db
    .insert(schema.bomDrafts)
    .values(data)
    .returning();
  return draft;
}

export async function getBomDraftById(tenantId: string, id: string) {
  const [draft] = await db
    .select()
    .from(schema.bomDrafts)
    .where(
      and(
        eq(schema.bomDrafts.id, id),
        eq(schema.bomDrafts.tenantId, tenantId)
      )
    )
    .limit(1);
  return draft ?? null;
}

export async function getBomDraftsByTenant(
  tenantId: string,
  status?: string
) {
  const conditions = [eq(schema.bomDrafts.tenantId, tenantId)];
  if (status) {
    conditions.push(eq(schema.bomDrafts.status, status));
  }
  return db
    .select()
    .from(schema.bomDrafts)
    .where(and(...conditions))
    .orderBy(desc(schema.bomDrafts.createdAt));
}

/**
 * Update a BoM draft with optimistic locking.
 * Returns null if version mismatch (HTTP 409 scenario).
 */
export async function updateBomDraft(
  tenantId: string,
  id: string,
  expectedVersion: number,
  data: Partial<typeof schema.bomDrafts.$inferInsert>
) {
  const [updated] = await db
    .update(schema.bomDrafts)
    .set({
      ...data,
      version: expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.bomDrafts.id, id),
        eq(schema.bomDrafts.tenantId, tenantId),
        eq(schema.bomDrafts.version, expectedVersion)
      )
    )
    .returning();
  return updated ?? null;
}

// ─── Review queries ──────────────────────────────────────────────────────

export async function createReview(
  data: typeof schema.reviews.$inferInsert
) {
  const [review] = await db
    .insert(schema.reviews)
    .values(data)
    .returning();
  return review;
}

export async function getReviewsByBomDraft(
  tenantId: string,
  bomDraftId: string
) {
  return db
    .select()
    .from(schema.reviews)
    .where(
      and(
        eq(schema.reviews.tenantId, tenantId),
        eq(schema.reviews.bomDraftId, bomDraftId)
      )
    )
    .orderBy(desc(schema.reviews.createdAt));
}

// ─── Export queries ──────────────────────────────────────────────────────

export async function createExport(
  data: typeof schema.exports.$inferInsert
) {
  const [exp] = await db
    .insert(schema.exports)
    .values(data)
    .returning();
  return exp;
}

// ─── Audit log queries ──────────────────────────────────────────────────

export async function appendAuditLog(
  tenantId: string,
  eventType: string,
  actorId: string | null,
  payload: Record<string, unknown>
) {
  const [entry] = await db
    .insert(schema.auditLog)
    .values({
      tenantId,
      eventType,
      actorId,
      payloadJson: payload,
    })
    .returning();
  return entry;
}

export async function getAuditLog(
  tenantId: string,
  limit = 100,
  offset = 0
) {
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.tenantId, tenantId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit)
    .offset(offset);
}
