import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { buildConfigurationExpansionDraft } from "@/lib/projects/config-expansion";
import type { CanonicalBoqLine, SkuResolutionDecision } from "@/types/project";
import type { ConfigExpansionRulePack } from "@/lib/projects/config-expansion-types";

/**
 * Tests for the approved Honeywell MVP Batch 3 runtime rule pack
 * (data/config-expansion/honeywell-batch3-approved-rules.json). The pack is a NEW,
 * separate artifact authored from the explicit human Batch 3 approval (questions
 * 1-6 approved, including the FAN-T2 x3 and C9300L-STACK-A x2 fixed_per_parent
 * multipliers; questions 7-8 confirmed deferred/out of scope). It carries only the
 * Batch 3 non-term hardware/accessory runtime scope: exactly 18 child lines under
 * the three parents CW9178I-CFG, C9300X-48HX-A, and C9300L-24P-4X-A. It is NOT the
 * full 53-line Honeywell candidate pack, it is separate from the Batch 1 and Batch
 * 2 approved packs, and it defers optics and all replacement candidates. These
 * tests prove the pack is approved/partial/pricing-free, that no optic, historical
 * replacement, or Batch 1/Batch 2 child SKU leaks in, that default-selected lines
 * stay advisory engineer-review options (not universal Cisco logic), that the
 * source candidate and packet artifacts plus the Batch 1/Batch 2 packs are
 * untouched, and that the pack expands deterministically under the runtime
 * evaluator. The committed pack is read from disk and never mutated.
 */

const dataPath = (f: string) => join(process.cwd(), "data/config-expansion", f);
const PACK_PATH = dataPath("honeywell-batch3-approved-rules.json");
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-batch3-approved-rules.test.ts"
);

// Parsed as `any`: the pack carries authoring metadata (approval/derivedFrom)
// beyond the ConfigExpansionRulePack contract, and the evaluator's own
// validateRulePack is the real structural gate (exercised by the smoke test).
const packRaw = readFileSync(PACK_PATH, "utf8");
const pack: any = JSON.parse(packRaw);

const PARENT_SKUS = ["CW9178I-CFG", "C9300X-48HX-A", "C9300L-24P-4X-A"];

// Approved Batch 3 children per parent, in approval-packet order. Note three SKUs
// (C9K-ACC-RBFT, C9K-ACC-SCR-4, CAB-GUIDE-1RU) appear under BOTH switches, so the
// pack has 18 child LINES across 15 distinct SKUs.
const CW9178I_CHILDREN = ["AIR-AP-BRACKET-2", "AIR-AP-T-RAIL-F", "CW9178-SINGLE"];
const C9300X_CHILDREN = [
  "C9300-SSD-NONE", "STACK-T1-50CM", "CAB-SPWR-30CM",
  "C9K-ACC-RBFT", "C9K-ACC-SCR-4", "CAB-GUIDE-1RU", "C9300X-NM-8Y",
];
const C9300L_CHILDREN = [
  "FAN-T2", "C9300L-SSD-NONE", "C9K-ACC-RBFT", "C9K-ACC-SCR-4",
  "CAB-GUIDE-1RU", "C9300L-STACK-KIT2", "C9300L-STACK-A", "STACK-T3A-50CM",
];
const CHILDREN_BY_PARENT: Record<string, string[]> = {
  "CW9178I-CFG": CW9178I_CHILDREN,
  "C9300X-48HX-A": C9300X_CHILDREN,
  "C9300L-24P-4X-A": C9300L_CHILDREN,
};
const TOTAL_CHILD_LINES = 18;

// The two confirmed fixed_per_parent multipliers (both under the C9300L switch).
const FIXED_PER_PARENT: Array<[string, string, number]> = [
  ["C9300L-24P-4X-A", "FAN-T2", 3],
  ["C9300L-24P-4X-A", "C9300L-STACK-A", 2],
];

