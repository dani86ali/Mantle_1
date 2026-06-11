/**
 * Source-hygiene / unit-level guards for
 * scripts/prove-project-quick-bom-browser-real-db.ts.
 *
 * This suite NEVER launches a browser, starts Next, or connects to a database. It
 * only reads the script source as text and asserts structural invariants: ASCII
 * purity; DATABASE_URL is resolved and process.env.DATABASE_URL is set before any
 * dynamic import; NODE_ENV is set to "development" before the app/server launch;
 * browser executable discovery honors BOMATIC_BROWSER_EXE then Chrome then Edge;
 * Node's built-in WebSocket / the Chrome DevTools Protocol is used and no
 * Playwright/Puppeteer/Cypress import exists; cleanup runs in a finally block; the
 * full DATABASE_URL is never printed; no forbidden AI/engine/coordinator/adapter/
 * agent runtime module is imported; the only product module imported is the existing
 * Honeywell demo fixture; no package/dependency file is referenced for modification;
 * the script states it is not a manual browser QA replacement; and proof
 * Project/tenant cleanup is present.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.join(
  process.cwd(),
  "scripts",
  "prove-project-quick-bom-browser-real-db.ts"
);
const TEST_PATH = path.join(
  process.cwd(),
  "tests",
  "scripts",
  "prove-project-quick-bom-browser-real-db.test.ts"
);

function read(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

/** True when every character is in the printable/whitespace ASCII range. */
function isAscii(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return !/[^\x00-\x7F]/.test(text);
}

/** Extract module specifiers from `from "x"` and `import("x")` forms only. */
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const fromRe = /import\s+(?:type\s+)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g;
  const dynRe = /\bimport\(\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = fromRe.exec(source)) !== null) specs.push(match[1]);
  while ((match = dynRe.exec(source)) !== null) specs.push(match[1]);
  return specs;
}

// Forbidden import prefixes: AI SDKs, engines, coordinator, adapters, agents, and
// runtime catalog/pricing/config authority. The ONE allowed @/lib/projects import is
// the existing Honeywell demo fixture used for proof setup (asserted separately).
const HONEYWELL_FIXTURE = "@/lib/projects/honeywell-demo-project-fixture";
const FORBIDDEN_IMPORT_PREFIXES = [
  "@/lib/adapters",
  "@/lib/agent",
  "@/lib/catalog",
  "@/lib/projects",
  "@/coordinator",
  "@/engines",
  "@anthropic-ai",
  "@google/generative-ai",
  "openai",
];

