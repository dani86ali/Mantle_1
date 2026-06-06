import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { buildConfigurationExpansionDraft } from "@/lib/projects/config-expansion";
import type { CanonicalBoqLine, SkuResolutionDecision } from "@/types/project";
import type { ConfigExpansionRulePack } from "@/lib/projects/config-expansion-types";

/**
 * Tests for the approved Honeywell MVP Batch 2 runtime rule pack
 * (data/config-expansion/honeywell-batch2-approved-rules.json, Prompt 58). The
 * pack is a NEW, separate artifact authored from the explicit human Batch 2
 * approval (questions 1-6 with the 3Y default; questions 7-8 deferred/out of
 * scope). It carries only the Batch 2 term/support/software runtime scope: the
 * C9300X/C9300L term-coupled licenses-support (3Y default) and included
 * zero-price software, the wireless support/subscription-support attach, and the
 * current phone support attach. It is NOT the full 53-line Honeywell pack, it is
 * separate from the Batch 1 approved pack, and it defers Batch 3 replacements and
 * Batch 4 broader generalization. These tests prove the pack is
 * approved/partial/pricing-free, that no historical/optic/Batch-1 line and no
 * invented 5Y/7Y term SKU leaks in, that the source candidate/review/approval
 * artifacts are untouched, and that the pack expands deterministically under the
 * runtime evaluator. The committed pack is read from disk and never mutated.
 */

const dataPath = (f: string) => join(process.cwd(), "data/config-expansion", f);
const PACK_PATH = dataPath("honeywell-batch2-approved-rules.json");
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-batch2-approved-rules.test.ts"
);

// Parsed as `any`: the pack carries authoring metadata (approval/derivedFrom)
// beyond the ConfigExpansionRulePack contract, and the evaluator's own
// validateRulePack is the real structural gate (exercised by the smoke test).
const packRaw = readFileSync(PACK_PATH, "utf8");
const pack: any = JSON.parse(packRaw);

const PARENT_SKUS = [
  "C9300X-48HX-A",
  "C9300L-24P-4X-A",
  "CW9178I-CFG",
  "CISCO-NETWORK-SUB",
  "CP-7841-K9=",
];

// Approved Batch 2 children, in the approval-packet order.
const C9300X_CHILDREN = [
  "CON-L1NCD-C9300XY4", "C9300-DNA-A-48", "CON-L1SWT-C93A48", "C9300-DNA-A-48-3Y",
  "TE-EMBEDDED-T", "TE-EMBEDDED-T-3Y", "D-DNAS-EXT-S-T", "D-DNAS-EXT-S-3Y",
  "C9300-NW-A-48", "SC9300UK9-1715", "TE-C9K-SW", "NETWORK-PNP-LIC",
];
const C9300L_CHILDREN = [
  "CON-L1NCD-C93024PX", "C9300L-DNA-A-24", "CON-L1SWT-C93LA24", "C9300L-DNA-A-24-3Y",
  "TE-EMBEDDED-T", "TE-EMBEDDED-T-3Y", "D-DNAS-EXT-S-T", "D-DNAS-EXT-S-3Y",
  "S9300LUK9-1718", "C9300L-NW-A-24", "TE-C9K-SW", "NETWORK-PNP-LIC",
];

// 3Y term-coupled lines: carry termMonths 36 (no 5Y/7Y term is activated).
const TERM_36_LINES: Array<[string, string]> = [
  ["C9300X-48HX-A", "CON-L1NCD-C9300XY4"],
  ["C9300X-48HX-A", "CON-L1SWT-C93A48"],
  ["C9300X-48HX-A", "C9300-DNA-A-48-3Y"],
  ["C9300X-48HX-A", "TE-EMBEDDED-T-3Y"],
  ["C9300X-48HX-A", "D-DNAS-EXT-S-3Y"],
  ["C9300L-24P-4X-A", "CON-L1NCD-C93024PX"],
  ["C9300L-24P-4X-A", "CON-L1SWT-C93LA24"],
  ["C9300L-24P-4X-A", "C9300L-DNA-A-24-3Y"],
  ["C9300L-24P-4X-A", "TE-EMBEDDED-T-3Y"],
  ["C9300L-24P-4X-A", "D-DNAS-EXT-S-3Y"],
];
// Support attach lines that carry a 12-month term (NOT the 3Y/36 default).
const TERM_12_LINES: Array<[string, string]> = [
  ["CW9178I-CFG", "CON-ROB-CW9178IC"],
  ["CP-7841-K9=", "CON-L1NBD-P7PK94P1"],
];

