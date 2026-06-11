/**
 * Operator proof / evidence command (Prompt 135).
 *
 * Exercises live, provisioned Postgres Project-state execution end to end so the
 * Project store + Prompt 133 staleness propagation are proven against a real
 * local Docker Postgres database, not only in-memory mocks. This script is an
 * EVIDENCE command only: it changes no product behavior, wires no runtime
 * service/route/UI, performs no AI/catalog/SKU/configuration/pricing decision,
 * and runs no engine/coordinator/adapter. pg is used only for proof setup,
 * cleanup, schema checks, and low-level assertions; all Project-state behavior
 * goes through the existing Project repository/service functions.
 *
 * It resolves DATABASE_URL safely and sets process.env.DATABASE_URL BEFORE any
 * dynamic import of a module that imports src/lib/db/index.ts, because the DB
 * pool is constructed at module load time. Cleanup runs in a finally block and
 * deletes only the deterministic proof tenant's rows. Source is ASCII-only and
 * the full DATABASE_URL is never printed.
 *
 * Run (not registered in package.json by design):
 *   npx.cmd tsx scripts/prove-project-real-db.ts
 */
import { readFileSync } from "fs";
import path from "path";
import pg from "pg";

/** Deterministic identifiers reserved for THIS proof script only. */
const PROOF_TENANT_ID = "00000000-0000-4000-8000-0000000d1350";
const PROOF_TENANT_SLUG = "proof-real-db-prompt135";
const PROOF_TENANT_NAME = "Proof Real DB (Prompt 135)";
const PROOF_TENANT_REGION = "sa";
/** A second, never-created tenant id used to prove tenant-scoped isolation. */
const WRONG_TENANT_ID = "00000000-0000-4000-8000-0000000d13ff";
/** Deterministic UUID for the proof approver (decided_by is a UUID column). */
const PROOF_OPERATOR_ID = "00000000-0000-4000-8000-0000000d1300";

const REQUIRED_TABLES = [
  "tenants",
  "projects",
  "project_stages",
  "project_artifacts",
  "project_approvals",
] as const;

/** Resolve DATABASE_URL from the environment, else a DATABASE_URL= line in .env. */
function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") return fromEnv.trim();

  const envPath = path.join(process.cwd(), ".env");
  let contents: string;
  try {
    contents = readFileSync(envPath, "utf8");
  } catch {
    throw new Error(
      "DATABASE_URL is not set and .env was not found at repo root."
    );
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("DATABASE_URL=")) continue;
    let value = line.slice("DATABASE_URL=".length).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value !== "") return value;
  }
  throw new Error("No usable DATABASE_URL= line found in .env.");
}

/** Throw with a clear, prefixed message when an assertion fails. */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("ASSERTION FAILED: " + message);
}

