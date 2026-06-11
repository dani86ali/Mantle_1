import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { composeApprovedConfigExpansionRulePacks } from "@/lib/projects/config-expansion-rule-pack-composer";
import { buildConfigurationExpansionDraft, type ConfigurationExpansionDraft } from "@/lib/projects/config-expansion";
import type { CanonicalBoqLine, SkuResolutionDecision } from "@/types/project";
import type {
  ConfigExpansionChildRule,
  ConfigExpansionEvidenceCitation,
  ConfigExpansionOptionGroup,
  ConfigExpansionParentRule,
  ConfigExpansionRulePack,
} from "@/lib/projects/config-expansion-types";

/**
 * Behavior tests for the approved rule-pack composer. The composer merges
 * separately-approved packs by parentSku so the Honeywell Batch 1 + Batch 2 + Batch 3
 * approved packs - which intentionally share parents (C9300X-48HX-A and
 * C9300L-24P-4X-A across all three batches; CISCO-NETWORK-SUB across Batch 1 + Batch 2;
 * CW9178I-CFG across Batch 2 + Batch 3) - compose into one in-memory approved pack that
 * buildConfigurationExpansionDraft accepts without duplicate-parent-SKU or
 * sourceRuleId-mismatch errors. It approves nothing new, introduces no replacement
 * handling, and carries no pricing authority. Committed packs are read from disk and
 * never mutated by these tests.
 */

const COMPOSER_PATH = join(process.cwd(), "src/lib/projects/config-expansion-rule-pack-composer.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/config-expansion-rule-pack-composer.test.ts");
const dataPath = (f: string) => join(process.cwd(), "data/config-expansion", f);

const RULE_PACK_ID = "honeywell-mvp-composed-batch1-batch2-batch3";

// Fresh parses so any test that mutates never corrupts another (advisor guidance).
function freshBatch1(): ConfigExpansionRulePack {
  return JSON.parse(readFileSync(dataPath("honeywell-batch1-approved-rules.json"), "utf8")) as ConfigExpansionRulePack;
}
function freshBatch2(): ConfigExpansionRulePack {
  return JSON.parse(readFileSync(dataPath("honeywell-batch2-approved-rules.json"), "utf8")) as ConfigExpansionRulePack;
}
function freshBatch3(): ConfigExpansionRulePack {
  return JSON.parse(readFileSync(dataPath("honeywell-batch3-approved-rules.json"), "utf8")) as ConfigExpansionRulePack;
}

function composeBatches(
  overrides: Partial<Parameters<typeof composeApprovedConfigExpansionRulePacks>[0]> = {},
): ConfigExpansionRulePack {
  return composeApprovedConfigExpansionRulePacks({
    rulePackId: RULE_PACK_ID,
    name: "Honeywell MVP Composed Batch 1 + Batch 2 + Batch 3 (in-memory)",
    version: "1.0.0",
    sourceScope: "Honeywell MVP / Batch 1 + Batch 2 + Batch 3 (composed)",
    rulePacks: [freshBatch1(), freshBatch2(), freshBatch3()],
    ...overrides,
  });
}

// Shared read-only composition for the happy-path assertions.
const composed = composeBatches();

// First-seen parentSku union across [Batch 1, Batch 2, Batch 3]. Batch 3 adds no new
// parent SKU (all three of its parents already appear in Batch 1 or Batch 2), so the
// parent order is unchanged from the Batch 1 + Batch 2 composition.
const EXPECTED_PARENT_ORDER = [
  "CISCO-NETWORK-SUB",
  "C9300X-48HX-A",
  "C9300L-24P-4X-A",
  "CW9178I-CFG",
  "CP-7841-K9=",
];

