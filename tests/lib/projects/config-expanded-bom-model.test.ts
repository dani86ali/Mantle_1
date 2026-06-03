import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildConfigExpandedBomModel,
  type ConfigExpandedBomModel,
} from "@/lib/projects/config-expanded-bom-model";
import type {
  ConfigExpansionEvidenceCitation,
  ConfigurationExpansionDraftLine,
} from "@/lib/projects/config-expansion-types";

/**
 * Behavior test for the pure parent-child display model - a structural model for
 * configuration-expansion draft/display lines (Prompt 36, Section 19 task 8g). The
 * helper groups/flattens draft/display lines: it nests expansion lines under their
 * source customer line while preserving customer lines and original line order. It
 * is NOT the accepted expanded BoM; that comes later from the engineer review
 * helper. These tests build small inline draft-line fixtures; they never persist,
 * price, look up the catalog, or wire runtime, and they prove the model neither
 * mutates nor aliases its inputs.
 */

const MODULE_PATH = join(process.cwd(), "src/lib/projects/config-expanded-bom-model.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/config-expanded-bom-model.test.ts");

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

function build(lines: readonly ConfigurationExpansionDraftLine[]): ConfigExpandedBomModel {
  return buildConfigExpandedBomModel(lines);
}

// --- Parent groups and nesting ---------------------------------------------

describe("buildConfigExpandedBomModel - parent groups", () => {
  it("builds parent groups in customer line order", () => {
    const model = build([
      customer({ lineId: "line-1", sku: "P1" }),
      customer({ lineId: "line-2", sku: "P2", sourceRowNumber: 2, originalLineNumber: "2" }),
      customer({ lineId: "line-3", sku: "P3", sourceRowNumber: 3, originalLineNumber: "3" }),
    ]);
    expect(model.groups.map((g) => g.customerLine.lineId)).toEqual(["line-1", "line-2", "line-3"]);
    expect(model.groups.every((g) => g.children.length === 0)).toBe(true);
    expect(model.summary).toEqual({
      customerLineCount: 3,
      expansionLineCount: 0,
      totalLineCount: 3,
    });
  });

  it("nests expansion lines under the correct customer line", () => {
    const model = build([
      customer({ lineId: "line-1", sku: "P1" }),
      expansion({ lineId: "line-1-x1", sku: "C1", parentLineId: "line-1" }),
      customer({ lineId: "line-2", sku: "P2", sourceRowNumber: 2, originalLineNumber: "2" }),
      expansion({ lineId: "line-2-x1", sku: "C2", parentLineId: "line-2" }),
    ]);
    const byParent = Object.fromEntries(
      model.groups.map((g) => [g.customerLine.lineId, g.children.map((c) => c.sku)])
    );
    expect(byParent).toEqual({ "line-1": ["C1"], "line-2": ["C2"] });
  });

  it("preserves child order from the flat draft within a group", () => {
    const model = build([
      customer({ lineId: "line-1" }),
      expansion({ lineId: "line-1-x1", sku: "C1", parentLineId: "line-1" }),
      expansion({ lineId: "line-1-x2", sku: "C2", parentLineId: "line-1" }),
      expansion({ lineId: "line-1-x3", sku: "C3", parentLineId: "line-1" }),
    ]);
    expect(model.groups[0].children.map((c) => c.sku)).toEqual(["C1", "C2", "C3"]);
  });

  it("keeps a customer line with no children as a group", () => {
    const model = build([
      customer({ lineId: "line-1", sku: "P1" }),
      customer({ lineId: "line-2", sku: "P2", sourceRowNumber: 2, originalLineNumber: "2" }),
      expansion({ lineId: "line-2-x1", sku: "C1", parentLineId: "line-2" }),
    ]);
    expect(model.groups).toHaveLength(2);
    expect(model.groups[0].children).toEqual([]);
    expect(model.groups[1].children.map((c) => c.sku)).toEqual(["C1"]);
  });

  it("returns flattened display lines in parent-child order from scrambled input", () => {
    // Deliberately interleaved/out-of-group input: both customers first, then the
    // children - and a child placed before any line-grouping. The model regroups.
    const model = build([
      customer({ lineId: "line-1", sku: "P1" }),
      customer({ lineId: "line-2", sku: "P2", sourceRowNumber: 2, originalLineNumber: "2" }),
      expansion({ lineId: "line-2-x1", sku: "C2a", parentLineId: "line-2" }),
      expansion({ lineId: "line-1-x1", sku: "C1a", parentLineId: "line-1" }),
      expansion({ lineId: "line-1-x2", sku: "C1b", parentLineId: "line-1" }),
    ]);
    expect(model.flattenedLines.map((l) => l.sku)).toEqual(["P1", "C1a", "C1b", "P2", "C2a"]);
    expect(model.summary).toEqual({
      customerLineCount: 2,
      expansionLineCount: 3,
      totalLineCount: 5,
    });
  });
});

// --- Validation -------------------------------------------------------------

describe("buildConfigExpandedBomModel - validation", () => {
  it("rejects duplicate lineId values", () => {
    expect(() =>
      build([customer({ lineId: "dup" }), customer({ lineId: "dup", sourceRowNumber: 2 })])
    ).toThrow(/duplicate lineId/);
  });

  it("rejects an expansion line whose parentLineId references no customer line", () => {
    expect(() =>
      build([customer({ lineId: "line-1" }), expansion({ parentLineId: "nope" })])
    ).toThrow(/does not reference a customer line/);
  });

  it("rejects an expansion line nesting under another expansion line", () => {
    expect(() =>
      build([
        customer({ lineId: "line-1" }),
        expansion({ lineId: "line-1-x1", parentLineId: "line-1" }),
        expansion({ lineId: "line-1-x1-x1", sku: "GRANDCHILD", parentLineId: "line-1-x1" }),
      ])
    ).toThrow(/must not nest under another expansion line/);
  });

  it("rejects an expansion line missing a parentLineId", () => {
    expect(() =>
      build([customer({ lineId: "line-1" }), expansion({ parentLineId: undefined })])
    ).toThrow(/missing a parentLineId/);
  });

  it("rejects a customer line carrying a parentLineId", () => {
    expect(() =>
      build([customer({ lineId: "line-1" }), customer({ lineId: "line-2", parentLineId: "line-1" })])
    ).toThrow(/must not carry a parentLineId/);
  });

  it("rejects an unknown origin defensively", () => {
    const bad = { ...customer({ lineId: "line-1" }), origin: "mystery" } as unknown as ConfigurationExpansionDraftLine;
    expect(() => build([bad])).toThrow(/unknown origin/);
  });
});

// --- Purity: no mutation, no aliasing --------------------------------------

describe("buildConfigExpandedBomModel - purity", () => {
  it("does not mutate or alias input objects, cells, or evidence", () => {
    const cust = customer({
      lineId: "line-1",
      originalCells: { "#": "1", "Part Number": "PARENT-A" },
    });
    const exp = expansion({ lineId: "line-1-x1", parentLineId: "line-1", evidence: [citation()] });
    const inputCells = cust.originalCells;
    const inputEvidence = exp.evidence;
    const inputCitation = exp.evidence?.[0];

    const model = build([cust, exp]);
    const outCustomer = model.groups[0].customerLine;
    const outChild = model.groups[0].children[0];

    // The model copies, it does not alias the input line objects or their nested data.
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
  });
});

// --- Decoupling and hygiene -------------------------------------------------

describe("config-expanded-bom-model module - decoupling and hygiene", () => {
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
