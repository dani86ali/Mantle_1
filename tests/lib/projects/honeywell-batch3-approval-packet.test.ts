import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Tests for the review-only Honeywell Batch 3 non-term hardware/accessory
 * approval packet:
 *  - data/config-expansion/honeywell-batch3-approval-packet.json
 *  - docs/config-expansion/HONEYWELL_BATCH3_APPROVAL_PACKET.md
 *
 * Per this packet's sequencing authority, Batch 3 is the non-term
 * hardware/accessory child lines; replacement candidates and optics remain
 * deferred. This packet is a REVIEW PACKET ONLY: it is not runtime authority, it
 * creates no approved Batch 3 runtime pack, it activates nothing, and every entry
 * stays pending_human_approval with an advisory recommendedDecision. These tests
 * prove the packet is review-only/pricing-free, that exactly the 18 expected
 * Batch 3 approval entries exist (and no Batch 1 or Batch 2 child lines), that the
 * two optics and all 11 replacement candidates appear only in deferred form, and
 * that the v2 candidate pack and the approved Batch 1 / Batch 2 packs are
 * untouched. Files are read from disk and never mutated. The packet is parsed as
 * `any`: it is a groups/deferred review shape, not a ConfigExpansionRulePack, so
 * no runtime evaluator is imported and no runtime expansion smoke test is added.
 */

const dataPath = (f: string) => join(process.cwd(), "data/config-expansion", f);
const PACKET_PATH = dataPath("honeywell-batch3-approval-packet.json");
const MD_PATH = join(
  process.cwd(),
  "docs/config-expansion/HONEYWELL_BATCH3_APPROVAL_PACKET.md"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-batch3-approval-packet.test.ts"
);

const packetRaw = readFileSync(PACKET_PATH, "utf8");
const packet: any = JSON.parse(packetRaw);
const v2: any = JSON.parse(readFileSync(dataPath("honeywell-candidate-rules-v2.json"), "utf8"));

const RECOMMENDED = new Set([
  "approve_for_honeywell_mvp",
  "defer_needs_more_evidence",
  "reject_for_runtime",
  "review_option_only",
]);
const PRICING_TOKENS = [
  "price", "cost", "discount", "margin", "markup", "vat", "currency", "msrp", "sell", "amount",
];

const APPROVAL_GROUP_IDS = [
  "wireless-accessories",
  "c9300x-nonterm-hardware-accessories",
  "c9300l-nonterm-hardware-accessories",
];

// The exact 18 Batch 3 approval lines, keyed on (parentSku, sku). Several SKUs
// (C9K-ACC-RBFT, C9K-ACC-SCR-4, CAB-GUIDE-1RU) legitimately repeat across the two
// switch parents, so the set is keyed on the parent::sku pair, not the bare SKU.
const EXPECTED_18: Array<[string, string]> = [
  ["CW9178I-CFG", "AIR-AP-BRACKET-2"],
  ["CW9178I-CFG", "AIR-AP-T-RAIL-F"],
  ["CW9178I-CFG", "CW9178-SINGLE"],
  ["C9300X-48HX-A", "C9300-SSD-NONE"],
  ["C9300X-48HX-A", "STACK-T1-50CM"],
  ["C9300X-48HX-A", "CAB-SPWR-30CM"],
  ["C9300X-48HX-A", "C9K-ACC-RBFT"],
  ["C9300X-48HX-A", "C9K-ACC-SCR-4"],
  ["C9300X-48HX-A", "CAB-GUIDE-1RU"],
  ["C9300X-48HX-A", "C9300X-NM-8Y"],
  ["C9300L-24P-4X-A", "FAN-T2"],
  ["C9300L-24P-4X-A", "C9300L-SSD-NONE"],
  ["C9300L-24P-4X-A", "C9K-ACC-RBFT"],
  ["C9300L-24P-4X-A", "C9K-ACC-SCR-4"],
  ["C9300L-24P-4X-A", "CAB-GUIDE-1RU"],
  ["C9300L-24P-4X-A", "C9300L-STACK-KIT2"],
  ["C9300L-24P-4X-A", "C9300L-STACK-A"],
  ["C9300L-24P-4X-A", "STACK-T3A-50CM"],
];

const OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];

function groups(): any[] {
  return Array.isArray(packet.groups) ? packet.groups : [];
}
function groupById(id: string): any {
  return groups().find((g: any) => g.groupId === id);
}
function deferredEntries(): any[] {
  return Array.isArray(packet.deferred?.entries) ? packet.deferred.entries : [];
}
function approvalEntries(): any[] {
  return groups().flatMap((g: any) => (Array.isArray(g.entries) ? g.entries : []));
}
function allEntries(): any[] {
  return [...approvalEntries(), ...deferredEntries()];
}
function pairKey(parent: string, sku: string): string {
  return parent + "::" + sku;
}

function collectObjects(node: unknown, acc: Record<string, unknown>[]): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const v of node) collectObjects(v, acc);
  } else if (node !== null && typeof node === "object") {
    acc.push(node as Record<string, unknown>);
    for (const v of Object.values(node as Record<string, unknown>)) collectObjects(v, acc);
  }
  return acc;
}

// Child SKUs that belong to the already-approved Batch 1 / Batch 2 packs. Derived
// from the approved packs themselves so the disjointness check tracks the real
// approved scope. Keyed on child SKU (never parentSku, which legitimately overlaps
// across batches - e.g. CW9178I-CFG / C9300X-48HX-A / C9300L-24P-4X-A).
function approvedChildSkus(file: string): Set<string> {
  const pack: any = JSON.parse(readFileSync(dataPath(file), "utf8"));
  const skus = (pack.parentRules ?? []).flatMap((p: any) =>
    (p.childLines ?? []).map((c: any) => c.sku)
  );
  return new Set<string>(skus);
}

// --- Metadata ---------------------------------------------------------------

describe("honeywell batch 3 packet - metadata", () => {
  it("exists and is valid JSON", () => {
    expect(existsSync(PACKET_PATH)).toBe(true);
    expect(typeof packet).toBe("object");
    expect(packet).toBeTruthy();
  });

  it("is a review-only, batch-3, pending packet", () => {
    expect(packet.packetId).toBe("honeywell-batch3-approval-packet");
    expect(packet.batch).toBe("batch-3");
    expect(packet.status).toBe("pending_human_approval");
    expect(packet.reviewOnly).toBe(true);
    expect(packet.runtimeAuthority).toBe(false);
  });

  it("sources from the v2 candidate pack and references both approved packs", () => {
    expect(packet.sourceCandidateRulePackId).toBe("honeywell-candidate-rules-v2");
    expect(packet.sourceCandidateRulePackStatus).toBe("candidate");
    expect(packet.batch1ApprovedPackId).toBe("honeywell-batch1-approved-rules");
    expect(packet.batch2ApprovedPackId).toBe("honeywell-batch2-approved-rules");
  });

  it("carries a loud sequencing note (Batch 3 = non-term hardware/accessory)", () => {
    expect(typeof packet.sequencingNote).toBe("string");
    expect(packet.sequencingNote.length).toBeGreaterThan(0);
    expect(packet.sequencingNote).toContain("HONEYWELL_RULE_APPROVAL_BATCH_STRATEGY.md");
  });
});

// --- Nothing approved / nothing requires-approval-off / no pricing ----------

