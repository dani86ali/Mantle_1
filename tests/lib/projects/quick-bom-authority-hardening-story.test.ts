import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const DOC_PATH = join(
  process.cwd(),
  "docs",
  "execution-history",
  "BOMATIC_PROMPTS_104_125_AUTHORITY_STORY.md"
);

const TEST_PATH = join(
  process.cwd(),
  "tests",
  "lib",
  "projects",
  "quick-bom-authority-hardening-story.test.ts"
);

function flatten(s: string): string {
  return s.replace(/\s+/g, " ").toLowerCase();
}

function isAsciiOnly(s: string): boolean {
  return /^[\x00-\x7F]*$/.test(s);
}

describe("quick-bom-authority-hardening-story doc regression", () => {
  const doc = readFileSync(DOC_PATH, "utf8");
  const testSrc = readFileSync(TEST_PATH, "utf8");
  const flat = flatten(doc);

  it("doc exists and is non-empty", () => {
    expect(doc.length).toBeGreaterThan(100);
  });

  it("doc is ASCII-only", () => {
    expect(isAsciiOnly(doc)).toBe(true);
  });

  it("test source is ASCII-only", () => {
    expect(isAsciiOnly(testSrc)).toBe(true);
  });

  it("doc names P104 through P125", () => {
    for (let p = 104; p <= 125; p++) {
      expect(flat).toContain(`p${p}`);
    }
  });

  it("doc includes source-of-truth boundary", () => {
    expect(flat).toContain("source of truth");
    expect(flat).toContain("mvp_canonical_project_state.md");
  });

  it("doc names required authority IDs", () => {
    expect(doc).toContain("honeywell-mvp-composed-batch1-batch2-batch3");
    expect(doc).toContain("prompt-116-user-approved-honeywell-config-authority");
    expect(doc).toContain("honeywell-mvp-demo-pricing-authority-profile");
    expect(doc).toContain("prompt-119-user-approved-honeywell-demo-pricing-authority");
    expect(doc).toContain("committed_honeywell_demo_pricing_fixture");
  });

  it("doc includes explicit Honeywell catalog opt-in boundary", () => {
    expect(flat).toContain("explicit");
    expect(flat).toContain("opt-in");
  });

  it("doc includes no runtime AI decisions boundary", () => {
    expect(flat).toContain("no runtime ai");
  });

  it("doc includes no silent sku substitution boundary", () => {
    expect(flat).toContain("no silent sku substitution");
  });

  it("doc includes no production cisco pricing claim boundary", () => {
    expect(flat).toContain("no production cisco pricing");
  });

  it("doc includes unknown relationships deferred boundary", () => {
    expect(flat).toContain("unknown relationships are deferred");
  });

  it("doc includes optics not auto-attached boundary", () => {
    expect(flat).toContain("optics are not auto-attached under switches");
  });

  it("doc includes pricing and configuration authority separated", () => {
    expect(flat).toContain("pricing authority and configuration authority are distinct");
  });

  it("doc includes lean provenance summaries, no payload/source/path leakage", () => {
    expect(flat).toContain("lean provenance summaries");
    expect(flat).toContain("not exposed");
  });

  it("doc includes future roadmap", () => {
    expect(flat).toContain("future roadmap");
    expect(flat).toContain("line-level sku review ui");
    expect(flat).toContain("production pricing authority");
    expect(flat).toContain("marafiq");
  });

  it("doc includes future human approval gates", () => {
    expect(flat).toContain("future human approval gates");
    expect(flat).toContain("any production cisco pricing source or claim");
    expect(flat).toContain("any replacement or substitution mapping");
  });

  it("doc does not claim broad cisco-general intelligence is approved", () => {
    expect(doc).not.toContain("BOMATIC is Cisco-certified");
    expect(doc).not.toContain("runtime AI decides");
    expect(doc).not.toContain("automatic SKU substitution");
    expect(doc).not.toContain("production Cisco pricing authority is approved");
    expect(doc).not.toContain("broad Cisco-general configuration authority is approved");
  });
});