const B1_C9300X = ["PWR-C1-1100WAC-P", "PWR-C1-1100WAC-P/2", "CAB-C15-CBN"];
const B2_C9300X = [
  "CON-L1NCD-C9300XY4", "C9300-DNA-A-48", "CON-L1SWT-C93A48", "C9300-DNA-A-48-3Y",
  "TE-EMBEDDED-T", "TE-EMBEDDED-T-3Y", "D-DNAS-EXT-S-T", "D-DNAS-EXT-S-3Y",
  "C9300-NW-A-48", "SC9300UK9-1715", "TE-C9K-SW", "NETWORK-PNP-LIC",
];
const B3_C9300X = [
  "C9300-SSD-NONE", "STACK-T1-50CM", "CAB-SPWR-30CM", "C9K-ACC-RBFT",
  "C9K-ACC-SCR-4", "CAB-GUIDE-1RU", "C9300X-NM-8Y",
];
const B1_C9300L = ["PWR-C1-715WAC-P", "PWR-C1-715WAC-P/2", "CAB-C15-CBN"];
const B2_C9300L = [
  "CON-L1NCD-C93024PX", "C9300L-DNA-A-24", "CON-L1SWT-C93LA24", "C9300L-DNA-A-24-3Y",
  "TE-EMBEDDED-T", "TE-EMBEDDED-T-3Y", "D-DNAS-EXT-S-T", "D-DNAS-EXT-S-3Y",
  "S9300LUK9-1718", "C9300L-NW-A-24", "TE-C9K-SW", "NETWORK-PNP-LIC",
];
const B3_C9300L = [
  "FAN-T2", "C9300L-SSD-NONE", "C9K-ACC-RBFT", "C9K-ACC-SCR-4",
  "CAB-GUIDE-1RU", "C9300L-STACK-KIT2", "C9300L-STACK-A", "STACK-T3A-50CM",
];
// Batch 3 wireless mounting/bracket/single-pack accessories under CW9178I-CFG.
const B3_CW9178 = ["AIR-AP-BRACKET-2", "AIR-AP-T-RAIL-F", "CW9178-SINGLE"];
const PRICING_TOKENS = ["price", "cost", "discount", "margin", "markup", "vat", "currency", "msrp", "sell", "amount"];

function parentBySku(pack: ConfigExpansionRulePack, sku: string): ConfigExpansionParentRule | undefined {
  return pack.parentRules.find((p) => p.parentSku === sku);
}
function childSkus(pack: ConfigExpansionRulePack, sku: string): string[] {
  return (parentBySku(pack, sku)?.childLines ?? []).map((c) => c.sku);
}
function composedChild(parentSku: string, childSku: string): ConfigExpansionChildRule | undefined {
  return parentBySku(composed, parentSku)?.childLines.find((c) => c.sku === childSku);
}

// --- Synthetic approved fixtures for targeted rejection tests ---------------
// Each rejection fixture breaks exactly one field so the thrown error is provably
// the one under test (advisor guidance).

function citation(): ConfigExpansionEvidenceCitation {
  return { sourceType: "ccw_export", sourcePath: "C:/fixture.xlsx", sheetName: "S", lineNumber: 1, evidenceNote: "note" };
}
function childRule(over: Partial<ConfigExpansionChildRule> = {}): ConfigExpansionChildRule {
  return {
    sku: "CHILD-1",
    description: "Child one",
    relationshipType: "service_or_support",
    quantityRule: "same_as_parent",
    includedItem: false,
    sourceRuleId: "rule-a",
    evidence: [citation()],
    approvalRequired: false,
    approved: true,
    ...over,
  };
}
function parentRule(over: Partial<ConfigExpansionParentRule> = {}): ConfigExpansionParentRule {
  return {
    ruleId: "rule-a",
    parentSku: "PARENT-A",
    parentDescription: "Parent A",
    evidence: [citation()],
    childLines: [childRule()],
    approvalRequired: false,
    approved: true,
    ...over,
  };
}
function approvedInputPack(over: Partial<ConfigExpansionRulePack> = {}): ConfigExpansionRulePack {
  return {
    rulePackId: "src-pack",
    name: "Source pack",
    version: "1.0.0",
    status: "approved",
    approvalRequired: false,
    sourceScope: "fixture",
    parentRules: [parentRule()],
    ...over,
  };
}
function optionGroup(over: Partial<ConfigExpansionOptionGroup> = {}): ConfigExpansionOptionGroup {
  return {
    optionGroupId: "g1",
    label: "Group 1",
    selectionMode: "multi_select",
    required: true,
    engineerReviewRequired: true,
    optionSkus: ["A", "B"],
    ...over,
  };
}
function composePacks(...packs: ConfigExpansionRulePack[]): ConfigExpansionRulePack {
  return composeApprovedConfigExpansionRulePacks({
    rulePackId: "out", name: "out", version: "1.0.0", sourceScope: "s", rulePacks: packs,
  });
}

// --- BoQ / decision helpers for runtime-expansion smoke tests --------------

