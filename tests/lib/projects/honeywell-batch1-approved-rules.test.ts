import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildConfigurationExpansionDraft } from "@/lib/projects/config-expansion";
import type { CanonicalBoqLine, SkuResolutionDecision } from "@/types/project";
import type { ConfigExpansionRulePack } from "@/lib/projects/config-expansion-types";

/**
 * Tests for the approved Honeywell MVP Batch 1 runtime rule pack
 * (data/config-expansion/honeywell-batch1-approved-rules.json, Prompt 56). The
 * pack is a NEW, separate artifact authored from the explicit Batch 1 human
 * approval; it carries only the Batch 1 runtime scope (two wireless license lines,
 * the two switch AC power-supply option groups, and their selected-option power
 * cords) and is NOT the full 53-line Honeywell pack. These tests prove the pack is
 * approved/partial/pricing-free, that the source candidate and review packet files
 * are untouched, and that the pack expands deterministically under the Prompt 55
 * runtime evaluator. The committed pack is read from disk and never mutated.
 */

const dataPath = (f: string) => join(process.cwd(), "data/config-expansion", f);
const PACK_PATH = dataPath("honeywell-batch1-approved-rules.json");
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-batch1-approved-rules.test.ts"
);

// Parsed as `any`: the advanced quantityModel union would otherwise force narrowing
// before relatedSku/optionGroupId are reachable. The evaluator's own validateRulePack
// is the real structural gate (exercised by the smoke test below).
const pack: any = JSON.parse(readFileSync(PACK_PATH, "utf8"));

const PARENT_SKUS = ["CISCO-NETWORK-SUB", "C9300X-48HX-A", "C9300L-24P-4X-A"];

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

// --- Pack metadata ----------------------------------------------------------

describe("honeywell batch 1 approved pack - metadata", () => {
  it("is present and valid JSON", () => {
    expect(pack).toBeTruthy();
    expect(typeof pack).toBe("object");
  });

  it("declares the expected id and version", () => {
    expect(pack.rulePackId).toBe("honeywell-batch1-approved-rules");
    expect(pack.version).toBe("1.0.0");
  });

  it("is an approved, no-further-approval-required runtime pack", () => {
    expect(pack.status).toBe("approved");
    expect(pack.approvalRequired).toBe(false);
  });

  it("scopes itself to Honeywell MVP / Batch 1", () => {
    expect(pack.sourceScope).toBe("Honeywell MVP / Batch 1");
  });

  it("records the partial-approval and deferral notes", () => {
    const notes = String(pack.notes).toLowerCase();
    expect(notes).toContain("partial");
    expect(notes).toContain("batch 1");
    expect(notes).toContain("not approved");
    expect(notes).toContain("deferred");
    expect(notes).toContain("pricing");
    expect(notes).toContain("unchanged");
  });
});

// --- Parent rules -----------------------------------------------------------

describe("honeywell batch 1 approved pack - parent rules", () => {
  it("contains exactly the three Batch 1 parent rules and no others", () => {
    expect(parents()).toHaveLength(3);
    expect(parents().map((p: any) => p.parentSku).sort()).toEqual([...PARENT_SKUS].sort());
  });

  it("approves every parent rule with no further approval required", () => {
    for (const p of parents()) {
      expect(p.approved, `${p.parentSku} approved`).toBe(true);
      expect(p.approvalRequired, `${p.parentSku} approvalRequired`).toBe(false);
      expect(Array.isArray(p.evidence) && p.evidence.length >= 1, `${p.parentSku} evidence`).toBe(true);
    }
  });

  it("approves every child line with no further approval required", () => {
    const children = allChildren();
    expect(children.length).toBeGreaterThan(0);
    for (const c of children) {
      expect(c.approved, `${c.sku} approved`).toBe(true);
      expect(c.approvalRequired, `${c.sku} approvalRequired`).toBe(false);
      expect(Array.isArray(c.evidence) && c.evidence.length >= 1, `${c.sku} evidence`).toBe(true);
    }
  });
});

// --- CISCO-NETWORK-SUB wireless licenses ------------------------------------

