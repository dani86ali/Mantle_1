/**
 * Source-hygiene / unit-level guards for
 * scripts/prove-project-quick-bom-browser-workflow-real-db.ts (Prompt 140).
 *
 * This suite NEVER launches a browser, starts Next, or connects to a database. It
 * only reads the script source as text and asserts structural invariants: ASCII
 * purity; DATABASE_URL is resolved and process.env.DATABASE_URL is set before any
 * dynamic import and before the dev-server launch; NODE_ENV is set to "development"
 * before the dev-server launch; browser executable discovery honors
 * BOMATIC_BROWSER_EXE then Chrome then Edge; Node's built-in WebSocket / the Chrome
 * DevTools Protocol is used and no Playwright/Puppeteer/Cypress import exists; the
 * app and debug ports are guaranteed distinct; cleanup runs in a finally block; the
 * full DATABASE_URL is never printed; the dev tenant is snapshotted/restored and
 * never deleted; the full seven-line Honeywell CSV is present; the Project is created
 * through an in-browser fetch to the existing create route; the upload uses
 * DOM.setFileInputFiles; every workflow selector is driven; no forbidden AI/engine/
 * coordinator/adapter/catalog/product-service module is imported (DB is raw pg only);
 * and no overclaim is made.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.join(
  process.cwd(),
  "scripts",
  "prove-project-quick-bom-browser-workflow-real-db.ts"
);
const TEST_PATH = path.join(
  process.cwd(),
  "tests",
  "scripts",
  "prove-project-quick-bom-browser-workflow-real-db.test.ts"
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

// Forbidden import prefixes: AI SDKs, engines, coordinator, adapters, agents, runtime
// catalog/pricing/config authority, AND any product service (this proof drives the
// app through the browser and never imports an app module - DB access is raw pg only).
const FORBIDDEN_IMPORT_PREFIXES = [
  "@/lib/adapters",
  "@/lib/agent",
  "@/lib/catalog",
  "@/lib/projects",
  "@/lib/db",
  "@/coordinator",
  "@/engines",
  "@/app",
  "@anthropic-ai",
  "@google/generative-ai",
  "openai",
];

describe("prove-project-quick-bom-browser-workflow-real-db script hygiene", () => {
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

  it("resolves DATABASE_URL and sets process.env.DATABASE_URL before any dynamic import", () => {
    expect(source.includes("resolveDatabaseUrl")).toBe(true);
    const setIndex = source.indexOf("process.env.DATABASE_URL =");
    expect(setIndex).toBeGreaterThan(-1);
    // No forbidden dynamic imports exist; any dynamic import (if added) must follow.
    const dynamicImportIndexes = Array.from(
      source.matchAll(/await import\(/g)
    ).map((m) => m.index ?? -1);
    for (const idx of dynamicImportIndexes) {
      expect(idx).toBeGreaterThan(setIndex);
    }
  });

  it('sets DATABASE_URL and NODE_ENV before the dev-server launch', () => {
    const dbIndex = source.indexOf("process.env.DATABASE_URL =");
    const nodeEnvIndex = source.indexOf('.NODE_ENV = "development"');
    const devServerCall = source.indexOf("= startNextDevServer(");
    expect(dbIndex).toBeGreaterThan(-1);
    expect(nodeEnvIndex).toBeGreaterThan(-1);
    expect(devServerCall).toBeGreaterThan(-1);
    expect(dbIndex).toBeLessThan(devServerCall);
    expect(nodeEnvIndex).toBeLessThan(devServerCall);
  });

  it("discovers the browser via BOMATIC_BROWSER_EXE, then Chrome, then Edge", () => {
    expect(source.includes("BOMATIC_BROWSER_EXE")).toBe(true);
    expect(source.indexOf("chrome.exe")).toBeGreaterThan(-1);
    expect(source.indexOf("msedge.exe")).toBeGreaterThan(-1);
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
    for (const spec of importSpecifiers(source)) {
      expect(/playwright|puppeteer|cypress/i.test(spec)).toBe(false);
    }
  });

  it("launches the browser headless with a temp user-data-dir", () => {
    expect(source.includes("--headless")).toBe(true);
    expect(source.includes("--user-data-dir=")).toBe(true);
    expect(source.includes("mkdtempSync")).toBe(true);
  });

  it("guarantees the app and debug ports are distinct", () => {
    expect(
      source.includes("findFreePort(PREFERRED_DEBUG_PORT, [appPort])")
    ).toBe(true);
    expect(source.includes("debugPort !== appPort")).toBe(true);
    expect(source.includes("excludedPorts")).toBe(true);
  });

  it("includes cleanup in a finally block", () => {
    const finallyIndex = source.indexOf("} finally {");
    expect(finallyIndex).toBeGreaterThan(-1);
    expect(source.indexOf("browserChild", finallyIndex)).toBeGreaterThan(
      finallyIndex
    );
    expect(source.indexOf("devChild", finallyIndex)).toBeGreaterThan(finallyIndex);
    expect(source.indexOf("rmSync(userDataDir", finallyIndex)).toBeGreaterThan(
      finallyIndex
    );
    expect(source.indexOf("rmSync(csvUploadPath", finallyIndex)).toBeGreaterThan(
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

  it("seeds under the default dev-session tenant and cleans only the proof Project", () => {
    expect(source.includes("00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(source.includes("deleteProofProject")).toBe(true);
    expect(source.includes("deleteProofProjectsByName")).toBe(true);
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
    expect(source.includes("existing dev tenant metadata restored")).toBe(true);
    expect(source.includes("inserted default dev tenant row preserved")).toBe(true);
    expect(/delete from tenants/i.test(source)).toBe(false);
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

  it("writes the full seven-line Honeywell CSV", () => {
    for (const row of [
      "#,Description,Part Number,Qty",
      "1,Wireless AP,CW9178I-CFG,12",
      "2,Network subscription,CISCO-NETWORK-SUB,1",
      "3,Access switch,C9300X-48HX-A,7",
      "4,Access switch,C9300L-24P-4X-A,6",
      "5,Standalone optic,SFP-10G-LR-S=,12",
      "6,Standalone optic,SFP-10/25G-LR-S=,14",
      "7,Desk phone,CP-7841-K9=,59",
    ]) {
      expect(source.includes(row), `missing CSV row ${row}`).toBe(true);
    }
  });

  it("creates the Project through an in-browser fetch to the existing create route", () => {
    expect(source.includes("fetch('/api/projects/quick-bom'")).toBe(true);
    // Only product-allowed fields are sent; no tenantId/decidedBy/authority fields.
    for (const forbidden of ["tenantId", "decidedBy", "projectId:", "authority"]) {
      // The create payload object literal must not carry these. Scope to the
      // createPayload block.
      const block = source.slice(
        source.indexOf("const createPayload"),
        source.indexOf("const createExpr")
      );
      expect(block.includes(forbidden), `create payload leaks ${forbidden}`).toBe(
        false
      );
    }
  });

  it("uploads the CSV through DOM.setFileInputFiles", () => {
    expect(source.includes("DOM.setFileInputFiles")).toBe(true);
    expect(source.includes("workflow-upload-file")).toBe(true);
  });

  it("drives every workflow selector through the UI", () => {
    for (const selector of [
      "workflow-upload-normalize",
      "workflow-create-sku_resolution",
      "sku-review-load",
      "sku-review-accept-all-same-sku",
      "approve-sku_resolution",
      "workflow-create-configuration_expansion",
      "config-review-load",
      "config-review-accept-all-expansion",
      "config-review-submit",
      "approve-configuration_expansion",
      "workflow-create-priced_boq",
      "priced-review-load",
      "priced-review-summary",
      "approve-priced_boq",
      "workflow-create-export_package",
      "approve-export_package",
      "download-export_package",
    ]) {
      expect(source.includes(selector), `missing selector ${selector}`).toBe(true);
    }
  });

  it("drives the explicit batch review controls, not the per-line/bulk accept paths", () => {
    // The fixed UI uses single batch buttons; the proof must click those.
    expect(source.includes("sku-review-accept-all-same-sku")).toBe(true);
    expect(source.includes("config-review-accept-all-expansion")).toBe(true);
    expect(
      source.includes('clickTestId(cdp, sessionId, "sku-review-accept-all-same-sku")')
    ).toBe(true);
    expect(
      source.includes(
        'clickTestId(cdp, sessionId, "config-review-accept-all-expansion")'
      )
    ).toBe(true);
    // The old proof path is gone: no per-line sku accept loop, no bulk-click of the
    // per-line config accept buttons.
    expect(source.includes('clickTestId(cdp, sessionId, "sku-review-accept")')).toBe(
      false
    );
    expect(source.includes('clickAllTestId(cdp, sessionId, "config-review-accept")')).toBe(
      false
    );
  });

  it("asserts deterministic priced totals and 60-line counts", () => {
    expect(source.includes("2185708.76")).toBe(true);
    expect(source.includes("327856.31")).toBe(true);
    expect(source.includes("2513565.07")).toBe(true);
    expect(source.includes("60 lines")).toBe(true);
  });

  it("imports no forbidden AI/engine/coordinator/adapter/catalog/product-service module (DB is raw pg only)", () => {
    for (const spec of importSpecifiers(source)) {
      for (const prefix of FORBIDDEN_IMPORT_PREFIXES) {
        expect(
          spec === prefix || spec.startsWith(prefix + "/"),
          `forbidden import "${spec}" matched "${prefix}"`
        ).toBe(false);
      }
    }
    // The only database dependency is the raw pg driver.
    expect(importSpecifiers(source).includes("pg")).toBe(true);
  });

  it("does not mention AI/LLM runtime authorities by name in import specifiers", () => {
    for (const spec of importSpecifiers(source)) {
      expect(/anthropic|openai|generative-ai|claude-/i.test(spec)).toBe(false);
    }
  });

  it("references no package/dependency file for modification", () => {
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

  it("states it is an automated headless workflow proof and not manual browser QA", () => {
    expect(/automated headless browser workflow proof/i.test(source)).toBe(true);
    expect(/NOT manual browser QA/i.test(source)).toBe(true);
  });

  it("makes no overclaim about QA completeness or Cisco certification", () => {
    expect(/manual browser QA complete/i.test(source)).toBe(false);
    expect(/production ready/i.test(source)).toBe(false);
    expect(/general Cisco complete/i.test(source)).toBe(false);
    expect(/Cisco-certified/i.test(source)).toBe(false);
  });

  it("declares cleanup resource variables before the main try", () => {
    const mainIndex = source.indexOf("async function main");
    expect(mainIndex).toBeGreaterThan(-1);
    const tryIndex = source.indexOf("try {", mainIndex);
    expect(tryIndex).toBeGreaterThan(-1);
    for (const decl of [
      "let userDataDir: string | null = null;",
      "let csvUploadPath: string | null = null;",
      "let clientConnected = false;",
    ]) {
      const at = source.indexOf(decl);
      expect(at, `missing declaration: ${decl}`).toBeGreaterThan(-1);
      expect(at).toBeLessThan(tryIndex);
    }
    expect(source.includes("if (!clientConnected)")).toBe(true);
    expect(source.indexOf("if (userDataDir !== null)")).toBeGreaterThan(-1);
  });
});
