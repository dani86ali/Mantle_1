/**
 * Operator proof / evidence command (Prompt 139).
 *
 * Headless browser smoke proof against a live/provisioned local Postgres DB. It
 * seeds the canonical Honeywell quick_bom demo Project (through the existing demo
 * fixture and existing Project services), starts the EXISTING Next.js dev server
 * as a child process, drives a locally installed Chrome/Edge in headless mode over
 * the Chrome DevTools Protocol (Node's built-in WebSocket - no Playwright/Puppeteer/
 * Cypress), navigates a REAL browser to /projects/{id}/quick-bom, and asserts the
 * page renders the seeded live-DB state (Honeywell project/customer, Quick BoM
 * artifacts, approved SKU/configuration/priced artifacts with their authority
 * provenance, and an export-package approval/download surface) without generic load
 * failure text or our-route console/network errors.
 *
 * This is a headless browser SMOKE proof, NOT a manual browser QA replacement. It
 * changes no product behavior, adds no route/service, and performs no runtime AI,
 * math, pricing, SKU replacement/substitution, validation, catalog lookup, or
 * configuration decision of its own. All Quick BoM behavior runs through the
 * existing app served by the existing dev server; the only app module imported here
 * is the existing Honeywell demo fixture used for proof setup. `pg` is used only for
 * a tenant metadata snapshot/restore, required-table checks, and removing ONLY the
 * proof Project rows it created. The shared default dev tenant row is upserted (and
 * its prior metadata restored on cleanup), never deleted.
 *
 * It resolves DATABASE_URL safely and sets process.env.DATABASE_URL BEFORE any
 * dynamic import of a module that imports src/lib/db/index.ts (the pg Pool there is
 * constructed at module load time). It sets process.env.NODE_ENV to "development"
 * BEFORE the dev server / browser requests so the default dev session authenticates
 * the browser. Cleanup runs in a finally block. Source is ASCII-only and the full
 * DATABASE_URL is never printed.
 *
 * Run (not registered in package.json by design):
 *   npx.cmd tsx scripts/prove-project-quick-bom-browser-real-db.ts
 */
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "fs";
import http from "http";
import net from "net";
import os from "os";
import path from "path";
import pg from "pg";

/**
 * The default dev-session tenant. Browser requests carry no x-dev-session header,
 * so getSession() returns DEFAULT_DEV_SESSION whose tenantId is this value. Seeding
 * under it is what lets the unauthenticated browser read the proof Project.
 */
const DEV_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEV_TENANT_SLUG = "dev-default-tenant";
const DEV_TENANT_NAME = "Dev Default Tenant";
const DEV_TENANT_REGION = "sa";
/** Deterministic actor id for seeded reviews/approvals in the demo fixture. */
const PROOF_OPERATOR_ID = "00000000-0000-4000-8000-0000000d1390";
/** Deterministic, proof-specific Project name so leftovers can be cleaned by name. */
const PROOF_PROJECT_NAME = "Prompt 139 Honeywell Browser Smoke Proof";

const REQUIRED_TABLES = [
  "tenants",
  "projects",
  "project_files",
  "project_stages",
  "project_artifacts",
  "project_approvals",
] as const;

/** Candidate browser executables, in priority order (env override first). */
const CHROME_DEFAULT = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_DEFAULT =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

/** A high fixed app port preferred first, then probed fallbacks if occupied. */
const PREFERRED_APP_PORT = 41739;
const PREFERRED_DEBUG_PORT = 41740;

/** Throw with a clear, prefixed message when an assertion fails. */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("ASSERTION FAILED: " + message);
}

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

/** First existing browser executable: env override, then Chrome, then Edge. */
function findBrowserExecutable(): string {
  const override = process.env.BOMATIC_BROWSER_EXE;
  if (typeof override === "string" && override.trim() !== "") {
    const exe = override.trim();
    if (existsSync(exe)) return exe;
    throw new Error("BOMATIC_BROWSER_EXE is set but does not exist: " + exe);
  }
  if (existsSync(CHROME_DEFAULT)) return CHROME_DEFAULT;
  if (existsSync(EDGE_DEFAULT)) return EDGE_DEFAULT;
  throw new Error(
    "No browser executable found. Set BOMATIC_BROWSER_EXE, or install Chrome/Edge " +
      "at the default Windows paths."
  );
}

