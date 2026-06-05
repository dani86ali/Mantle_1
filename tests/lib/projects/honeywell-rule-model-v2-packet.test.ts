import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Model-aware Honeywell candidate/approval packet v2 asset test (Prompt 50).
 *
 * Verifies the committed v2 artifacts:
 *  - data/config-expansion/honeywell-candidate-rules-v2.json
 *  - data/config-expansion/honeywell-rule-approval-packet-v2.json
 *  - docs/config-expansion/HONEYWELL_RULE_APPROVAL_PACKET_V2.md
 *
 * The v2 candidate re-expresses the Honeywell configuration LOGIC on the advanced
 * rule model (related-SKU quantities, selected-option-count quantities, option
 * groups, term option groups, evidence scope, separate replacement candidates)
 * instead of freezing Honeywell quote quantities. Both v2 artifacts stay
 * candidate/pending only: they activate nothing, approve nothing, and add no
 * pricing. The v1 candidate pack and v1 approval packet must remain candidate and
 * pending. Files are read from disk (not imported) so the test also proves the
 * committed JSON parses and the Markdown exists, all ASCII-only.
 */

const V1_CAND_PATH = join(
  process.cwd(),
  "data/config-expansion/honeywell-candidate-rules.json"
);
const V1_PACKET_PATH = join(
  process.cwd(),
  "data/config-expansion/honeywell-rule-approval-packet.json"
);
const V2_CAND_PATH = join(
  process.cwd(),
  "data/config-expansion/honeywell-candidate-rules-v2.json"
);
const V2_PACKET_PATH = join(
  process.cwd(),
  "data/config-expansion/honeywell-rule-approval-packet-v2.json"
);
const V2_MD_PATH = join(
  process.cwd(),
  "docs/config-expansion/HONEYWELL_RULE_APPROVAL_PACKET_V2.md"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-rule-model-v2-packet.test.ts"
);

// Pricing must be absent. These tokens must not appear in ANY object key. This is
// a KEY-only check: a relationshipType VALUE such as "included_zero_price" is
// allowed, because it is a value, never a key.
const FORBIDDEN_KEY_TOKENS = [
  "price",
  "cost",
  "discount",
  "margin",
  "markup",
  "vat",
  "currency",
  "msrp",
  "sell",
  "amount",
];

// A SKU-shaped 5Y/7Y token (hyphen-prefixed). This intentionally does NOT match
// prose such as "5Y/7Y alternatives", only an invented SKU name like "...-5Y".
const INVENTED_TERM_SKU = /-(5Y|7Y)\b/;

const PSU_GROUP_BY_PARENT: Record<string, string> = {
  "honeywell-c9300x-48hx-a": "c9300x-ac-power-supplies",
  "honeywell-c9300l-24p-4x-a": "c9300l-ac-power-supplies",
};

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function obj(v: unknown): Obj {
  return isObj(v) ? v : {};
}

/** Depth-first collect of every plain object in the parsed tree. */
function collectObjects(node: unknown, acc: Obj[]): Obj[] {
  if (Array.isArray(node)) {
    for (const v of node) collectObjects(v, acc);
  } else if (isObj(node)) {
    acc.push(node);
    for (const v of Object.values(node)) collectObjects(v, acc);
  }
  return acc;
}

/** Depth-first collect of every string value in the parsed tree. */
function collectStrings(node: unknown, acc: string[]): string[] {
  if (typeof node === "string") acc.push(node);
  else if (Array.isArray(node)) {
    for (const v of node) collectStrings(v, acc);
  } else if (isObj(node)) {
    for (const v of Object.values(node)) collectStrings(v, acc);
  }
  return acc;
}

function parentsOf(pack: Obj): Obj[] {
  return asArr(pack.parentRules).filter(isObj);
}

function childrenOf(pack: Obj): Obj[] {
  const out: Obj[] = [];
  for (const p of parentsOf(pack)) {
    for (const c of asArr(p.childLines).filter(isObj)) out.push(c);
  }
  return out;
}

function packetChildReviews(packet: Obj): Obj[] {
  const out: Obj[] = [];
  for (const pr of asArr(packet.parentRuleReviews).filter(isObj)) {
    for (const cr of asArr(pr.childLineReviews).filter(isObj)) out.push(cr);
  }
  return out;
}

