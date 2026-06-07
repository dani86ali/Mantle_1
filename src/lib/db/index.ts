import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;

/**
 * The transaction handle passed to a {@link withTenantDb} callback. Derived from
 * db.transaction's own callback so reads and writes use the exact Drizzle
 * transaction type without restating the full PgTransaction generic.
 */
export type TenantDb = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Run callback inside a DB transaction whose PostgreSQL app.tenant_id is set for
 * the life of that transaction. The Project RLS policies read
 * current_setting('app.tenant_id', true), so every statement issued on the
 * provided tx is tenant-scoped at the database level.
 *
 * Tenant context is transaction-local (set_config(..., true)), never session or
 * global, so it cannot leak across pooled connections. The callback must use the
 * provided tx (not the module-level db) so its statements share this transaction
 * and its tenant setting. Keep explicit tenant_id filters in queries as defense
 * in depth - this helper does not replace them.
 */
export async function withTenantDb<T>(
  tenantId: string,
  callback: (tenantDb: TenantDb) => Promise<T>
): Promise<T> {
  if (typeof tenantId !== "string" || tenantId.trim() === "") {
    throw new Error("tenantId is required.");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return callback(tx);
  });
}