describe("prove-project-quick-bom-browser-real-db script hygiene", () => {
  const source = read(SCRIPT_PATH);

  it("script file exists and is non-empty", () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it("script source is ASCII-only", () => {
    expect(isAscii(source)).toBe(true);
  });

  it("this test file is ASCII-only", () => {
    expect(isAscii(read(TEST_PATH))).toBe(true);
  });

  it("resolves DATABASE_URL and sets process.env.DATABASE_URL before dynamic imports", () => {
    expect(source.includes("resolveDatabaseUrl")).toBe(true);
    const setIndex = source.indexOf("process.env.DATABASE_URL =");
    expect(setIndex).toBeGreaterThan(-1);
    const dynamicImportIndexes = Array.from(
      source.matchAll(/await import\(/g)
    ).map((m) => m.index ?? -1);
    expect(dynamicImportIndexes.length).toBeGreaterThanOrEqual(1);
    for (const idx of dynamicImportIndexes) {
      expect(idx).toBeGreaterThan(setIndex);
    }
  });

  it('sets process.env.NODE_ENV = "development" before the dynamic import and server launch', () => {
    const nodeEnvIndex = source.indexOf('.NODE_ENV = "development"');
    expect(nodeEnvIndex).toBeGreaterThan(-1);
    // The dynamic fixture import precedes the dev-server start in main(), so
    // ordering before the import also proves ordering before the server launch.
    const firstImport = source.indexOf("await import(");
    expect(firstImport).toBeGreaterThan(-1);
    expect(nodeEnvIndex).toBeLessThan(firstImport);
    // The dev-server CALL site (not its earlier function definition) follows.
    const devServerCall = source.indexOf("= startNextDevServer(");
    expect(devServerCall).toBeGreaterThan(-1);
    expect(nodeEnvIndex).toBeLessThan(devServerCall);
  });

  it("discovers the browser via BOMATIC_BROWSER_EXE, then Chrome, then Edge", () => {
    expect(source.includes("BOMATIC_BROWSER_EXE")).toBe(true);
    const chromeIdx = source.indexOf("chrome.exe");
    const edgeIdx = source.indexOf("msedge.exe");
    expect(chromeIdx).toBeGreaterThan(-1);
    expect(edgeIdx).toBeGreaterThan(-1);
    // Chrome is tried before Edge.
    expect(source.indexOf("CHROME_DEFAULT")).toBeLessThan(
      source.indexOf("EDGE_DEFAULT")
    );
  });

  it("uses the built-in WebSocket / Chrome DevTools Protocol", () => {
    expect(source.includes("new WebSocket(")).toBe(true);
    expect(source.includes("webSocketDebuggerUrl")).toBe(true);
    expect(source.includes("remote-debugging-port")).toBe(true);
    expect(source.includes("Page.navigate")).toBe(true);
  });

  it("imports no browser-automation package (Playwright/Puppeteer/Cypress)", () => {
    // Scope to import specifiers, not mentions: the script's own doc comment names
    // these packages to state it does NOT use them.
    for (const spec of importSpecifiers(source)) {
      expect(/playwright|puppeteer|cypress/i.test(spec)).toBe(false);
    }
  });

  it("launches the browser headless with a temp user-data-dir", () => {
    expect(source.includes("--headless")).toBe(true);
    expect(source.includes("--user-data-dir=")).toBe(true);
    expect(source.includes("mkdtempSync")).toBe(true);
  });

  it("includes cleanup in a finally block", () => {
    const finallyIndex = source.indexOf("} finally {");
    expect(finallyIndex).toBeGreaterThan(-1);
    // Browser, dev server, temp dir, and proof Project cleanup are in finally.
    expect(source.indexOf("browserChild", finallyIndex)).toBeGreaterThan(
      finallyIndex
    );
    expect(source.indexOf("devChild", finallyIndex)).toBeGreaterThan(
      finallyIndex
    );
    expect(source.indexOf("rmSync(userDataDir", finallyIndex)).toBeGreaterThan(
      finallyIndex
    );
    expect(source.indexOf("deleteProofProject", finallyIndex)).toBeGreaterThan(
      finallyIndex
    );
  });

  it("never prints the full DATABASE_URL", () => {
    expect(/process\.stdout\.write\([^)]*databaseUrl/.test(source)).toBe(false);
    expect(/console\.[a-z]+\([^)]*databaseUrl/i.test(source)).toBe(false);
    expect(
      /(stdout\.write|console\.[a-z]+)\([^)]*DATABASE_URL/.test(source)
    ).toBe(false);
  });

  it("imports the existing Honeywell demo fixture for proof setup", () => {
    const re = new RegExp(
      'await import\\(\\s*["\']' +
        HONEYWELL_FIXTURE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        '["\']'
    );
    expect(re.test(source)).toBe(true);
  });

  it("imports no forbidden AI/engine/coordinator/adapter/agent/catalog/pricing/config module (fixture excepted)", () => {
    for (const spec of importSpecifiers(source)) {
      if (spec === HONEYWELL_FIXTURE) continue;
      for (const prefix of FORBIDDEN_IMPORT_PREFIXES) {
        expect(
          spec === prefix || spec.startsWith(prefix + "/"),
          `forbidden import "${spec}" matched "${prefix}"`
        ).toBe(false);
      }
    }
  });

  it("does not mention AI/LLM runtime authorities by name in import specifiers", () => {
    for (const spec of importSpecifiers(source)) {
      expect(/anthropic|openai|generative-ai|claude-/i.test(spec)).toBe(false);
    }
  });

  it("checks required Project tables and points to db:migrate when missing", () => {
    for (const table of [
      "tenants",
      "projects",
      "project_files",
      "project_stages",
      "project_artifacts",
      "project_approvals",
    ]) {
      expect(source.includes(table), `missing table check ${table}`).toBe(true);
    }
    expect(source.includes("npm.cmd run db:migrate")).toBe(true);
  });

  it("references no package/dependency file for modification", () => {
    // Scope to imports and write call-sites, not mentions: the script's doc comment
    // notes it is "not registered in package.json by design".
    for (const spec of importSpecifiers(source)) {
      expect(/package\.json|package-lock|pnpm-lock|yarn\.lock/i.test(spec)).toBe(
        false
      );
    }
    expect(
      /(writeFileSync|Write|appendFileSync)\([^)]*(package\.json|package-lock|pnpm-lock|yarn\.lock)/i.test(
        source
      )
    ).toBe(false);
  });

  it("states it is a smoke proof and not a manual browser QA replacement", () => {
    expect(/headless browser smoke proof/i.test(source)).toBe(true);
    expect(/NOT a manual browser QA replacement/i.test(source)).toBe(true);
  });

  it("makes no overclaim about QA completeness or Cisco certification", () => {
    expect(/manual browser QA complete/i.test(source)).toBe(false);
    expect(/production ready/i.test(source)).toBe(false);
    expect(/general Cisco complete/i.test(source)).toBe(false);
    expect(/Cisco-certified/i.test(source)).toBe(false);
  });

  it("seeds under the default dev-session tenant and cleans only the proof Project", () => {
    expect(source.includes("00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(source.includes("deleteProofProject")).toBe(true);
    expect(source.includes("deleteProofProjectsByName")).toBe(true);
    // The shared dev tenant row is upserted, never deleted.
    expect(source.includes("upsertDevTenant")).toBe(true);
    expect(/delete from tenants/i.test(source)).toBe(false);
  });

  it("snapshots and restores the shared dev tenant metadata (never deletes it)", () => {
    expect(source.includes("readDevTenantSnapshot")).toBe(true);
    expect(source.includes("restoreDevTenant")).toBe(true);
    expect(
      source.includes("select name, slug, region from tenants where id = $1")
    ).toBe(true);
    expect(
      source.includes("update tenants set name = $2, slug = $3, region = $4")
    ).toBe(true);
    // Cleanup output distinguishes restored vs inserted-preserved outcomes.
    expect(source.includes("existing dev tenant metadata restored")).toBe(true);
    expect(source.includes("inserted default dev tenant row preserved")).toBe(
      true
    );
    expect(/delete from tenants/i.test(source)).toBe(false);
  });

  it("guards the app/debug port pair against collision", () => {
    expect(source.includes("findFreePort(PREFERRED_DEBUG_PORT, [appPort])")).toBe(
      true
    );
    expect(source.includes("debugPort !== appPort")).toBe(true);
    // findFreePort accepts an excluded-ports list and skips it during the scan.
    expect(source.includes("excludedPorts")).toBe(true);
  });

  it("declares cleanup resource variables before the main try", () => {
    // Locate the main function, then its first `try {` (not any earlier helper try).
    const mainIndex = source.indexOf("async function main");
    expect(mainIndex).toBeGreaterThan(-1);
    const tryIndex = source.indexOf("try {", mainIndex);
    expect(tryIndex).toBeGreaterThan(-1);
    for (const decl of [
      "let userDataDir: string | null = null;",
      "let exportOutputPath: string | null = null;",
      "let clientConnected = false;",
    ]) {
      const at = source.indexOf(decl);
      expect(at, `missing declaration: ${decl}`).toBeGreaterThan(-1);
      expect(at).toBeLessThan(tryIndex);
    }
    // Temp profile cleanup remains in the main finally, null-guarded.
    const finallyIndex = source.indexOf("} finally {");
    expect(
      source.indexOf("rmSync(userDataDir", finallyIndex)
    ).toBeGreaterThan(finallyIndex);
    expect(source.indexOf("if (userDataDir !== null)")).toBeGreaterThan(-1);
    // client.end() only runs when the connection actually opened.
    expect(source.includes("if (!clientConnected)")).toBe(true);
  });
});
