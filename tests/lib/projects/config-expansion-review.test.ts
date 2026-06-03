import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  applyConfigurationExpansionReview,
  type ApplyConfigurationExpansionReviewInput,
  type ConfigurationExpansionReviewDecision,
} from "@/lib/projects/config-expansion-review";
import type {
  ConfigExpansionEvidenceCitation,
  ConfigurationExpansionDraftLine,
} from "@/lib/projects/config-expansion-types";

/**
 * Behavior test for the pure engineer-review helper (Prompt 37, Section 19 task 8h).
 * The helper applies explicit human accept/reject decisions over an expansion draft
 * to produce the in-memory accepted expanded BoM. These tests build small inline
 * draft-line fixtures; they never persist, price, look up the catalog, load a rule
 * pack, or wire runtime, and they prove the helper neither mutates nor aliases its
 * inputs and adds no pricing fields.
 */

const MODULE_PATH = join(process.cwd(), "src/lib/projects/config-expansion-review.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/config-expansion-review.test.ts");

// --- Inline draft-line fixtures --------------------------------------------

function citation(): ConfigExpansionEvidenceCitation {
  return {
    sourceType: "ccw_export",
    sourcePath: "C:/Pre-Sales/fixture.xlsx",
    sheetName: "Sheet1",
    lineNumber: 1,
    evidenceNote: "fixture evidence",
  };
}

function customer(
  overrides: Partial<ConfigurationExpansionDraftLine> = {}
): ConfigurationExpansionDraftLine {
  return {
    lineId: "line-1",
    origin: "customer",
    sku: "PARENT-A",
    description: "Parent A",
    quantity: 3,
    sourceFileId: "file-1",
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: "PARENT-A",
    originalCells: { "#": "1", "Part Number": "PARENT-A" },
    ...overrides,
  };
}

function expansion(
  overrides: Partial<ConfigurationExpansionDraftLine> = {}
): ConfigurationExpansionDraftLine {
  return {
    lineId: "line-1-x1",
    origin: "expansion",
    sku: "CHILD-1",
    description: "Child one",
    quantity: 3,
    parentLineId: "line-1",
    parentLineNumber: "1",
    relationshipType: "service_or_support",
    quantityRule: "same_as_parent",
    includedItem: false,
    sourceRuleId: "rule-a",
    evidence: [citation()],
    approvalRequired: true,
    approved: false,
    ...overrides,
  };
}

function accept(lineId: string, note?: string): ConfigurationExpansionReviewDecision {
  return note === undefined ? { lineId, action: "accept" } : { lineId, action: "accept", note };
}

function reject(lineId: string, note?: string): ConfigurationExpansionReviewDecision {
  return note === undefined ? { lineId, action: "reject" } : { lineId, action: "reject", note };
}

function review(input: ApplyConfigurationExpansionReviewInput) {
  return applyConfigurationExpansionReview(input);
}

// --- Customer line preservation --------------------------------------------

describe("applyConfigurationExpansionReview - customer lines", () => {
  it("preserves customer lines without requiring review decisions for them", () => {
    const result = review({
      lines: [
        customer({ lineId: "line-1", sku: "P1" }),
        customer({ lineId: "line-2", sku: "P2", sourceRowNumber: 2, originalLineNumber: "2" }),
      ],
      decisions: [],
    });
    expect(result.acceptedLines.map((l) => l.sku)).toEqual(["P1", "P2"]);
    expect(result.acceptedLines.every((l) => l.origin === "customer")).toBe(true);
    expect(result.summary.customerLineCount).toBe(2);
    expect(result.summary.reviewedExpansionLineCount).toBe(0);
    expect(result.summary.totalAcceptedLineCount).toBe(2);
    expect(result.acceptedModel.groups).toHaveLength(2);
  });
});

// --- Explicit decisions required -------------------------------------------