// Batch 1 child SKUs must not reappear in this Batch 2 pack.
const BATCH1_CHILD_SKUS = [
  "LIC-CW-A", "LIC-SPACES-ADV", "CAB-C15-CBN",
  "PWR-C1-1100WAC-P", "PWR-C1-1100WAC-P/2", "PWR-C1-715WAC-P", "PWR-C1-715WAC-P/2",
];
const OPTIC_SKUS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];
const HISTORICAL_PHONE_SKU = "CON-SNT-P7PK94P1";
const PRICING_TOKENS = [
  "price", "cost", "discount", "margin", "markup", "vat", "currency", "msrp", "sell", "amount",
];
// A SKU-shaped 5Y/7Y token (e.g. "...-5Y"); does NOT match prose like "5Y/7Y".
const INVENTED_TERM_SKU = /-(5Y|7Y)\b/;

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

describe("honeywell batch 2 approved pack - metadata", () => {
  it("is present and valid JSON", () => {
    expect(existsSync(PACK_PATH)).toBe(true);
    expect(pack).toBeTruthy();
    expect(typeof pack).toBe("object");
  });

  it("declares the expected id and version", () => {
    expect(pack.rulePackId).toBe("honeywell-batch2-approved-rules");
    expect(pack.version).toBe("1.0.0");
  });

  it("is an approved, no-further-approval-required runtime pack", () => {
    expect(pack.status).toBe("approved");
    expect(pack.approvalRequired).toBe(false);
  });

  it("scopes itself to Honeywell MVP / Batch 2", () => {
    expect(pack.sourceScope).toBe("Honeywell MVP / Batch 2");
  });

  it("records the partial-approval, 3Y-default, and deferral notes", () => {
    const notes = String(pack.notes).toLowerCase();
    expect(notes).toContain("partial");
    expect(notes).toContain("batch 2");
    expect(notes).toContain("batch 1");
    expect(notes).toContain("53");
    expect(notes).toContain("not approved");
    expect(notes).toContain("batch 3");
    expect(notes).toContain("batch 4");
    expect(notes).toContain("deferred");
    expect(notes).toContain("3y");
    expect(notes).toContain("5y/7y");
    expect(notes).toContain("pricing");
    expect(notes).toContain("unchanged");
  });

  it("records the recorded human Batch 2 approval decision", () => {
    expect(pack.approval.batch).toBe("batch-2");
    const decision = String(pack.approval.decision).toLowerCase();
    expect(decision).toContain("approve batch 2");
    expect(decision).toContain("3y default");
  });
});

// --- Parent rules: exactly the five Batch 2 parents -------------------------

