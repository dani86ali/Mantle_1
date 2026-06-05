import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  validateHoneywellRuleModelV2Artifacts,
  type HoneywellRuleModelV2ValidationReport,
} from "@/lib/projects/honeywell-rule-model-v2-validator";

/**
 * Tests for the deterministic Honeywell model-aware v2 rule artifact validator
 * (Prompt 52). The four committed JSON artifacts are read from disk and fed to the
 * validator: the positive case proves the validator passes on the current
 * candidate/pending v2 artifacts with the expected summary counts, and a set of
 * deep-cloned negative cases prove it deterministically catches the regressions the
 * reviewer cares about (approval leakage, non-pending decisions, pricing keys, and
 * the model re-expression being undone). The validator is also proven import-free
 * and both new files ASCII-only.
 */

const dataPath = (f: string) => join(process.cwd(), "data/config-expansion", f);
const V1_CAND = dataPath("honeywell-candidate-rules.json");
const V1_PACKET = dataPath("honeywell-rule-approval-packet.json");
const V2_CAND = dataPath("honeywell-candidate-rules-v2.json");
const V2_PACKET = dataPath("honeywell-rule-approval-packet-v2.json");
const SRC_PATH = join(
  process.cwd(),
  "src/lib/projects/honeywell-rule-model-v2-validator.ts"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-rule-model-v2-validator.test.ts"
);

// Pristine parsed artifacts. Negative cases clone these and mutate the clone only,
// so a mutation never leaks into a sibling test.
const v1Candidate = JSON.parse(readFileSync(V1_CAND, "utf8"));
const v1ApprovalPacket = JSON.parse(readFileSync(V1_PACKET, "utf8"));
const v2Candidate = JSON.parse(readFileSync(V2_CAND, "utf8"));
const v2ApprovalPacket = JSON.parse(readFileSync(V2_PACKET, "utf8"));

const clone = (v: unknown) => JSON.parse(JSON.stringify(v));

function findChild(pack: any, sku: string): any {
  for (const p of pack.parentRules ?? []) {
    for (const c of p.childLines ?? []) if (c.sku === sku) return c;
  }
  return undefined;
}

function findParent(pack: any, parentSku: string): any {
  return (pack.parentRules ?? []).find((p: any) => p.parentSku === parentSku);
}

// Validate the pristine base, overriding one artifact with a mutated clone.
function run(
  over: Partial<{
    v1Candidate: unknown;
    v1ApprovalPacket: unknown;
    v2Candidate: unknown;
    v2ApprovalPacket: unknown;
  }> = {}
): HoneywellRuleModelV2ValidationReport {
  return validateHoneywellRuleModelV2Artifacts({
    v1Candidate,
    v1ApprovalPacket,
    v2Candidate,
    v2ApprovalPacket,
    ...over,
  });
}