function boqLine(row: number, sku: string, quantity: number): CanonicalBoqLine {
  return {
    sourceFormat: "format_2_number_part_qty",
    sourceFileId: "file-1",
    sourceRowNumber: row,
    originalLineNumber: String(row),
    sku,
    description: sku,
    quantity,
    originalCells: { "#": String(row), "Part Number": sku },
  };
}
function acceptDecision(row: number, sku: string): SkuResolutionDecision {
  return {
    sourceFileId: "file-1",
    sourceRowNumber: row,
    originalLineNumber: String(row),
    originalSku: sku,
    status: "accepted",
    suggestions: [],
    acceptedSku: sku,
  };
}
function expand(rows: Array<[number, string, number]>): ConfigurationExpansionDraft {
  return buildConfigurationExpansionDraft({
    lines: rows.map(([r, s, q]) => boqLine(r, s, q)),
    decisions: rows.map(([r, s]) => acceptDecision(r, s)),
    rulePack: composed,
  });
}
function added(draft: ConfigurationExpansionDraft) {
  return draft.lines.filter((l) => l.origin === "expansion");
}
function addedQty(draft: ConfigurationExpansionDraft, sku: string): number | undefined {
  return added(draft).find((l) => l.sku === sku)?.quantity;
}

// --- Composed pack shape ----------------------------------------------------

describe("composeApprovedConfigExpansionRulePacks - composed pack shape", () => {
  it("returns an approved, no-further-approval-required pack with the supplied metadata", () => {
    expect(composed.status).toBe("approved");
    expect(composed.approvalRequired).toBe(false);
    expect(composed.rulePackId).toBe(RULE_PACK_ID);
    expect(composed.version).toBe("1.0.0");
    expect(composed.sourceScope).toBe("Honeywell MVP / Batch 1 + Batch 2 + Batch 3 (composed)");
  });

  it("emits one parent per parentSku in first-seen union order (no duplicate shared parents)", () => {
    expect(composed.parentRules.map((p) => p.parentSku)).toEqual(EXPECTED_PARENT_ORDER);
    expect(new Set(composed.parentRules.map((p) => p.parentSku)).size).toBe(composed.parentRules.length);
  });

  it("uses the composed parent ruleId convention and rewrites every child sourceRuleId to it", () => {
    for (const p of composed.parentRules) {
      expect(p.ruleId).toBe(`${RULE_PACK_ID}::${p.parentSku}`);
      for (const c of p.childLines) {
        expect(c.sourceRuleId, `${p.parentSku}/${c.sku}`).toBe(p.ruleId);
      }
    }
  });
});

// --- Merged child sets ------------------------------------------------------

describe("composeApprovedConfigExpansionRulePacks - merged child sets", () => {
  it("merges C9300X-48HX-A: Batch 1 power, then Batch 2 software/support, then Batch 3 hardware/accessories", () => {
    expect(childSkus(composed, "C9300X-48HX-A")).toEqual([...B1_C9300X, ...B2_C9300X, ...B3_C9300X]);
  });

  it("merges C9300L-24P-4X-A: Batch 1 power, then Batch 2 software/support, then Batch 3 hardware/accessories", () => {
    expect(childSkus(composed, "C9300L-24P-4X-A")).toEqual([...B1_C9300L, ...B2_C9300L, ...B3_C9300L]);
  });

  it("merges CISCO-NETWORK-SUB: Batch 1 wireless licenses then the Batch 2 support line, in order", () => {
    expect(childSkus(composed, "CISCO-NETWORK-SUB")).toEqual(["LIC-CW-A", "LIC-SPACES-ADV", "SVS-L0SPT-CN"]);
  });

  it("merges CW9178I-CFG: the Batch 2 support attach then the Batch 3 wireless accessories, in order", () => {
    expect(childSkus(composed, "CW9178I-CFG")).toEqual(["CON-ROB-CW9178IC", ...B3_CW9178]);
  });

  it("carries the Batch 2-only CP-7841-K9= parent and its single child", () => {
    expect(childSkus(composed, "CP-7841-K9=")).toEqual(["CON-L1NBD-P7PK94P1"]);
  });
});

// --- Child authority property preservation ----------------------------------
// Positive field checks: the Honeywell smoke quantities coincide with the frozen v1
// fallbacks, so they alone cannot prove the advanced model fields survived the merge.
// These assert the fields directly so the test verifies the spec, not the coincidence.