// Deferred / out-of-scope SKUs that must not appear ANYWHERE in the raw pack.
const OPTIC_SKUS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];
const HISTORICAL_REPLACEMENT_SKUS = [
  "C9300-DNX-A-48-3Y", "C9300L-DNX-A-24-3Y", "SC9300UK9-1712", "S9300LUK9-1712",
  "SPACES-EXT-S", "CON-L1NBX-C9300XY4", "CON-L1SWX-93XA48MY", "CON-L1NBX-C93024PX",
  "CON-L1SWX-3LXA24MY", "CON-SNT-P7PK94P1", "C9300L-STACK-BLANK",
];
// Batch 1 and Batch 2 child SKUs must not reappear as Batch 3 children.
const BATCH1_CHILD_SKUS = [
  "LIC-CW-A", "LIC-SPACES-ADV", "CAB-C15-CBN",
  "PWR-C1-1100WAC-P", "PWR-C1-1100WAC-P/2", "PWR-C1-715WAC-P", "PWR-C1-715WAC-P/2",
];
const BATCH2_CHILD_SKUS = [
  "CON-L1NCD-C9300XY4", "C9300-DNA-A-48", "CON-L1SWT-C93A48", "C9300-DNA-A-48-3Y",
  "TE-EMBEDDED-T", "TE-EMBEDDED-T-3Y", "D-DNAS-EXT-S-T", "D-DNAS-EXT-S-3Y",
  "C9300-NW-A-48", "SC9300UK9-1715", "TE-C9K-SW", "NETWORK-PNP-LIC",
  "CON-L1NCD-C93024PX", "C9300L-DNA-A-24", "CON-L1SWT-C93LA24", "C9300L-DNA-A-24-3Y",
  "S9300LUK9-1718", "C9300L-NW-A-24", "CON-ROB-CW9178IC", "SVS-L0SPT-CN",
  "CON-L1NBD-P7PK94P1",
];
const PRICING_TOKENS = [
  "price", "cost", "discount", "margin", "markup", "vat", "currency", "msrp", "sell", "amount",
];

function parents(): any[] {
  return Array.isArray(pack.parentRules) ? pack.parentRules : [];
}
function parentBySku(sku: string): any {
  return parents().find((p: any) => p.parentSku === sku);
}
function childSkus(parentSku: string): string[] {
  return (parentBySku(parentSku)?.childLines ?? []).map((c: any) => c.sku);
}
function child(parentSku: string, childSku: string): any {
  return (parentBySku(parentSku)?.childLines ?? []).find((c: any) => c.sku === childSku);
}
function allChildren(): any[] {
  return parents().flatMap((p: any) => p.childLines ?? []);
}
function allChildSkus(): string[] {
  return allChildren().map((c: any) => c.sku);
}

// --- Pack metadata ----------------------------------------------------------

describe("honeywell batch 3 approved pack - metadata", () => {
  it("is present and valid JSON", () => {
    expect(existsSync(PACK_PATH)).toBe(true);
    expect(pack).toBeTruthy();
    expect(typeof pack).toBe("object");
  });

  it("declares the expected id and version", () => {
    expect(pack.rulePackId).toBe("honeywell-batch3-approved-rules");
    expect(pack.version).toBe("1.0.0");
  });

  it("is an approved, no-further-approval-required runtime pack", () => {
    expect(pack.status).toBe("approved");
    expect(pack.approvalRequired).toBe(false);
  });

  it("scopes itself to Honeywell MVP / Batch 3", () => {
    expect(pack.sourceScope).toBe("Honeywell MVP / Batch 3");
  });

  it("records the partial-approval and deferral notes", () => {
    const notes = String(pack.notes).toLowerCase();
    for (const token of [
      "partial", "batch 3", "batch 1", "batch 2", "53", "deferred",
      "optics", "replacement", "silent sku substitution", "pricing",
      "unchanged", "candidate", "not broad cisco-general",
    ]) {
      expect(notes, token).toContain(token);
    }
  });

  it("records the recorded human Batch 3 approval decision", () => {
    expect(pack.approval.batch).toBe("batch-3");
    expect(pack.approval.scope).toBe("honeywell_mvp_batch_3");
    const decision = String(pack.approval.decision).toLowerCase();
    expect(decision).toContain("approve batch 3");
    expect(decision).toContain("questions 1-6");
    expect(decision).toContain("7-8");
    expect(decision).toContain("fan-t2 x3");
    expect(decision).toContain("c9300l-stack-a x2");
  });
});