/** True when nothing is currently listening on this localhost TCP port. */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * First free localhost port at/after `preferred`, scanning a small window and
 * skipping any port in `excludedPorts` (so the app and debug ports never collide).
 */
async function findFreePort(
  preferred: number,
  excludedPorts: readonly number[] = []
): Promise<number> {
  const excluded = new Set(excludedPorts);
  for (let port = preferred; port < preferred + 50; port++) {
    if (excluded.has(port)) continue;
    if (await isPortFree(port)) return port;
  }
  throw new Error("No free localhost port near " + preferred + ".");
}

/** Resolve once an HTTP GET to `url` returns any status, else reject on timeout. */
function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error("Timed out waiting for " + url));
          return;
        }
        setTimeout(attempt, 500);
      });
      req.setTimeout(4000, () => req.destroy());
    };
    attempt();
  });
}

/** GET a JSON document and parse it (used for the CDP /json endpoints). */
function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const req = http.get(url, (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error("Timed out fetching " + url));
          return;
        }
        setTimeout(attempt, 300);
      });
      req.setTimeout(4000, () => req.destroy());
    };
    attempt();
  });
}

/** Start the EXISTING Next.js dev server as a child bound to 127.0.0.1:port. */
function startNextDevServer(
  port: number,
  databaseUrl: string
): { child: ChildProcess; output: string[] } {
  const nextBin = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );
  const output: string[] = [];
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const capture = (chunk: Buffer): void => {
    // Keep a bounded tail only; printed solely if the proof fails.
    output.push(chunk.toString("utf8"));
    if (output.length > 200) output.splice(0, output.length - 200);
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  return { child, output };
}

/**
 * Terminate a child AND its descendants. A bare child.kill() on Windows reaps only
 * the direct process, so `next dev` workers and Chrome renderers would linger and
 * keep the port held; taskkill /T /F walks the whole tree. Best-effort and safe to
 * call when the process already exited.
 */
function killProcessTree(child: ChildProcess | null): void {
  if (!child || child.pid === undefined) return;
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      return;
    } catch {
      // Fall through to the direct kill below.
    }
  }
  try {
    child.kill();
  } catch {
    // Ignore: the process may have already exited.
  }
}

/** Launch the browser headless with a temp profile and remote-debugging port. */
function launchBrowser(
  exe: string,
  debugPort: number,
  userDataDir: string
): ChildProcess {
  return spawn(
    exe,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=" + String(debugPort),
      "--user-data-dir=" + userDataDir,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore"] }
  );
}

/**
 * Minimal Chrome DevTools Protocol client over Node's built-in WebSocket. One
 * browser-level socket multiplexes flat sessions (sessionId routing). No app module
 * is imported here - this is pure browser automation over the wire.
 */
class CdpClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private listeners: Array<
    (method: string, params: Record<string, unknown>, sessionId?: string) => void
  > = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    // If the socket dies, fail every in-flight command so no await hangs forever.
    const failAllPending = (reason: string): void => {
      for (const waiter of Array.from(this.pending.values())) {
        waiter.reject(new Error(reason));
      }
      this.pending.clear();
    };
    this.ws.addEventListener("close", () =>
      failAllPending("CDP WebSocket closed before the command completed.")
    );
    this.ws.addEventListener("error", () =>
      failAllPending("CDP WebSocket errored before the command completed.")
    );
    this.ws.addEventListener("message", (event: MessageEvent) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      if (typeof message.id === "number") {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) {
          waiter.reject(
            new Error(
              "CDP error: " + JSON.stringify(message.error)
            )
          );
        } else {
          waiter.resolve(message.result);
        }
        return;
      }
      if (typeof message.method === "string") {
        const params = (message.params as Record<string, unknown>) ?? {};
        const sessionId =
          typeof message.sessionId === "string" ? message.sessionId : undefined;
        for (const listener of this.listeners) {
          listener(message.method, params, sessionId);
        }
      }
    });
  }

  static connect(wsUrl: string, timeoutMs = 30000): Promise<CdpClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // Ignore: nothing to clean up if the socket never opened.
        }
        reject(new Error("Timed out opening the CDP WebSocket."));
      }, timeoutMs);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve(new CdpClient(ws));
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Failed to open CDP WebSocket."));
      });
    });
  }

  onEvent(
    listener: (
      method: string,
      params: Record<string, unknown>,
      sessionId?: string
    ) => void
  ): void {
    this.listeners.push(listener);
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    timeoutMs = 30000
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      // Bound every command so a lost/never-answered reply cannot hang the proof.
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error("CDP command timed out: " + method));
        }
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve((value as Record<string, unknown>) ?? {});
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Ignore: socket cleanup is best-effort.
    }
  }
}

