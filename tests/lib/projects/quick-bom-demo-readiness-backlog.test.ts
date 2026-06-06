import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Doc regression test for the Quick BoM demo-readiness backlog
 * (docs/QUICK_BOM_DEMO_READINESS_BACKLOG.md), refreshed by Prompt 65 to match the
 * current Honeywell configuration-expansion state.
 *
 * It asserts the backlog reflects the now-approved Batch 1+2+3 runtime expansion
 * authority, names the Batch 4 record as a decision record only (not runtime
 * authority), keeps the optics-standalone and replacements-deferred boundaries,
 * preserves the pricing/configuration authority separation and the temporary
 * demo-fixture pricing boundary, carries the current P65-P71 sequence, and is free
 * of the stale Prompt 46/47-era phrasing. The doc is read from disk and never
 * mutated; no runtime evaluator, composer, pricing, or expansion code is imported
 * or run, and the backlog stays an execution tracker (the planning file remains
 * the source of truth).
 */

const DOC_PATH = join(process.cwd(), "docs/QUICK_BOM_DEMO_READINESS_BACKLOG.md");
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/quick-bom-demo-readiness-backlog.test.ts"
);

const doc = readFileSync(DOC_PATH, "utf8");
const docLower = doc.toLowerCase();

const APPROVED_PACK_FILES = [
  "honeywell-batch1-approved-rules.json",
  "honeywell-batch2-approved-rules.json",
  "honeywell-batch3-approved-rules.json",
];
const BATCH4_DECISION_RECORD_FILE = "honeywell-batch4-decision-record.json";
const PROMPT_SEQUENCE = ["P65", "P66", "P67", "P68", "P69", "P70", "P71"];

// Stale Prompt 46/47-era phrases that must NOT survive the refresh. Matched
// case-sensitively and exactly, as they appeared in the pre-refresh backlog.
const STALE_PHRASES = [
  "No approved/active configuration-expansion rule pack",
  "No approved Honeywell runtime rule pack",
  "implementation resumes at Prompt 47",
  "Blocks B2/P47",
];

describe("quick bom demo-readiness backlog - exists and stays an execution tracker", () => {
  it("exists and is non-empty", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    expect(doc.length).toBeGreaterThan(0);
  });

  it("keeps the planning file as source of truth and itself an execution tracker", () => {
    expect(doc).toContain("MVP_CANONICAL_PROJECT_STATE.md");
    expect(docLower).toContain("execution tracker");
    expect(docLower).toContain("source of truth");
  });
});

describe("quick bom demo-readiness backlog - approved Batch 1+2+3 authority", () => {
  it("names the three approved Honeywell runtime expansion packs", () => {
    for (const file of APPROVED_PACK_FILES) {
      expect(doc, file).toContain(file);
    }
  });

  it("states approved runtime configuration expansion authority now exists", () => {
    expect(docLower).toContain(
      "approved runtime configuration expansion authority now exists"
    );
  });

  it("credits the composer with Batch 1+2+3 coverage", () => {
    expect(doc).toContain("composeApprovedConfigExpansionRulePacks");
    expect(docLower).toContain("batch 1+2+3");
  });

  it("names the Batch 4 record as a decision record only, not runtime authority", () => {
    expect(doc).toContain(BATCH4_DECISION_RECORD_FILE);
    expect(docLower).toContain("decision record");
    expect(docLower).toContain("not runtime expansion authority");
  });
});

describe("quick bom demo-readiness backlog - optics and replacement boundaries", () => {
  it("states optics are standalone customer BoQ lines, not expansion children", () => {
    expect(docLower).toContain("standalone customer boq line");
    expect(docLower).toContain("not configuration-expansion children");
  });

  it("states replacements remain deferred with no silent SKU substitution", () => {
    expect(docLower).toContain("replacement candidates remain deferred");
    expect(docLower).toContain("no silent runtime sku substitution");
  });
});

describe("quick bom demo-readiness backlog - authority separation and fixture boundary", () => {
  it("preserves the pricing/configuration authority separation", () => {
    expect(docLower).toContain(
      "pricing authority and configuration authority stay separate"
    );
  });

  it("marks demo-fixture pricing temporary, not production authority", () => {
    expect(docLower).toContain("temporary demo-fixture pricing");
    expect(docLower).toContain("not permanent");
    expect(docLower).toContain("production pricing authority");
  });
});

describe("quick bom demo-readiness backlog - current P65-P71 sequence", () => {
  it("carries each prompt id from P65 through P71 as a list item", () => {
    for (const prompt of PROMPT_SEQUENCE) {
      expect(doc, prompt).toContain(`- ${prompt} -`);
    }
  });

  it("names active Batch 1+2+3 selection/composition (P66) as the next step", () => {
    expect(docLower).toContain("next implementation step");
    expect(doc).toContain("P66");
  });

  it("frames the Honeywell Quick BoM MVP path as first target, RFP out of scope", () => {
    expect(docLower).toContain("10-14 prompt");
    expect(docLower).toContain("rfp remains out of current scope");
  });
});

describe("quick bom demo-readiness backlog - stale phrasing removed", () => {
  for (const phrase of STALE_PHRASES) {
    it(`no longer contains: ${phrase}`, () => {
      expect(doc.includes(phrase)).toBe(false);
    });
  }

  it("carries no pre-P65 next-prompt ids (P47-P52 scheme retired)", () => {
    for (const old of ["P47", "P48", "P49", "P50", "P51", "P52"]) {
      expect(doc.includes(old), old).toBe(false);
    }
  });
});

describe("quick bom demo-readiness backlog - hygiene", () => {
  it("keeps the backlog ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(doc)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
