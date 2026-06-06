import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Tests for the Honeywell Batch 4 DECISION RECORD (not a runtime expansion pack):
 *  - data/config-expansion/honeywell-batch4-decision-record.json
 *  - docs/config-expansion/HONEYWELL_BATCH4_DECISION_RECORD.md
 *
 * The record captures the human/business decision after reviewing the Batch 4
 * approval packet: the two optics (SFP-10G-LR-S=, SFP-10/25G-LR-S=) are standalone
 * customer BoQ / pricing / export lines, NOT configuration-expansion children, and
 * must not be auto-attached under C9300X-48HX-A / C9300L-24P-4X-A; the 11
 * historical-to-current replacement candidates remain deferred with no silent
 * runtime SKU substitution. It is NOT an approved Batch 4 runtime expansion rule
 * pack and creates none; the composer/selector remains Batch 1 + Batch 2 + Batch 3
 * only. These tests prove the decision-record shape (not a ConfigExpansionRulePack),
 * the optics/replacement decisions, the absence of price amounts, the Markdown
 * phrasing, and that the Batch 4 packet and the approved Batch 1/2/3 packs are
 * untouched. Files are read from disk and never mutated; no runtime evaluator is
 * imported and no expansion smoke test is run.
 */

const dataPath = (f: string) => join(process.cwd(), "data/config-expansion", f);
const RECORD_PATH = dataPath("honeywell-batch4-decision-record.json");
const MD_PATH = join(
  process.cwd(),
  "docs/config-expansion/HONEYWELL_BATCH4_DECISION_RECORD.md"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-batch4-decision-record.test.ts"
);

const recordRaw = readFileSync(RECORD_PATH, "utf8");
const record: any = JSON.parse(recordRaw);
const v2: any = JSON.parse(readFileSync(dataPath("honeywell-candidate-rules-v2.json"), "utf8"));

const EXPECTED_ACTIVE_PACKS = [
  "honeywell-batch1-approved-rules",
  "honeywell-batch2-approved-rules",
  "honeywell-batch3-approved-rules",
];
const OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];
const NO_AUTO_ATTACH = ["C9300X-48HX-A", "C9300L-24P-4X-A"];

// Price AMOUNT keys only. The record legitimately discusses pricing in explanatory
// KEY names (deterministicPricingRequired, noPriceValuesEncoded,
// noPricingAuthorityBeyondDeterministicInputs) and in VALUES, so this is a
// case-insensitive EXACT-match denylist of amount-shaped key names - never a
// substring scan that would false-positive on those explanatory names.
const PRICE_AMOUNT_KEYS = new Set([
  "unitprice",
  "listprice",
  "totalprice",
  "discount",
  "margin",
  "markup",
  "vatamount",
  "currency",
  "amount",
  "sellprice",
]);

function collectObjects(node: unknown, acc: Record<string, unknown>[]): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const v of node) collectObjects(v, acc);
  } else if (node !== null && typeof node === "object") {
    acc.push(node as Record<string, unknown>);
    for (const v of Object.values(node as Record<string, unknown>)) collectObjects(v, acc);
  }
  return acc;
}

function opticDecisions(): any[] {
  return Array.isArray(record.opticDecisions) ? record.opticDecisions : [];
}
function replacementDecisions(): any[] {
  return Array.isArray(record.replacementDecisions) ? record.replacementDecisions : [];
}

// --- Metadata ---------------------------------------------------------------

