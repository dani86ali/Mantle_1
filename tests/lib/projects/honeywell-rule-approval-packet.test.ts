import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Honeywell rule APPROVAL PACKET asset test (Prompt 47).
 *
 * Verifies the committed human-review approval packet at
 * data/config-expansion/honeywell-rule-approval-packet.json and its companion
 * Markdown at docs/config-expansion/HONEYWELL_RULE_APPROVAL_PACKET.md.
 *
 * The packet is a review-only artifact derived mechanically from the candidate
 * rule pack (data/config-expansion/honeywell-candidate-rules.json). It is NOT
 * runtime authority: it activates nothing, approves nothing, and every decision
 * in it is "pending". This test proves a 1:1 review coverage of every candidate
 * parent rule, child line, and replacement; that no decision has been made; that
 * no object claims approval; that no pricing field leaked in; and that all three
 * new files are valid and ASCII-only. Files are read from disk (not imported) so
 * the test also proves the committed JSON parses and the Markdown exists.
 */

const CANDIDATE_PATH = join(
  process.cwd(),
  "data/config-expansion/honeywell-candidate-rules.json"
);
const PACKET_PATH = join(
  process.cwd(),
  "data/config-expansion/honeywell-rule-approval-packet.json"
);
const MD_PATH = join(
  process.cwd(),
  "docs/config-expansion/HONEYWELL_RULE_APPROVAL_PACKET.md"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-rule-approval-packet.test.ts"
);

// Pricing must be absent. These tokens must not appear in ANY object key. This is
// a KEY-only check: a relationshipType VALUE such as "included_zero_price" or a
// risk-flag VALUE such as "included_zero_price_accessory_requires_review" is
// allowed, because they are values, never keys.
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

const candidateRaw = readFileSync(CANDIDATE_PATH, "utf8");
const candidate = JSON.parse(candidateRaw) as Obj;

const packetRaw = readFileSync(PACKET_PATH, "utf8");
const packet = JSON.parse(packetRaw) as Obj;

// Candidate side.
const candidateParents = asArr(candidate.parentRules).filter(isObj);
const candidateReplacements = asArr(candidate.candidateReplacements).filter(isObj);

// Packet side.
const parentReviews = asArr(packet.parentRuleReviews).filter(isObj);
const replacementReviews = asArr(packet.replacementReviews).filter(isObj);

function childReviewsOf(parentReview: Obj | undefined): Obj[] {
  return asArr(parentReview?.childLineReviews).filter(isObj);
}

function parentReviewByRuleId(ruleId: string): Obj[] {
  return parentReviews.filter((pr) => str(pr.ruleId) === ruleId);
}

const packetObjects = collectObjects(packet, []);

describe("Honeywell rule approval packet - metadata", () => {
  it("exists, parses as JSON, and is a pending human-review packet", () => {
    expect(existsSync(PACKET_PATH)).toBe(true);
    expect(packet.packetId).toBe("honeywell-rule-approval-packet");
    expect(packet.packetVersion).toBe("0.1.0");
    expect(packet.purpose).toBe("human_review_packet");
    expect(packet.status).toBe("pending_human_approval");
  });

  it("points back at the candidate pack by id, version, and status", () => {
    expect(packet.sourceCandidateRulePackId).toBe(candidate.rulePackId);
    expect(packet.sourceCandidateRulePackId).toBe("honeywell-candidate-rules");
    expect(packet.sourceCandidateRulePackVersion).toBe(candidate.version);
    expect(packet.sourceCandidateRulePackVersion).toBe("0.1.0-candidate");
    expect(packet.sourceCandidateRulePackStatus).toBe(candidate.status);
    expect(packet.sourceCandidateRulePackStatus).toBe("candidate");
  });

  it("leaves the candidate pack candidate-only and approval-required", () => {
    expect(candidate.status).toBe("candidate");
    expect(candidate.approvalRequired).toBe(true);
  });
});