describe("honeywell batch 3 packet - approves nothing", () => {
  it("has no approved: true anywhere", () => {
    for (const o of collectObjects(packet, [])) {
      if ("approved" in o) expect(o.approved, JSON.stringify(o).slice(0, 90)).not.toBe(true);
    }
  });

  it("has no approvalRequired: false anywhere", () => {
    for (const o of collectObjects(packet, [])) {
      if ("approvalRequired" in o) {
        expect(o.approvalRequired, JSON.stringify(o).slice(0, 90)).not.toBe(false);
      }
    }
  });

  it("keeps every entry pending_human_approval", () => {
    const entries = allEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e.status, e.decisionId).toBe("pending_human_approval");
  });

  it("uses unique decisionIds across the whole packet", () => {
    const ids = allEntries().map((e: any) => e.decisionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("honeywell batch 3 packet - no pricing authority", () => {
  // Keys-only by design: the preserved evidence legitimately contains the
  // substring "price" in VALUES (relationshipType included_zero_price, GPL notes
  // such as "not price authority"). The architecture bans pricing as configuration
  // fields, i.e. pricing-shaped KEYS - so this scans keys, never values.
  it("carries no pricing key anywhere in the packet", () => {
    const objs = collectObjects(packet, []);
    const keys = objs.flatMap((o) => Object.keys(o));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const lower = key.toLowerCase();
      for (const token of PRICING_TOKENS) {
        expect(lower.includes(token), `key "${key}" contains pricing token "${token}"`).toBe(false);
      }
    }
  });
});

// --- Required groups --------------------------------------------------------

describe("honeywell batch 3 packet - required groups", () => {
  it("contains the three Batch 3 approval groups", () => {
    expect(groups().map((g: any) => g.groupId).sort()).toEqual([...APPROVAL_GROUP_IDS].sort());
  });

  it("contains the deferred group", () => {
    expect(packet.deferred).toBeTruthy();
    expect(packet.deferred.groupId).toBe("deferred-from-batch-3");
    expect(deferredEntries().length).toBeGreaterThan(0);
  });

  it("each approval group is non-empty and carries parent SKUs", () => {
    for (const id of APPROVAL_GROUP_IDS) {
      const g = groupById(id);
      expect(g, id).toBeTruthy();
      expect((g.entries ?? []).length, id).toBeGreaterThan(0);
      expect(Array.isArray(g.parentSkus) && g.parentSkus.length >= 1, id).toBe(true);
    }
  });
});

// --- Exactly the 18 Batch 3 approval entries --------------------------------

describe("honeywell batch 3 packet - exactly the 18 approval entries", () => {
  it("has exactly 18 approval entries", () => {
    expect(approvalEntries().length).toBe(18);
  });

  it("matches the expected 18 (parentSku, sku) pairs exactly", () => {
    const actual = approvalEntries()
      .map((e: any) => pairKey(e.parentSku, e.sku))
      .sort();
    const expected = EXPECTED_18.map(([p, s]) => pairKey(p, s)).sort();
    expect(actual).toEqual(expected);
  });

  it("keeps Batch 1 approved child SKUs out of the Batch 3 approval entries", () => {
    const batch1 = approvedChildSkus("honeywell-batch1-approved-rules.json");
    expect(batch1.size).toBeGreaterThan(0);
    for (const e of approvalEntries()) expect(batch1.has(e.sku), e.sku).toBe(false);
  });

  it("keeps Batch 2 approved child SKUs out of the Batch 3 approval entries", () => {
    const batch2 = approvedChildSkus("honeywell-batch2-approved-rules.json");
    expect(batch2.size).toBeGreaterThan(0);
    for (const e of approvalEntries()) expect(batch2.has(e.sku), e.sku).toBe(false);
  });
});

// --- Entry shape ------------------------------------------------------------

describe("honeywell batch 3 packet - approval entry shape", () => {
  it("every approval-group entry carries the required review fields", () => {
    for (const e of approvalEntries()) {
      const label = e.decisionId;
      expect(typeof e.decisionId, label).toBe("string");
      expect(e.batch, label).toBe("batch-3");
      expect(e.status, label).toBe("pending_human_approval");
      expect(typeof e.parentSku === "string" && e.parentSku.length > 0, label).toBe(true);
      expect(typeof e.sku === "string" && e.sku.length > 0, label).toBe(true);
      expect(typeof e.description === "string" && e.description.length > 0, label).toBe(true);
      expect(typeof e.relationshipType, label).toBe("string");
      expect(typeof e.quantityRule, label).toBe("string");
      expect(typeof e.evidenceScope === "string" && e.evidenceScope.length > 0, label).toBe(true);
      expect(Array.isArray(e.evidence) && e.evidence.length >= 1, label).toBe(true);
      expect(Array.isArray(e.riskFlags) && e.riskFlags.length >= 1, label).toBe(true);
      expect(typeof e.reviewQuestion === "string" && e.reviewQuestion.length > 0, label).toBe(true);
      expect(typeof e.notes === "string" && e.notes.length > 0, label).toBe(true);
    }
  });

  it("recommends review_option_only for default_selected and approve_for_honeywell_mvp for included_zero_price", () => {
    for (const e of approvalEntries()) {
      expect(RECOMMENDED.has(e.recommendedDecision), e.decisionId).toBe(true);
      if (e.relationshipType === "default_selected") {
        expect(e.recommendedDecision, e.decisionId).toBe("review_option_only");
        expect(e.riskFlags, e.decisionId).toContain("default_selected_requires_review");
      } else if (e.relationshipType === "included_zero_price") {
        expect(e.recommendedDecision, e.decisionId).toBe("approve_for_honeywell_mvp");
        expect(e.riskFlags, e.decisionId).toContain("included_zero_price_hardware");
      } else {
        throw new Error(`unexpected relationshipType ${e.relationshipType} on ${e.decisionId}`);
      }
    }
  });

  it("never recommends defer/reject for an approval entry", () => {
    for (const e of approvalEntries()) {
      expect(["defer_needs_more_evidence", "reject_for_runtime"], e.decisionId).not.toContain(
        e.recommendedDecision
      );
    }
  });

  it("preserves the two fixed_per_parent quantity multipliers and flags them", () => {
    const multipliers = approvalEntries().filter((e: any) => e.quantityRule === "fixed_per_parent");
    const byKey = new Map(multipliers.map((e: any) => [pairKey(e.parentSku, e.sku), e]));
    expect(multipliers.length).toBe(2);
    const fan = byKey.get(pairKey("C9300L-24P-4X-A", "FAN-T2"));
    const stack = byKey.get(pairKey("C9300L-24P-4X-A", "C9300L-STACK-A"));
    expect(fan?.quantityValue).toBe(3);
    expect(stack?.quantityValue).toBe(2);
    for (const e of multipliers) {
      expect(e.riskFlags, e.decisionId).toContain("fixed_per_parent_multiplier_requires_review");
    }
  });
});

// --- Optics: deferred only --------------------------------------------------

describe("honeywell batch 3 packet - optics deferred only", () => {
  it("places both optics in the deferred group, never as approval entries", () => {
    const approvalSkus = new Set(approvalEntries().map((e: any) => e.sku));
    const deferredOptics = deferredEntries().filter((e: any) => e.deferredCategory === "optic");
    const deferredOpticSkus = deferredOptics.map((e: any) => e.sku);
    for (const optic of OPTICS) {
      expect(deferredOpticSkus, optic).toContain(optic);
      expect(approvalSkus.has(optic), optic).toBe(false);
    }
    expect(deferredOptics.length).toBe(OPTICS.length);
    for (const e of deferredOptics) {
      expect(e.recommendedDecision, e.sku).toBe("defer_needs_more_evidence");
      expect(e.riskFlags, e.sku).toContain("deferred_not_batch_3");
    }
  });
});

// --- Replacement candidates: deferred only ----------------------------------

describe("honeywell batch 3 packet - replacements deferred only", () => {
  const historicalSkus: string[] = (v2.replacementCandidates ?? []).map((r: any) => r.historicalSku);

  it("the v2 source actually carries all 11 replacement candidates", () => {
    expect(historicalSkus.length).toBe(11);
  });

  it("keeps every historical replacement SKU out of the approval entries", () => {
    const approvalSkus = new Set(approvalEntries().map((e: any) => e.sku));
    for (const h of historicalSkus) expect(approvalSkus.has(h), h).toBe(false);
  });

  it("represents every replacement only as a deferred, non-approval entry", () => {
    const byHistorical = new Map<string, any>();
    for (const e of deferredEntries()) {
      if (e.deferredCategory === "replacement_candidate") byHistorical.set(e.historicalSku, e);
    }
    expect(byHistorical.size).toBe(11);
    for (const h of historicalSkus) {
      const e = byHistorical.get(h);
      expect(e, h).toBeTruthy();
      expect(e.deferredCategory, h).toBe("replacement_candidate");
      expect(["defer_needs_more_evidence", "reject_for_runtime"], h).toContain(e.recommendedDecision);
      expect(e.recommendedDecision, h).not.toBe("approve_for_honeywell_mvp");
      expect(e.riskFlags, h).toContain("historical_sku_mismatch");
      expect(e.riskFlags, h).toContain("deferred_not_batch_3");
    }
  });
});

// --- Deferred entry shape ---------------------------------------------------

describe("honeywell batch 3 packet - deferred entry shape", () => {
  it("every deferred entry carries the core review fields and the deferred flag", () => {
    const entries = deferredEntries();
    expect(entries.length).toBe(13);
    for (const e of entries) {
      const label = e.decisionId;
      expect(typeof e.decisionId, label).toBe("string");
      expect(e.batch, label).toBe("batch-3");
      expect(e.status, label).toBe("pending_human_approval");
      expect(typeof e.sku === "string" && e.sku.length > 0, label).toBe(true);
      expect(typeof e.description === "string" && e.description.length > 0, label).toBe(true);
      expect(typeof e.evidenceScope === "string" && e.evidenceScope.length > 0, label).toBe(true);
      expect(Array.isArray(e.evidence) && e.evidence.length >= 1, label).toBe(true);
      expect(Array.isArray(e.riskFlags) && e.riskFlags.length >= 1, label).toBe(true);
      expect(e.riskFlags, label).toContain("deferred_not_batch_3");
      expect(RECOMMENDED.has(e.recommendedDecision), label).toBe(true);
      expect(typeof e.reviewQuestion === "string" && e.reviewQuestion.length > 0, label).toBe(true);
      expect(typeof e.notes === "string" && e.notes.length > 0, label).toBe(true);
    }
  });
});

// --- Source candidate / approved packs remain candidate / approved ----------

describe("honeywell batch 3 packet - source and approved packs unchanged", () => {
  const read = (f: string) => JSON.parse(readFileSync(dataPath(f), "utf8"));

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
});

// --- Companion Markdown -----------------------------------------------------

describe("honeywell batch 3 packet - companion Markdown", () => {
  const md = existsSync(MD_PATH) ? readFileSync(MD_PATH, "utf8") : "";
  const mdLower = md.toLowerCase();

  it("exists on disk", () => {
    expect(existsSync(MD_PATH)).toBe(true);
    expect(md.length).toBeGreaterThan(0);
  });

  it("carries the review-only / not-runtime-authority warning", () => {
    expect(mdLower).toContain("warning");
    expect(mdLower).toContain("review-only");
    expect(mdLower).toContain("not runtime authority");
  });

  it("summarizes Batch 1 and Batch 2 as already approved and states the Batch 3 scope", () => {
    expect(mdLower).toContain("batch 1");
    expect(mdLower).toContain("batch 2");
    expect(mdLower).toContain("already approved");
    expect(mdLower).toContain("batch 3 scope");
  });

  it("documents the sequencing override away from the strategy doc", () => {
    expect(mdLower).toContain("sequencing");
    expect(mdLower).toContain("honeywell_rule_approval_batch_strategy.md");
  });

  it("includes the grouped accessory sections", () => {
    for (const phrase of ["wireless", "catalyst 9300x", "catalyst 9300l", "deferred"]) {
      expect(mdLower, phrase).toContain(phrase);
    }
  });

  it("states optics and replacement candidates remain deferred", () => {
    expect(mdLower).toContain("optics");
    expect(mdLower).toContain("replacement");
    expect(mdLower).toContain("deferred");
  });

  it("includes a Questions for Human Approval section", () => {
    expect(mdLower).toContain("questions for human approval");
  });

  it("states no pricing/catalog/API/UI/export/runtime behavior is added", () => {
    expect(mdLower).toContain("no pricing");
    expect(mdLower).toContain("runtime");
  });
});

// --- Hygiene ----------------------------------------------------------------

describe("honeywell batch 3 packet - hygiene", () => {
  it("keeps the packet JSON ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(packetRaw)).toBe(false);
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