function assertNoPricingKeys(node: unknown, label: string): void {
  for (const o of collectObjects(node, [])) {
    for (const key of Object.keys(o)) {
      const lower = key.toLowerCase();
      for (const token of FORBIDDEN_KEY_TOKENS) {
        expect(
          lower.includes(token),
          `${label}: key "${key}" contains pricing token "${token}"`
        ).toBe(false);
      }
    }
  }
}

const v1Candidate = JSON.parse(readFileSync(V1_CAND_PATH, "utf8")) as Obj;
const v1Packet = JSON.parse(readFileSync(V1_PACKET_PATH, "utf8")) as Obj;

const v2CandRaw = readFileSync(V2_CAND_PATH, "utf8");
const v2Candidate = JSON.parse(v2CandRaw) as Obj;
const v2PacketRaw = readFileSync(V2_PACKET_PATH, "utf8");
const v2Packet = JSON.parse(v2PacketRaw) as Obj;

const v1Parents = parentsOf(v1Candidate);
const v1Children = childrenOf(v1Candidate);
const v2Parents = parentsOf(v2Candidate);
const v2Children = childrenOf(v2Candidate);

// All SKUs present in the v1 candidate (used to prove no invented option/term SKU).
const v1Skus = new Set<string>();
for (const p of v1Parents) {
  v1Skus.add(str(p.parentSku));
  for (const c of asArr(p.childLines).filter(isObj)) v1Skus.add(str(c.sku));
}

describe("Honeywell v2 model packet - v1 stays candidate/pending", () => {
  it("leaves the v1 candidate pack candidate and approval-required", () => {
    expect(v1Candidate.rulePackId).toBe("honeywell-candidate-rules");
    expect(v1Candidate.status).toBe("candidate");
    expect(v1Candidate.approvalRequired).toBe(true);
  });

  it("leaves the v1 approval packet pending human approval", () => {
    expect(v1Packet.packetId).toBe("honeywell-rule-approval-packet");
    expect(v1Packet.status).toBe("pending_human_approval");
  });
});

describe("Honeywell v2 candidate - metadata and approval state", () => {
  it("exists, parses, and is the model-aware v2 candidate pack", () => {
    expect(existsSync(V2_CAND_PATH)).toBe(true);
    expect(v2Candidate.rulePackId).toBe("honeywell-candidate-rules-v2");
    expect(v2Candidate.version).toBe("0.2.0-candidate");
    expect(v2Candidate.status).toBe("candidate");
    expect(v2Candidate.approvalRequired).toBe(true);
  });

  it("back-references the v1 candidate pack", () => {
    expect(v2Candidate.sourceCandidateRulePackId).toBe(v1Candidate.rulePackId);
    expect(v2Candidate.sourceCandidateRulePackVersion).toBe(v1Candidate.version);
    expect(v2Candidate.sourceCandidateRulePackStatus).toBe(v1Candidate.status);
  });

  it("preserves the v1 parent and child counts", () => {
    expect(v2Parents.length).toBe(v1Parents.length);
    expect(v2Children.length).toBe(v1Children.length);
  });

  it("marks no object approved and keeps every approval gate inactive", () => {
    for (const o of collectObjects(v2Candidate, [])) {
      if ("approved" in o) {
        expect(o.approved, JSON.stringify(o).slice(0, 90)).toBe(false);
      }
    }
    for (const p of v2Parents) {
      expect(p.approvalRequired, str(p.parentSku)).toBe(true);
      expect(p.approved, str(p.parentSku)).toBe(false);
    }
    for (const c of v2Children) {
      expect(c.approvalRequired, str(c.sku)).toBe(true);
      expect(c.approved, str(c.sku)).toBe(false);
    }
  });
});

describe("Honeywell v2 candidate - wireless license quantity model", () => {
  for (const sku of ["LIC-CW-A", "LIC-SPACES-ADV"]) {
    it(`models ${sku} as the related CW9178I-CFG total, not a frozen 12`, () => {
      const child = v2Children.find((c) => str(c.sku) === sku);
      expect(child, sku).toBeDefined();
      const c = obj(child);

      const qm = obj(c.quantityModel);
      expect(str(qm.type)).toBe("same_as_related_sku_total");
      expect(str(qm.relatedSku)).toBe("CW9178I-CFG");
      expect(str(qm.scope)).toBe("project");

      const dup = obj(c.duplicatePolicy);
      expect(str(dup.scope)).toBe("project_sku");

      // evidenceScope must be present.
      expect(str(c.evidenceScope).length).toBeGreaterThan(0);

      // The legacy fixed quantity is preserved as quote-observed compatibility
      // data and must NOT be described as reusable logic.
      expect(c.quantityValue).toBe(12);
      expect(str(c.legacyQuantityScope)).toBe("quote_observed");
      expect(str(c.legacyQuantityScope)).not.toBe("reusable_logic");
      const notes = str(c.reviewNotes).toLowerCase();
      expect(notes).toContain("quote-observed");
      expect(notes).toContain("not reusable");
    });
  }
});