describe("composeApprovedConfigExpansionRulePacks - preserves child authority properties", () => {
  it("preserves the Batch 1 wireless-license advanced quantity model and duplicate policy", () => {
    const lic = composedChild("CISCO-NETWORK-SUB", "LIC-CW-A");
    expect(lic?.quantityModel).toEqual({ type: "same_as_related_sku_total", relatedSku: "CW9178I-CFG", scope: "project" });
    expect(lic?.duplicatePolicy).toEqual({ scope: "project_sku", match: "sku", quantitySatisfaction: "existing_satisfies_required" });
    expect(lic?.relationshipType).toBe("subscription");
    expect(lic?.evidenceScope).toBe("reusable_logic");
  });

  it("preserves the Batch 1 selected-option power-cord model and its frozen v1 quantity fields", () => {
    const cab = composedChild("C9300X-48HX-A", "CAB-C15-CBN");
    expect(cab?.quantityModel).toEqual({ type: "selected_option_count", optionGroupId: "c9300x-ac-power-supplies" });
    expect(cab?.quantityRule).toBe("fixed_per_parent");
    expect(cab?.quantityValue).toBe(2);
    expect(cab?.evidenceScope).toBe("needs_more_evidence");
    expect(typeof cab?.reviewNotes).toBe("string");
  });

  it("preserves the Batch 1 included zero-price PSU option line", () => {
    const psu = composedChild("C9300X-48HX-A", "PWR-C1-1100WAC-P");
    expect(psu?.includedItem).toBe(true);
    expect(psu?.optionGroupId).toBe("c9300x-ac-power-supplies");
    expect(psu?.relationshipType).toBe("included_zero_price");
  });

  it("preserves the Batch 2 term-coupled support term (36 months)", () => {
    const support = composedChild("C9300X-48HX-A", "CON-L1NCD-C9300XY4");
    expect(support?.termMonths).toBe(36);
    expect(support?.relationshipType).toBe("service_or_support");
  });

  it("preserves the Batch 3 fixed_per_parent fan-module multiplier (x3) and zero-price policy", () => {
    const fan = composedChild("C9300L-24P-4X-A", "FAN-T2");
    expect(fan?.quantityRule).toBe("fixed_per_parent");
    expect(fan?.quantityValue).toBe(3);
    expect(fan?.includedItem).toBe(true);
    expect(fan?.relationshipType).toBe("included_zero_price");
    expect(fan?.evidenceScope).toBe("quote_observed");
  });

  it("preserves the Batch 3 fixed_per_parent stack-module multiplier (x2) and zero-price policy", () => {
    const stack = composedChild("C9300L-24P-4X-A", "C9300L-STACK-A");
    expect(stack?.quantityRule).toBe("fixed_per_parent");
    expect(stack?.quantityValue).toBe(2);
    expect(stack?.includedItem).toBe(true);
    expect(stack?.relationshipType).toBe("included_zero_price");
  });

  it("preserves a Batch 3 default-selected wireless accessory under CW9178I-CFG", () => {
    const bracket = composedChild("CW9178I-CFG", "AIR-AP-BRACKET-2");
    expect(bracket?.relationshipType).toBe("default_selected");
    expect(bracket?.quantityRule).toBe("same_as_parent");
    expect(bracket?.includedItem).toBe(false);
    expect(bracket?.evidenceScope).toBe("reusable_logic");
  });

  it("preserves the Batch 3 default-selected uplink network module under C9300X-48HX-A", () => {
    const nm = composedChild("C9300X-48HX-A", "C9300X-NM-8Y");
    expect(nm?.relationshipType).toBe("default_selected");
    expect(nm?.quantityRule).toBe("same_as_parent");
    expect(nm?.includedItem).toBe(false);
    expect(nm?.evidenceScope).toBe("reusable_logic");
  });
});

// --- Evidence, option groups, createdFromEvidence ---------------------------