/** True when every required Project table exists in the public schema. */
async function checkRequiredTables(client: pg.Client): Promise<{
  ok: boolean;
  missing: string[];
}> {
  const result = await client.query<{ table_name: string }>(
    "select table_name from information_schema.tables " +
      "where table_schema = 'public' and table_name = any($1::text[])",
    [REQUIRED_TABLES as unknown as string[]]
  );
  const present = new Set(result.rows.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((name) => !present.has(name));
  return { ok: missing.length === 0, missing };
}

/** Delete only the proof tenant's Project rows and tenant row (child-first). */
async function cleanProofTenant(client: pg.Client): Promise<void> {
  await client.query("delete from project_approvals where tenant_id = $1", [
    PROOF_TENANT_ID,
  ]);
  await client.query("delete from project_artifacts where tenant_id = $1", [
    PROOF_TENANT_ID,
  ]);
  await client.query("delete from project_stages where tenant_id = $1", [
    PROOF_TENANT_ID,
  ]);
  await client.query("delete from projects where tenant_id = $1", [
    PROOF_TENANT_ID,
  ]);
  await client.query("delete from tenants where id = $1", [PROOF_TENANT_ID]);
}

/** Insert/upsert the proof tenant row so Project FKs can be satisfied. */
async function upsertProofTenant(client: pg.Client): Promise<void> {
  await client.query(
    "insert into tenants (id, name, slug, region) values ($1, $2, $3, $4) " +
      "on conflict (id) do update set name = excluded.name, " +
      "slug = excluded.slug, region = excluded.region",
    [PROOF_TENANT_ID, PROOF_TENANT_NAME, PROOF_TENANT_SLUG, PROOF_TENANT_REGION]
  );
}

async function main(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  // Must be set BEFORE importing any module that imports src/lib/db/index.ts:
  // the pg Pool there is constructed at module load time.
  process.env.DATABASE_URL = databaseUrl;

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  // Set tenant context on this raw client so RLS-scoped statements (insert,
  // delete) operate on the proof tenant. Session-level (false) persists for the
  // life of this dedicated, soon-closed connection.
  await client.query("select set_config('app.tenant_id', $1, false)", [
    PROOF_TENANT_ID,
  ]);

  const summary: string[] = [];
  let passed = false;
  let cleanupResult = "not run";

  try {
    const tableCheck = await checkRequiredTables(client);
    if (!tableCheck.ok) {
      throw new Error(
        "Missing required Project tables: " +
          tableCheck.missing.join(", ") +
          ". Run `npm.cmd run db:migrate` and retry."
      );
    }

    // Dynamic imports AFTER process.env.DATABASE_URL is set.
    const { createQuickBomProject } = await import(
      "@/lib/projects/project-quick-bom-creation"
    );
    const { createProjectArtifactVersion, listProjectArtifacts } = await import(
      "@/lib/db/project-artifact-store"
    );
    const { createProjectApproval, listProjectApprovals } = await import(
      "@/lib/db/project-approval-store"
    );
    const { getProjectById } = await import("@/lib/db/project-store");

    // Start from a clean proof-tenant slate, then (re)create the tenant FK root.
    await cleanProofTenant(client);
    await upsertProofTenant(client);

    // 1) Create the quick_bom Project shell with SAR pricing config.
    const created = await createQuickBomProject({
      tenantId: PROOF_TENANT_ID,
      name: "Prompt 135 Real DB Proof",
      customerName: "Proof Customer",
      pricingConfig: { mode: "margin", ratePercent: 20 },
    });
    assert(created.status === "ok", "createQuickBomProject returned ok");
    if (created.status !== "ok") return;
    const projectId = created.project.id;

    // 2) Read the Project back for the same tenant; assert materialized stages.
    const readBack = await getProjectById(PROOF_TENANT_ID, projectId);
    assert(readBack !== null, "getProjectById returns the proof Project");
    const stageCount = readBack ? readBack.stages.length : 0;
    assert(stageCount > 0, "proof Project has materialized stages");

    // 3) Wrong-tenant read must be null (tenant-scoped isolation).
    const wrongTenantRead = await getProjectById(WRONG_TENANT_ID, projectId);
    assert(
      wrongTenantRead === null,
      "wrong-tenant getProjectById returns null"
    );

    // 4) normalized_boq v1.
    const normalizedV1 = await createProjectArtifactVersion({
      projectId,
      tenantId: PROOF_TENANT_ID,
      stageId: "boq_format_validation",
      type: "normalized_boq",
      status: "generated",
    });
    assert(normalizedV1.version === 1, "normalized_boq starts at version 1");

    // 5) Downstream artifacts with creatable statuses.
    await createProjectArtifactVersion({
      projectId,
      tenantId: PROOF_TENANT_ID,
      stageId: "sku_resolution",
      type: "sku_resolution",
      status: "generated",
    });
    await createProjectArtifactVersion({
      projectId,
      tenantId: PROOF_TENANT_ID,
      stageId: "configuration_expansion_review",
      type: "configuration_expansion",
      status: "generated",
    });
    const pricedV1 = await createProjectArtifactVersion({
      projectId,
      tenantId: PROOF_TENANT_ID,
      stageId: "boq_pricing_review",
      type: "priced_boq",
      status: "needs_review",
    });
    await createProjectArtifactVersion({
      projectId,
      tenantId: PROOF_TENANT_ID,
      stageId: "export_approval",
      type: "export_package",
      status: "generated",
    });

    // 6) Approve the EXACT priced_boq artifact/version.
    const approvalResult = await createProjectApproval({
      tenantId: PROOF_TENANT_ID,
      projectId,
      artifactId: pricedV1.id,
      decision: "approved",
      decidedBy: PROOF_OPERATOR_ID,
    });
    assert(approvalResult !== null, "createProjectApproval returned a result");
    const approvalsForPriced = (
      await listProjectApprovals(PROOF_TENANT_ID, projectId)
    ).filter(
      (a) => a.artifactId === pricedV1.id && a.artifactVersion === pricedV1.version
    );
    assert(
      approvalsForPriced.length === 1,
      "exactly one approval exists for the exact priced_boq artifact/version"
    );

    // 7) normalized_boq v2 -> Prompt 133 staleness propagation.
    const normalizedV2 = await createProjectArtifactVersion({
      projectId,
      tenantId: PROOF_TENANT_ID,
      stageId: "boq_format_validation",
      type: "normalized_boq",
      status: "generated",
    });
    assert(normalizedV2.version === 2, "normalized_boq advanced to version 2");

    const afterV2 = await listProjectArtifacts(PROOF_TENANT_ID, projectId);
    const latestByType = (type: string) =>
      afterV2
        .filter((a) => a.type === type)
        .reduce(
          (latest, a) => (latest && latest.version > a.version ? latest : a),
          undefined as (typeof afterV2)[number] | undefined
        );

    const staleTypes = [
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
      "export_package",
    ];
    const statusLines: string[] = [];
    for (const type of staleTypes) {
      const latest = latestByType(type);
      assert(latest !== undefined, "latest " + type + " exists");
      assert(
        latest !== undefined && latest.status === "stale",
        "latest " + type + " is marked stale after normalized_boq v2"
      );
      if (latest) statusLines.push("  " + type + ": " + latest.status);
    }

    const latestNormalized = latestByType("normalized_boq");
    assert(
      latestNormalized !== undefined &&
        latestNormalized.version === 2 &&
        latestNormalized.status !== "stale",
      "normalized_boq v2 remains non-stale"
    );
    if (latestNormalized) {
      statusLines.push(
        "  normalized_boq (v" +
          latestNormalized.version +
          "): " +
          latestNormalized.status
      );
    }

    // 8) Tenant/project scoping: list/read returns only proof Project artifacts.
    assert(
      afterV2.every((a) => a.projectId === projectId),
      "listProjectArtifacts returns only proof Project artifacts"
    );
    const wrongTenantArtifacts = await listProjectArtifacts(
      WRONG_TENANT_ID,
      projectId
    );
    assert(
      wrongTenantArtifacts.length === 0,
      "wrong-tenant listProjectArtifacts returns nothing"
    );

    passed = true;
    summary.push("project id:        " + projectId);
    summary.push("stage count:       " + stageCount);
    summary.push("wrong-tenant read: " + String(wrongTenantRead));
    summary.push("approval count:    " + approvalsForPriced.length);
    summary.push("artifact statuses after normalized_boq v2:");
    summary.push(...statusLines);
    void normalizedV1;
  } finally {
    try {
      await cleanProofTenant(client);
      cleanupResult = "ok (proof tenant rows removed)";
    } catch (cleanupError) {
      cleanupResult =
        "FAILED: " +
        (cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError));
      passed = false;
    } finally {
      await client.end();
    }
  }

  // ASCII summary to stdout.
  const lines: string[] = [];
  lines.push("============================================================");
  lines.push("BOMATIC Project Real-DB Proof (Prompt 135)");
  lines.push("============================================================");
  lines.push("result:            " + (passed ? "PASS" : "FAIL"));
  lines.push("required tables:    present (" + REQUIRED_TABLES.join(", ") + ")");
  for (const line of summary) lines.push(line);
  lines.push("cleanup result:    " + cleanupResult);
  lines.push("============================================================");
  process.stdout.write(lines.join("\n") + "\n");

  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stdout.write(
    "BOMATIC Project Real-DB Proof (Prompt 135)\nresult:            FAIL\n" +
      "error:             " +
      (error instanceof Error ? error.message : String(error)) +
      "\n"
  );
  process.exitCode = 1;
});