describe("Honeywell v2 candidate - power cable quantity model", () => {
  it("models both CAB-C15-CBN lines as a selected AC PSU count", () => {
    const cabRules: { ruleId: string; child: Obj }[] = [];
    for (const p of v2Parents) {
      for (const c of asArr(p.childLines).filter(isObj)) {
        if (str(c.sku) === "CAB-C15-CBN") {
          cabRules.push({ ruleId: str(p.ruleId), child: c });
        }
      }
    }
    // One CAB-C15-CBN under each of the two switch parents.
    expect(cabRules.length).toBe(2);
    for (const { ruleId, child } of cabRules) {
      const qm = obj(child.quantityModel);
      expect(str(qm.type), ruleId).toBe("selected_option_count");
      expect(str(qm.optionGroupId), ruleId).toBe(PSU_GROUP_BY_PARENT[ruleId]);
    }
  });
});

describe("Honeywell v2 candidate - option groups", () => {
  const groups = asArr(v2Candidate.optionGroups).filter(isObj);

  it("defines the C9300X and C9300L AC power-supply groups with their PSU SKUs", () => {
    const expected: Record<string, string[]> = {
      "c9300x-ac-power-supplies": ["PWR-C1-1100WAC-P", "PWR-C1-1100WAC-P/2"],
      "c9300l-ac-power-supplies": ["PWR-C1-715WAC-P", "PWR-C1-715WAC-P/2"],
    };
    for (const [groupId, psus] of Object.entries(expected)) {
      const group = groups.find((g) => str(g.optionGroupId) === groupId);
      expect(group, groupId).toBeDefined();
      const skus = asArr(obj(group).optionSkus).map(str);
      for (const psu of psus) {
        expect(skus, groupId).toContain(psu);
      }
      expect(obj(group).engineerReviewRequired, groupId).toBe(true);
    }
  });
});

describe("Honeywell v2 candidate - term option groups", () => {
  const termGroups = asArr(v2Candidate.termOptionGroups).filter(isObj);

  it("has at least one term group", () => {
    expect(termGroups.length).toBeGreaterThan(0);
  });

  it("defaults to a 3Y term with 5Y/7Y review alternatives and an evidence caveat", () => {
    for (const g of termGroups) {
      expect(g.defaultTermMonths, str(g.termGroupId)).toBe(36);
      const allowed = asArr(g.allowedTermMonths);
      expect(allowed, str(g.termGroupId)).toContain(36);
      expect(allowed, str(g.termGroupId)).toContain(60);
      expect(allowed, str(g.termGroupId)).toContain(84);
      const notes = str(g.notes);
      expect(notes, str(g.termGroupId)).toContain("5Y/7Y");
      expect(notes.toLowerCase(), str(g.termGroupId)).toContain("evidence");
    }
  });

  it("lists only existing v1 SKUs and invents no 5Y/7Y SKU", () => {
    for (const g of termGroups) {
      for (const sku of asArr(g.optionSkus).map(str)) {
        expect(v1Skus.has(sku), sku).toBe(true);
        expect(INVENTED_TERM_SKU.test(sku), sku).toBe(false);
      }
    }
  });

  it("invents no 5Y/7Y SKU token anywhere in the v2 candidate", () => {
    for (const s of collectStrings(v2Candidate, [])) {
      expect(INVENTED_TERM_SKU.test(s), s).toBe(false);
    }
  });
});