describe("applyConfigurationExpansionReview - explicit decisions", () => {
  it("requires an explicit decision for every expansion line", () => {
    expect(() =>
      review({
        lines: [customer({ lineId: "line-1" }), expansion({ lineId: "line-1-x1", parentLineId: "line-1" })],
        decisions: [],
      })
    ).toThrow(/decision for every expansion line/);
  });

  it("accepts an expansion line and sets approved:true / approvalRequired:false", () => {
    const result = review({
      lines: [customer({ lineId: "line-1" }), expansion({ lineId: "line-1-x1", parentLineId: "line-1" })],
      decisions: [accept("line-1-x1")],
    });
    const accepted = result.acceptedLines.find((l) => l.origin === "expansion");
    expect(accepted).toBeDefined();
    expect(accepted?.approved).toBe(true);
    expect(accepted?.approvalRequired).toBe(false);
    expect(result.summary.acceptedExpansionLineCount).toBe(1);
    expect(result.summary.rejectedExpansionLineCount).toBe(0);
    expect(result.summary.totalAcceptedLineCount).toBe(2);
    expect(result.summary.reviewedExpansionLineCount).toBe(1);
  });

  it("rejects an expansion line and excludes it from acceptedLines", () => {
    const result = review({
      lines: [
        customer({ lineId: "line-1" }),
        expansion({ lineId: "line-1-x1", sku: "C1", parentLineId: "line-1" }),
      ],
      decisions: [reject("line-1-x1")],
    });
    expect(result.acceptedLines.map((l) => l.origin)).toEqual(["customer"]);
    expect(result.summary.acceptedExpansionLineCount).toBe(0);
    expect(result.summary.rejectedExpansionLineCount).toBe(1);
    expect(result.summary.reviewedExpansionLineCount).toBe(1);
  });

  it("records rejected lines in the output", () => {
    const result = review({
      lines: [
        customer({ lineId: "line-1" }),
        expansion({ lineId: "line-1-x1", sku: "C1", parentLineId: "line-1" }),
      ],
      decisions: [reject("line-1-x1", "superseded by an existing customer line")],
    });
    expect(result.rejectedLines).toHaveLength(1);
    expect(result.rejectedLines[0].sku).toBe("C1");
    expect(result.rejectedLines[0].origin).toBe("expansion");
  });
});

// --- Decision validation ----------------------------------------------------

describe("applyConfigurationExpansionReview - decision validation", () => {
  it("rejects duplicate review decisions for the same lineId", () => {
    expect(() =>
      review({
        lines: [customer({ lineId: "line-1" }), expansion({ lineId: "line-1-x1", parentLineId: "line-1" })],
        decisions: [accept("line-1-x1"), accept("line-1-x1")],
      })
    ).toThrow(/duplicate decision/);
  });

  it("rejects a decision referencing an unknown lineId", () => {
    expect(() =>
      review({
        lines: [customer({ lineId: "line-1" }), expansion({ lineId: "line-1-x1", parentLineId: "line-1" })],
        decisions: [accept("line-1-x1"), accept("ghost")],
      })
    ).toThrow(/unknown lineId/);
  });

  it("rejects a decision targeting a customer line", () => {
    expect(() =>
      review({
        lines: [customer({ lineId: "line-1" }), expansion({ lineId: "line-1-x1", parentLineId: "line-1" })],
        decisions: [accept("line-1")],
      })
    ).toThrow(/must not target a customer line/);
  });
});

// --- Accepted-line traceability --------------------------------------------

describe("applyConfigurationExpansionReview - accepted-line traceability", () => {
  it("rejects an accepted expansion line missing its sourceRuleId", () => {
    expect(() =>
      review({
        lines: [
          customer({ lineId: "line-1" }),
          expansion({ lineId: "line-1-x1", parentLineId: "line-1", sourceRuleId: undefined }),
        ],
        decisions: [accept("line-1-x1")],
      })
    ).toThrow(/must carry a sourceRuleId/);
  });

  it("rejects an accepted expansion line missing evidence", () => {
    expect(() =>
      review({
        lines: [
          customer({ lineId: "line-1" }),
          expansion({ lineId: "line-1-x1", parentLineId: "line-1", evidence: undefined }),
        ],
        decisions: [accept("line-1-x1")],
      })
    ).toThrow(/must carry evidence/);
    expect(() =>
      review({
        lines: [
          customer({ lineId: "line-1" }),
          expansion({ lineId: "line-1-x1", parentLineId: "line-1", evidence: [] }),
        ],
        decisions: [accept("line-1-x1")],
      })
    ).toThrow(/must carry evidence/);
  });

  it("does not require traceability for a rejected expansion line", () => {
    const result = review({
      lines: [
        customer({ lineId: "line-1" }),
        expansion({
          lineId: "line-1-x1",
          sku: "C1",
          parentLineId: "line-1",
          sourceRuleId: undefined,
          evidence: undefined,
        }),
      ],
      decisions: [reject("line-1-x1")],
    });
    expect(result.rejectedLines.map((l) => l.sku)).toEqual(["C1"]);
    expect(result.summary.rejectedExpansionLineCount).toBe(1);
  });
});