describe("composeApprovedConfigExpansionRulePacks - evidence and tables", () => {
  it("preserves the two Batch 1 option groups structurally, with no others", () => {
    const ids = (composed.optionGroups ?? []).map((g) => g.optionGroupId).sort();
    expect(ids).toEqual(["c9300l-ac-power-supplies", "c9300x-ac-power-supplies"]);
    const b1 = freshBatch1();
    for (const g of composed.optionGroups ?? []) {
      expect(g).toEqual((b1.optionGroups ?? []).find((x) => x.optionGroupId === g.optionGroupId));
    }
  });

  it("emits no termOptionGroups (neither batch defines any)", () => {
    expect(composed.termOptionGroups).toBeUndefined();
  });

  it("dedupes structurally-identical parent evidence first-seen", () => {
    for (const p of composed.parentRules) {
      for (let i = 0; i < p.evidence.length; i++) {
        for (let j = i + 1; j < p.evidence.length; j++) {
          expect(p.evidence[i], `${p.parentSku} evidence ${i}/${j}`).not.toEqual(p.evidence[j]);
        }
      }
    }
  });

  it("unions createdFromEvidence first-seen across all three batches and dedupes shared sources", () => {
    const cfe = composed.createdFromEvidence ?? [];
    expect(cfe).toHaveLength(10);
    expect(cfe.filter((e) => e.sourceType === "ccw_export")).toHaveLength(1);
    // Batch 2 marker (IP Phone data sheet) and Batch 3 marker (wireless install guide)
    // both present, proving all three batches contributed to the union.
    expect(cfe.some((e) => e.sourcePath.includes("Cisco IP Phone 7800 Series Data Sheet.pdf"))).toBe(true);
    expect(cfe.some((e) => e.sourceType === "install_guide")).toBe(true);
  });

  it("uses a supplied createdFromEvidence verbatim (deep-copied) when provided", () => {
    const supplied = [{ sourceType: "ordering_guide" as const, sourcePath: "C:/only.pdf", title: "Only source" }];
    const c = composeBatches({ createdFromEvidence: supplied });
    expect(c.createdFromEvidence).toEqual(supplied);
    expect(c.createdFromEvidence).not.toBe(supplied);
  });
});

// --- No pricing / no replacements -------------------------------------------

describe("composeApprovedConfigExpansionRulePacks - authority boundaries", () => {
  it("emits no replacementCandidates field", () => {
    expect(composed.replacementCandidates).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(composed, "replacementCandidates")).toBe(false);
  });

  it("carries no pricing-authority key anywhere in the composed pack", () => {
    const keys: string[] = [];
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const v of node) collect(v);
      } else if (node !== null && typeof node === "object") {
        for (const k of Object.keys(node as Record<string, unknown>)) {
          keys.push(k);
          collect((node as Record<string, unknown>)[k]);
        }
      }
    };
    collect(composed);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      for (const token of PRICING_TOKENS) {
        expect(key.toLowerCase().includes(token), `key "${key}" contains pricing token "${token}"`).toBe(false);
      }
    }
  });
});

// --- Deep copy --------------------------------------------------------------

describe("composeApprovedConfigExpansionRulePacks - deep copy", () => {
  it("deep-copies sources: mutating the composed output does not mutate Batch 1/Batch 2/Batch 3", () => {
    const b1 = freshBatch1();
    const b2 = freshBatch2();
    const b3 = freshBatch3();
    const snap1 = JSON.stringify(b1);
    const snap2 = JSON.stringify(b2);
    const snap3 = JSON.stringify(b3);
    const c = composeApprovedConfigExpansionRulePacks({
      rulePackId: RULE_PACK_ID, name: "n", version: "1.0.0", sourceScope: "s", rulePacks: [b1, b2, b3],
    });
    for (const p of c.parentRules) {
      p.ruleId = "MUT";
      p.parentDescription = "MUT";
      for (const e of p.evidence) e.evidenceNote = "MUT";
      for (const ch of p.childLines) {
        ch.sku = "MUT";
        ch.sourceRuleId = "MUT";
        for (const e of ch.evidence) e.evidenceNote = "MUT";
      }
    }
    for (const g of c.optionGroups ?? []) {
      g.optionGroupId = "MUT";
      g.optionSkus.push("MUT");
    }
    expect(JSON.stringify(b1)).toBe(snap1);
    expect(JSON.stringify(b2)).toBe(snap2);
    expect(JSON.stringify(b3)).toBe(snap3);
  });
});

// --- Runtime expansion smoke (composed pack feeds buildConfigurationExpansionDraft) --

