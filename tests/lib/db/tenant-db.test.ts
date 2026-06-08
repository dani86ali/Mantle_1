import { describe, it, expect, beforeEach, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// --- What this file proves --------------------------------------------------
// withTenantDb is the ONLY runtime helper Project stores use for tenant-scoped
// DB execution (src/lib/db/index.ts). This test exercises the REAL helper and
// the REAL drizzle `sql` template; only the database boundary is faked:
//
//   * `pg` Pool        -> a no-op class so module load never opens a socket;
//   * `drizzle()`      -> returns a fake `db` whose `.transaction` is a spy.
//
// Because `drizzle-orm` itself is NOT mocked, the `sql` fragment the helper
// builds is a genuine drizzle SQL object. We capture it from the tx.execute spy
// and compile it with the real PgDialect to prove the tenant id is bound as a
// parameter (not concatenated) and that set_config is transaction-local.
//
// The fakes are self-checking: if either mock failed to apply, `db.transaction`
// would be the real driver and these assertions would FAIL, not silently pass.

const { PoolMock, drizzleMock, transactionMock, executeMock, txHandle, capture, order } =
  vi.hoisted(() => {
    // Recorded across the helper's single transaction so a test can assert
    // tx.execute (the set_config) runs before the callback body.
    const order: string[] = [];
    // Holds the SQL fragment the helper passes to tx.execute, for compilation.
    const capture: { sql: unknown } = { sql: undefined };

    // tx.execute(set_config(...)). Default impl records ordering + the fragment;
    // a test can override it once (mockRejectedValueOnce) to fail transaction
    // setup.
    const executeMock = vi.fn(async (fragment: unknown) => {
      capture.sql = fragment;
      order.push("execute");
      return undefined;
    });

    // The transaction handle passed to the callback. A DISTINCT object (not the
    // module-level db) so a test can prove the callback receives the tx.
    const txHandle = { execute: executeMock };

    // db.transaction(cb): run cb with the tx handle and return its result,
    // mirroring node-postgres transaction semantics closely enough for the
    // helper under test.
    const transactionMock = vi.fn(
      async (cb: (tx: unknown) => unknown) => cb(txHandle)
    );

    // drizzle(pool, { schema }) -> the fake db whose only used method is
    // transaction.
    const drizzleMock = vi.fn(() => ({ transaction: transactionMock }));

    // new pg.Pool({ connectionString }) at module load must not touch a socket.
    class PoolMock {}

    return {
      PoolMock,
      drizzleMock,
      transactionMock,
      executeMock,
      txHandle,
      capture,
      order,
    };
  });

vi.mock("pg", () => ({ default: { Pool: PoolMock }, Pool: PoolMock }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: drizzleMock }));

import { db, withTenantDb } from "@/lib/db/index";

const TENANT = "11111111-1111-1111-1111-111111111111";

/** Compile the captured fragment with the real Postgres dialect. */
function compileCapturedSql() {
  return new PgDialect().sqlToQuery(capture.sql as SQL);
}

beforeEach(() => {
  // clearAllMocks (NOT reset) so executeMock/transactionMock keep their hoisted
  // implementations between tests; only call records are cleared.
  vi.clearAllMocks();
  order.length = 0;
  capture.sql = undefined;
});

describe("withTenantDb - tenant id validation", () => {
  // Blank/whitespace tenant ids are rejected BEFORE any transaction is opened.
  for (const blank of ["", " ", "   ", "\t", "\n", " \t\n "]) {
    it(`rejects ${JSON.stringify(blank)} before opening a transaction`, async () => {
      const callback = vi.fn(async (_tx: unknown) => undefined);

      await expect(withTenantDb(blank, callback)).rejects.toThrow(
        "tenantId is required."
      );

      expect(transactionMock).not.toHaveBeenCalled();
      expect(executeMock).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });
  }
});

describe("withTenantDb - transaction + tenant context", () => {
  it("opens db.transaction for a valid tenant", async () => {
    await withTenantDb(TENANT, async () => undefined);

    expect(transactionMock).toHaveBeenCalledTimes(1);
    // The spy IS db.transaction: the helper went through the module-level db.
    expect(db.transaction).toBe(transactionMock);
  });

  it("runs tx.execute(set_config) before invoking the callback", async () => {
    await withTenantDb(TENANT, async () => {
      order.push("callback");
    });

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["execute", "callback"]);
  });

  it("passes the transaction handle - not the module-level db - to the callback", async () => {
    let received: unknown;
    await withTenantDb(TENANT, async (tx) => {
      received = tx;
    });

    expect(received).toBe(txHandle);
    expect(received).not.toBe(db);
  });

  it("binds the tenant id as a SQL parameter, not concatenated into raw SQL", async () => {
    await withTenantDb(TENANT, async () => undefined);

    const compiled = compileCapturedSql();
    // The tenant id travels as a bound parameter value...
    expect(compiled.params).toEqual([TENANT]);
    // ...and a numbered placeholder stands in for it in the SQL text...
    expect(compiled.sql).toContain("$1");
    // ...so the raw tenant id never appears in the SQL string.
    expect(compiled.sql).not.toContain(TENANT);
  });

  it("requests transaction-local tenant context (set_config third arg true)", async () => {
    await withTenantDb(TENANT, async () => undefined);

    const compiled = compileCapturedSql();
    // Transaction-local: set_config(..., true). The real dialect emitted exactly
    // `select set_config('app.tenant_id', $1, true)`.
    expect(compiled.sql).toMatch(
      /set_config\('app\.tenant_id',\s*\$1,\s*true\)/
    );
    // Not session/global: no is_local=false flag, no SET SESSION.
    expect(compiled.sql).not.toMatch(/,\s*false\)/);
    expect(compiled.sql.toLowerCase()).not.toContain("set session");
  });
});

describe("withTenantDb - result & error propagation", () => {
  it("returns the callback's resolved value", async () => {
    const result = await withTenantDb(TENANT, async () => ({ rows: 7 }));
    expect(result).toEqual({ rows: 7 });
  });

  it("propagates errors thrown by the callback", async () => {
    const boom = new Error("callback boom");
    await expect(
      withTenantDb(TENANT, async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
  });

  it("propagates transaction-setup (set_config) failures and never runs the callback", async () => {
    const setupError = new Error("set_config failed");
    executeMock.mockRejectedValueOnce(setupError);
    const callback = vi.fn(async (_tx: unknown) => undefined);

    await expect(withTenantDb(TENANT, callback)).rejects.toBe(setupError);

    // The transaction was opened, set_config was attempted, but the callback
    // never ran because the helper awaits tx.execute before calling it.
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });
});