describe("honeywell batch 2 approved pack - parent rules", () => {
  it("contains exactly the five Batch 2 parent rules and no others", () => {
    expect(parents()).toHaveLength(5);
    expect(parents().map((p: any) => p.parentSku).sort()).toEqual([...PARENT_SKUS].sort());
  });

  it("approves every parent rule with no further approval required", () => {
    for (const p of parents()) {
      expect(p.approved, `${p.parentSku} approved`).toBe(true);
      expect(p.approvalRequired, `${p.parentSku} approvalRequired`).toBe(false);
      expect(Array.isArray(p.evidence) && p.evidence.length >= 1, `${p.parentSku} evidence`).toBe(true);
    }
  });

  it("approves every child line with no further approval required, each with evidence", () => {
    const children = allChildren();
    expect(children.length).toBe(27);
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

describe("honeywell batch 2 approved pack - exact child SKU sets", () => {
  it("C9300X-48HX-A carries exactly its 12 approved Batch 2 children", () => {
    expect(childSkus("C9300X-48HX-A").slice().sort()).toEqual([...C9300X_CHILDREN].sort());
    expect(childSkus("C9300X-48HX-A")).toHaveLength(12);
  });

  it("C9300L-24P-4X-A carries exactly its 12 approved Batch 2 children", () => {
    expect(childSkus("C9300L-24P-4X-A").slice().sort()).toEqual([...C9300L_CHILDREN].sort());
    expect(childSkus("C9300L-24P-4X-A")).toHaveLength(12);
  });

  it("CW9178I-CFG carries exactly CON-ROB-CW9178IC", () => {
    expect(childSkus("CW9178I-CFG")).toEqual(["CON-ROB-CW9178IC"]);
  });

  it("CISCO-NETWORK-SUB carries exactly SVS-L0SPT-CN", () => {
    expect(childSkus("CISCO-NETWORK-SUB")).toEqual(["SVS-L0SPT-CN"]);
  });

  it("CP-7841-K9= carries exactly CON-L1NBD-P7PK94P1", () => {
    expect(childSkus("CP-7841-K9=")).toEqual(["CON-L1NBD-P7PK94P1"]);
  });
});

// --- Term behavior: 3Y default only, no 5Y/7Y activation --------------------

describe("honeywell batch 2 approved pack - term behavior", () => {
  it("every 3Y term-coupled line carries termMonths 36", () => {
    for (const [parentSku, childSku] of TERM_36_LINES) {
      expect(child(parentSku, childSku)?.termMonths, `${parentSku}/${childSku}`).toBe(36);
    }
  });

  it("carries exactly the ten 3Y (36-month) term lines", () => {
    expect(allChildren().filter((c: any) => c.termMonths === 36)).toHaveLength(10);
  });

  it("keeps the wireless and phone support attach lines at their 12-month term", () => {
    for (const [parentSku, childSku] of TERM_12_LINES) {
      expect(child(parentSku, childSku)?.termMonths, `${parentSku}/${childSku}`).toBe(12);
    }
    expect(allChildren().filter((c: any) => c.termMonths === 12)).toHaveLength(2);
  });

  it("activates no 5Y/7Y term (no 60- or 84-month line, no termOptionGroups)", () => {
    for (const c of allChildren()) {
      expect(c.termMonths, c.sku).not.toBe(60);
      expect(c.termMonths, c.sku).not.toBe(84);
    }
    expect(pack.termOptionGroups).toBeUndefined();
  });

  it("invents no 5Y/7Y SKU token anywhere in the pack", () => {
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const v of node) walk(v);
      } else if (node !== null && typeof node === "object") {
        for (const v of Object.values(node as Record<string, unknown>)) walk(v);
      } else if (typeof node === "string") {
        expect(INVENTED_TERM_SKU.test(node), node).toBe(false);
      }
    };
    walk(pack);
  });
});

// --- Deferred / out-of-scope lines stay out ---------------------------------

describe("honeywell batch 2 approved pack - out-of-scope lines excluded", () => {
  it("encodes no termOptionGroups, optionGroups, or replacementCandidates", () => {
    expect(pack.termOptionGroups).toBeUndefined();
    expect(pack.optionGroups).toBeUndefined();
    expect(pack.replacementCandidates).toBeUndefined();
  });

  it("omits the historical phone support SKU entirely", () => {
    expect(allChildSkus()).not.toContain(HISTORICAL_PHONE_SKU);
    expect(packRaw.includes(HISTORICAL_PHONE_SKU)).toBe(false);
  });

  it("omits both deferred optics", () => {
    for (const optic of OPTIC_SKUS) {
      expect(allChildSkus(), optic).not.toContain(optic);
      expect(packRaw.includes(optic), optic).toBe(false);
    }
  });

  it("omits every Batch 1 child line", () => {
    const childSet = new Set(allChildSkus());
    for (const s of BATCH1_CHILD_SKUS) {
      expect(childSet.has(s), s).toBe(false);
    }
  });
});

// --- Pricing authority stays out (key-only check) ---------------------------

describe("honeywell batch 2 approved pack - no pricing authority", () => {
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

// --- Batch 1 approved pack remains approved and unchanged in scope ----------

describe("honeywell batch 2 approved pack - Batch 1 pack untouched", () => {
  const batch1: any = JSON.parse(readFileSync(dataPath("honeywell-batch1-approved-rules.json"), "utf8"));

  it("leaves the Batch 1 pack approved and runtime-active", () => {
    expect(batch1.rulePackId).toBe("honeywell-batch1-approved-rules");
    expect(batch1.status).toBe("approved");
    expect(batch1.approvalRequired).toBe(false);
    expect(batch1.sourceScope).toBe("Honeywell MVP / Batch 1");
  });

  it("leaves the Batch 1 scope at its three parent rules", () => {
    const parentSkus = (batch1.parentRules ?? []).map((p: any) => p.parentSku).sort();
    expect(parentSkus).toEqual(["C9300L-24P-4X-A", "C9300X-48HX-A", "CISCO-NETWORK-SUB"]);
  });
});

// --- Source candidate / review / approval packet files unchanged ------------

describe("honeywell batch 2 approved pack - source artifacts untouched", () => {
  const read = (f: string) => JSON.parse(readFileSync(dataPath(f), "utf8"));

  it("leaves the Batch 2 approval packet pending and review-only", () => {
    const p = read("honeywell-batch2-approval-packet.json");
    expect(p.packetId).toBe("honeywell-batch2-approval-packet");
    expect(p.status).toBe("pending_human_approval");
    expect(p.reviewOnly).toBe(true);
    expect(p.runtimeAuthority).toBe(false);
  });

  it("leaves the v2 candidate pack candidate and approval-required", () => {
    const c = read("honeywell-candidate-rules-v2.json");
    expect(c.rulePackId).toBe("honeywell-candidate-rules-v2");
    expect(c.status).toBe("candidate");
    expect(c.approvalRequired).toBe(true);
  });

  it("leaves the v2 approval packet pending human approval", () => {
    const p = read("honeywell-rule-approval-packet-v2.json");
    expect(p.packetId).toBe("honeywell-rule-approval-packet-v2");
    expect(p.status).toBe("pending_human_approval");
  });

  it("leaves the v1 candidate pack and v1 review packet candidate/pending", () => {
    expect(read("honeywell-candidate-rules.json").status).toBe("candidate");
    expect(read("honeywell-rule-approval-packet.json").status).toBe("pending_human_approval");
  });
});

// --- Runtime evaluator smoke test (deterministic, no catalog/pricing) -------

describe("honeywell batch 2 approved pack - runtime expansion smoke test", () => {
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
  // One customer line per draft keeps each parent its own segment, so shared
  // child SKUs (TE-EMBEDDED-T, ...) never collide across the two switches.
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

  it("expands C9300X-48HX-A qty 7 into its 12 children, each qty 7", () => {
    const added = expansion(expandOne("C9300X-48HX-A", 7));
    expect(added.map((l) => l.sku).sort()).toEqual([...C9300X_CHILDREN].sort());
    for (const l of added) expect(l.quantity, l.sku).toBe(7);
  });

  it("expands C9300L-24P-4X-A qty 6 into its 12 children, each qty 6", () => {
    const added = expansion(expandOne("C9300L-24P-4X-A", 6));
    expect(added.map((l) => l.sku).sort()).toEqual([...C9300L_CHILDREN].sort());
    for (const l of added) expect(l.quantity, l.sku).toBe(6);
  });

  it("expands CW9178I-CFG qty 12 into CON-ROB-CW9178IC qty 12", () => {
    const added = expansion(expandOne("CW9178I-CFG", 12));
    expect(added).toHaveLength(1);
    expect(added[0].sku).toBe("CON-ROB-CW9178IC");
    expect(added[0].quantity).toBe(12);
  });

  it("expands CISCO-NETWORK-SUB qty 1 into SVS-L0SPT-CN qty 1", () => {
    const added = expansion(expandOne("CISCO-NETWORK-SUB", 1));
    expect(added).toHaveLength(1);
    expect(added[0].sku).toBe("SVS-L0SPT-CN");
    expect(added[0].quantity).toBe(1);
  });

  it("expands CP-7841-K9= qty 59 into CON-L1NBD-P7PK94P1 qty 59", () => {
    const added = expansion(expandOne("CP-7841-K9=", 59));
    expect(added).toHaveLength(1);
    expect(added[0].sku).toBe("CON-L1NBD-P7PK94P1");
    expect(added[0].quantity).toBe(59);
  });
});

// --- Hygiene ----------------------------------------------------------------

describe("honeywell batch 2 approved pack - hygiene", () => {
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