describe("composeApprovedConfigExpansionRulePacks - runtime expansion smoke", () => {
  it("is accepted by buildConfigurationExpansionDraft with no duplicate-parent or mismatch error", () => {
    expect(() => buildConfigurationExpansionDraft({ lines: [], decisions: [], rulePack: composed })).not.toThrow();
  });

  it("expands C9300X-48HX-A qty 7 into all 22 Batch 1 + Batch 2 + Batch 3 children", () => {
    const draft = expand([[1, "C9300X-48HX-A", 7]]);
    const skus = added(draft).map((l) => l.sku);
    expect(skus.slice().sort()).toEqual([...B1_C9300X, ...B2_C9300X, ...B3_C9300X].sort());
    expect(added(draft)).toHaveLength(22);
    // Batch 1 selected-option power cord follows the two AC PSUs (7 + 7); Batch 2 license tracks parent.
    expect(addedQty(draft, "CAB-C15-CBN")).toBe(14);
    expect(addedQty(draft, "C9300-DNA-A-48-3Y")).toBe(7);
    // Representative Batch 3 hardware line (uplink network module) tracks the parent.
    expect(addedQty(draft, "C9300X-NM-8Y")).toBe(7);
  });

  it("expands C9300L-24P-4X-A qty 6 into all 23 Batch 1 + Batch 2 + Batch 3 children", () => {
    const draft = expand([[1, "C9300L-24P-4X-A", 6]]);
    const skus = added(draft).map((l) => l.sku);
    expect(skus.slice().sort()).toEqual([...B1_C9300L, ...B2_C9300L, ...B3_C9300L].sort());
    expect(added(draft)).toHaveLength(23);
    expect(addedQty(draft, "CAB-C15-CBN")).toBe(12);
    expect(addedQty(draft, "C9300L-DNA-A-24-3Y")).toBe(6);
    // Batch 3 fixed_per_parent multipliers: FAN-T2 x3 and C9300L-STACK-A x2 of parent qty 6.
    expect(addedQty(draft, "FAN-T2")).toBe(18);
    expect(addedQty(draft, "C9300L-STACK-A")).toBe(12);
    // Representative Batch 3 same_as_parent accessory line.
    expect(addedQty(draft, "STACK-T3A-50CM")).toBe(6);
  });

  it("expands CW9178I-CFG qty 12 + CISCO-NETWORK-SUB qty 1 into wireless support, Batch 3 accessories, and subscription children", () => {
    const draft = expand([[1, "CW9178I-CFG", 12], [2, "CISCO-NETWORK-SUB", 1]]);
    expect(addedQty(draft, "CON-ROB-CW9178IC")).toBe(12);
    // Batch 3 wireless accessories under CW9178I-CFG track the access-point parent qty.
    expect(addedQty(draft, "AIR-AP-BRACKET-2")).toBe(12);
    expect(addedQty(draft, "AIR-AP-T-RAIL-F")).toBe(12);
    expect(addedQty(draft, "CW9178-SINGLE")).toBe(12);
    expect(addedQty(draft, "LIC-CW-A")).toBe(12);
    expect(addedQty(draft, "LIC-SPACES-ADV")).toBe(12);
    expect(addedQty(draft, "SVS-L0SPT-CN")).toBe(1);
    expect(added(draft)).toHaveLength(7);
  });

  it("expands CP-7841-K9= qty 59 into CON-L1NBD-P7PK94P1 qty 59", () => {
    const draft = expand([[1, "CP-7841-K9=", 59]]);
    expect(added(draft)).toHaveLength(1);
    expect(addedQty(draft, "CON-L1NBD-P7PK94P1")).toBe(59);
  });
});

// --- Rejections (one broken field per fixture) ------------------------------