describe("Honeywell rule approval packet - 1:1 review coverage", () => {
  it("gives every candidate parent rule exactly one parent review", () => {
    expect(candidateParents.length).toBeGreaterThan(0);
    expect(parentReviews.length).toBe(candidateParents.length);
    for (const p of candidateParents) {
      const ruleId = str(p.ruleId);
      expect(parentReviewByRuleId(ruleId).length, ruleId).toBe(1);
    }
  });

  it("gives every candidate child line exactly one matching child review", () => {
    for (const p of candidateParents) {
      const ruleId = str(p.ruleId);
      const review = parentReviewByRuleId(ruleId)[0];
      const childReviews = childReviewsOf(review);
      const candidateChildren = asArr(p.childLines).filter(isObj);
      expect(childReviews.length, ruleId).toBe(candidateChildren.length);
      for (const c of candidateChildren) {
        const sku = str(c.sku);
        const matches = childReviews.filter((cr) => str(cr.sku) === sku);
        expect(matches.length, `${ruleId} / ${sku}`).toBe(1);
      }
    }
  });

  it("gives every candidate replacement exactly one replacement review", () => {
    expect(candidateReplacements.length).toBeGreaterThan(0);
    expect(replacementReviews.length).toBe(candidateReplacements.length);
    for (const r of candidateReplacements) {
      const id = str(r.candidateReplacementId);
      const matches = replacementReviews.filter(
        (rr) => str(rr.candidateReplacementId) === id
      );
      expect(matches.length, id).toBe(1);
    }
  });
});

describe("Honeywell rule approval packet - everything is pending", () => {
  it("marks every review decision pending", () => {
    const reviews: Obj[] = [
      ...parentReviews,
      ...parentReviews.flatMap((pr) => childReviewsOf(pr)),
      ...replacementReviews,
    ];
    expect(reviews.length).toBe(
      parentReviews.length +
        parentReviews.reduce((n, pr) => n + childReviewsOf(pr).length, 0) +
        replacementReviews.length
    );
    for (const r of reviews) {
      expect(str(r.reviewDecision), JSON.stringify(r).slice(0, 90)).toBe(
        "pending"
      );
    }
  });

  it("never carries reviewDecision other than pending anywhere in the tree", () => {
    for (const o of packetObjects) {
      if ("reviewDecision" in o) {
        expect(o.reviewDecision, JSON.stringify(o).slice(0, 90)).toBe("pending");
      }
    }
  });

  it("marks no object in the packet approved: true", () => {
    for (const o of packetObjects) {
      if ("approved" in o) {
        expect(o.approved, JSON.stringify(o).slice(0, 90)).not.toBe(true);
      }
    }
  });
});

describe("Honeywell rule approval packet - pricing absence", () => {
  it("carries no pricing field on any object key", () => {
    for (const o of packetObjects) {
      for (const key of Object.keys(o)) {
        const lower = key.toLowerCase();
        for (const token of FORBIDDEN_KEY_TOKENS) {
          expect(
            lower.includes(token),
            `key "${key}" contains pricing token "${token}"`
          ).toBe(false);
        }
      }
    }
  });
});

describe("Honeywell rule approval packet - companion Markdown", () => {
  const md = existsSync(MD_PATH) ? readFileSync(MD_PATH, "utf8") : "";

  it("exists on disk", () => {
    expect(existsSync(MD_PATH)).toBe(true);
    expect(md.length).toBeGreaterThan(0);
  });

  it("warns it is not runtime authority and requires human pending review", () => {
    expect(md).toContain("not runtime authority");
    expect(md).toContain("human");
    expect(md).toContain("pending");
  });

  it("names every candidate parent SKU", () => {
    for (const p of candidateParents) {
      const sku = str(p.parentSku);
      expect(sku.length).toBeGreaterThan(0);
      expect(md, sku).toContain(sku);
    }
  });
});

describe("Honeywell rule approval packet - source hygiene", () => {
  it("keeps the approval packet JSON ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(packetRaw)).toBe(false);
  });

  it("keeps the approval packet Markdown ASCII-only", () => {
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