// --- Parent rules: exactly the three Batch 3 parents ------------------------

describe("honeywell batch 3 approved pack - parent rules", () => {
  it("contains exactly the three Batch 3 parent rules and no others", () => {
    expect(parents()).toHaveLength(3);
    expect(parents().map((p: any) => p.parentSku).sort()).toEqual([...PARENT_SKUS].sort());
  });

  it("approves every parent rule with no further approval required, each with evidence", () => {
    for (const p of parents()) {
      expect(p.approved, `${p.parentSku} approved`).toBe(true);
      expect(p.approvalRequired, `${p.parentSku} approvalRequired`).toBe(false);
      expect(Array.isArray(p.evidence) && p.evidence.length >= 1, `${p.parentSku} evidence`).toBe(true);
    }
  });

  it("carries exactly 18 approved child lines, each with evidence and a sourceRuleId", () => {
    const children = allChildren();
    expect(children.length).toBe(TOTAL_CHILD_LINES);
    for (const c of children) {
      expect(c.approved, `${c.sku} approved`).toBe(true);
      expect(c.approvalRequired, `${c.sku} approvalRequired`).toBe(false);
      expect(Array.isArray(c.evidence) && c.evidence.length >= 1, `${c.sku} evidence`).toBe(true);
      expect(typeof c.sourceRuleId === "string" && c.sourceRuleId.length > 0, `${c.sku} sourceRuleId`).toBe(true);
    }
  });

  it("each child sourceRuleId matches its parent ruleId", () => {
    for (const p of parents()) {
      for (const c of p.childLines ?? []) {
        expect(c.sourceRuleId, `${p.parentSku}/${c.sku}`).toBe(p.ruleId);
      }
    }
  });
});

// --- Exact child SKU sets per parent ----------------------------------------

describe("honeywell batch 3 approved pack - exact child SKU sets", () => {
  it("CW9178I-CFG carries exactly its 3 wireless accessory children", () => {
    expect(childSkus("CW9178I-CFG").slice().sort()).toEqual([...CW9178I_CHILDREN].sort());
    expect(childSkus("CW9178I-CFG")).toHaveLength(3);
  });

  it("C9300X-48HX-A carries exactly its 7 Batch 3 children", () => {
    expect(childSkus("C9300X-48HX-A").slice().sort()).toEqual([...C9300X_CHILDREN].sort());
    expect(childSkus("C9300X-48HX-A")).toHaveLength(7);
  });

  it("C9300L-24P-4X-A carries exactly its 8 Batch 3 children", () => {
    expect(childSkus("C9300L-24P-4X-A").slice().sort()).toEqual([...C9300L_CHILDREN].sort());
    expect(childSkus("C9300L-24P-4X-A")).toHaveLength(8);
  });
});

// --- Default-selected lines stay advisory, not universal Cisco logic ---------

