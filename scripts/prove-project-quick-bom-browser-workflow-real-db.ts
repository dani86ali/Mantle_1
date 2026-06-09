/**
 * Operator proof / evidence command (Prompt 140).
 *
 * Full browser-DRIVEN Quick BoM workflow proof against a live/provisioned local
 * Postgres DB. Unlike the Prompt 139 render smoke proof (which seeds a fixture and
 * only asserts the page renders), this proof drives the EXISTING Project Quick BoM
 * page CONTROLS end to end with a real headless browser over the Chrome DevTools
 * Protocol (Node's built-in WebSocket - no Playwright/Puppeteer/Cypress):
 *
 *   create a quick_bom Project through an in-browser fetch to the existing
 *   /api/projects/quick-bom create route
 *   -> navigate to /projects/{projectId}/quick-bom
 *   -> upload the full seven-line Honeywell CSV through the real file input
 *   -> click the upload+normalize button
 *   -> tick the Honeywell MVP demo catalog checkbox
 *   -> click create sku_resolution
 *   -> load SKU review lines and accept all seven suggestions through the UI
 *   -> approve sku_resolution through the artifact approval control
 *   -> click create configuration_expansion
 *   -> load configuration review lines, accept every expansion line, submit
 *   -> approve configuration_expansion through the artifact approval control
 *   -> click create priced_boq
 *   -> load the priced review panel and assert 60 lines / deterministic totals
 *   -> approve priced_boq through the priced review approval control
 *   -> click create export_package
 *   -> approve export_package through the artifact approval control
 *   -> assert the approved export download link is visible
 *
 * This is an automated headless browser workflow proof; NOT manual browser QA. It
 * changes no product behavior, adds no route/service, and performs no runtime AI,
 * math, pricing, SKU replacement/substitution, validation, catalog lookup, or
 * configuration decision of its own. Every Quick BoM behavior runs through the
 * existing app served by the existing dev server; NO app module is imported here -
 * even the Project is created through the browser hitting the existing create route.
 * `pg` is used only for a tenant metadata snapshot/restore, required-table checks,
 * final persisted-state assertions, and removing ONLY this proof Project's rows and
 * files. The shared default dev tenant row is upserted (and its prior metadata
 * restored on cleanup), never deleted.
 *
 * It resolves DATABASE_URL safely and sets process.env.DATABASE_URL BEFORE any
 * dynamic import of a module that imports src/lib/db/index.ts. It sets
 * process.env.NODE_ENV to "development" BEFORE the dev server / browser requests so
 * the default dev session authenticates the browser. Cleanup runs in a finally
 * block. Source is ASCII-only and the full DATABASE_URL is never printed.
 *
 * Run (not registered in package.json by design):
 *   npx.cmd tsx scripts/prove-project-quick-bom-browser-workflow-real-db.ts
 */
import { spawn, spawnSync, type ChildProcess } from "child_process";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from "fs";
import { dirname } from "path";
import http from "http";
import net from "net";
import os from "os";
import path from "path";
import pg from "pg";

/**
 * The default dev-session tenant. Browser requests carry no x-dev-session header,
 * so the auth middleware returns the default dev session whose tenantId is this
 * value. Creating the Project under it (through the browser) is what lets the
 * unauthenticated browser read and drive the proof Project.
 */
const DEV_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEV_TENANT_SLUG = "dev-default-tenant";
const DEV_TENANT_NAME = "Dev Default Tenant";
const DEV_TENANT_REGION = "sa";
/** Deterministic, proof-specific Project name so leftovers can be cleaned by name. */
const PROOF_PROJECT_NAME = "Prompt 140 Honeywell Browser Workflow Proof";
const PROOF_CUSTOMER_NAME = "Honeywell";

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
const PREFERRED_APP_PORT = 41759;
const PREFERRED_DEBUG_PORT = 41760;

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
const EXPECTED_SUBTOTAL_SELL_SAR = 2185708.76;
const EXPECTED_VAT_SAR = 327856.31;
const EXPECTED_TOTAL_INC_VAT_SAR = 2513565.07;
const TOTAL_TOLERANCE = 0.1;

/** Throw with a clear, prefixed message when an assertion fails. */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("ASSERTION FAILED: " + message);
}