// --- Parent-child model semantics ------------------------------------------

describe("applyConfigurationExpansionReview - accepted parent-child model", () => {
  it("uses buildConfigExpandedBomModel semantics for accepted parent-child output", () => {
    const result = review({
      lines: [
        customer({ lineId: "line-1", sku: "P1" }),
        expansion({ lineId: "line-1-x1", sku: "C1a", parentLineId: "line-1", sourceRuleId: "rule-a" }),
        expansion({ lineId: "line-1-x2", sku: "C1b", parentLineId: "line-1", sourceRuleId: "rule-a" }),
        customer({ lineId: "line-2", sku: "P2", sourceRowNumber: 2, originalLineNumber: "2" }),
        expansion({ lineId: "line-2-x1", sku: "C2a", parentLineId: "line-2", sourceRuleId: "rule-b" }),
      ],
      decisions: [accept("line-1-x1"), reject("line-1-x2"), accept("line-2-x1")],
    });

    // Rejected child excluded from both the flat accepted lines and the model.
    expect(result.acceptedLines.map((l) => l.sku)).toEqual(["P1", "C1a", "P2", "C2a"]);
    expect(result.rejectedLines.map((l) => l.sku)).toEqual(["C1b"]);

    const byParent = Object.fromEntries(
      result.acceptedModel.groups.map((g) => [g.customerLine.lineId, g.children.map((c) => c.sku)])
    );
    expect(byParent).toEqual({ "line-1": ["C1a"], "line-2": ["C2a"] });
    expect(result.acceptedModel.flattenedLines.map((l) => l.sku)).toEqual(["P1", "C1a", "P2", "C2a"]);
    expect(result.summary).toEqual({
      customerLineCount: 2,
      acceptedExpansionLineCount: 2,
      rejectedExpansionLineCount: 1,
      totalAcceptedLineCount: 4,
      reviewedExpansionLineCount: 3,
    });
  });

  it("returns acceptedLines in customer-then-children order from scrambled input", () => {
    // Customers first, then children interleaved out of group order; each child also
    // out of input order relative to its parent. Two accepted children plus two
    // rejected children to prove rejected lines keep their own input order.
    const result = review({
      lines: [
        customer({ lineId: "line-1", sku: "P1" }),
        customer({ lineId: "line-2", sku: "P2", sourceRowNumber: 2, originalLineNumber: "2" }),
        expansion({ lineId: "line-2-x1", sku: "C2", parentLineId: "line-2", sourceRuleId: "rule-b" }),
        expansion({ lineId: "line-1-x1", sku: "C1", parentLineId: "line-1", sourceRuleId: "rule-a" }),
        expansion({ lineId: "line-2-x2", sku: "C2R", parentLineId: "line-2", sourceRuleId: "rule-b" }),
        expansion({ lineId: "line-1-x2", sku: "C1R", parentLineId: "line-1", sourceRuleId: "rule-a" }),
      ],
      decisions: [
        accept("line-2-x1"),
        accept("line-1-x1"),
        reject("line-2-x2"),
        reject("line-1-x2"),
      ],
    });

    // Accepted lines are regrouped into deterministic customer-then-children order...
    expect(result.acceptedLines.map((l) => l.sku)).toEqual(["P1", "C1", "P2", "C2"]);
    // ...matching the display model's flattenedLines exactly.
    expect(result.acceptedModel.flattenedLines.map((l) => l.sku)).toEqual(["P1", "C1", "P2", "C2"]);
    // Rejected lines keep their original (ungrouped) draft order.
    expect(result.rejectedLines.map((l) => l.sku)).toEqual(["C2R", "C1R"]);
  });
});

// --- Reviewer metadata ------------------------------------------------------

describe("applyConfigurationExpansionReview - reviewer metadata", () => {
  it("echoes reviewedBy/reviewedAt only when provided, never generating time", () => {
    const without = review({ lines: [customer({ lineId: "line-1" })], decisions: [] });
    expect(without.reviewedBy).toBeUndefined();
    expect(without.reviewedAt).toBeUndefined();

    const withMeta = review({
      lines: [customer({ lineId: "line-1" })],
      decisions: [],
      reviewedBy: "eng@example.com",
      reviewedAt: "2026-06-02T00:00:00.000Z",
    });
    expect(withMeta.reviewedBy).toBe("eng@example.com");
    expect(withMeta.reviewedAt).toBe("2026-06-02T00:00:00.000Z");
  });
});