describe("honeywell batch 3 approved pack - default-selected discipline", () => {
  it("splits the 18 lines into 9 default-selected and 9 included-zero-price", () => {
    const ds = allChildren().filter((c: any) => c.relationshipType === "default_selected");
    const iz = allChildren().filter((c: any) => c.relationshipType === "included_zero_price");
    expect(ds).toHaveLength(9);
    expect(iz).toHaveLength(9);
  });

  it("keeps every default-selected line approved but carrying an advisory engineer-review note", () => {
    for (const c of allChildren().filter((x: any) => x.relationshipType === "default_selected")) {
      expect(c.approved, `${c.sku} approved`).toBe(true);
      expect(c.includedItem, `${c.sku} includedItem`).toBe(false);
      const notes = String(c.reviewNotes ?? "").toLowerCase();
      // Advisory option, explicitly NOT broadened into universal Cisco logic.
      expect(notes, `${c.sku} engineer-review note`).toContain("engineer-review");
      expect(notes, `${c.sku} universal caveat`).toContain("universal");
    }
  });
});

// --- Fixed_per_parent multipliers -------------------------------------------

describe("honeywell batch 3 approved pack - quantity multipliers", () => {
  it("carries FAN-T2 and C9300L-STACK-A as the only fixed_per_parent lines, with the approved multipliers", () => {
    for (const [parentSku, childSku, value] of FIXED_PER_PARENT) {
      const c = child(parentSku, childSku);
      expect(c?.quantityRule, `${childSku} quantityRule`).toBe("fixed_per_parent");
      expect(c?.quantityValue, `${childSku} quantityValue`).toBe(value);
    }
    const fixed = allChildren().filter((c: any) => c.quantityRule === "fixed_per_parent");
    expect(fixed.map((c: any) => c.sku).sort()).toEqual(["C9300L-STACK-A", "FAN-T2"]);
  });

  it("keeps every other child line same_as_parent with no quantityValue", () => {
    for (const c of allChildren()) {
      if (c.sku === "FAN-T2" || c.sku === "C9300L-STACK-A") continue;
      expect(c.quantityRule, `${c.sku} quantityRule`).toBe("same_as_parent");
      expect(c.quantityValue, `${c.sku} quantityValue`).toBeUndefined();
    }
  });
});

// --- Out-of-scope lines stay out --------------------------------------------

describe("honeywell batch 3 approved pack - out-of-scope lines excluded", () => {
  it("encodes no optionGroups, termOptionGroups, replacementCandidates, or deferred section", () => {
    expect(pack.optionGroups).toBeUndefined();
    expect(pack.termOptionGroups).toBeUndefined();
    expect(pack.replacementCandidates).toBeUndefined();
    expect(pack.deferred).toBeUndefined();
  });

  it("omits both deferred optics entirely", () => {
    for (const optic of OPTIC_SKUS) {
      expect(allChildSkus(), optic).not.toContain(optic);
      expect(packRaw.includes(optic), optic).toBe(false);
    }
  });

  it("omits every historical replacement SKU entirely", () => {
    for (const sku of HISTORICAL_REPLACEMENT_SKUS) {
      expect(allChildSkus(), sku).not.toContain(sku);
      expect(packRaw.includes(sku), sku).toBe(false);
    }
  });

  it("omits every Batch 1 and Batch 2 child SKU", () => {
    const childSet = new Set(allChildSkus());
    for (const s of [...BATCH1_CHILD_SKUS, ...BATCH2_CHILD_SKUS]) {
      expect(childSet.has(s), s).toBe(false);
    }
  });
});

// --- Pricing authority stays out (key-only check) ---------------------------

describe("honeywell batch 3 approved pack - no pricing authority", () => {
  it("carries no pricing key anywhere in the pack", () => {
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
    collect(pack);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      for (const token of PRICING_TOKENS) {
        expect(key.toLowerCase().includes(token), `key "${key}" contains pricing token "${token}"`).toBe(false);
      }
    }
  });
});

// --- Source candidate / packet / Batch 1 / Batch 2 artifacts unchanged ------

