/**
 * Source-hygiene / unit-level guards for
 * scripts/prove-project-quick-bom-route-real-db.ts.
 *
 * This suite NEVER connects to a real database and NEVER imports or runs the
 * proof script. It only reads the script source as text and asserts structural
 * invariants: ASCII purity; DATABASE_URL is resolved and process.env.DATABASE_URL
 * is set before any dynamic import; NODE_ENV is set to "development" before the
 * dynamic route imports; cleanup runs in a finally block; the full DATABASE_URL is
 * never printed; the 12 existing Quick BoM route handlers are imported
 * dynamically (route handlers are the only behavior path, not product services);
 * required-table checks point the operator to `npm.cmd run db:migrate`; the full
 * seven-line Honeywell CSV is present and the SKU resolution uses the default Quick
 * BoM approved catalog with no catalog profile; no forbidden
 * AI/engine/coordinator/adapter/agent/catalog/pricing/config
 * authority module is imported; and no route request body supplies
 * tenantId/projectId/decidedBy/pricing/authority fields.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.join(
  process.cwd(),
  "scripts",
  "prove-project-quick-bom-route-real-db.ts"
);
const TEST_PATH = path.join(
  process.cwd(),
  "tests",
  "scripts",
  "prove-project-quick-bom-route-real-db.test.ts"
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

/** Return the balanced-parenthesis argument text for each `name(` call site. */
function callArguments(source: string, name: string): string[] {
  const args: string[] = [];
  const opener = name + "(";
  let from = 0;
  for (;;) {
    const start = source.indexOf(opener, from);
    if (start === -1) break;
    let depth = 0;
    let i = start + opener.length - 1;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    args.push(source.slice(start + opener.length, i));
    from = i + 1;
  }
  return args;
}

const REQUIRED_ROUTE_SPECIFIERS = [
  "@/app/api/projects/quick-bom/route",
  "@/app/api/projects/[id]/quick-bom/route",
  "@/app/api/projects/[id]/quick-bom/files/route",
  "@/app/api/projects/[id]/quick-bom/files/[fileId]/normalize/route",
  "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/route",
  "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/review/route",
  "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/route",
  "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/review/route",
  "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/priced-boq/route",
  "@/app/api/projects/[id]/quick-bom/approvals/route",
  "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/export-package/route",
  "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/export-package/download/route",
];

// Forbidden import prefixes: AI SDKs, engines, coordinator, adapters, agents, and
// runtime catalog/pricing/config authority. @/lib/projects covers product
// services AND the pricing/config-authority modules that live under it - the
// script must reach behavior only through the @/app route handlers, never by
// importing a product service directly. The allowed @/lib imports are the safe
// read-only DB stores (project-store, project-artifact-store).
const FORBIDDEN_IMPORT_PREFIXES = [
  "@/lib/adapters",
  "@/lib/agent",
  "@/lib/catalog",
  "@/lib/projects",
  "@/coordinator",
  "@/engines",
  "@anthropic-ai",
  "openai",
];

describe("prove-project-quick-bom-route-real-db script hygiene", () => {
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
    expect(dynamicImportIndexes.length).toBeGreaterThanOrEqual(12);
    for (const idx of dynamicImportIndexes) {
      expect(idx).toBeGreaterThan(setIndex);
    }
  });

  it('sets process.env.NODE_ENV = "development" before the dynamic route imports', () => {
    const nodeEnvIndex = source.indexOf('NODE_ENV = "development"');
    expect(nodeEnvIndex).toBeGreaterThan(-1);
    const firstImport = source.indexOf("await import(");
    expect(firstImport).toBeGreaterThan(-1);
    expect(nodeEnvIndex).toBeLessThan(firstImport);
  });

  it("includes cleanup in a finally block", () => {
    expect(source.includes("cleanProofTenant")).toBe(true);
    const finallyIndex = source.indexOf("} finally {");
    expect(finallyIndex).toBeGreaterThan(-1);
    const cleanupInFinally = source.indexOf("cleanProofTenant(client)", finallyIndex);
    expect(cleanupInFinally).toBeGreaterThan(finallyIndex);
  });

  it("never prints the full DATABASE_URL", () => {
    expect(/process\.stdout\.write\([^)]*databaseUrl/.test(source)).toBe(false);
    expect(/console\.[a-z]+\([^)]*databaseUrl/i.test(source)).toBe(false);
    expect(
      /(stdout\.write|console\.[a-z]+)\([^)]*DATABASE_URL/.test(source)
    ).toBe(false);
  });

  it("imports the 12 existing Quick BoM route handlers dynamically", () => {
    for (const spec of REQUIRED_ROUTE_SPECIFIERS) {
      const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp('await import\\(\\s*["\']' + escaped + '["\']');
      expect(re.test(source), `missing dynamic import of ${spec}`).toBe(true);
    }
  });

  it("inspects persisted state only through the safe read-only DB stores", () => {
    expect(source.includes("@/lib/db/project-store")).toBe(true);
    expect(source.includes("@/lib/db/project-artifact-store")).toBe(true);
  });

  it("imports no forbidden AI/engine/coordinator/adapter/agent/catalog/pricing/config module", () => {
    for (const spec of importSpecifiers(source)) {
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
      expect(/anthropic|openai|claude-/i.test(spec)).toBe(false);
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

  it("includes the full seven-line Honeywell CSV input", () => {
    for (const line of [
      "#,Description,Part Number,Qty",
      "1,Wireless AP,CW9178I-CFG,12",
      "2,Network subscription,CISCO-NETWORK-SUB,1",
      "3,Access switch,C9300X-48HX-A,7",
      "4,Access switch,C9300L-24P-4X-A,6",
      "5,Standalone optic,SFP-10G-LR-S=,12",
      "6,Standalone optic,SFP-10/25G-LR-S=,14",
      "7,Desk phone,CP-7841-K9=,59",
    ]) {
      expect(source.includes(line), `missing CSV line ${line}`).toBe(true);
    }
  });

  it("uses the default Quick BoM catalog with no catalog profile", () => {
    expect(source.includes("catalogProfile")).toBe(false);
    expect(source.includes('"default_quick_bom_approved_catalog"')).toBe(true);
  });

  it("never supplies tenantId/projectId/decidedBy/pricing/authority in a request body", () => {
    const bodyArgs = [...callArguments(source, "jsonRequest")];
    expect(bodyArgs.length).toBeGreaterThan(0);
    const forbiddenBodyKey =
      /\b(tenantId|projectId|decidedBy|decidedAt|pricing|replacementAuthority|skuSubstitutionAuthority|configAuthority|pricingAuthority)\s*:/;
    for (const arg of bodyArgs) {
      expect(
        forbiddenBodyKey.test(arg),
        `request body supplies a forbidden authority field: ${arg}`
      ).toBe(false);
    }
  });
});