describe("honeywell batch 1 approved pack - wireless licenses", () => {
  it("CISCO-NETWORK-SUB carries exactly LIC-CW-A and LIC-SPACES-ADV", () => {
    expect(childSkus("CISCO-NETWORK-SUB").sort()).toEqual(["LIC-CW-A", "LIC-SPACES-ADV"]);
  });

  it("both license lines use same_as_related_sku_total against CW9178I-CFG (project scope)", () => {
    for (const sku of ["LIC-CW-A", "LIC-SPACES-ADV"]) {
      const qm = child("CISCO-NETWORK-SUB", sku).quantityModel;
      expect(qm.type, sku).toBe("same_as_related_sku_total");
      expect(qm.relatedSku, sku).toBe("CW9178I-CFG");
      expect(qm.scope, sku).toBe("project");
    }
  });

  it("both license lines carry the approved project_sku duplicate policy", () => {
    for (const sku of ["LIC-CW-A", "LIC-SPACES-ADV"]) {
      const dp = child("CISCO-NETWORK-SUB", sku).duplicatePolicy;
      expect(dp.scope, sku).toBe("project_sku");
      expect(dp.match, sku).toBe("sku");
      expect(dp.quantitySatisfaction, sku).toBe("existing_satisfies_required");
    }
  });
});

// --- Switch AC PSU + power cord lines ---------------------------------------

describe("honeywell batch 1 approved pack - switch power lines", () => {
  it("C9300X-48HX-A carries exactly its two AC PSUs and the power cord", () => {
    expect(childSkus("C9300X-48HX-A").sort()).toEqual(
      ["CAB-C15-CBN", "PWR-C1-1100WAC-P", "PWR-C1-1100WAC-P/2"]
    );
  });

  it("C9300L-24P-4X-A carries exactly its two AC PSUs and the power cord", () => {
    expect(childSkus("C9300L-24P-4X-A").sort()).toEqual(
      ["CAB-C15-CBN", "PWR-C1-715WAC-P", "PWR-C1-715WAC-P/2"]
    );
  });

  it("both CAB-C15-CBN lines use selected_option_count against the right AC PSU group", () => {
    const x = child("C9300X-48HX-A", "CAB-C15-CBN").quantityModel;
    expect(x.type).toBe("selected_option_count");
    expect(x.optionGroupId).toBe("c9300x-ac-power-supplies");
    const l = child("C9300L-24P-4X-A", "CAB-C15-CBN").quantityModel;
    expect(l.type).toBe("selected_option_count");
    expect(l.optionGroupId).toBe("c9300l-ac-power-supplies");
  });

  it("the AC PSU option child lines preserve their option group id and evidence", () => {
    const psus: Array<[string, string]> = [
      ["C9300X-48HX-A", "PWR-C1-1100WAC-P"],
      ["C9300X-48HX-A", "PWR-C1-1100WAC-P/2"],
      ["C9300L-24P-4X-A", "PWR-C1-715WAC-P"],
      ["C9300L-24P-4X-A", "PWR-C1-715WAC-P/2"],
    ];
    for (const [parentSku, psu] of psus) {
      const c = child(parentSku, psu);
      const expected = parentSku === "C9300X-48HX-A" ? "c9300x-ac-power-supplies" : "c9300l-ac-power-supplies";
      expect(c.optionGroupId, psu).toBe(expected);
      expect(c.evidence.length, psu).toBeGreaterThanOrEqual(1);
    }
  });
});

// --- Option groups ----------------------------------------------------------

describe("honeywell batch 1 approved pack - option groups", () => {
  it("contains exactly the two AC PSU option groups", () => {
    const ids = (pack.optionGroups ?? []).map((g: any) => g.optionGroupId).sort();
    expect(ids).toEqual(["c9300l-ac-power-supplies", "c9300x-ac-power-supplies"]);
  });

  it("preserves the option SKUs and keeps engineerReviewRequired true", () => {
    const expected: Record<string, string[]> = {
      "c9300x-ac-power-supplies": ["PWR-C1-1100WAC-P", "PWR-C1-1100WAC-P/2"],
      "c9300l-ac-power-supplies": ["PWR-C1-715WAC-P", "PWR-C1-715WAC-P/2"],
    };
    for (const g of pack.optionGroups ?? []) {
      expect(g.optionSkus.sort(), g.optionGroupId).toEqual([...expected[g.optionGroupId]].sort());
      expect(g.engineerReviewRequired, g.optionGroupId).toBe(true);
    }
  });
});