describe("honeywell batch 3 approved pack - source artifacts untouched", () => {
  const read = (f: string) => JSON.parse(readFileSync(dataPath(f), "utf8"));

  it("leaves the v2 candidate pack candidate and approval-required", () => {
    const c = read("honeywell-candidate-rules-v2.json");
    expect(c.rulePackId).toBe("honeywell-candidate-rules-v2");
    expect(c.status).toBe("candidate");
    expect(c.approvalRequired).toBe(true);
    expect(c.sourceScope).toBe("honeywell_current_ccw_2026_06_02");
  });

  it("leaves the Batch 3 approval packet pending and review-only", () => {
    const p = read("honeywell-batch3-approval-packet.json");
    expect(p.packetId).toBe("honeywell-batch3-approval-packet");
    expect(p.status).toBe("pending_human_approval");
    expect(p.reviewOnly).toBe(true);
    expect(p.runtimeAuthority).toBe(false);
  });

  it("leaves the Batch 1 approved pack approved and unchanged in scope", () => {
    const b1 = read("honeywell-batch1-approved-rules.json");
    expect(b1.rulePackId).toBe("honeywell-batch1-approved-rules");
    expect(b1.status).toBe("approved");
    expect(b1.approvalRequired).toBe(false);
    expect(b1.sourceScope).toBe("Honeywell MVP / Batch 1");
  });

  it("leaves the Batch 2 approved pack approved and unchanged in scope", () => {
    const b2 = read("honeywell-batch2-approved-rules.json");
    expect(b2.rulePackId).toBe("honeywell-batch2-approved-rules");
    expect(b2.status).toBe("approved");
    expect(b2.approvalRequired).toBe(false);
    expect(b2.sourceScope).toBe("Honeywell MVP / Batch 2");
  });
});

// --- Runtime evaluator smoke test (deterministic, no catalog/pricing) -------

describe("honeywell batch 3 approved pack - runtime expansion smoke test", () => {
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
  // One customer line per draft keeps each parent its own segment, so the rack
  // accessories shared across the two switches never collide.
  function expandOne(sku: string, quantity: number) {
    return buildConfigurationExpansionDraft({
      lines: [boqLine(1, sku, quantity)],
      decisions: [acceptDecision(1, sku)],
      rulePack: pack as ConfigExpansionRulePack,
    });
  }
  function expansion(draft: { lines: Array<{ origin: string; sku: string; quantity: number }> }) {
    return draft.lines.filter((l) => l.origin === "expansion");
  }
  function qtyBySku(added: Array<{ sku: string; quantity: number }>) {
    return new Map(added.map((l) => [l.sku, l.quantity]));
  }

  it("expands CW9178I-CFG qty 12 into its 3 accessory children, each qty 12", () => {
    const added = expansion(expandOne("CW9178I-CFG", 12));
    expect(added.map((l) => l.sku).sort()).toEqual([...CW9178I_CHILDREN].sort());
    for (const l of added) expect(l.quantity, l.sku).toBe(12);
  });

  it("expands C9300X-48HX-A qty 7 into its 7 children, each qty 7", () => {
    const added = expansion(expandOne("C9300X-48HX-A", 7));
    expect(added.map((l) => l.sku).sort()).toEqual([...C9300X_CHILDREN].sort());
    for (const l of added) expect(l.quantity, l.sku).toBe(7);
  });

  it("expands C9300L-24P-4X-A qty 6 into its 8 children, with FAN-T2 qty 18 and C9300L-STACK-A qty 12", () => {
    const added = expansion(expandOne("C9300L-24P-4X-A", 6));
    expect(added.map((l) => l.sku).sort()).toEqual([...C9300L_CHILDREN].sort());
    const qty = qtyBySku(added);
    expect(qty.get("FAN-T2")).toBe(18);
    expect(qty.get("C9300L-STACK-A")).toBe(12);
    for (const sku of C9300L_CHILDREN) {
      if (sku === "FAN-T2" || sku === "C9300L-STACK-A") continue;
      expect(qty.get(sku), sku).toBe(6);
    }
  });
});

// --- Hygiene ----------------------------------------------------------------

describe("honeywell batch 3 approved pack - hygiene", () => {
  it("keeps the approved pack JSON ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(packRaw)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