describe("honeywell batch 4 decision record - metadata", () => {
  it("exists and is valid JSON", () => {
    expect(existsSync(RECORD_PATH)).toBe(true);
    expect(typeof record).toBe("object");
    expect(record).toBeTruthy();
  });

  it("asserts the decision-record metadata exactly", () => {
    expect(record.recordId).toBe("honeywell-batch4-decision-record");
    expect(record.batch).toBe("batch-4");
    expect(record.status).toBe("decision_recorded");
    expect(record.runtimeAuthority).toBe(false);
    expect(record.configurationExpansionAuthority).toBe(false);
    expect(record.createsRuntimeRulePack).toBe(false);
    expect(record.approvedRuntimeRulePackId).toBe(null);
  });

  it("lists exactly Batch 1, Batch 2, Batch 3 as the active expansion packs", () => {
    expect(record.activeExpansionPackIds).toEqual(EXPECTED_ACTIVE_PACKS);
  });

  it("sources from the Batch 4 packet and the v2 candidate pack", () => {
    expect(record.sourceApprovalPacketId).toBe("honeywell-batch4-approval-packet");
    expect(record.sourceCandidateRulePackId).toBe("honeywell-candidate-rules-v2");
    expect(record.scope).toBe("Honeywell MVP only");
  });
});

// --- Not a ConfigExpansionRulePack ------------------------------------------

describe("honeywell batch 4 decision record - is not an approved rule pack shape", () => {
  it("has no top-level rulePackId", () => {
    expect("rulePackId" in record).toBe(false);
  });

  it("has no top-level parentRules", () => {
    expect("parentRules" in record).toBe(false);
  });

  it("has no approved: true anywhere", () => {
    for (const o of collectObjects(record, [])) {
      if ("approved" in o) expect(o.approved, JSON.stringify(o).slice(0, 90)).not.toBe(true);
    }
  });

  it("has no approvalRequired: false anywhere", () => {
    for (const o of collectObjects(record, [])) {
      if ("approvalRequired" in o) {
        expect(o.approvalRequired, JSON.stringify(o).slice(0, 90)).not.toBe(false);
      }
    }
  });
});

// --- No price amount keys ---------------------------------------------------

describe("honeywell batch 4 decision record - no pricing amount keys", () => {
  it("carries no price-amount key anywhere (explanatory pricing key names are allowed)", () => {
    const objs = collectObjects(record, []);
    const keys = objs.flatMap((o) => Object.keys(o));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(
        PRICE_AMOUNT_KEYS.has(key.toLowerCase()),
        `key "${key}" is a price-amount key`
      ).toBe(false);
    }
    // Sanity: the explanatory keys that legitimately mention pricing are present
    // and are NOT treated as price-amount keys.
    expect(keys).toContain("deterministicPricingRequired");
    expect(keys).toContain("noPriceValuesEncoded");
  });
});

// --- Optics: standalone customer BoQ lines ----------------------------------

describe("honeywell batch 4 decision record - optics are standalone customer BoQ lines", () => {
  it("records exactly the two optics with qty 12 and 14", () => {
    const optics = opticDecisions();
    expect(optics.length).toBe(2);
    expect(optics.map((o: any) => o.sku).sort()).toEqual([...OPTICS].sort());
    expect(new Set(optics.map((o: any) => o.quantity))).toEqual(new Set([12, 14]));
  });

  it("marks each optic standalone, not an expansion child, and do-not-auto-attach", () => {
    for (const o of opticDecisions()) {
      const label = o.sku;
      expect(o.relationshipType, label).toBe("standalone_customer_boq_line");
      expect(o.notConfigurationExpansionChild, label).toBe(true);
      expect(o.allowedWhenCustomerProvided, label).toBe(true);
      expect(o.deterministicPricingRequired, label).toBe(true);
      expect(o.noPriceValuesEncoded, label).toBe(true);
      expect(Array.isArray(o.doNotAutoAttachToParentSkus), label).toBe(true);
      for (const parent of NO_AUTO_ATTACH) {
        expect(o.doNotAutoAttachToParentSkus, `${label} -> ${parent}`).toContain(parent);
      }
      expect(Array.isArray(o.evidence) && o.evidence.length >= 1, label).toBe(true);
    }
  });
});

// --- Replacements: every v2 candidate, deferred, non-silent -----------------