/** True when |actual - expected| is within the deterministic-total tolerance. */
function closeTo(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= TOTAL_TOLERANCE;
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
          waiter.reject(new Error("CDP error: " + JSON.stringify(message.error)));
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

/**
 * Evaluate an expression that resolves a Promise (awaitPromise) and return the
 * by-value result. Used for the in-browser create-route fetch.
 */
async function evaluateAsyncValue(
  cdp: CdpClient,
  sessionId: string,
  expression: string
): Promise<unknown> {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
    60000
  );
  const details = (result as { exceptionDetails?: { text?: string } })
    .exceptionDetails;
  if (details) {
    throw new Error("in-browser evaluate threw: " + String(details.text ?? ""));
  }
  return (result.result as { value?: unknown } | undefined)?.value;
}

/** Click the first element with `data-testid=testid`; true when one was clicked. */
async function clickTestId(
  cdp: CdpClient,
  sessionId: string,
  testid: string
): Promise<boolean> {
  const sel = '[data-testid="' + testid + '"]';
  const expr =
    "(function(){var el=document.querySelector(" +
    JSON.stringify(sel) +
    ");if(!el)return false;el.click();return true;})()";
  const r = await cdp.send(
    "Runtime.evaluate",
    { expression: expr, returnByValue: true },
    sessionId
  );
  return (r.result as { value?: unknown } | undefined)?.value === true;
}

/** Click EVERY element with `data-testid=testid`; returns how many were clicked. */
async function clickAllTestId(
  cdp: CdpClient,
  sessionId: string,
  testid: string
): Promise<number> {
  const sel = '[data-testid="' + testid + '"]';
  const expr =
    "(function(){var b=document.querySelectorAll(" +
    JSON.stringify(sel) +
    ");for(var i=0;i<b.length;i++){b[i].click();}return b.length;})()";
  const r = await cdp.send(
    "Runtime.evaluate",
    { expression: expr, returnByValue: true },
    sessionId
  );
  const value = (r.result as { value?: unknown } | undefined)?.value;
  return typeof value === "number" ? value : 0;
}

/** Tick a checkbox (only if not already checked); returns its final checked state. */
async function ensureChecked(
  cdp: CdpClient,
  sessionId: string,
  testid: string
): Promise<boolean> {
  const sel = '[data-testid="' + testid + '"]';
  const expr =
    "(function(){var el=document.querySelector(" +
    JSON.stringify(sel) +
    ");if(!el)return false;if(!el.checked)el.click();return !!el.checked;})()";
  const r = await cdp.send(
    "Runtime.evaluate",
    { expression: expr, returnByValue: true },
    sessionId
  );
  return (r.result as { value?: unknown } | undefined)?.value === true;
}