/** Read document.body.innerText in the attached page session. */
async function evaluateTextContent(
  cdp: CdpClient,
  sessionId: string
): Promise<string> {
  const result = await cdp.send(
    "Runtime.evaluate",
    {
      expression: "document.body ? document.body.innerText : ''",
      returnByValue: true,
    },
    sessionId
  );
  const value = (result.result as { value?: unknown } | undefined)?.value;
  return typeof value === "string" ? value : "";
}

/** True when a DOM element matching `selector` exists in the page session. */
async function querySelectorExists(
  cdp: CdpClient,
  sessionId: string,
  selector: string
): Promise<boolean> {
  const result = await cdp.send(
    "Runtime.evaluate",
    {
      expression: "!!document.querySelector(" + JSON.stringify(selector) + ")",
      returnByValue: true,
    },
    sessionId
  );
  return (result.result as { value?: unknown } | undefined)?.value === true;
}

/** Read innerText of the first element matching `selector` (empty if absent). */
async function evaluateSelectorText(
  cdp: CdpClient,
  sessionId: string,
  selector: string
): Promise<string> {
  const expression =
    "(function(){var el=document.querySelector(" +
    JSON.stringify(selector) +
    ");return el?el.innerText:'';})()";
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true },
    sessionId
  );
  const value = (result.result as { value?: unknown } | undefined)?.value;
  return typeof value === "string" ? value : "";
}

