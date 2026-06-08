/**
 * Source-hygiene / unit-level guards for scripts/prove-project-real-db.ts.
 *
 * This suite NEVER connects to a real database and NEVER imports or runs the
 * proof script. It only reads the script source as text and asserts structural
 * invariants: ASCII purity, no forbidden runtime-authority imports, dynamic
 * imports performed AFTER DATABASE_URL is set, cleanup in a finally block, the
 * full DATABASE_URL is never printed, the existing Project store/service
 * functions are used, and the required-table check tells the operator to run
 * `npm.cmd run db:migrate` when a table is missing.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.join(
  process.cwd(),
  "scripts",
  "prove-project-real-db.ts"
);
const TEST_PATH = path.join(
  process.cwd(),
  "tests",
  "scripts",
  "prove-project-real-db.test.ts"
);

function read(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

/** True when every character is in the printable/whitespace ASCII range. */
function isAscii(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return !/[^\x00-\x7F]/.test(text);
}

describe("prove-project-real-db script hygiene", () => {
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

  it("does not import forbidden runtime authorities/modules", () => {
    // Match import specifiers, not prose mentions in comments.
    const importSpecifiers = Array.from(
      source.matchAll(/(?:import|from|require)\s*\(?\s*["']([^"']+)["']/g)
    ).map((m) => m[1]);
    const forbiddenFragments = [
      "anthropic",
      "openai",
      "/agent",
      "/engines",
      "/coordinator",
      "/adapters",
      "catalog",
      "config-expansion",
      "configuration-expansion",
      "rule-pack",
      "priced-boq",
      "/pricing",
      "export",
      "/api/",
      "/app/",
      "runner",
    ];
    for (const specifier of importSpecifiers) {
      for (const fragment of forbiddenFragments) {
        expect(
          specifier.includes(fragment),
          `forbidden import specifier "${specifier}" matched "${fragment}"`
        ).toBe(false);
      }
    }
  });

  it("does not mention AI/LLM runtime authorities by name", () => {
    expect(/anthropic|\bLLM\b|claude-/i.test(source)).toBe(false);
  });

  it("uses dynamic imports performed after DATABASE_URL is set", () => {
    const setIndex = source.indexOf("process.env.DATABASE_URL =");
    expect(setIndex).toBeGreaterThan(-1);
    const dynamicImportIndexes = Array.from(
      source.matchAll(/await import\(/g)
    ).map((m) => m.index ?? -1);
    expect(dynamicImportIndexes.length).toBeGreaterThanOrEqual(4);
    for (const idx of dynamicImportIndexes) {
      expect(idx).toBeGreaterThan(setIndex);
    }
  });

  it("includes cleanup in a finally block", () => {
    expect(source.includes("finally")).toBe(true);
    expect(source.includes("cleanProofTenant")).toBe(true);
    // The cleanup call appears after a finally keyword.
    const finallyIndex = source.indexOf("} finally {");
    expect(finallyIndex).toBeGreaterThan(-1);
    const cleanupInFinally = source.indexOf(
      "cleanProofTenant(client)",
      finallyIndex
    );
    expect(cleanupInFinally).toBeGreaterThan(finallyIndex);
  });

  it("never prints the full DATABASE_URL", () => {
    // No stdout/console write should pass the resolved URL value.
    expect(/process\.stdout\.write\([^)]*databaseUrl/.test(source)).toBe(false);
    expect(/console\.[a-z]+\([^)]*databaseUrl/i.test(source)).toBe(false);
    expect(/(stdout\.write|console\.[a-z]+)\([^)]*DATABASE_URL/.test(source)).toBe(
      false
    );
  });

  it("uses the existing Project store/service functions", () => {
    const required = [
      "@/lib/projects/project-quick-bom-creation",
      "createQuickBomProject",
      "@/lib/db/project-artifact-store",
      "createProjectArtifactVersion",
      "listProjectArtifacts",
      "@/lib/db/project-approval-store",
      "createProjectApproval",
      "listProjectApprovals",
      "@/lib/db/project-store",
      "getProjectById",
    ];
    for (const token of required) {
      expect(source.includes(token), `missing ${token}`).toBe(true);
    }
  });

  it("checks required Project tables and points to db:migrate when missing", () => {
    for (const table of [
      "tenants",
      "projects",
      "project_stages",
      "project_artifacts",
      "project_approvals",
    ]) {
      expect(source.includes(table), `missing table check ${table}`).toBe(true);
    }
    expect(source.includes("npm.cmd run db:migrate")).toBe(true);
  });
});
