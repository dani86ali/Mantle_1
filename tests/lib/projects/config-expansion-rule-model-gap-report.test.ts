import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Configuration Expansion Rule Model Gap Report asset test (Prompt 48).
 *
 * Verifies the committed gap report at
 * docs/config-expansion/RULE_MODEL_GAP_REPORT.md. The report is an
 * architecture/modeling document only: it is NOT runtime authority and NOT an
 * approved rule pack. It records why some Honeywell candidate rules encode
 * observed CCW quantities (e.g. LIC-CW-A / LIC-SPACES-ADV fixed at 12, the
 * CW9178I-CFG access-point count) instead of reusable configuration logic, and
 * it names the model capabilities a later prompt must add. This test reads the
 * file from disk (not via import) so it also proves the committed Markdown exists
 * and is ASCII-only.
 */

const REPORT_PATH = join(
  process.cwd(),
  "docs/config-expansion/RULE_MODEL_GAP_REPORT.md"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/config-expansion-rule-model-gap-report.test.ts"
);

const TITLE = "# Configuration Expansion Rule Model Gap Report";

// The critical Honeywell examples the report must name by SKU.
const CRITICAL_EXAMPLE_SKUS = [
  "LIC-CW-A",
  "LIC-SPACES-ADV",
  "CW9178I-CFG",
  "CAB-C15-CBN",
  "CISCO-NETWORK-SUB",
  "SC9300UK9-1715",
  "S9300LUK9-1718",
];

// The required model-capability phrases the report must include verbatim.
const REQUIRED_CAPABILITY_PHRASES = [
  "same_as_related_sku_total",
  "selected AC power-supply count",
  "parent_segment",
  "project_sku",
  "related_sku_group",
  "quote_observed",
  "reusable_logic",
  "needs_more_evidence",
  "3Y default",
  "5Y",
  "7Y",
];

const report = existsSync(REPORT_PATH) ? readFileSync(REPORT_PATH, "utf8") : "";

describe("Rule model gap report - existence and title", () => {
  it("exists on disk and is non-empty", () => {
    expect(existsSync(REPORT_PATH)).toBe(true);
    expect(report.length).toBeGreaterThan(0);
  });

  it("contains the exact title as the document heading", () => {
    expect(report).toContain(TITLE);
    expect(report.startsWith(TITLE)).toBe(true);
  });
});

describe("Rule model gap report - not authority", () => {
  it("states it is not runtime authority and not an approved rule pack", () => {
    expect(report).toContain("not runtime authority");
    expect(report).toContain("not an approved rule pack");
  });

  it("says the approved Honeywell runtime pack must not be created until the gaps are addressed", () => {
    expect(report).toContain(
      "Do not create the approved Honeywell runtime pack until these model gaps are addressed"
    );
  });
});

describe("Rule model gap report - critical examples", () => {
  it("names every critical Honeywell example SKU", () => {
    for (const sku of CRITICAL_EXAMPLE_SKUS) {
      expect(report, sku).toContain(sku);
    }
  });

  it("explains why the fixed Honeywell quantities are unsafe to reuse", () => {
    // The discovery: LIC-CW-A / LIC-SPACES-ADV are fixed at 12 because Honeywell
    // has 12 CW9178I-CFG access points; the report must tie the two together.
    expect(report).toContain("access-point count");
    expect(report).toContain("frozen");
  });
});

describe("Rule model gap report - required capability phrases", () => {
  it("includes every required model-capability phrase verbatim", () => {
    for (const phrase of REQUIRED_CAPABILITY_PHRASES) {
      expect(report, phrase).toContain(phrase);
    }
  });
});

describe("Rule model gap report - source hygiene", () => {
  it("keeps the report Markdown ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(report)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