describe("Honeywell v2 candidate - replacement candidates", () => {
  const replacements = asArr(v2Candidate.replacementCandidates).filter(isObj);

  it("carries the replacements as a separate table, all unapproved", () => {
    const v1Replacements = asArr(v1Candidate.candidateReplacements).filter(isObj);
    expect(replacements.length).toBe(v1Replacements.length);
    expect(replacements.length).toBeGreaterThan(0);
    for (const r of replacements) {
      const hist = str(r.historicalSku);
      expect(hist.length).toBeGreaterThan(0);
      expect(r.approved, hist).toBe(false);
      expect(r.approvalRequired, hist).toBe(true);
      expect(asArr(r.currentSkus).length, hist).toBeGreaterThanOrEqual(1);
      expect(asArr(r.evidence).length, hist).toBeGreaterThanOrEqual(1);
      expect(str(r.evidenceScope).length, hist).toBeGreaterThan(0);
    }
  });
});

describe("Honeywell v2 approval packet - metadata and pending state", () => {
  it("exists, parses, and is the model-aware pending packet", () => {
    expect(existsSync(V2_PACKET_PATH)).toBe(true);
    expect(v2Packet.packetId).toBe("honeywell-rule-approval-packet-v2");
    expect(v2Packet.packetVersion).toBe("0.2.0");
    expect(v2Packet.purpose).toBe("model_aware_human_review_packet");
    expect(v2Packet.status).toBe("pending_human_approval");
  });

  it("sources from the v2 candidate pack", () => {
    expect(v2Packet.sourceCandidateRulePackId).toBe("honeywell-candidate-rules-v2");
    expect(v2Packet.sourceCandidateRulePackVersion).toBe("0.2.0-candidate");
    expect(v2Packet.sourceCandidateRulePackStatus).toBe("candidate");
  });

  it("keeps every review decision pending and approves nothing", () => {
    for (const o of collectObjects(v2Packet, [])) {
      if ("reviewDecision" in o) {
        expect(o.reviewDecision, JSON.stringify(o).slice(0, 90)).toBe("pending");
      }
      if ("approved" in o) {
        expect(o.approved, JSON.stringify(o).slice(0, 90)).not.toBe(true);
      }
    }
  });

  it("includes model fields in the relevant child reviews", () => {
    const reviews = packetChildReviews(v2Packet);
    const lic = reviews.find((r) => str(r.sku) === "LIC-CW-A");
    expect(lic).toBeDefined();
    expect(str(obj(obj(lic).quantityModel).type)).toBe("same_as_related_sku_total");
    expect(str(obj(obj(lic).duplicatePolicy).scope)).toBe("project_sku");
    expect(str(obj(lic).evidenceScope).length).toBeGreaterThan(0);

    const cab = reviews.find((r) => str(r.sku) === "CAB-C15-CBN");
    expect(cab).toBeDefined();
    expect(str(obj(obj(cab).quantityModel).type)).toBe("selected_option_count");
    expect(str(obj(obj(cab).quantityModel).optionGroupId).length).toBeGreaterThan(0);
  });
});

describe("Honeywell v2 - companion Markdown", () => {
  const md = existsSync(V2_MD_PATH) ? readFileSync(V2_MD_PATH, "utf8") : "";

  it("exists on disk", () => {
    expect(existsSync(V2_MD_PATH)).toBe(true);
    expect(md.length).toBeGreaterThan(0);
  });

  it("includes the required model-aware review phrases", () => {
    for (const phrase of [
      "not runtime authority",
      "same_as_related_sku_total",
      "selected AC PSU count",
      "3Y default",
      "5Y/7Y",
      "all decisions pending",
    ]) {
      expect(md, phrase).toContain(phrase);
    }
  });

  it("names every v2 candidate parent SKU", () => {
    for (const p of v2Parents) {
      const sku = str(p.parentSku);
      expect(sku.length).toBeGreaterThan(0);
      expect(md, sku).toContain(sku);
    }
  });
});

describe("Honeywell v2 - pricing absence", () => {
  it("carries no pricing field on any v2 candidate object key", () => {
    assertNoPricingKeys(v2Candidate, "v2 candidate");
  });

  it("carries no pricing field on any v2 approval packet object key", () => {
    assertNoPricingKeys(v2Packet, "v2 packet");
  });
});

describe("Honeywell v2 - source hygiene", () => {
  it("keeps the v2 candidate JSON ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(v2CandRaw)).toBe(false);
  });

  it("keeps the v2 approval packet JSON ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(v2PacketRaw)).toBe(false);
  });

  it("keeps the v2 Markdown ASCII-only", () => {
    const md = readFileSync(V2_MD_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(md)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