describe("honeywell batch 4 decision record - replacements remain deferred", () => {
  const v2Candidates: any[] = Array.isArray(v2.replacementCandidates) ? v2.replacementCandidates : [];

  it("the v2 source carries all 11 replacement candidates", () => {
    expect(v2Candidates.length).toBe(11);
  });

  it("represents all 11 v2 replacements as deferred, non-silent, runtime-disallowed decisions", () => {
    const decisions = replacementDecisions();
    expect(decisions.length).toBe(11);
    const byHistorical = new Map<string, any>();
    for (const d of decisions) byHistorical.set(d.historicalSku, d);
    expect(byHistorical.size).toBe(11);
    for (const c of v2Candidates) {
      const d = byHistorical.get(c.historicalSku);
      expect(d, c.historicalSku).toBeTruthy();
      expect(d.status, c.historicalSku).toBe("deferred");
      expect(d.noSilentRuntimeSubstitution, c.historicalSku).toBe(true);
      expect(d.allowedAtRuntime, c.historicalSku).toBe(false);
      expect(new Set(d.currentSkus), c.historicalSku).toEqual(new Set(c.currentSkus));
    }
  });
});

// --- Source packet / approved packs untouched -------------------------------

describe("honeywell batch 4 decision record - source packet and approved packs unchanged", () => {
  const read = (f: string) => JSON.parse(readFileSync(dataPath(f), "utf8"));

  it("leaves the Batch 4 approval packet pending and not runtime authority", () => {
    const packet = read("honeywell-batch4-approval-packet.json");
    expect(packet.packetId).toBe("honeywell-batch4-approval-packet");
    expect(packet.status).toBe("pending_human_approval");
    expect(packet.runtimeAuthority).toBe(false);
  });

  it("leaves the Batch 1 approved pack approved and runtime-active", () => {
    const b1 = read("honeywell-batch1-approved-rules.json");
    expect(b1.rulePackId).toBe("honeywell-batch1-approved-rules");
    expect(b1.status).toBe("approved");
    expect(b1.approvalRequired).toBe(false);
  });

  it("leaves the Batch 2 approved pack approved and runtime-active", () => {
    const b2 = read("honeywell-batch2-approved-rules.json");
    expect(b2.rulePackId).toBe("honeywell-batch2-approved-rules");
    expect(b2.status).toBe("approved");
    expect(b2.approvalRequired).toBe(false);
  });

  it("leaves the Batch 3 approved pack approved and runtime-active", () => {
    const b3 = read("honeywell-batch3-approved-rules.json");
    expect(b3.rulePackId).toBe("honeywell-batch3-approved-rules");
    expect(b3.status).toBe("approved");
    expect(b3.approvalRequired).toBe(false);
  });
});

// --- Companion Markdown -----------------------------------------------------

describe("honeywell batch 4 decision record - companion Markdown", () => {
  const md = existsSync(MD_PATH) ? readFileSync(MD_PATH, "utf8") : "";
  const mdLower = md.toLowerCase();

  it("exists on disk", () => {
    expect(existsSync(MD_PATH)).toBe(true);
    expect(md.length).toBeGreaterThan(0);
  });

  it("says it is a decision record, not runtime authority", () => {
    expect(mdLower).toContain("decision record");
    expect(mdLower).toContain("not runtime authority");
  });

  it("says optics are standalone customer BoQ lines, not expansion children", () => {
    expect(mdLower).toContain("standalone customer boq line");
    expect(mdLower).toContain("not expansion children");
  });

  it("says the composer remains Batch 1+2+3 and replacements remain deferred", () => {
    expect(mdLower).toContain("composer remains batch 1+2+3");
    expect(mdLower).toContain("replacements remain deferred");
  });

  it("says no silent substitution", () => {
    expect(mdLower).toContain("no silent substitution");
  });
});

// --- Hygiene ----------------------------------------------------------------

describe("honeywell batch 4 decision record - hygiene", () => {
  it("keeps the decision-record JSON ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(recordRaw)).toBe(false);
  });

  it("keeps the companion Markdown ASCII-only", () => {
    const md = readFileSync(MD_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(md)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
