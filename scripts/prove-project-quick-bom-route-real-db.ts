/**
 * Operator proof / evidence command (Prompt 137).
 *
 * Drives the EXISTING Next.js Quick BoM API route handlers directly against a
 * real, provisioned local Postgres so the full route/action chain is proven end
 * to end against live Project persistence (not only the in-memory test store).
 * The chain exercised is: create quick_bom Project -> upload the full seven-line
 * Honeywell CSV -> normalize -> SKU resolution (explicit honeywell_mvp_demo
 * catalog profile opt-in) -> explicit per-line SKU review -> SKU approval ->
 * configuration expansion draft -> explicit per-line configuration review ->
 * configuration approval -> deterministic SAR pricing -> priced approval ->
 * export package -> export approval -> approved workbook download.
 *
 * This script is an EVIDENCE command ONLY. It changes no product behavior, wires
 * no new runtime service, and performs no runtime AI, fuzzy matching, catalog
 * authority, replacement/substitution, configuration authority, or pricing
 * decision of its own. All Quick BoM behavior runs through the existing route
 * handlers and the existing Project services behind them. `pg` is used only for
 * proof setup, cleanup, schema checks, proof-tenant row assertions, and low-level
 * table checks; the existing DB stores are imported only to inspect persisted
 * artifact payloads (decisions / draft lines / accepted lines) so that explicit
 * review actions can be built - never to bypass the route chain for behavior.
 *
 * It resolves DATABASE_URL safely and sets process.env.DATABASE_URL BEFORE any
 * dynamic import of a module that imports src/lib/db/index.ts (the pg Pool there
 * is constructed at module load time). It sets process.env.NODE_ENV to
 * "development" BEFORE route calls so requireAuth reads the explicit x-dev-session
 * header. Cleanup runs in a finally block and deletes only the deterministic
 * proof tenant's rows. Source is ASCII-only and the full DATABASE_URL is never
 * printed.
 *
 * Run (not registered in package.json by design):
 *   npx.cmd tsx scripts/prove-project-quick-bom-route-real-db.ts
 */
import { readFileSync, rmSync } from "fs";
import { dirname } from "path";
import path from "path";
import pg from "pg";

import type { NextRequest } from "next/server";

/** Deterministic identifiers reserved for THIS proof script only. */
const PROOF_TENANT_ID = "00000000-0000-4000-8000-0000000d1370";
const PROOF_TENANT_SLUG = "proof-route-real-db-prompt137";
const PROOF_TENANT_NAME = "Proof Route Real DB (Prompt 137)";
const PROOF_TENANT_REGION = "sa";
/** A second, never-created tenant id used to prove tenant-scoped isolation. */
const WRONG_TENANT_ID = "00000000-0000-4000-8000-0000000d137f";
/** Deterministic UUID for the proof operator (the x-dev-session user id). */
const PROOF_OPERATOR_ID = "00000000-0000-4000-8000-0000000d1371";

const REQUIRED_TABLES = [
  "tenants",
  "projects",
  "project_files",
  "project_stages",
  "project_artifacts",
  "project_approvals",
] as const;

/** The explicit dev session the route handlers authenticate against. */
const PROOF_SESSION = {
  userId: PROOF_OPERATOR_ID,
  tenantId: PROOF_TENANT_ID,
  email: "operator@proof.example",
  name: "Proof Operator",
  role: "engineer",
};
const PROOF_SESSION_HEADER = JSON.stringify(PROOF_SESSION);

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HONEYWELL_CATALOG_SOURCE = "honeywell_mvp_demo_catalog_supplement";
const STANDALONE_OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];

/** Full seven-line Honeywell Format #2 CSV (proof input). */
const HONEYWELL_SEVEN_LINE_CSV = [
  "#,Description,Part Number,Qty",
  "1,Wireless AP,CW9178I-CFG,12",
  "2,Network subscription,CISCO-NETWORK-SUB,1",
  "3,Access switch,C9300X-48HX-A,7",
  "4,Access switch,C9300L-24P-4X-A,6",
  "5,Standalone optic,SFP-10G-LR-S=,12",
  "6,Standalone optic,SFP-10/25G-LR-S=,14",
  "7,Desk phone,CP-7841-K9=,59",
].join("\n");

