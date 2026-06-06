import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Tests for the review-only Honeywell Batch 4 optics / replacement-candidate
 * approval packet:
 *  - data/config-expansion/honeywell-batch4-approval-packet.json
 *  - docs/config-expansion/HONEYWELL_BATCH4_APPROVAL_PACKET.md
 *
 * Batch 4 is the remaining-review batch: the 2 optics and the 11
 * historical-to-current replacement candidates that approved Batch 1, Batch 2,
 * and Batch 3 intentionally left deferred. This packet is a REVIEW PACKET ONLY:
 * it is not runtime authority, it creates no approved Batch 4 runtime pack, it
 * activates nothing, and every entry stays pending_human_approval with an
 * advisory recommendedDecision. These tests prove the packet is
 * review-only/pricing-free, that exactly the 2 optics and 11 replacement
 * candidates exist as review entries, that no already-approved Batch 1 / Batch 2
 * / Batch 3 child line appears as a Batch 4 approval entry (with the documented
 * exception that a replacement's CURRENT SKUs may already be approved), that
 * optics are not approved and replacement candidates authorize no silent runtime
 * SKU substitution, and that the v2 candidate pack and the approved Batch 1 /
 * Batch 2 / Batch 3 packs are untouched. Files are read from disk and never
 * mutated. The packet is parsed as `any`: it is a groups review shape, not a
 * ConfigExpansionRulePack, so no runtime evaluator is imported and no runtime
 * expansion smoke test is added.
 */

const dataPath = (f: string) => join(process.cwd(), "data/config-expansion", f);
const PACKET_PATH = dataPath("honeywell-batch4-approval-packet.json");
const MD_PATH = join(
  process.cwd(),
  "docs/config-expansion/HONEYWELL_BATCH4_APPROVAL_PACKET.md"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-batch4-approval-packet.test.ts"
);

const packetRaw = readFileSync(PACKET_PATH, "utf8");
const packet: any = JSON.parse(packetRaw);
const v2: any = JSON.parse(readFileSync(dataPath("honeywell-candidate-rules-v2.json"), "utf8"));

const RECOMMENDED = new Set([
  "defer_needs_more_evidence",
  "reject_for_runtime",
  "review_option_only",
]);
const PRICING_TOKENS = [
  "price", "cost", "discount", "margin", "markup", "vat", "currency", "msrp", "sell", "amount",
];

const GROUP_IDS = ["optics", "replacement-candidates"];
const OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];