/** Set the page file input (by data-testid) to a single on-disk path via CDP DOM. */
async function setFileInput(
  cdp: CdpClient,
  sessionId: string,
  testid: string,
  filePath: string
): Promise<void> {
  const doc = await cdp.send("DOM.getDocument", { depth: -1 }, sessionId);
  const rootNodeId = (doc.root as { nodeId?: number } | undefined)?.nodeId;
  assert(typeof rootNodeId === "number", "DOM.getDocument returned a root node");
  const query = await cdp.send(
    "DOM.querySelector",
    { nodeId: rootNodeId, selector: '[data-testid="' + testid + '"]' },
    sessionId
  );
  const fileNodeId = (query as { nodeId?: number }).nodeId;
  assert(
    typeof fileNodeId === "number" && fileNodeId !== 0,
    "found the file input node for " + testid
  );
  await cdp.send(
    "DOM.setFileInputFiles",
    { files: [filePath], nodeId: fileNodeId },
    sessionId
  );
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Poll until an element with `data-testid=testid` exists or the timeout elapses. */
async function waitForTestId(
  cdp: CdpClient,
  sessionId: string,
  testid: string,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const sel = '[data-testid="' + testid + '"]';
  for (;;) {
    if (await querySelectorExists(cdp, sessionId, sel)) return true;
    if (Date.now() > deadline) return false;
    await sleep(500);
  }
}

/** Poll until an element with `data-testid=testid` is gone or the timeout elapses. */
async function waitForTestIdGone(
  cdp: CdpClient,
  sessionId: string,
  testid: string,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const sel = '[data-testid="' + testid + '"]';
  for (;;) {
    if (!(await querySelectorExists(cdp, sessionId, sel))) return true;
    if (Date.now() > deadline) return false;
    await sleep(500);
  }
}

/** Lowercased innerText of one spine row, e.g. spine-sku_resolution. */
async function spineText(
  cdp: CdpClient,
  sessionId: string,
  type: string
): Promise<string> {
  const text = await evaluateSelectorText(
    cdp,
    sessionId,
    '[data-testid="spine-' + type + '"]'
  );
  return text.toLowerCase();
}

/** Poll until a spine row's text contains `statusWord` or the timeout elapses. */
async function waitForSpineStatus(
  cdp: CdpClient,
  sessionId: string,
  type: string,
  statusWord: string,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const needle = statusWord.toLowerCase();
  for (;;) {
    if ((await spineText(cdp, sessionId, type)).includes(needle)) return true;
    if (Date.now() > deadline) return false;
    await sleep(500);
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

/** Latest (highest version) persisted artifact of a type for this proof Project. */
async function latestArtifact(
  client: pg.Client,
  projectId: string,
  type: string
): Promise<{ status: string; version: number; payload: Record<string, unknown> } | null> {
  const result = await client.query<{
    status: string;
    version: number;
    payload: Record<string, unknown>;
  }>(
    "select status, version, payload from project_artifacts " +
      "where tenant_id = $1 and project_id = $2 and type = $3 " +
      "order by version desc limit 1",
    [DEV_TENANT_ID, projectId, type]
  );
  if (result.rowCount === null || result.rowCount === 0) return null;
  return result.rows[0];
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

/** Collect uploaded/exported on-disk paths for ONLY this proof Project. */
async function collectProofFilePaths(
  client: pg.Client,
  projectId: string
): Promise<string[]> {
  const paths: string[] = [];
  try {
    const files = await client.query<{ storage_path: string | null }>(
      "select storage_path from project_files where tenant_id = $1 and project_id = $2",
      [DEV_TENANT_ID, projectId]
    );
    for (const row of files.rows) {
      if (typeof row.storage_path === "string" && row.storage_path !== "") {
        paths.push(row.storage_path);
      }
    }
    const artifacts = await client.query<{ file_path: string | null }>(
      "select file_path from project_artifacts " +
        "where tenant_id = $1 and project_id = $2 and file_path is not null",
      [DEV_TENANT_ID, projectId]
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

/** Best-effort removal of proof-Project temp files and their upload directories. */
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
  // Must be set BEFORE importing any module that imports src/lib/db/index.ts and
  // BEFORE starting the dev server: the dev-server child inherits these.
  process.env.DATABASE_URL = databaseUrl;
  // Must be set BEFORE the dev server / browser requests so the default dev session
  // authenticates the unauthenticated browser. process.env.NODE_ENV is typed
  // read-only; assign through a mutable view.
  (process.env as { NODE_ENV?: string }).NODE_ENV = "development";

  const browserExe = findBrowserExecutable();

  // Resources that need cleanup are declared (null/false) BEFORE the try so the
  // finally can release exactly the ones that were actually created.
  const client = new pg.Client({ connectionString: databaseUrl });
  let clientConnected = false;
  let userDataDir: string | null = null;
  let csvUploadPath: string | null = null;
  let tenantSnapshot: DevTenantSnapshot = { existed: false };

  const summary: string[] = [];
  const stepsCompleted: string[] = [];
  let passed = false;
  let cleanupResult = "not run";
  let projectId = "(not created)";
  let devChild: ChildProcess | null = null;
  let browserChild: ChildProcess | null = null;
  let cdp: CdpClient | null = null;
  let pageSessionId: string | null = null;
  let devOutput: string[] = [];

  let skuAcceptedCount = 0;
  let configAcceptClicks = 0;
  let normalizedLineCount = 0;
  let configAcceptedLineCount = 0;
  let pricedLineCount = 0;
  let exportRowCount = 0;
  let subtotalSellSar = 0;
  let vatSar = 0;
  let totalIncVatSar = 0;
  let downloadLinkVisible = false;
  let appUrl = "(not navigated)";
  let diagnostics = "";

  try {
    const appPort = await findFreePort(PREFERRED_APP_PORT);
    const debugPort = await findFreePort(PREFERRED_DEBUG_PORT, [appPort]);
    assert(debugPort !== appPort, "debug port must differ from the app port");
    const appOrigin = "http://127.0.0.1:" + appPort;

    userDataDir = mkdtempSync(path.join(os.tmpdir(), "bomatic-wf-proof-"));
    csvUploadPath = path.join(userDataDir, "honeywell-workflow-proof.csv");
    writeFileSync(csvUploadPath, HONEYWELL_SEVEN_LINE_CSV, "utf8");

    await client.connect();
    clientConnected = true;
    // Session-scoped tenant context so RLS-scoped statements operate on the dev
    // tenant for the life of this connection.
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

    const created = await cdp.send("Target.createTarget", { url: "about:blank" });
    const targetId = (created as { targetId?: string }).targetId;
    assert(typeof targetId === "string", "created a browser target");
    const attached = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const sessionId = (attached as { sessionId?: string }).sessionId;
    assert(typeof sessionId === "string", "attached a flat CDP session");
    pageSessionId = sessionId;

    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Log.enable", {}, sessionId);
    await cdp.send("Network.enable", {}, sessionId);
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("DOM.enable", {}, sessionId);

    // Navigate to a same-origin app page so the in-browser fetch is same-origin and
    // carries the (default) dev session. The /projects listing is an existing route.
    await cdp.send("Page.navigate", { url: appOrigin + "/projects" }, sessionId);
    // Wait until the document is on the app origin before issuing the fetch.
    {
      const deadline = Date.now() + 90000;
      for (;;) {
        const originValue = await evaluateAsyncValue(
          cdp,
          sessionId,
          "window.location.origin"
        );
        if (originValue === appOrigin) break;
        if (Date.now() > deadline) {
          throw new Error("browser never reached the app origin " + appOrigin);
        }
        await sleep(500);
      }
    }

    // 1) Create the quick_bom Project through an in-browser fetch to the EXISTING
    //    create route. The body carries ONLY product-allowed fields: no tenantId,
    //    projectId, decidedBy, or authority field.
    const createPayload = {
      name: PROOF_PROJECT_NAME,
      customerName: PROOF_CUSTOMER_NAME,
      pricingConfig: {
        mode: "markup",
        ratePercent: 0,
        vatRatePercent: 15,
        roundingDecimals: 2,
      },
    };
    const createExpr =
      "fetch('/api/projects/quick-bom',{method:'POST'," +
      "headers:{'Content-Type':'application/json'}," +
      "body:" +
      JSON.stringify(JSON.stringify(createPayload)) +
      "}).then(function(r){return r.text().then(function(t){" +
      "return JSON.stringify({status:r.status,body:t});});})";
    const createRaw = await evaluateAsyncValue(cdp, sessionId, createExpr);
    assert(typeof createRaw === "string", "create fetch returned a string result");
    const createEnvelope = JSON.parse(createRaw as string) as {
      status: number;
      body: string;
    };
    assert(
      createEnvelope.status === 201,
      "create route returned HTTP 201 (got " + createEnvelope.status + ")"
    );
    const createBody = JSON.parse(createEnvelope.body) as {
      project?: { id?: string };
    };
    const newId = createBody.project?.id;
    assert(typeof newId === "string" && newId !== "", "create route returned a project id");
    projectId = newId;
    stepsCompleted.push("create quick_bom Project (browser fetch)");

    const pagePath = "/projects/" + projectId + "/quick-bom";
    const apiPath = "/api/projects/" + projectId + "/quick-bom";
    appUrl = appOrigin + pagePath;
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
          routeErrors.push("network " + response.status + " for " + response.url);
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
          const errText = args
            .map((a) => (typeof a.value === "string" ? a.value : ""))
            .join(" ");
          if (isOurRoute(errText)) routeErrors.push("console error: " + errText);
        }
      }
    });

    // 2) Navigate to the Quick BoM page and wait for the workspace to render.
    await cdp.send("Page.navigate", { url: appOrigin + pagePath }, sessionId);
    const projectNameShown = await (async () => {
      const deadline = Date.now() + 90000;
      for (;;) {
        const t = await evaluateTextContent(cdp, sessionId);
        if (t.includes(PROOF_PROJECT_NAME)) return true;
        if (Date.now() > deadline) return false;
        await sleep(500);
      }
    })();
    assert(projectNameShown, "Quick BoM page rendered the proof project name");
    assert(
      !(await querySelectorExists(cdp, sessionId, '[data-testid="load-error"]')),
      "no load-error element is present on first render"
    );
    stepsCompleted.push("navigate to Quick BoM page");

    // 3) Upload the seven-line CSV through the real file input + click upload/normalize.
    assert(
      await waitForTestId(cdp, sessionId, "workflow-upload-file", 30000),
      "file input is present"
    );
    await setFileInput(cdp, sessionId, "workflow-upload-file", csvUploadPath);
    assert(
      await clickTestId(cdp, sessionId, "workflow-upload-normalize"),
      "clicked upload+normalize"
    );
    assert(
      await waitForSpineStatus(cdp, sessionId, "normalized_boq", "version", 90000),
      "normalized_boq spine row appeared after upload+normalize"
    );
    assert(
      await waitForTestId(cdp, sessionId, "workflow-create-sku_resolution", 90000),
      "create sku_resolution action became available"
    );
    stepsCompleted.push("upload + normalize seven-line CSV");

    // 4) Tick the Honeywell demo catalog checkbox, then create sku_resolution.
    assert(
      await ensureChecked(
        cdp,
        sessionId,
        "workflow-honeywell-demo-catalog-profile"
      ),
      "Honeywell MVP demo catalog checkbox is ticked"
    );
    assert(
      await clickTestId(cdp, sessionId, "workflow-create-sku_resolution"),
      "clicked create sku_resolution"
    );
    assert(
      await waitForSpineStatus(cdp, sessionId, "sku_resolution", "needs review", 90000),
      "sku_resolution created as needs_review"
    );
    stepsCompleted.push("create sku_resolution (Honeywell demo catalog opt-in)");

    // 5) SKU review loop: load lines, accept exactly one suggestion, repeat until
    //    every line is accepted and the artifact is no longer needs_review.
    for (let iteration = 0; iteration < 12; iteration++) {
      if (!(await spineText(cdp, sessionId, "sku_resolution")).includes("needs review")) {
        break;
      }
      assert(
        await waitForTestId(cdp, sessionId, "sku-review-load", 30000),
        "SKU review load control is present"
      );
      assert(
        await clickTestId(cdp, sessionId, "sku-review-load"),
        "clicked load SKU review lines"
      );
      assert(
        await waitForTestId(cdp, sessionId, "sku-review-accept", 60000),
        "SKU review accept controls rendered"
      );
      assert(
        await clickTestId(cdp, sessionId, "sku-review-accept"),
        "clicked accept on one SKU line"
      );
      skuAcceptedCount += 1;
      // A successful review POST clears the panel (setSkuReview(null)) and reloads.
      assert(
        await waitForTestIdGone(cdp, sessionId, "sku-review-line", 60000),
        "SKU review panel cleared after the accept"
      );
    }
    assert(
      !(await spineText(cdp, sessionId, "sku_resolution")).includes("needs review"),
      "sku_resolution left needs_review after accepting all lines"
    );
    assert(skuAcceptedCount === 7, "exactly seven SKU lines were accepted");
    stepsCompleted.push("accept all seven SKU review lines");

    // 6) Approve the reviewed sku_resolution through the artifact approval control.
    assert(
      await waitForTestId(cdp, sessionId, "approve-sku_resolution", 30000),
      "approve sku_resolution control is present"
    );
    assert(
      await clickTestId(cdp, sessionId, "approve-sku_resolution"),
      "clicked approve sku_resolution"
    );
    assert(
      await waitForSpineStatus(cdp, sessionId, "sku_resolution", "approved", 60000),
      "sku_resolution is approved"
    );
    stepsCompleted.push("approve sku_resolution");

    // 7) Create configuration_expansion, then run its line review.
    assert(
      await waitForTestId(cdp, sessionId, "workflow-create-configuration_expansion", 30000),
      "create configuration_expansion action became available"
    );
    assert(
      await clickTestId(cdp, sessionId, "workflow-create-configuration_expansion"),
      "clicked create configuration_expansion"
    );
    assert(
      await waitForSpineStatus(cdp, sessionId, "configuration_expansion", "needs review", 90000),
      "configuration_expansion draft created as needs_review"
    );
    assert(
      await clickTestId(cdp, sessionId, "config-review-load"),
      "clicked load configuration expansion review lines"
    );
    assert(
      await waitForTestId(cdp, sessionId, "config-review-accept", 60000),
      "configuration expansion accept controls rendered"
    );
    configAcceptClicks = await clickAllTestId(cdp, sessionId, "config-review-accept");
    assert(configAcceptClicks > 0, "accepted at least one expansion line");
    assert(
      await clickTestId(cdp, sessionId, "config-review-submit"),
      "clicked submit configuration expansion review"
    );
    stepsCompleted.push("accept + submit configuration expansion review");

    // 8) Approve the reviewed configuration_expansion through the approval control.
    assert(
      await waitForTestId(cdp, sessionId, "approve-configuration_expansion", 90000),
      "approve configuration_expansion control is present after review"
    );
    assert(
      await clickTestId(cdp, sessionId, "approve-configuration_expansion"),
      "clicked approve configuration_expansion"
    );
    assert(
      await waitForSpineStatus(cdp, sessionId, "configuration_expansion", "approved", 60000),
      "configuration_expansion is approved"
    );
    stepsCompleted.push("approve configuration_expansion");

    // 9) Create priced_boq, then load and assert the priced review panel.
    assert(
      await waitForTestId(cdp, sessionId, "workflow-create-priced_boq", 30000),
      "create priced_boq action became available"
    );
    assert(
      await clickTestId(cdp, sessionId, "workflow-create-priced_boq"),
      "clicked create priced_boq"
    );
    assert(
      await waitForSpineStatus(cdp, sessionId, "priced_boq", "needs review", 90000),
      "priced_boq created as needs_review"
    );
    assert(
      await clickTestId(cdp, sessionId, "priced-review-load"),
      "clicked load priced BoQ review"
    );
    assert(
      await waitForTestId(cdp, sessionId, "priced-review-summary", 60000),
      "priced review summary rendered"
    );
    const pricedSummaryText = await evaluateSelectorText(
      cdp,
      sessionId,
      '[data-testid="priced-review-summary"]'
    );
    for (const fragment of [
      "60 lines",
      "60 priced",
      "0 unpriced",
      "0 missing price",
      String(EXPECTED_SUBTOTAL_SELL_SAR),
      String(EXPECTED_VAT_SAR),
      String(EXPECTED_TOTAL_INC_VAT_SAR),
    ]) {
      assert(
        pricedSummaryText.includes(fragment),
        "priced review summary contains '" + fragment + "'"
      );
    }
    stepsCompleted.push("load + assert priced BoQ review (60 lines, deterministic totals)");

    // 10) Approve priced_boq through the priced review approval control.
    assert(
      await clickTestId(cdp, sessionId, "approve-priced_boq"),
      "clicked approve priced_boq"
    );
    assert(
      await waitForSpineStatus(cdp, sessionId, "priced_boq", "approved", 60000),
      "priced_boq is approved"
    );
    stepsCompleted.push("approve priced_boq");

    // 11) Create export_package, then approve it through the approval control.
    assert(
      await waitForTestId(cdp, sessionId, "workflow-create-export_package", 30000),
      "create export_package action became available"
    );
    assert(
      await clickTestId(cdp, sessionId, "workflow-create-export_package"),
      "clicked create export_package"
    );
    assert(
      await waitForSpineStatus(cdp, sessionId, "export_package", "needs review", 90000),
      "export_package created as needs_review"
    );
    assert(
      await waitForTestId(cdp, sessionId, "approve-export_package", 30000),
      "approve export_package control is present"
    );
    assert(
      await clickTestId(cdp, sessionId, "approve-export_package"),
      "clicked approve export_package"
    );
    assert(
      await waitForSpineStatus(cdp, sessionId, "export_package", "approved", 60000),
      "export_package is approved"
    );
    stepsCompleted.push("create + approve export_package");

    // 12) Assert the approved export download link is visible and points at the
    //     existing export-package download route.
    assert(
      await waitForTestId(cdp, sessionId, "download-export_package", 30000),
      "approved export download link is visible"
    );
    const downloadHref = await evaluateAsyncValue(
      cdp,
      sessionId,
      "(function(){var a=document.querySelector('[data-testid=\"download-export_package\"]');return a?a.getAttribute('href'):'';})()"
    );
    assert(
      typeof downloadHref === "string" &&
        downloadHref.includes(apiPath) &&
        downloadHref.includes("/export-package/download"),
      "download link points at the export-package download route"
    );
    downloadLinkVisible = true;
    stepsCompleted.push("assert approved export download link visible");

    // --- No generic error surfaces are visible ----------------------------
    const bodyText = await evaluateTextContent(cdp, sessionId);
    for (const errText of [
      "Unable to load this Quick BoM workspace.",
      "Unable to record this approval decision.",
      "Unable to complete this workflow action.",
      "Unable to load or update the SKU line review.",
      "Unable to load or submit the configuration expansion line review.",
      "Unable to load the priced BoQ review.",
      "Authentication required",
    ]) {
      assert(!bodyText.includes(errText), "page does not show: " + errText);
    }
    for (const errId of [
      "load-error",
      "approval-error",
      "workflow-error",
      "sku-review-error",
      "config-review-error",
      "priced-review-error",
    ]) {
      assert(
        !(await querySelectorExists(cdp, sessionId, '[data-testid="' + errId + '"]')),
        "no " + errId + " element is present"
      );
    }
    assert(
      routeErrors.length === 0,
      "no our-route console/network errors: " + routeErrors.join(" | ")
    );

    // --- Persisted-state assertions over raw pg ---------------------------
    const normalized = await latestArtifact(client, projectId, "normalized_boq");
    assert(normalized !== null, "normalized_boq is persisted");
    normalizedLineCount = ((normalized.payload.lines as unknown[]) ?? []).length;
    assert(normalizedLineCount === 7, "persisted normalized_boq has 7 lines");

    const sku = await latestArtifact(client, projectId, "sku_resolution");
    assert(sku !== null && sku.status === "approved", "latest sku_resolution is approved");

    const config = await latestArtifact(client, projectId, "configuration_expansion");
    assert(
      config !== null && config.status === "approved",
      "latest configuration_expansion is approved"
    );
    configAcceptedLineCount = (
      (config.payload.acceptedLines as unknown[]) ?? []
    ).length;
    assert(
      configAcceptedLineCount === 60,
      "persisted configuration_expansion has 60 accepted lines"
    );

    const priced = await latestArtifact(client, projectId, "priced_boq");
    assert(priced !== null && priced.status === "approved", "latest priced_boq is approved");
    pricedLineCount = ((priced.payload.lines as unknown[]) ?? []).length;
    assert(pricedLineCount === 60, "persisted priced_boq has 60 lines");
    const pricedSummary = priced.payload.summary as
      | { totals?: Record<string, number> }
      | undefined;
    const totals = pricedSummary?.totals ?? {};
    subtotalSellSar = Number(totals.subtotalSellPriceSar);
    vatSar = Number(totals.vatAmountSar);
    totalIncVatSar = Number(totals.totalIncVatSar);
    assert(
      closeTo(subtotalSellSar, EXPECTED_SUBTOTAL_SELL_SAR),
      "persisted priced_boq subtotal sell matches the committed fixture"
    );
    assert(
      closeTo(vatSar, EXPECTED_VAT_SAR),
      "persisted priced_boq VAT matches the committed fixture"
    );
    assert(
      closeTo(totalIncVatSar, EXPECTED_TOTAL_INC_VAT_SAR),
      "persisted priced_boq total inc VAT matches the committed fixture"
    );

    const exportPkg = await latestArtifact(client, projectId, "export_package");
    assert(
      exportPkg !== null && exportPkg.status === "approved",
      "latest export_package is approved"
    );
    exportRowCount = Number(exportPkg.payload.rowCount);
    assert(exportRowCount === 60, "persisted export_package has 60 rows");

    passed = true;
    summary.push("project id:                " + projectId);
    summary.push("browser executable:        " + browserExe);
    summary.push("app url:                   " + appUrl);
    summary.push("workflow steps completed:  " + stepsCompleted.length);
    for (const step of stepsCompleted) summary.push("  - " + step);
    summary.push("normalized line count:     " + normalizedLineCount);
    summary.push("SKU accepted count:        " + skuAcceptedCount);
    summary.push("config accept clicks:      " + configAcceptClicks);
    summary.push("config accepted lines:     " + configAcceptedLineCount);
    summary.push("priced line count:         " + pricedLineCount);
    summary.push("totalPriceSar:             " + subtotalSellSar.toFixed(2));
    summary.push("VAT:                       " + vatSar.toFixed(2));
    summary.push("totalIncVatSar:            " + totalIncVatSar.toFixed(2));
    summary.push("export row count:          " + exportRowCount);
    summary.push("download link visible:     " + (downloadLinkVisible ? "yes" : "no"));
  } catch (workflowError) {
    // Capture the on-page error surfaces (if the browser is still attached) so a
    // failing run reports WHAT the page showed, not only which assertion tripped.
    if (cdp !== null && pageSessionId !== null) {
      try {
        const parts: string[] = [];
        for (const errId of [
          "load-error",
          "approval-error",
          "workflow-error",
          "sku-review-error",
          "config-review-error",
          "priced-review-error",
          "workflow-status",
        ]) {
          const t = await evaluateSelectorText(
            cdp,
            pageSessionId,
            '[data-testid="' + errId + '"]'
          );
          if (t.trim() !== "") parts.push(errId + ": " + t.trim());
        }
        for (const type of [
          "sku_resolution",
          "configuration_expansion",
          "priced_boq",
          "export_package",
        ]) {
          parts.push("spine-" + type + ": " + (await spineText(cdp, pageSessionId, type)).replace(/\s+/g, " ").trim());
        }
        diagnostics = parts.join("\n");
      } catch {
        // Ignore: diagnostics are best-effort.
      }
    }
    passed = false;
    diagnostics =
      "error: " +
      (workflowError instanceof Error
        ? workflowError.message
        : String(workflowError)) +
      (diagnostics ? "\n" + diagnostics : "");
  } finally {
    try {
      cdp?.close();
    } catch {
      // Ignore: socket cleanup is best-effort.
    }
    killProcessTree(browserChild);
    killProcessTree(devChild);
    // DB-derived file paths must be collected BEFORE the rows are deleted.
    if (!clientConnected) {
      cleanupResult = "skipped (DB connection never established)";
    } else {
      try {
        const proofFilePaths =
          projectId !== "(not created)"
            ? await collectProofFilePaths(client, projectId)
            : [];
        if (projectId !== "(not created)") {
          await deleteProofProject(client, projectId);
        }
        await deleteProofProjectsByName(client);
        removeProofFiles(proofFilePaths);
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
            "ok (proof Project rows, temp profile, temp CSV, and server files removed; " +
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
    // Remove only the temp resources that were actually created.
    try {
      if (csvUploadPath !== null) rmSync(csvUploadPath, { force: true });
      if (userDataDir !== null) {
        rmSync(userDataDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore: temp dir/file cleanup is best-effort.
    }
  }

  const lines: string[] = [];
  lines.push("============================================================");
  lines.push("BOMATIC Quick BoM Browser Workflow Real-DB Proof (Prompt 140)");
  lines.push("(automated headless browser workflow proof; NOT manual browser QA)");
  lines.push("============================================================");
  lines.push("result:                    " + (passed ? "PASS" : "FAIL"));
  for (const line of summary) lines.push(line);
  lines.push("cleanup result:            " + cleanupResult);
  lines.push("============================================================");
  if (!passed && diagnostics !== "") {
    lines.push("diagnostics:");
    lines.push(diagnostics);
    lines.push("============================================================");
  }
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
    "BOMATIC Quick BoM Browser Workflow Real-DB Proof (Prompt 140)\n" +
      "(automated headless browser workflow proof; NOT manual browser QA)\n" +
      "result:                    FAIL\n" +
      "error:                     " +
      (error instanceof Error ? error.message : String(error)) +
      "\n"
  );
  process.exitCode = 1;
});
