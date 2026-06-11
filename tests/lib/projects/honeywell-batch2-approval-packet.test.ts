import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Tests for the review-only Honeywell Batch 2 term/support/software approval
 * packet (Prompt 57):
 *  - data/config-expansion/honeywell-batch2-approval-packet.json
 *  - docs/config-expansion/HONEYWELL_BATCH2_APPROVAL_PACKET.md
 *
 * Batch 2 is the higher-risk term/support/software review batch. This packet is a
 * REVIEW PACKET ONLY: it is not runtime authority, it creates no approved Batch 2
 * runtime pack, it activates nothing, and every entry stays
 * pending_human_approval with an advisory recommendedDecision. These tests prove
 * the packet is review-only/pricing-free, that the five required groups exist with
 * the expected SKUs, that replacement candidates appear only in deferred form, and
 * that the Batch 1 approved pack and the v2 candidate/approval-packet source files
 * are untouched. Files are read from disk and never mutated. The packet is parsed
 * as `any`: it is a groups/deferred review shape, not a ConfigExpansionRulePack.
 */

const dataPath = (f: string) => join(process.cwd(), "data/config-expansion", f);
const PACKET_PATH = dataPath("honeywell-batch2-approval-packet.json");
const MD_PATH = join(
  process.cwd(),
  "docs/config-expansion/HONEYWELL_BATCH2_APPROVAL_PACKET.md"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-batch2-approval-packet.test.ts"
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
// A SKU-shaped 5Y/7Y token. Does NOT match prose like "5Y/7Y", only an invented
// SKU name such as "...-5Y".
const INVENTED_TERM_SKU = /-(5Y|7Y)\b/;

const APPROVAL_GROUP_IDS = [
  "c9300x-software-support-term",
  "c9300l-software-support-term",
  "wireless-support-subscription-support",
  "phone-support",
];

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
function groupSkus(id: string): string[] {
  return (groupById(id)?.entries ?? []).map((e: any) => e.sku);
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

// --- Metadata ---------------------------------------------------------------

describe("honeywell batch 2 packet - metadata", () => {
  it("exists and is valid JSON", () => {
    expect(existsSync(PACKET_PATH)).toBe(true);
    expect(typeof packet).toBe("object");
    expect(packet).toBeTruthy();
  });

  it("is a review-only, batch-2, pending packet", () => {
    expect(packet.packetId).toBe("honeywell-batch2-approval-packet");
    expect(packet.batch).toBe("batch-2");
    expect(packet.status).toBe("pending_human_approval");
    expect(packet.reviewOnly).toBe(true);
    expect(packet.runtimeAuthority).toBe(false);
  });

  it("sources from the v2 candidate pack and v2 approval packet", () => {
    expect(packet.sourceCandidateRulePackId).toBe("honeywell-candidate-rules-v2");
    expect(packet.sourceCandidateRulePackStatus).toBe("candidate");
    expect(packet.sourceApprovalPacketId).toBe("honeywell-rule-approval-packet-v2");
  });
});

// --- Nothing approved / nothing requires-approval-off / no pricing ----------

describe("honeywell batch 2 packet - approves nothing", () => {
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
});

describe("honeywell batch 2 packet - no pricing authority", () => {
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

describe("honeywell batch 2 packet - required groups", () => {
  it("contains the four Batch 2 approval groups", () => {
    expect(groups().map((g: any) => g.groupId).sort()).toEqual([...APPROVAL_GROUP_IDS].sort());
  });

  it("contains the deferred group", () => {
    expect(packet.deferred).toBeTruthy();
    expect(packet.deferred.groupId).toBe("deferred-from-batch-2");
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

// --- Expected SKUs in the right groups --------------------------------------

describe("honeywell batch 2 packet - expected SKUs per group", () => {
  it("places the C9300X software/support/term SKUs in the C9300X group", () => {
    const skus = groupSkus("c9300x-software-support-term");
    for (const s of [
      "C9300-DNA-A-48", "C9300-DNA-A-48-3Y", "C9300-NW-A-48", "SC9300UK9-1715",
      "TE-EMBEDDED-T", "TE-EMBEDDED-T-3Y", "D-DNAS-EXT-S-T", "D-DNAS-EXT-S-3Y",
      "TE-C9K-SW", "NETWORK-PNP-LIC", "CON-L1NCD-C9300XY4", "CON-L1SWT-C93A48",
    ]) {
      expect(skus, s).toContain(s);
    }
  });

  it("places the C9300L software/support/term SKUs in the C9300L group", () => {
    const skus = groupSkus("c9300l-software-support-term");
    for (const s of [
      "C9300L-DNA-A-24", "C9300L-DNA-A-24-3Y", "C9300L-NW-A-24", "S9300LUK9-1718",
      "TE-EMBEDDED-T", "TE-EMBEDDED-T-3Y", "D-DNAS-EXT-S-T", "D-DNAS-EXT-S-3Y",
      "TE-C9K-SW", "NETWORK-PNP-LIC", "CON-L1NCD-C93024PX", "CON-L1SWT-C93LA24",
    ]) {
      expect(skus, s).toContain(s);
    }
  });

  it("places the wireless support/subscription-support SKUs in the wireless group", () => {
    const skus = groupSkus("wireless-support-subscription-support");
    expect(skus).toContain("CON-ROB-CW9178IC");
    expect(skus).toContain("SVS-L0SPT-CN");
  });

  it("places the current phone support SKU in the phone group", () => {
    expect(groupSkus("phone-support")).toContain("CON-L1NBD-P7PK94P1");
  });

  it("keeps Batch 1 SKUs out of the Batch 2 approval groups", () => {
    const approvalSkus = new Set(approvalEntries().map((e: any) => e.sku));
    for (const s of [
      "LIC-CW-A", "LIC-SPACES-ADV", "CAB-C15-CBN",
      "PWR-C1-1100WAC-P", "PWR-C1-1100WAC-P/2", "PWR-C1-715WAC-P", "PWR-C1-715WAC-P/2",
    ]) {
      expect(approvalSkus.has(s), s).toBe(false);
    }
  });

  it("places both optics in the deferred group", () => {
    const deferredSkus = deferredEntries().map((e: any) => e.sku);
    expect(deferredSkus).toContain("SFP-10G-LR-S=");
    expect(deferredSkus).toContain("SFP-10/25G-LR-S=");
  });
});

// --- Entry shape ------------------------------------------------------------

describe("honeywell batch 2 packet - entry shape", () => {
  it("every approval-group entry carries the required review fields", () => {
    for (const e of approvalEntries()) {
      const label = e.decisionId;
      expect(typeof e.decisionId, label).toBe("string");
      expect(e.batch, label).toBe("batch-2");
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

  it("every entry recommendedDecision is one of the allowed values", () => {
    for (const e of allEntries()) {
      expect(RECOMMENDED.has(e.recommendedDecision), `${e.decisionId}: ${e.recommendedDecision}`).toBe(true);
    }
  });

  it("uses unique decisionIds across the whole packet", () => {
    const ids = allEntries().map((e: any) => e.decisionId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("flags term-coupled term-group lines with the 3Y default and 5Y/7Y alternative flags", () => {
    const termLines = approvalEntries().filter((e: any) => typeof e.termGroupId === "string");
    expect(termLines.length).toBeGreaterThan(0);
    for (const e of termLines) {
      expect(e.riskFlags, e.decisionId).toContain("term_coupled");
      expect(e.riskFlags, e.decisionId).toContain("term_default_36_months");
      expect(e.riskFlags, e.decisionId).toContain("term_alternatives_60_84_months");
      expect(e.termMonths, e.decisionId).toBe(36);
    }
  });
});

describe("honeywell batch 2 packet - deferred entry shape", () => {
  // quantityRule is intentionally child-line-only: replacement candidates are SKU
  // mappings (not parent/child lines) and standalone optics carry no parent-derived
  // quantity rule, so deferred entries faithfully omit it. They still carry the
  // review fields a deferred entry needs.
  it("every deferred entry carries the core review fields", () => {
    const entries = deferredEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      const label = e.decisionId;
      expect(typeof e.decisionId, label).toBe("string");
      expect(e.batch, label).toBe("batch-2");
      expect(e.status, label).toBe("pending_human_approval");
      expect(typeof e.sku === "string" && e.sku.length > 0, label).toBe(true);
      expect(typeof e.description === "string" && e.description.length > 0, label).toBe(true);
      expect(typeof e.evidenceScope === "string" && e.evidenceScope.length > 0, label).toBe(true);
      expect(Array.isArray(e.evidence) && e.evidence.length >= 1, label).toBe(true);
      expect(Array.isArray(e.riskFlags) && e.riskFlags.length >= 1, label).toBe(true);
      expect(e.riskFlags, label).toContain("deferred_not_batch_2");
      expect(RECOMMENDED.has(e.recommendedDecision), label).toBe(true);
      expect(typeof e.reviewQuestion === "string" && e.reviewQuestion.length > 0, label).toBe(true);
      expect(typeof e.notes === "string" && e.notes.length > 0, label).toBe(true);
    }
  });
});

// --- Phone historical SKU mismatch ------------------------------------------

describe("honeywell batch 2 packet - phone support historical mismatch", () => {
  it("flags the current phone support SKU with historical_sku_mismatch and names the old SKU", () => {
    const phone = (groupById("phone-support").entries ?? []).find(
      (e: any) => e.sku === "CON-L1NBD-P7PK94P1"
    );
    expect(phone).toBeTruthy();
    expect(phone.riskFlags).toContain("historical_sku_mismatch");
    expect(String(phone.notes)).toContain("CON-SNT-P7PK94P1");
  });
});

// --- Replacement candidates: deferred form only -----------------------------

describe("honeywell batch 2 packet - replacements deferred only", () => {
  const historicalSkus: string[] = (v2.replacementCandidates ?? []).map((r: any) => r.historicalSku);

  it("the v2 source actually carries replacement candidates", () => {
    expect(historicalSkus.length).toBeGreaterThan(0);
  });

  it("keeps every historical replacement SKU out of the approval groups", () => {
    const approvalSkus = new Set(approvalEntries().map((e: any) => e.sku));
    for (const h of historicalSkus) expect(approvalSkus.has(h), h).toBe(false);
  });

  it("represents every replacement only as a deferred, non-approval entry", () => {
    const byHistorical = new Map<string, any>();
    for (const e of deferredEntries()) {
      if (e.deferredCategory === "replacement_candidate") byHistorical.set(e.historicalSku, e);
    }
    for (const h of historicalSkus) {
      const e = byHistorical.get(h);
      expect(e, h).toBeTruthy();
      expect(e.deferredCategory, h).toBe("replacement_candidate");
      expect(["defer_needs_more_evidence", "reject_for_runtime"], h).toContain(e.recommendedDecision);
      expect(e.recommendedDecision, h).not.toBe("approve_for_honeywell_mvp");
      expect(e.riskFlags, h).toContain("historical_sku_mismatch");
    }
  });
});

// --- Batch 1 approved pack remains approved and unchanged in scope ----------

describe("honeywell batch 2 packet - Batch 1 pack untouched", () => {
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

// --- Source candidate / review packet files remain candidate / pending ------

describe("honeywell batch 2 packet - source v2 files unchanged", () => {
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
});

// --- Companion Markdown -----------------------------------------------------

describe("honeywell batch 2 packet - companion Markdown", () => {
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

  it("summarizes Batch 1 and states the Batch 2 scope", () => {
    expect(mdLower).toContain("batch 1");
    expect(mdLower).toContain("batch 2 scope");
  });

  it("includes the five grouped sections", () => {
    for (const phrase of [
      "catalyst 9300x", "catalyst 9300l", "wireless support", "phone support", "deferred",
    ]) {
      expect(mdLower, phrase).toContain(phrase);
    }
  });

  it("includes a Questions for Human Approval section", () => {
    expect(mdLower).toContain("questions for human approval");
  });

  it("states Batch 2 does not approve replacements or broader Cisco generalization", () => {
    expect(mdLower).toContain("replacement");
    expect(mdLower).toContain("broader cisco generalization");
  });
});

// --- Hygiene ----------------------------------------------------------------

describe("honeywell batch 2 packet - hygiene", () => {
  it("invents no 5Y/7Y SKU token anywhere in the packet", () => {
    for (const o of collectObjects(packet, [])) {
      for (const v of Object.values(o)) {
        if (typeof v === "string") expect(INVENTED_TERM_SKU.test(v), v).toBe(false);
      }
    }
  });

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