describe("composeApprovedConfigExpansionRulePacks - rejection guards", () => {
  it("rejects when no input packs are supplied", () => {
    expect(() => composePacks()).toThrow(/at least one input pack/);
  });

  it("rejects a non-approved (candidate) pack", () => {
    expect(() => composePacks(approvedInputPack({ status: "candidate" }))).toThrow(/input pack status to be approved/);
  });

  it("rejects a pack that still requires approval", () => {
    expect(() => composePacks(approvedInputPack({ approvalRequired: true }))).toThrow(/approvalRequired to be false/);
  });

  it("rejects an unapproved parent rule", () => {
    expect(() => composePacks(approvedInputPack({ parentRules: [parentRule({ approved: false })] }))).toThrow(/parent rule to be approved/);
  });

  it("rejects a parent rule without evidence", () => {
    expect(() => composePacks(approvedInputPack({ parentRules: [parentRule({ evidence: [] })] }))).toThrow(/parent rule to carry evidence/);
  });

  it("rejects an unapproved child rule", () => {
    expect(() => composePacks(approvedInputPack({ parentRules: [parentRule({ childLines: [childRule({ approved: false })] })] }))).toThrow(/child rule to be approved/);
  });

  it("rejects a child rule without evidence", () => {
    expect(() => composePacks(approvedInputPack({ parentRules: [parentRule({ childLines: [childRule({ evidence: [] })] })] }))).toThrow(/child rule to carry evidence/);
  });

  it("rejects a child whose sourceRuleId does not match its source parent ruleId", () => {
    expect(() => composePacks(approvedInputPack({ parentRules: [parentRule({ childLines: [childRule({ sourceRuleId: "wrong" })] })] }))).toThrow(/sourceRuleId to match/);
  });

  it("rejects one parent ruleId mapped to two different parent SKUs", () => {
    const pack = approvedInputPack({
      parentRules: [
        parentRule({ ruleId: "dup", parentSku: "P1", childLines: [] }),
        parentRule({ ruleId: "dup", parentSku: "P2", childLines: [] }),
      ],
    });
    expect(() => composePacks(pack)).toThrow(/ruleId mapped to different parent SKUs/);
  });

  it("rejects a duplicate child SKU under one composed parent SKU", () => {
    const packA = approvedInputPack({ rulePackId: "a", parentRules: [parentRule({ ruleId: "ra", childLines: [childRule({ sku: "SHARED", sourceRuleId: "ra" })] })] });
    const packB = approvedInputPack({ rulePackId: "b", parentRules: [parentRule({ ruleId: "rb", childLines: [childRule({ sku: "SHARED", sourceRuleId: "rb" })] })] });
    expect(() => composePacks(packA, packB)).toThrow(/duplicate child SKU/);
  });

  it("rejects conflicting parent metadata for a shared parent SKU", () => {
    const packA = approvedInputPack({ rulePackId: "a", parentRules: [parentRule({ ruleId: "ra", childLines: [], parentDescription: "Description A" })] });
    const packB = approvedInputPack({ rulePackId: "b", parentRules: [parentRule({ ruleId: "rb", childLines: [], parentDescription: "Description B differs" })] });
    expect(() => composePacks(packA, packB)).toThrow(/conflicting parent/);
  });

  it("rejects a non-identical duplicate optionGroup definition", () => {
    const packA = approvedInputPack({ rulePackId: "a", parentRules: [parentRule({ childLines: [] })], optionGroups: [optionGroup()] });
    const packB = approvedInputPack({ rulePackId: "b", parentRules: [parentRule({ childLines: [] })], optionGroups: [optionGroup({ optionSkus: ["A", "C"] })] });
    expect(() => composePacks(packA, packB)).toThrow(/conflicting optionGroup/);
  });

  it("rejects a pack carrying replacementCandidates", () => {
    const pack = approvedInputPack({
      replacementCandidates: [
        { historicalSku: "OLD-SKU", currentSkus: ["NEW-SKU"], evidence: [citation()], evidenceScope: "quote_observed", approvalRequired: true, approved: false },
      ],
    });
    expect(() => composePacks(pack)).toThrow(/replacementCandidates/);
  });
});

// --- Hygiene ----------------------------------------------------------------

describe("composeApprovedConfigExpansionRulePacks - hygiene", () => {
  it("keeps the helper source ASCII-only", () => {
    const source = readFileSync(COMPOSER_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("imports only type-only symbols from config-expansion-types", () => {
    const source = readFileSync(COMPOSER_PATH, "utf8");
    const importRegex = /import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;
    const found: Array<{ typeOnly: boolean; from: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = importRegex.exec(source)) !== null) {
      found.push({ typeOnly: Boolean(m[1]), from: m[2] });
    }
    expect(found.length).toBeGreaterThan(0);
    for (const imp of found) {
      expect(imp.typeOnly, `import from "${imp.from}" must be type-only`).toBe(true);
      expect(imp.from, "only the config-expansion-types module may be imported").toBe(
        "@/lib/projects/config-expansion-types",
      );
    }
  });
});