// --- Deferred tables stay out of the approved pack --------------------------

describe("honeywell batch 1 approved pack - deferred scope excluded", () => {
  it("encodes no termOptionGroups (Batch 2 deferred)", () => {
    expect(pack.termOptionGroups).toBeUndefined();
  });

  it("encodes no replacementCandidates (Batch 3 deferred)", () => {
    expect(pack.replacementCandidates).toBeUndefined();
  });
});

// --- Pricing authority stays out (key-only check) --------------------------

describe("honeywell batch 1 approved pack - no pricing authority", () => {
  it("carries no pricing key anywhere in the pack", () => {
    const pricingTokens = ["price", "cost", "discount", "margin", "markup", "vat", "currency", "msrp", "sell", "amount"];
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
      for (const token of pricingTokens) {
        expect(key.toLowerCase().includes(token), `key "${key}" contains pricing token "${token}"`).toBe(false);
      }
    }
  });
});

// --- Source candidate / review artifacts remain unchanged ------------------

describe("honeywell batch 1 approved pack - source artifacts untouched", () => {
  const read = (f: string) => JSON.parse(readFileSync(dataPath(f), "utf8"));

  it("leaves the v2 candidate pack candidate/unapproved", () => {
    const v2 = read("honeywell-candidate-rules-v2.json");
    expect(v2.status).toBe("candidate");
    expect(v2.approvalRequired).toBe(true);
    expect(v2.rulePackId).toBe("honeywell-candidate-rules-v2");
  });

  it("leaves the v1 candidate pack candidate", () => {
    expect(read("honeywell-candidate-rules.json").status).toBe("candidate");
  });

  it("leaves both review packets pending human approval", () => {
    expect(read("honeywell-rule-approval-packet-v2.json").status).toBe("pending_human_approval");
    expect(read("honeywell-rule-approval-packet.json").status).toBe("pending_human_approval");
  });
});

// --- Runtime evaluator smoke test (Prompt 55 behavior) ---------------------

describe("honeywell batch 1 approved pack - runtime expansion smoke test", () => {
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
  function expand(rows: Array<[number, string, number]>) {
    return buildConfigurationExpansionDraft({
      lines: rows.map(([r, s, q]) => boqLine(r, s, q)),
      decisions: rows.map(([r, s]) => acceptDecision(r, s)),
      rulePack: pack as ConfigExpansionRulePack,
    });
  }
  function addedQty(draft: { lines: Array<{ origin: string; sku: string; quantity: number }> }, sku: string) {
    return draft.lines.find((l) => l.origin === "expansion" && l.sku === sku)?.quantity;
  }

  it("expands 12 CW9178I-CFG + CISCO-NETWORK-SUB into 12 + 12 wireless licenses", () => {
    const draft = expand([
      [1, "CW9178I-CFG", 12],
      [2, "CISCO-NETWORK-SUB", 1],
    ]);
    expect(addedQty(draft, "LIC-CW-A")).toBe(12);
    expect(addedQty(draft, "LIC-SPACES-ADV")).toBe(12);
  });

  it("expands C9300X-48HX-A qty 7 into CAB-C15-CBN qty 14", () => {
    const draft = expand([[1, "C9300X-48HX-A", 7]]);
    expect(addedQty(draft, "CAB-C15-CBN")).toBe(14);
  });

  it("expands C9300L-24P-4X-A qty 6 into CAB-C15-CBN qty 12", () => {
    const draft = expand([[1, "C9300L-24P-4X-A", 6]]);
    expect(addedQty(draft, "CAB-C15-CBN")).toBe(12);
  });
});

// --- Hygiene ----------------------------------------------------------------

describe("honeywell batch 1 approved pack - hygiene", () => {
  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("keeps the approved pack JSON ASCII-only", () => {
    const source = readFileSync(PACK_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