function groups(): any[] {
  return Array.isArray(packet.groups) ? packet.groups : [];
}
function groupById(id: string): any {
  return groups().find((g: any) => g.groupId === id);
}
function allEntries(): any[] {
  return groups().flatMap((g: any) => (Array.isArray(g.entries) ? g.entries : []));
}
function opticEntries(): any[] {
  return allEntries().filter((e: any) => e.category === "optic");
}
function replacementEntries(): any[] {
  return allEntries().filter((e: any) => e.category === "replacement_candidate");
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

// Child SKUs that belong to an already-approved runtime pack. Derived from the
// approved packs themselves so the disjointness check tracks the real approved
// scope. Keyed on child SKU (never parentSku, which legitimately overlaps across
// batches - e.g. CW9178I-CFG / C9300X-48HX-A / C9300L-24P-4X-A).
function approvedChildSkuList(file: string): string[] {
  const pack: any = JSON.parse(readFileSync(dataPath(file), "utf8"));
  return (pack.parentRules ?? []).flatMap((p: any) =>
    (p.childLines ?? []).map((c: any) => c.sku as string)
  );
}
function approvedUnion(): Set<string> {
  // Spread string[] (not Set<string>) into the array literal so this compiles
  // without --downlevelIteration on the project's TS target.
  return new Set<string>([
    ...approvedChildSkuList("honeywell-batch1-approved-rules.json"),
    ...approvedChildSkuList("honeywell-batch2-approved-rules.json"),
    ...approvedChildSkuList("honeywell-batch3-approved-rules.json"),
  ]);
}

// --- Metadata ---------------------------------------------------------------

describe("honeywell batch 4 packet - metadata", () => {
  it("exists and is valid JSON", () => {
    expect(existsSync(PACKET_PATH)).toBe(true);
    expect(typeof packet).toBe("object");
    expect(packet).toBeTruthy();
  });

  it("is a review-only, batch-4, pending packet", () => {
    expect(packet.packetId).toBe("honeywell-batch4-approval-packet");
    expect(packet.batch).toBe("batch-4");
    expect(packet.status).toBe("pending_human_approval");
    expect(packet.reviewOnly).toBe(true);
    expect(packet.runtimeAuthority).toBe(false);
    expect(packet.purpose).toBe("optics_replacements_deferred_oddities_review_packet");
  });

  it("sources from the v2 candidate pack and references all three approved packs", () => {
    expect(packet.sourceCandidateRulePackId).toBe("honeywell-candidate-rules-v2");
    expect(packet.sourceCandidateRulePackStatus).toBe("candidate");
    expect(packet.batch1ApprovedPackId).toBe("honeywell-batch1-approved-rules");
    expect(packet.batch2ApprovedPackId).toBe("honeywell-batch2-approved-rules");
    expect(packet.batch3ApprovedPackId).toBe("honeywell-batch3-approved-rules");
  });

  it("makes the Honeywell MVP boundary explicit (not broad Cisco-general)", () => {
    expect(typeof packet.honeywellMvpBoundary).toBe("string");
    expect(packet.honeywellMvpBoundary.toLowerCase()).toContain("not broad cisco-general");
  });
});

// --- Nothing approved / nothing requires-approval-off / no pricing ----------

describe("honeywell batch 4 packet - approves nothing", () => {
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

  it("never recommends approve_for_honeywell_mvp for any optic or replacement", () => {
    for (const e of allEntries()) {
      expect(e.recommendedDecision, e.decisionId).not.toBe("approve_for_honeywell_mvp");
      expect(RECOMMENDED.has(e.recommendedDecision), e.decisionId).toBe(true);
    }
  });

  it("uses unique decisionIds across the whole packet", () => {
    const ids = allEntries().map((e: any) => e.decisionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("honeywell batch 4 packet - no pricing authority", () => {
  // Keys-only by design: the preserved evidence legitimately contains the
  // substring "price" in VALUES (GPL notes such as "not pricing or configuration
  // authority"). The architecture bans pricing as configuration fields, i.e.
  // pricing-shaped KEYS - so this scans keys, never values.
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

describe("honeywell batch 4 packet - required groups", () => {
  it("contains exactly the optics and replacement-candidates groups", () => {
    expect(groups().map((g: any) => g.groupId).sort()).toEqual([...GROUP_IDS].sort());
  });

  it("has 13 review entries: 2 optics + 11 replacement candidates", () => {
    expect(allEntries().length).toBe(13);
    expect(opticEntries().length).toBe(2);
    expect(replacementEntries().length).toBe(11);
  });

  it("omits a deferred-oddities group and documents why (none remain)", () => {
    expect(groupById("deferred-oddities")).toBeFalsy();
    expect(packet.coverageReconciliation).toBeTruthy();
    expect(packet.coverageReconciliation.v2ChildSkusUncovered).toBe(0);
    expect(String(packet.coverageReconciliation.additionalDeferredOdditiesFound).toLowerCase()).toContain("none");
  });
});

// --- Optics: review-only, not approved --------------------------------------

describe("honeywell batch 4 packet - optics are review-only", () => {
  it("both optics exist as review entries and are not in any approved pack", () => {
    const approved = approvedUnion();
    const opticSkus = opticEntries().map((e: any) => e.sku);
    for (const optic of OPTICS) {
      expect(opticSkus, optic).toContain(optic);
      expect(approved.has(optic), optic).toBe(false);
    }
    expect(opticEntries().length).toBe(OPTICS.length);
    for (const e of opticEntries()) {
      expect(e.recommendedDecision, e.sku).toBe("defer_needs_more_evidence");
      expect(e.riskFlags, e.sku).toContain("optic_requires_review");
      expect(e.relationshipType, e.sku).toBe("standalone");
    }
  });
});

// --- Replacement candidates: every v2 candidate, deferred, non-silent -------

describe("honeywell batch 4 packet - replacement candidates", () => {
  const v2Candidates: any[] = Array.isArray(v2.replacementCandidates) ? v2.replacementCandidates : [];
  const historicalSkus: string[] = v2Candidates.map((r: any) => r.historicalSku);

  it("the v2 source actually carries all 11 replacement candidates", () => {
    expect(historicalSkus.length).toBe(11);
  });

  it("represents every v2 replacement candidate as a separate Batch 4 review entry", () => {
    const byHistorical = new Map<string, any>();
    for (const e of replacementEntries()) byHistorical.set(e.historicalSku, e);
    expect(byHistorical.size).toBe(11);
    for (const c of v2Candidates) {
      const e = byHistorical.get(c.historicalSku);
      expect(e, c.historicalSku).toBeTruthy();
      // sku field is the historical SKU; currentSkus mirror the v2 mapping.
      expect(e.sku, c.historicalSku).toBe(c.historicalSku);
      expect(e.candidateReplacementId, c.historicalSku).toBe(c.candidateReplacementId);
      expect(new Set(e.currentSkus), c.historicalSku).toEqual(new Set(c.currentSkus));
      expect(e.relationshipType, c.historicalSku).toBe("replacement_candidate");
      expect(["defer_needs_more_evidence", "reject_for_runtime"], c.historicalSku).toContain(
        e.recommendedDecision
      );
    }
  });

  it("proves every replacement entry authorizes no silent runtime SKU substitution", () => {
    for (const e of replacementEntries()) {
      expect(e.riskFlags, e.decisionId).toContain("no_silent_substitution");
      expect(e.riskFlags, e.decisionId).toContain("historical_sku_mismatch");
      expect(typeof e.notes, e.decisionId).toBe("string");
      expect(
        /does not authorize silent runtime sku replacement/.test(e.notes.toLowerCase()),
        e.decisionId
      ).toBe(true);
    }
  });
});

// --- Disjointness vs approved packs (be precise) ----------------------------

describe("honeywell batch 4 packet - no approved child line is a Batch 4 approval entry", () => {
  it("the approved union spans Batch 1, Batch 2 and Batch 3 and is non-empty", () => {
    expect(approvedUnion().size).toBeGreaterThan(0);
  });

  it("keeps every entry.sku out of the approved child-SKU union", () => {
    // entry.sku is the optic SKU or the HISTORICAL replacement SKU - none of which
    // is an approved child line. (The CURRENT replacement targets are handled by
    // the documented-exception check below, NOT here.)
    const approved = approvedUnion();
    for (const e of allEntries()) expect(approved.has(e.sku), e.sku).toBe(false);
  });

  it("documents the exception: each replacement's current SKUs may already be approved", () => {
    // Batch 4 replacement entries are historical-to-current REVIEW decisions, not
    // child-expansion approvals. The current SKUs they map to are legitimately
    // already approved Batch 2 / Batch 3 child lines; this proves the mapping is
    // historical -> approved-current and authorizes no silent substitution.
    const approved = approvedUnion();
    for (const e of replacementEntries()) {
      for (const cur of e.currentSkus) {
        expect(approved.has(cur), `${e.historicalSku} -> ${cur}`).toBe(true);
      }
    }
  });
});

// --- Entry shape ------------------------------------------------------------

describe("honeywell batch 4 packet - entry shape", () => {
  it("every entry carries the required review fields", () => {
    for (const e of allEntries()) {
      const label = e.decisionId;
      expect(typeof e.decisionId, label).toBe("string");
      expect(e.batch, label).toBe("batch-4");
      expect(e.status, label).toBe("pending_human_approval");
      expect(typeof e.category === "string" && e.category.length > 0, label).toBe(true);
      expect(typeof e.sku === "string" && e.sku.length > 0, label).toBe(true);
      expect(typeof e.description === "string" && e.description.length > 0, label).toBe(true);
      expect(typeof e.relationshipType, label).toBe("string");
      expect(typeof e.evidenceScope === "string" && e.evidenceScope.length > 0, label).toBe(true);
      expect(Array.isArray(e.evidence) && e.evidence.length >= 1, label).toBe(true);
      expect(Array.isArray(e.riskFlags) && e.riskFlags.length >= 1, label).toBe(true);
      expect(RECOMMENDED.has(e.recommendedDecision), label).toBe(true);
      expect(typeof e.reviewQuestion === "string" && e.reviewQuestion.length > 0, label).toBe(true);
      expect(typeof e.notes === "string" && e.notes.length > 0, label).toBe(true);
    }
  });

  it("every replacement entry carries the replacement-specific fields", () => {
    for (const e of replacementEntries()) {
      const label = e.decisionId;
      expect(typeof e.candidateReplacementId === "string" && e.candidateReplacementId.length > 0, label).toBe(true);
      expect(typeof e.historicalSku === "string" && e.historicalSku.length > 0, label).toBe(true);
      expect(e.sku, label).toBe(e.historicalSku);
      expect(Array.isArray(e.currentSkus) && e.currentSkus.length >= 1, label).toBe(true);
      expect(e.relationshipType, label).toBe("replacement_candidate");
    }
  });
});

// --- Source candidate / approved packs remain candidate / approved ----------

describe("honeywell batch 4 packet - source and approved packs unchanged", () => {
  const read = (f: string) => JSON.parse(readFileSync(dataPath(f), "utf8"));

  it("leaves the v2 candidate pack candidate and approval-required", () => {
    const c = read("honeywell-candidate-rules-v2.json");
    expect(c.rulePackId).toBe("honeywell-candidate-rules-v2");
    expect(c.status).toBe("candidate");
    expect(c.approvalRequired).toBe(true);
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

describe("honeywell batch 4 packet - companion Markdown", () => {
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

  it("states Batch 1, Batch 2 and Batch 3 are already approved and gives the Batch 4 scope", () => {
    expect(mdLower).toContain("batch 1");
    expect(mdLower).toContain("batch 2");
    expect(mdLower).toContain("batch 3");
    expect(mdLower).toContain("already approved");
    expect(mdLower).toContain("batch 4 scope");
  });

  it("lists optics and replacement candidates as pending review", () => {
    expect(mdLower).toContain("optics");
    expect(mdLower).toContain("replacement");
    expect(mdLower).toContain("pending");
    expect(mdLower).toContain("human approval");
    expect(mdLower).toContain("deferred");
  });

  it("states no silent substitution and no pricing/runtime behavior is added", () => {
    expect(mdLower).toContain("no silent");
    expect(mdLower).toContain("substitution");
    expect(mdLower).toContain("no pricing");
    expect(mdLower).toContain("runtime");
  });
});

// --- Hygiene ----------------------------------------------------------------

describe("honeywell batch 4 packet - hygiene", () => {
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