/** Poll innerText until `predicate` holds or the timeout elapses; returns last text. */
async function waitForDomText(
  cdp: CdpClient,
  sessionId: string,
  predicate: (text: string) => boolean,
  timeoutMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  for (;;) {
    lastText = await evaluateTextContent(cdp, sessionId);
    if (predicate(lastText)) return lastText;
    if (Date.now() > deadline) return lastText;
    await new Promise((r) => setTimeout(r, 500));
  }
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

/** True when every required Project table exists in the public schema. */
async function checkRequiredTables(
  client: pg.Client
): Promise<{ ok: boolean; missing: string[] }> {
  const result = await client.query<{ table_name: string }>(
    "select table_name from information_schema.tables " +
      "where table_schema = 'public' and table_name = any($1::text[])",
    [REQUIRED_TABLES as unknown as string[]]
  );
  const present = new Set(result.rows.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((name) => !present.has(name));
  return { ok: missing.length === 0, missing };
}

/** Prior state of the shared dev tenant row, captured before any upsert. */
interface DevTenantSnapshot {
  existed: boolean;
  name?: string | null;
  slug?: string | null;
  region?: string | null;
}

/** Read the existing default dev tenant metadata so cleanup can restore it. */
async function readDevTenantSnapshot(
  client: pg.Client
): Promise<DevTenantSnapshot> {
  const result = await client.query<{
    name: string | null;
    slug: string | null;
    region: string | null;
  }>("select name, slug, region from tenants where id = $1", [DEV_TENANT_ID]);
  if (result.rowCount === null || result.rowCount === 0) {
    return { existed: false };
  }
  const row = result.rows[0];
  return { existed: true, name: row.name, slug: row.slug, region: row.region };
}

/** Insert/upsert the shared dev tenant row so Project FKs can be satisfied. */
async function upsertDevTenant(client: pg.Client): Promise<void> {
  await client.query(
    "insert into tenants (id, name, slug, region) values ($1, $2, $3, $4) " +
      "on conflict (id) do update set name = excluded.name, " +
      "slug = excluded.slug, region = excluded.region",
    [DEV_TENANT_ID, DEV_TENANT_NAME, DEV_TENANT_SLUG, DEV_TENANT_REGION]
  );
}

/** Restore the dev tenant's prior metadata (only when it existed beforehand). */
async function restoreDevTenant(
  client: pg.Client,
  snapshot: DevTenantSnapshot
): Promise<void> {
  if (!snapshot.existed) return;
  await client.query(
    "update tenants set name = $2, slug = $3, region = $4 where id = $1",
    [DEV_TENANT_ID, snapshot.name, snapshot.slug, snapshot.region]
  );
}

/** Delete ONLY one Project (child rows first) under the dev tenant. */
async function deleteProofProject(
  client: pg.Client,
  projectId: string
): Promise<void> {
  await client.query(
    "delete from project_approvals where tenant_id = $1 and project_id = $2",
    [DEV_TENANT_ID, projectId]
  );
  if (await tableExists(client, "project_evidence_items")) {
    await client.query(
      "delete from project_evidence_items where tenant_id = $1 and project_id = $2",
      [DEV_TENANT_ID, projectId]
    );
  }
  await client.query(
    "delete from project_artifacts where tenant_id = $1 and project_id = $2",
    [DEV_TENANT_ID, projectId]
  );
  await client.query(
    "delete from project_files where tenant_id = $1 and project_id = $2",
    [DEV_TENANT_ID, projectId]
  );
  await client.query(
    "delete from project_stages where tenant_id = $1 and project_id = $2",
    [DEV_TENANT_ID, projectId]
  );
  await client.query("delete from projects where tenant_id = $1 and id = $2", [
    DEV_TENANT_ID,
    projectId,
  ]);
}

/** Remove any leftover proof Projects (matched by deterministic name) for idempotency. */
async function deleteProofProjectsByName(client: pg.Client): Promise<void> {
  const rows = await client.query<{ id: string }>(
    "select id from projects where tenant_id = $1 and name = $2",
    [DEV_TENANT_ID, PROOF_PROJECT_NAME]
  );
  for (const row of rows.rows) {
    await deleteProofProject(client, row.id);
  }
}

async function main(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  // Must be set BEFORE importing any module that imports src/lib/db/index.ts:
  // the pg Pool there is constructed at module load time.
  process.env.DATABASE_URL = databaseUrl;
  // Must be set BEFORE the dev server / browser requests so the default dev session
  // authenticates the unauthenticated browser. process.env.NODE_ENV is typed
  // read-only; assign through a mutable view.
  (process.env as { NODE_ENV?: string }).NODE_ENV = "development";

  const browserExe = findBrowserExecutable();

  // Resources that need cleanup are declared (null/false) BEFORE the try so the
  // finally can release exactly the ones that were actually created. Nothing here
  // can throw between the try and a half-created resource.
  const client = new pg.Client({ connectionString: databaseUrl });
  let clientConnected = false;
  let userDataDir: string | null = null;
  let exportOutputPath: string | null = null;
  let tenantSnapshot: DevTenantSnapshot = { existed: false };

  const summary: string[] = [];
  let passed = false;
  let cleanupResult = "not run";
  let projectId = "(not created)";
  let devChild: ChildProcess | null = null;
  let browserChild: ChildProcess | null = null;
  let cdp: CdpClient | null = null;
  let devOutput: string[] = [];

  try {
    // Pick the app port first, then the debug port excluding it so the two can
    // never collide; assert the guard held.
    const appPort = await findFreePort(PREFERRED_APP_PORT);
    const debugPort = await findFreePort(PREFERRED_DEBUG_PORT, [appPort]);
    assert(debugPort !== appPort, "debug port must differ from the app port");
    const appOrigin = "http://127.0.0.1:" + appPort;

    userDataDir = mkdtempSync(path.join(os.tmpdir(), "bomatic-browser-proof-"));
    exportOutputPath = path.join(
      userDataDir,
      "honeywell-browser-proof-export.xlsx"
    );

    await client.connect();
    clientConnected = true;
    // Session-scoped tenant context for this raw client so RLS-scoped statements
    // operate on the dev tenant for the life of this connection.
    await client.query("select set_config('app.tenant_id', $1, false)", [
      DEV_TENANT_ID,
    ]);

    const tableCheck = await checkRequiredTables(client);
    if (!tableCheck.ok) {
      throw new Error(
        "Missing required Project tables: " +
          tableCheck.missing.join(", ") +
          ". Run `npm.cmd run db:migrate` and retry."
      );
    }

    // Capture the prior dev tenant metadata so cleanup can restore it (the dev
    // tenant is shared - we upsert it but must not clobber its real metadata).
    tenantSnapshot = await readDevTenantSnapshot(client);

    // Idempotency: clear any leftover proof Project, then (re)create the dev tenant.
    await deleteProofProjectsByName(client);
    await upsertDevTenant(client);

    // Seed via the EXISTING demo fixture. Dynamic import AFTER DATABASE_URL is set.
    // The export package is intentionally left needs_review by the fixture, so the
    // page renders export review controls (no product behavior is bypassed here).
    const { createHoneywellQuickBomDemoProjectFixture } = await import(
      "@/lib/projects/honeywell-demo-project-fixture"
    );
    const fixture = await createHoneywellQuickBomDemoProjectFixture({
      tenantId: DEV_TENANT_ID,
      decidedBy: PROOF_OPERATOR_ID,
      outputPath: exportOutputPath,
      projectName: PROOF_PROJECT_NAME,
      customerName: "Honeywell",
    });
    projectId = fixture.project.id;

    // Start the existing Next.js dev server and wait until it answers.
    const dev = startNextDevServer(appPort, databaseUrl);
    devChild = dev.child;
    devOutput = dev.output;
    await waitForHttp(appOrigin, 120000);

    // Launch the headless browser and connect to the DevTools endpoint.
    browserChild = launchBrowser(browserExe, debugPort, userDataDir);
    const version = (await getJson(
      "http://127.0.0.1:" + debugPort + "/json/version",
      30000
    )) as { webSocketDebuggerUrl?: string };
    assert(
      typeof version.webSocketDebuggerUrl === "string",
      "browser exposes a DevTools WebSocket endpoint"
    );
    cdp = await CdpClient.connect(version.webSocketDebuggerUrl);

    // Create a blank target, attach a flat session, enable instrumentation, THEN
    // navigate - so console/network/exception events for the load are captured.
    const created = await cdp.send("Target.createTarget", { url: "about:blank" });
    const targetId = (created as { targetId?: string }).targetId;
    assert(typeof targetId === "string", "created a browser target");
    const attached = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const sessionId = (attached as { sessionId?: string }).sessionId;
    assert(typeof sessionId === "string", "attached a flat CDP session");

    const pagePath = "/projects/" + projectId + "/quick-bom";
    const apiPath = "/api/projects/" + projectId + "/quick-bom";
    const isOurRoute = (value: unknown): boolean =>
      typeof value === "string" &&
      (value.includes(pagePath) || value.includes(apiPath));

    // Collect ONLY our-route console/network errors so harmless dev-server noise
    // (favicon, HMR, _next chunks for other routes) does not fail the proof.
    const routeErrors: string[] = [];
    const requestUrlById = new Map<string, string>();
    cdp.onEvent((method, params) => {
      if (method === "Network.requestWillBeSent") {
        const requestId = params.requestId as string | undefined;
        const request = params.request as { url?: string } | undefined;
        if (requestId && request?.url) requestUrlById.set(requestId, request.url);
      } else if (method === "Network.responseReceived") {
        const response = params.response as
          | { url?: string; status?: number }
          | undefined;
        if (
          response &&
          isOurRoute(response.url) &&
          typeof response.status === "number" &&
          response.status >= 400
        ) {
          routeErrors.push(
            "network " + response.status + " for " + response.url
          );
        }
      } else if (method === "Network.loadingFailed") {
        const requestId = params.requestId as string | undefined;
        const url = requestId ? requestUrlById.get(requestId) : undefined;
        if (isOurRoute(url)) {
          routeErrors.push(
            "network failed for " + url + ": " + String(params.errorText ?? "")
          );
        }
      } else if (method === "Runtime.exceptionThrown") {
        const details = params.exceptionDetails as { text?: string } | undefined;
        routeErrors.push("uncaught exception: " + String(details?.text ?? ""));
      } else if (method === "Log.entryAdded") {
        const entry = params.entry as
          | { level?: string; text?: string; url?: string }
          | undefined;
        if (
          entry?.level === "error" &&
          (isOurRoute(entry.url) || isOurRoute(entry.text))
        ) {
          routeErrors.push("console error: " + String(entry.text ?? ""));
        }
      } else if (method === "Runtime.consoleAPICalled") {
        const type = params.type as string | undefined;
        if (type === "error") {
          const args = (params.args as Array<{ value?: unknown }>) ?? [];
          const text = args
            .map((a) => (typeof a.value === "string" ? a.value : ""))
            .join(" ");
          if (isOurRoute(text)) routeErrors.push("console error: " + text);
        }
      }
    });

    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Log.enable", {}, sessionId);
    await cdp.send("Network.enable", {}, sessionId);
    await cdp.send("Page.enable", {}, sessionId);

    await cdp.send("Page.navigate", { url: appOrigin + pagePath }, sessionId);

    // Wait until the client component has fetched the workspace and rendered the
    // Honeywell project name (the page renders a loading skeleton first).
    // The "Quick BoM workspace" eyebrow renders with CSS text-transform:uppercase,
    // so innerText reports it uppercased; match it case-insensitively.
    const text = await waitForDomText(
      cdp,
      sessionId,
      (t) =>
        t.includes("Honeywell") &&
        t.toLowerCase().includes("quick bom workspace"),
      90000
    );

    // --- Rendered live-DB canaries ----------------------------------------
    // The approved SKU/configuration/priced spine artifacts and the needs_review
    // export are read from their specific spine elements so the proof verifies the
    // actual approval state, not just the presence of the words somewhere on the page.
    const skuSpine = await evaluateSelectorText(
      cdp,
      sessionId,
      '[data-testid="spine-sku_resolution"]'
    );
    const configSpine = await evaluateSelectorText(
      cdp,
      sessionId,
      '[data-testid="spine-configuration_expansion"]'
    );
    const pricedSpine = await evaluateSelectorText(
      cdp,
      sessionId,
      '[data-testid="spine-priced_boq"]'
    );
    const exportSpine = await evaluateSelectorText(
      cdp,
      sessionId,
      '[data-testid="spine-export_package"]'
    );
    const canaries: Array<{ label: string; ok: boolean }> = [
      { label: "Honeywell", ok: text.includes("Honeywell") },
      {
        label: "Quick BoM workspace",
        ok: text.toLowerCase().includes("quick bom workspace"),
      },
      { label: "proof project name", ok: text.includes(PROOF_PROJECT_NAME) },
      { label: "Customer: Honeywell", ok: text.includes("Customer: Honeywell") },
      {
        label: "approved sku_resolution",
        ok: skuSpine.toLowerCase().includes("approved"),
      },
      {
        label: "approved configuration_expansion",
        ok: configSpine.toLowerCase().includes("approved"),
      },
      {
        label: "approved priced_boq",
        ok: pricedSpine.toLowerCase().includes("approved"),
      },
      {
        label: "needs_review export_package",
        ok: exportSpine.toLowerCase().includes("needs review"),
      },
    ];
    for (const canary of canaries) {
      assert(canary.ok, "page renders live-DB canary: " + canary.label);
    }

    // The page must NOT show generic load/auth failure text.
    assert(
      !text.includes("Unable to load this Quick BoM workspace."),
      "page does not render the generic Quick BoM load failure"
    );
    assert(
      !text.includes("Authentication required"),
      "page does not render an authentication failure"
    );
    const loadErrorPresent = await querySelectorExists(
      cdp,
      sessionId,
      '[data-testid="load-error"]'
    );
    assert(!loadErrorPresent, "no load-error element is present");

    // Export approval/download surface: needs_review export renders review controls;
    // an approved export would render the download anchor. Either satisfies the surface.
    const approveExport = await querySelectorExists(
      cdp,
      sessionId,
      '[data-testid="approve-export_package"]'
    );
    const downloadExport = await querySelectorExists(
      cdp,
      sessionId,
      '[data-testid="download-export_package"]'
    );
    const exportSurface = approveExport
      ? "export review controls (needs_review)"
      : downloadExport
        ? "approved export download link"
        : "none";
    assert(
      approveExport || downloadExport,
      "page renders an export approval/download surface"
    );

    // No our-route console/network errors were observed during the load.
    assert(
      routeErrors.length === 0,
      "no our-route console/network errors: " + routeErrors.join(" | ")
    );

    passed = true;
    summary.push("project id:                " + projectId);
    summary.push("browser executable:        " + browserExe);
    summary.push("app url:                   " + appOrigin + pagePath);
    summary.push(
      "confirmed canaries:        " +
        canaries.map((c) => c.label).join(", ")
    );
    summary.push("export surface:            " + exportSurface);
    summary.push("our-route console/net err: 0");
  } finally {
    try {
      cdp?.close();
    } catch {
      // Ignore: socket cleanup is best-effort.
    }
    // Tree-kill so no dev-server worker or Chrome renderer lingers on the port.
    killProcessTree(browserChild);
    killProcessTree(devChild);
    // Remove only the temp resources that were actually created.
    try {
      if (exportOutputPath !== null) {
        rmSync(exportOutputPath, { force: true });
      }
      if (userDataDir !== null) {
        rmSync(userDataDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore: temp dir/file cleanup is best-effort.
    }
    // DB cleanup only when the connection actually opened.
    if (!clientConnected) {
      cleanupResult = "skipped (DB connection never established)";
    } else {
      try {
        if (projectId !== "(not created)") {
          await deleteProofProject(client, projectId);
        }
        // Also clear any leftover same-name proof Projects, then verify removal.
        await deleteProofProjectsByName(client);
        // Restore the shared dev tenant's prior metadata; if it did not exist
        // before the proof, the inserted default dev tenant row is left in place.
        await restoreDevTenant(client, tenantSnapshot);
        const tenantOutcome = tenantSnapshot.existed
          ? "existing dev tenant metadata restored"
          : "inserted default dev tenant row preserved";
        const remaining = await client.query(
          "select id from projects where tenant_id = $1 and name = $2",
          [DEV_TENANT_ID, PROOF_PROJECT_NAME]
        );
        if (remaining.rowCount !== 0) {
          cleanupResult =
            "FAILED: proof Project rows remain after cleanup (" +
            remaining.rowCount +
            ")";
          passed = false;
        } else {
          cleanupResult =
            "ok (proof Project rows, temp profile, and temp export removed; " +
            tenantOutcome +
            ")";
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
  }

  const lines: string[] = [];
  lines.push("============================================================");
  lines.push("BOMATIC Quick BoM Browser Real-DB Smoke Proof (Prompt 139)");
  lines.push("(headless browser smoke proof; NOT a manual browser QA replacement)");
  lines.push("============================================================");
  lines.push("result:                    " + (passed ? "PASS" : "FAIL"));
  for (const line of summary) lines.push(line);
  lines.push("cleanup result:            " + cleanupResult);
  lines.push("============================================================");
  if (!passed && devOutput.length > 0) {
    const tail = devOutput.join("").slice(-2000);
    lines.push("dev server output (tail):");
    lines.push(tail);
    lines.push("============================================================");
  }
  process.stdout.write(lines.join("\n") + "\n");

  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stdout.write(
    "BOMATIC Quick BoM Browser Real-DB Smoke Proof (Prompt 139)\n" +
      "(headless browser smoke proof; NOT a manual browser QA replacement)\n" +
      "result:                    FAIL\n" +
      "error:                     " +
      (error instanceof Error ? error.message : String(error)) +
      "\n"
  );
  process.exitCode = 1;
});