/** Expected deterministic priced/export totals (committed demo pricing fixture). */
const EXPECTED_TOTAL_PRICE_SAR = 2185708.76;
const EXPECTED_TOTAL_INC_VAT_SAR = 2513565.07;
const TOTAL_TOLERANCE = 0.1;

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

/** True when |actual - expected| is within the deterministic-total tolerance. */
function closeTo(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= TOTAL_TOLERANCE;
}

/** Case-insensitive header bag: x-dev-session always present, plus any extras. */
function headerBag(extra: Record<string, string> = {}): {
  get: (name: string) => string | null;
} {
  const map: Record<string, string> = { "x-dev-session": PROOF_SESSION_HEADER };
  for (const [key, value] of Object.entries(extra)) {
    map[key.toLowerCase()] = value;
  }
  return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

/** Minimal authenticated request with no body. */
function emptyRequest(): NextRequest {
  return {
    headers: headerBag(),
    cookies: { get: () => undefined },
  } as unknown as NextRequest;
}

/** Minimal authenticated request exposing a JSON body via request.json(). */
function jsonRequest(body: unknown): NextRequest {
  return {
    headers: headerBag(),
    cookies: { get: () => undefined },
    json: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

/**
 * Like jsonRequest but also reports an application/json content-type header so a
 * route that gates body parsing on content-type (sku-resolution) reads the body.
 */
function jsonContentTypeRequest(body: unknown): NextRequest {
  return {
    headers: headerBag({ "content-type": "application/json" }),
    cookies: { get: () => undefined },
    json: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

/** Minimal authenticated request exposing a multipart body via request.formData(). */
function formRequest(form: FormData): NextRequest {
  return {
    headers: headerBag(),
    cookies: { get: () => undefined },
    formData: () => Promise.resolve(form),
  } as unknown as NextRequest;
}

/** Assert the response status then parse and return its JSON body. */
async function expectJson(
  response: Response,
  status: number,
  label: string
): Promise<Record<string, unknown>> {
  assert(
    response.status === status,
    label + " expected HTTP " + status + " but got " + response.status
  );
  return (await response.json()) as Record<string, unknown>;
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

/** True when a public-schema table of this name exists. */
async function tableExists(
  client: pg.Client,
  tableName: string
): Promise<boolean> {
  const result = await client.query(
    "select 1 from information_schema.tables " +
      "where table_schema = 'public' and table_name = $1",
    [tableName]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

/** Collect uploaded/exported on-disk paths for the proof tenant (best-effort). */
async function collectProofFilePaths(client: pg.Client): Promise<string[]> {
  const paths: string[] = [];
  try {
    const files = await client.query<{ storage_path: string | null }>(
      "select storage_path from project_files where tenant_id = $1",
      [PROOF_TENANT_ID]
    );
    for (const row of files.rows) {
      if (typeof row.storage_path === "string" && row.storage_path !== "") {
        paths.push(row.storage_path);
      }
    }
    const artifacts = await client.query<{ file_path: string | null }>(
      "select file_path from project_artifacts " +
        "where tenant_id = $1 and file_path is not null",
      [PROOF_TENANT_ID]
    );
    for (const row of artifacts.rows) {
      if (typeof row.file_path === "string" && row.file_path !== "") {
        paths.push(row.file_path);
      }
    }
  } catch {
    // Best-effort only: a query failure must not block row cleanup.
  }
  return paths;
}

/** Best-effort removal of proof-tenant temp files and their upload directories. */
function removeProofFiles(paths: string[]): void {
  for (const filePath of paths) {
    try {
      rmSync(filePath, { force: true });
      const dir = dirname(filePath);
      if (dir.includes("bomatic-project-uploads")) {
        rmSync(dir, { recursive: true, force: true });
      }
    } catch {
      // Ignore: temp file cleanup is best-effort.
    }
  }
}

/** Delete only the proof tenant's rows and tenant row (child-first). */
async function cleanProofTenant(client: pg.Client): Promise<void> {
  await client.query("delete from project_approvals where tenant_id = $1", [
    PROOF_TENANT_ID,
  ]);
  if (await tableExists(client, "project_evidence_items")) {
    await client.query(
      "delete from project_evidence_items where tenant_id = $1",
      [PROOF_TENANT_ID]
    );
  }
  await client.query("delete from project_artifacts where tenant_id = $1", [
    PROOF_TENANT_ID,
  ]);
  await client.query("delete from project_files where tenant_id = $1", [
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

/** Recursively assert no active replacement/substitution fields in a payload. */
function assertNoReplacementSubstitution(value: unknown, here = "payload"): void {
  const FORBIDDEN_KEYS = new Set([
    "replacement",
    "replacementFor",
    "replacementSku",
    "replacementCandidate",
    "replacementCandidates",
    "substitution",
    "substitutedSku",
    "silentSubstitution",
    "currentSku",
  ]);
  const AUTHORITY_FLAG_KEYS = new Set([
    "replacementAuthority",
    "skuSubstitutionAuthority",
    "silentSkuSubstitution",
  ]);
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      assertNoReplacementSubstitution(item, here + "[" + i + "]")
    );
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const keyPath = here + "." + key;
    if (FORBIDDEN_KEYS.has(key)) {
      assert(
        child === undefined,
        "forbidden replacement/substitution key " + keyPath + " present"
      );
    } else if (AUTHORITY_FLAG_KEYS.has(key)) {
      assert(child === false, "authority flag " + keyPath + " must be false");
    } else {
      assertNoReplacementSubstitution(child, keyPath);
    }
  }
}

async function main(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  // Must be set BEFORE importing any module that imports src/lib/db/index.ts:
  // the pg Pool there is constructed at module load time.
  process.env.DATABASE_URL = databaseUrl;
  // Must be set BEFORE route calls so requireAuth reads the x-dev-session header.
  // process.env.NODE_ENV is typed read-only; assign through a mutable view.
  (process.env as { NODE_ENV?: string }).NODE_ENV = "development";

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  // Set tenant context on this raw client so RLS-scoped statements (insert,
  // delete) operate on the proof tenant for the life of this connection.
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

    // Dynamic imports AFTER process.env.DATABASE_URL is set. The route handlers
    // are the ONLY behavior path; the DB stores are read-only inspection helpers
    // used solely to build explicit review actions and verify final state.
    const projectCreateRoute = await import(
      "@/app/api/projects/quick-bom/route"
    );
    const workspaceRoute = await import(
      "@/app/api/projects/[id]/quick-bom/route"
    );
    const filesRoute = await import(
      "@/app/api/projects/[id]/quick-bom/files/route"
    );
    const normalizeRoute = await import(
      "@/app/api/projects/[id]/quick-bom/files/[fileId]/normalize/route"
    );
    const skuRoute = await import(
      "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/route"
    );
    const skuReviewRoute = await import(
      "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/review/route"
    );
    const configRoute = await import(
      "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/route"
    );
    const configReviewRoute = await import(
      "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/review/route"
    );
    const pricedRoute = await import(
      "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/priced-boq/route"
    );
    const approvalsRoute = await import(
      "@/app/api/projects/[id]/quick-bom/approvals/route"
    );
    const exportRoute = await import(
      "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/export-package/route"
    );
    const downloadRoute = await import(
      "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/export-package/download/route"
    );

    const { getProjectById } = await import("@/lib/db/project-store");
    const { getProjectArtifactById, listProjectArtifacts } = await import(
      "@/lib/db/project-artifact-store"
    );

    // Start from a clean proof-tenant slate, then (re)create the tenant FK root.
    await cleanProofTenant(client);
    await upsertProofTenant(client);

    // Generic approval through the Quick BoM approvals route (artifactId + decision).
    const approve = async (
      projectId: string,
      artifactId: string,
      label: string
    ): Promise<void> => {
      const res = await approvalsRoute.POST(
        jsonRequest({ artifactId, decision: "approved" }),
        { params: { id: projectId } }
      );
      const body = await expectJson(res, 200, "approve " + label);
      assert(
        body.artifactStatus === "approved",
        label + " artifact is approved after the approval route"
      );
      assert(
        body.stageStatus === "approved",
        label + " stage is approved after the approval route"
      );
    };

    // 1) Create the quick_bom Project through POST /api/projects/quick-bom.
    const createRes = await projectCreateRoute.POST(
      jsonRequest({
        name: "Prompt 137 Route Real DB Proof",
        customerName: "Proof Route Customer",
        pricingConfig: {
          mode: "markup",
          ratePercent: 0,
          vatRatePercent: 15,
          roundingDecimals: 2,
        },
      })
    );
    const createBody = await expectJson(createRes, 201, "create project");
    const projectId = (createBody.project as { id: string }).id;

    // Proof tenant sees the Project; the wrong tenant does not.
    assert(
      (await getProjectById(PROOF_TENANT_ID, projectId)) !== null,
      "proof tenant getProjectById returns the Project"
    );
    assert(
      (await getProjectById(WRONG_TENANT_ID, projectId)) === null,
      "wrong-tenant getProjectById returns null"
    );

    // 2) Upload the full seven-line Honeywell CSV.
    const form = new FormData();
    form.set(
      "file",
      new File([HONEYWELL_SEVEN_LINE_CSV], "honeywell-route-proof.csv", {
        type: "text/csv",
      })
    );
    const uploadRes = await filesRoute.POST(formRequest(form), {
      params: { id: projectId },
    });
    const uploadBody = await expectJson(uploadRes, 201, "upload");
    const fileId = (uploadBody.file as { id: string }).id;

    // 3) Normalize the uploaded BoQ.
    const normalizeRes = await normalizeRoute.POST(emptyRequest(), {
      params: { id: projectId, fileId },
    });
    const normalizeBody = await expectJson(normalizeRes, 201, "normalize");
    const normalizedArtifactId = (normalizeBody.artifact as { id: string }).id;
    const normalizedArtifact = await getProjectArtifactById(
      PROOF_TENANT_ID,
      projectId,
      normalizedArtifactId
    );
    assert(normalizedArtifact !== null, "normalized artifact is persisted");
    const normalizedLineCount = (
      (normalizedArtifact.payload.lines as unknown[]) ?? []
    ).length;
    assert(normalizedLineCount === 7, "normalized BoQ has 7 lines");

    // 4) SKU resolution with the explicit Honeywell demo catalog profile.
    const skuRes = await skuRoute.POST(
      jsonContentTypeRequest({ catalogProfile: "honeywell_mvp_demo" }),
      { params: { id: projectId, artifactId: normalizedArtifactId } }
    );
    const skuBody = await expectJson(skuRes, 201, "sku resolution");
    const skuArtifactId = (skuBody.artifact as { id: string }).id;
    const skuPayloadSummary = skuBody.payloadSummary as {
      lineCount: number;
      summary: { catalogSource: string; unresolvedCount: number };
    };
    assert(skuPayloadSummary.lineCount === 7, "SKU resolution has lineCount 7");
    assert(
      skuPayloadSummary.summary.catalogSource === HONEYWELL_CATALOG_SOURCE,
      "SKU resolution catalogSource is the Honeywell demo supplement"
    );
    assert(
      skuPayloadSummary.summary.unresolvedCount === 0,
      "SKU resolution has no unresolved lines"
    );
    assert(
      (skuBody.artifact as { status: string }).status === "needs_review",
      "SKU resolution stays needs_review until explicit review (no auto-approve)"
    );

    // Inspect persisted SKU decisions ONLY to build explicit accept actions.
    const skuDraft = await getProjectArtifactById(
      PROOF_TENANT_ID,
      projectId,
      skuArtifactId
    );
    assert(skuDraft !== null, "SKU draft is persisted");
    const skuDecisions = (skuDraft.payload.decisions ?? []) as Array<{
      sourceFileId: string;
      sourceRowNumber: number;
      status: string;
      suggestions: Array<{ suggestedSku: string }>;
    }>;
    assert(skuDecisions.length === 7, "SKU draft has 7 decisions");
    const skuActions = skuDecisions.map((decision) => {
      assert(
        decision.status === "needs_review",
        "each SKU decision starts needs_review"
      );
      assert(
        decision.suggestions.length > 0,
        "each SKU decision has at least one suggestion"
      );
      return {
        decision: "accept" as const,
        sourceFileId: decision.sourceFileId,
        sourceRowNumber: decision.sourceRowNumber,
        acceptedSku: decision.suggestions[0].suggestedSku,
      };
    });

    // 5) Review every SKU line by explicitly accepting its suggested SKU.
    const skuReviewRes = await skuReviewRoute.POST(
      jsonRequest({ actions: skuActions }),
      { params: { id: projectId, artifactId: skuArtifactId } }
    );
    const skuReviewBody = await expectJson(skuReviewRes, 200, "sku review");
    const reviewedSkuArtifactId = (skuReviewBody.artifact as { id: string }).id;
    const skuAcceptedCount = skuActions.length;

    // 6) Approve the reviewed sku_resolution artifact.
    await approve(projectId, reviewedSkuArtifactId, "sku_resolution");

    // 7) Create the configuration expansion draft from the approved SKU artifact.
    const configRes = await configRoute.POST(emptyRequest(), {
      params: { id: projectId, artifactId: reviewedSkuArtifactId },
    });
    const configBody = await expectJson(configRes, 201, "configuration expansion");
    const configArtifactId = (configBody.artifact as { id: string }).id;
    assert(
      (configBody.artifact as { status: string }).status === "needs_review",
      "configuration expansion draft requires review"
    );
    const configDraft = await getProjectArtifactById(
      PROOF_TENANT_ID,
      projectId,
      configArtifactId
    );
    assert(configDraft !== null, "configuration draft is persisted");
    assert(
      configDraft.payload.payloadKind === "configuration_expansion_draft",
      "configuration draft payload is a draft"
    );
    const configLines = (configDraft.payload.lines ?? []) as Array<{
      lineId: string;
      origin: string;
      sku: string;
    }>;
    const expansionLines = configLines.filter(
      (line) => line.origin === "expansion"
    );
    assert(expansionLines.length > 0, "configuration draft has expansion lines");
    // Optics remain standalone customer-origin lines, never expansion children.
    for (const optic of STANDALONE_OPTICS) {
      assert(
        !configLines.some(
          (line) => line.origin === "expansion" && line.sku === optic
        ),
        "optic " + optic + " is not an expansion child in the draft"
      );
    }

    // 8) Review configuration expansion by explicitly accepting every expansion
    //    line. Customer-origin lines are never decided here.
    const configDecisions = expansionLines.map((line) => ({
      lineId: line.lineId,
      action: "accept" as const,
    }));
    const configReviewRes = await configReviewRoute.POST(
      jsonRequest({ decisions: configDecisions }),
      { params: { id: projectId, artifactId: configArtifactId } }
    );
    const configReviewBody = await expectJson(
      configReviewRes,
      200,
      "configuration review"
    );
    const reviewedConfigArtifactId = (
      configReviewBody.artifact as { id: string }
    ).id;
    const reviewedConfig = await getProjectArtifactById(
      PROOF_TENANT_ID,
      projectId,
      reviewedConfigArtifactId
    );
    assert(reviewedConfig !== null, "reviewed configuration artifact persisted");
    const acceptedLines = (reviewedConfig.payload.acceptedLines ?? []) as Array<{
      origin: string;
      sku: string;
    }>;
    const configAcceptedLineCount = acceptedLines.length;
    assert(
      configAcceptedLineCount === 60,
      "reviewed configuration has 60 accepted lines"
    );
    for (const optic of STANDALONE_OPTICS) {
      const opticLines = acceptedLines.filter((line) => line.sku === optic);
      assert(opticLines.length > 0, "optic " + optic + " stays in the BoM");
      assert(
        opticLines.every((line) => line.origin === "customer"),
        "optic " + optic + " stays customer-origin"
      );
      assert(
        !acceptedLines.some(
          (line) => line.origin === "expansion" && line.sku === optic
        ),
        "optic " + optic + " is not an accepted expansion child"
      );
    }

    // 9) Approve the reviewed configuration_expansion artifact.
    await approve(projectId, reviewedConfigArtifactId, "configuration_expansion");

    // 10) Create priced_boq via deterministic SAR pricing.
    const pricedRes = await pricedRoute.POST(emptyRequest(), {
      params: { id: projectId, artifactId: reviewedConfigArtifactId },
    });
    const pricedBody = await expectJson(pricedRes, 200, "priced boq");
    const pricedArtifactId = (pricedBody.artifact as { id: string }).id;
    const pricedPayloadSummary = pricedBody.payloadSummary as {
      lineCount: number;
    };
    const pricingSummary = pricedBody.pricingSummary as {
      unpricedLineCount: number;
      missingPriceCount: number;
      totals: { subtotalSellPriceSar: number; totalIncVatSar: number };
    };
    assert(pricedPayloadSummary.lineCount === 60, "priced BoQ has 60 lines");
    assert(
      pricingSummary.unpricedLineCount === 0,
      "priced BoQ has no unpriced lines"
    );
    assert(
      pricingSummary.missingPriceCount === 0,
      "priced BoQ has no missing prices"
    );
    const totalPriceSar = pricingSummary.totals.subtotalSellPriceSar;
    const totalIncVatSar = pricingSummary.totals.totalIncVatSar;
    assert(
      closeTo(totalPriceSar, EXPECTED_TOTAL_PRICE_SAR),
      "priced BoQ totalPriceSar matches the committed fixture"
    );
    assert(
      closeTo(totalIncVatSar, EXPECTED_TOTAL_INC_VAT_SAR),
      "priced BoQ totalIncVatSar matches the committed fixture"
    );

    // 11) Approve the priced_boq artifact.
    await approve(projectId, pricedArtifactId, "priced_boq");

    // 12) Create the export package.
    const exportRes = await exportRoute.POST(emptyRequest(), {
      params: { id: projectId, artifactId: pricedArtifactId },
    });
    const exportBody = await expectJson(exportRes, 200, "export package");
    const exportArtifactId = (exportBody.artifact as { id: string }).id;
    const exportSummary = exportBody.exportSummary as {
      rowCount: number;
      warnings: string[];
      totals: { totalIncVatSar: number };
    };
    const exportRowCount = exportSummary.rowCount;
    assert(exportRowCount === 60, "export package has 60 rows");
    assert(exportSummary.warnings.length === 0, "export package has no warnings");
    assert(
      closeTo(exportSummary.totals.totalIncVatSar, EXPECTED_TOTAL_INC_VAT_SAR),
      "export totals are consistent with priced_boq"
    );

    // 13) Approve the export_package artifact.
    await approve(projectId, exportArtifactId, "export_package");

    // 14) Download the approved workbook.
    const downloadRes = await downloadRoute.GET(emptyRequest(), {
      params: { id: projectId, artifactId: exportArtifactId },
    });
    assert(downloadRes.status === 200, "download returns HTTP 200");
    assert(
      downloadRes.headers.get("content-type") === XLSX_MIME,
      "download is an XLSX content type"
    );
    const downloadedBytes = new Uint8Array(await downloadRes.arrayBuffer());
    assert(downloadedBytes.byteLength > 0, "downloaded workbook is non-empty");

    // --- Proof assertions over persisted state -----------------------------
    // Exactly one proof Project row exists during the run.
    const projectRows = await client.query(
      "select id from projects where tenant_id = $1",
      [PROOF_TENANT_ID]
    );
    assert(
      projectRows.rowCount === 1,
      "exactly one proof Project row exists before cleanup"
    );

    // Wrong-tenant reads see nothing; proof-tenant reads see only this Project.
    const wrongTenantArtifacts = await listProjectArtifacts(
      WRONG_TENANT_ID,
      projectId
    );
    assert(
      wrongTenantArtifacts.length === 0,
      "wrong-tenant listProjectArtifacts returns nothing"
    );
    const proofArtifacts = await listProjectArtifacts(PROOF_TENANT_ID, projectId);
    assert(
      proofArtifacts.every((artifact) => artifact.projectId === projectId),
      "proof-tenant artifacts all belong to the proof Project"
    );

    // Final latest artifacts are approved where expected.
    const latestByType = (type: string) =>
      proofArtifacts
        .filter((artifact) => artifact.type === type)
        .reduce(
          (latest, artifact) =>
            latest && latest.version > artifact.version ? latest : artifact,
          undefined as (typeof proofArtifacts)[number] | undefined
        );
    for (const type of [
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
      "export_package",
    ]) {
      const latest = latestByType(type);
      assert(latest !== undefined, "latest " + type + " exists");
      assert(
        latest !== undefined && latest.status === "approved",
        "latest " + type + " is approved"
      );
    }

    // No active replacement/substitution fields in any persisted payload.
    for (const type of [
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
      "export_package",
    ]) {
      const latest = latestByType(type);
      if (latest) assertNoReplacementSubstitution(latest.payload, type);
    }

    passed = true;
    summary.push("project id:               " + projectId);
    summary.push("uploaded file id:          " + fileId);
    summary.push("normalized line count:     " + normalizedLineCount);
    summary.push("SKU catalog source:        " + HONEYWELL_CATALOG_SOURCE);
    summary.push("SKU accepted count:        " + skuAcceptedCount);
    summary.push("config accepted lines:     " + configAcceptedLineCount);
    summary.push("priced line count:         " + pricedPayloadSummary.lineCount);
    summary.push("totalPriceSar:             " + totalPriceSar.toFixed(2));
    summary.push("totalIncVatSar:            " + totalIncVatSar.toFixed(2));
    summary.push("export row count:          " + exportRowCount);
    summary.push("downloaded XLSX bytes:     " + downloadedBytes.byteLength);
  } finally {
    try {
      const proofFilePaths = await collectProofFilePaths(client);
      await cleanProofTenant(client);
      removeProofFiles(proofFilePaths);
      // Verify cleanup actually removed the proof Project (not just no throw).
      const remaining = await client.query(
        "select id from projects where tenant_id = $1",
        [PROOF_TENANT_ID]
      );
      if (remaining.rowCount !== 0) {
        cleanupResult =
          "FAILED: proof Project rows remain after cleanup (" +
          remaining.rowCount +
          ")";
        passed = false;
      } else {
        cleanupResult = "ok (proof tenant rows and temp files removed)";
      }
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

  const lines: string[] = [];
  lines.push("============================================================");
  lines.push("BOMATIC Quick BoM Route Real-DB Proof (Prompt 137)");
  lines.push("============================================================");
  lines.push("result:                    " + (passed ? "PASS" : "FAIL"));
  lines.push("required tables:           present (" + REQUIRED_TABLES.join(", ") + ")");
  for (const line of summary) lines.push(line);
  lines.push("cleanup result:            " + cleanupResult);
  lines.push("============================================================");
  process.stdout.write(lines.join("\n") + "\n");

  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stdout.write(
    "BOMATIC Quick BoM Route Real-DB Proof (Prompt 137)\nresult:                    FAIL\n" +
      "error:                     " +
      (error instanceof Error ? error.message : String(error)) +
      "\n"
  );
  process.exitCode = 1;
});