// --- Purity: no mutation, no aliasing --------------------------------------

describe("applyConfigurationExpansionReview - purity", () => {
  it("never mutates or aliases input line objects, originalCells, or evidence citations", () => {
    const cust = customer({ lineId: "line-1", originalCells: { "#": "1", "Part Number": "PARENT-A" } });
    const exp = expansion({ lineId: "line-1-x1", parentLineId: "line-1", evidence: [citation()] });
    const inputCells = cust.originalCells;
    const inputEvidence = exp.evidence;
    const inputCitation = exp.evidence?.[0];

    const result = review({ lines: [cust, exp], decisions: [accept("line-1-x1")] });
    const outCustomer = result.acceptedLines[0];
    const outChild = result.acceptedLines[1];

    // The helper copies; it does not alias the input line objects or their nested data.
    expect(outCustomer).not.toBe(cust);
    expect(outCustomer.originalCells).not.toBe(inputCells);
    expect(outChild).not.toBe(exp);
    expect(outChild.evidence).not.toBe(inputEvidence);
    expect(outChild.evidence?.[0]).not.toBe(inputCitation);

    // Mutating the output must not bleed back into the input.
    if (outCustomer.originalCells) outCustomer.originalCells["#"] = "999";
    if (outChild.evidence) outChild.evidence[0].evidenceNote = "mutated";
    outChild.quantity = 4321;

    expect(cust.originalCells).toEqual({ "#": "1", "Part Number": "PARENT-A" });
    expect(inputCitation?.evidenceNote).toBe("fixture evidence");
    expect(exp.quantity).toBe(3);
    // Accepting did not flip the input line's approval flags.
    expect(exp.approved).toBe(false);
    expect(exp.approvalRequired).toBe(true);
  });
});

// --- No pricing/catalog fields ---------------------------------------------

describe("applyConfigurationExpansionReview - no pricing fields", () => {
  it("output contains no pricing/catalog fields", () => {
    const result = review({
      lines: [
        customer({ lineId: "line-1", sku: "P1" }),
        expansion({ lineId: "line-1-x1", sku: "C1", parentLineId: "line-1" }),
      ],
      decisions: [accept("line-1-x1")],
    });

    const keys: string[] = [];
    const collectKeys = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) collectKeys(item);
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
          keys.push(key);
          // originalCells is verbatim customer data, not helper-authored structure.
          if (key === "originalCells") continue;
          collectKeys(nested);
        }
      }
    };
    collectKeys(result);

    const forbidden = [
      "price",
      "cost",
      "discount",
      "margin",
      "markup",
      "vat",
      "currency",
      "sell",
      "amount",
      "catalog",
    ];
    for (const key of keys) {
      const lower = key.toLowerCase();
      for (const token of forbidden) {
        expect(lower.includes(token), `output key "${key}" matches forbidden "${token}"`).toBe(false);
      }
    }
  });
});

// --- Decoupling and hygiene -------------------------------------------------

describe("config-expansion-review module - decoupling and hygiene", () => {
  it("imports no DB, API/UI, engine, AI, pricing, catalog, or artifact-store modules", () => {
    const source = readFileSync(MODULE_PATH, "utf8");
    const importSources: string[] = [];
    const importRegex = /\bfrom\s+["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(source)) !== null) {
      importSources.push(match[1]);
    }
    const forbidden = [
      "/db",
      "db/",
      "drizzle",
      "artifact-store",
      "/api",
      "/app/",
      "/components",
      "engine",
      "coordinator",
      "anthropic",
      "generative-ai",
      "/ai",
      "pricing",
      "priced-boq",
      "catalog",
      "adapter",
    ];
    for (const importSource of importSources) {
      const lower = importSource.toLowerCase();
      for (const token of forbidden) {
        expect(
          lower.includes(token),
          `module imports "${importSource}" matching forbidden "${token}"`
        ).toBe(false);
      }
    }
  });

  it("keeps the module source ASCII-only", () => {
    const source = readFileSync(MODULE_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