describe("Honeywell v2 validator - committed artifacts", () => {
  const report = run();

  it("passes with no errors on the current v2 artifacts", () => {
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it("reports the expected summary counts", () => {
    expect(report.summary).toEqual({
      parentRuleCount: 7,
      childLineCount: 53,
      optionGroupCount: 2,
      termOptionGroupCount: 8,
      replacementCandidateCount: 11,
      approvedTrueCount: 0,
      nonPendingReviewDecisionCount: 0,
    });
  });
});

describe("Honeywell v2 validator - negative cases", () => {
  const expectCatch = (
    report: HoneywellRuleModelV2ValidationReport,
    code: string
  ) => {
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.code === code)).toBe(true);
  };

  it("catches the v2 candidate status changed to approved", () => {
    const v2 = clone(v2Candidate);
    v2.status = "approved";
    expectCatch(run({ v2Candidate: v2 }), "V2_CANDIDATE_STATUS");
  });

  it("catches approved:true added to a child", () => {
    const v2 = clone(v2Candidate);
    findChild(v2, "LIC-CW-A").approved = true;
    expectCatch(run({ v2Candidate: v2 }), "APPROVED_TRUE");
  });

  it("catches a reviewDecision changed from pending", () => {
    const p = clone(v2ApprovalPacket);
    p.parentRuleReviews[0].childLineReviews[0].reviewDecision = "reject";
    expectCatch(run({ v2ApprovalPacket: p }), "REVIEW_DECISION_NOT_PENDING");
  });

  it("catches a pricing key added to the v2 candidate", () => {
    const v2 = clone(v2Candidate);
    findChild(v2, "LIC-CW-A").unitPrice = 100;
    expectCatch(run({ v2Candidate: v2 }), "PRICING_KEY");
  });

  it("catches LIC-CW-A reverted to a fixed-only rule with no quantityModel", () => {
    const v2 = clone(v2Candidate);
    delete findChild(v2, "LIC-CW-A").quantityModel;
    expectCatch(run({ v2Candidate: v2 }), "WIRELESS_LICENSE_QUANTITY_MODEL");
  });

  it("catches LIC-SPACES-ADV relatedSku moved off CW9178I-CFG", () => {
    const v2 = clone(v2Candidate);
    findChild(v2, "LIC-SPACES-ADV").quantityModel.relatedSku = "OTHER-AP";
    expectCatch(run({ v2Candidate: v2 }), "WIRELESS_LICENSE_QUANTITY_MODEL");
  });

  it("catches CAB-C15-CBN missing selected_option_count", () => {
    const v2 = clone(v2Candidate);
    findChild(v2, "CAB-C15-CBN").quantityModel.type = "fixed_per_parent";
    expectCatch(run({ v2Candidate: v2 }), "POWER_CABLE_QUANTITY_MODEL");
  });

  it("catches CAB-C15-CBN missing under C9300X-48HX-A even with child count preserved", () => {
    // Rename (not delete) the C9300X power cable: total child count is unchanged,
    // but the expected CAB-C15-CBN line is now absent under this switch parent.
    const v2 = clone(v2Candidate);
    const cab = findParent(v2, "C9300X-48HX-A").childLines.find(
      (c: any) => c.sku === "CAB-C15-CBN"
    );
    cab.sku = "CAB-C15-CBN-RENAMED";
    expectCatch(run({ v2Candidate: v2 }), "POWER_CABLE_LINE_PRESENCE");
  });

  it("catches CAB-C15-CBN missing under C9300L-24P-4X-A even with child count preserved", () => {
    const v2 = clone(v2Candidate);
    const cab = findParent(v2, "C9300L-24P-4X-A").childLines.find(
      (c: any) => c.sku === "CAB-C15-CBN"
    );
    cab.sku = "CAB-C15-CBN-RENAMED";
    expectCatch(run({ v2Candidate: v2 }), "POWER_CABLE_LINE_PRESENCE");
  });

  it("catches a duplicate CAB-C15-CBN under one expected switch parent", () => {
    const v2 = clone(v2Candidate);
    const parent = findParent(v2, "C9300X-48HX-A");
    const cab = parent.childLines.find((c: any) => c.sku === "CAB-C15-CBN");
    parent.childLines.push(clone(cab));
    expectCatch(run({ v2Candidate: v2 }), "POWER_CABLE_LINE_PRESENCE");
  });

  it("catches a missing AC PSU option group", () => {
    const v2 = clone(v2Candidate);
    v2.optionGroups = v2.optionGroups.filter(
      (g: any) => g.optionGroupId !== "c9300x-ac-power-supplies"
    );
    expectCatch(run({ v2Candidate: v2 }), "OPTION_GROUP_MISSING");
  });

  it("catches an invented 5Y SKU in a term option group", () => {
    const v2 = clone(v2Candidate);
    v2.termOptionGroups[0].optionSkus.push("C9300-DNA-A-48-5Y");
    expectCatch(run({ v2Candidate: v2 }), "TERM_GROUP_INVENTED_SKU");
  });

  it("catches a replacement note that omits the no-silent-replacement warning", () => {
    const v2 = clone(v2Candidate);
    v2.replacementCandidates[0].notes =
      "Historical-to-current SKU mapping for review only.";
    expectCatch(run({ v2Candidate: v2 }), "REPLACEMENT_SILENT_WARNING");
  });
});

describe("Honeywell v2 validator - source hygiene", () => {
  const src = readFileSync(SRC_PATH, "utf8");

  it("imports nothing (no filesystem, DB, catalog, pricing, AI, API/UI/coordinator, or artifact-store)", () => {
    const importSources: string[] = [];
    const importRegex = /\bfrom\s+["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(src)) !== null) {
      importSources.push(match[1]);
    }
    expect(importSources).toEqual([]);
  });

  it("uses no Date or Math.random call (deterministic)", () => {
    // Match actual non-deterministic CALLS (trailing parenthesis), so the
    // module's own "no Date/Math.random" documentation comment is not flagged.
    expect(/Math\.random\s*\(/.test(src)).toBe(false);
    expect(/new\s+Date\s*\(/.test(src)).toBe(false);
    expect(/Date\.now\s*\(/.test(src)).toBe(false);
  });

  it("keeps the validator source ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(src)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const test = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});
