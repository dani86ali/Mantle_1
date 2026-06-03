import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildConfigurationExpansionDraft,
  type BuildConfigurationExpansionDraftInput,
  type ConfigurationExpansionDraft,
} from "@/lib/projects/config-expansion";
import type { CanonicalBoqLine, SkuResolutionDecision } from "@/types/project";
import type {
  ConfigExpansionChildRule,
  ConfigExpansionEvidenceCitation,
  ConfigExpansionParentRule,
  ConfigExpansionRulePack,
  ConfigurationExpansionDraftLine,
} from "@/lib/projects/config-expansion-types";

/**
 * Behavior test for the pure configuration-expansion draft helper (Prompt 35,
 * Section 19 task 8f). The helper consumes an APPROVED rule pack only; these
 * tests build small inline approved fixtures and never read the committed
 * candidate JSON pack, never flip its approval flags, and never wire runtime.
 */

const MODULE_PATH = join(process.cwd(), "src/lib/projects/config-expansion.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/config-expansion.test.ts");

// --- Inline approved fixtures ----------------------------------------------

function citation(): ConfigExpansionEvidenceCitation {
  return {
    sourceType: "ccw_export",
    sourcePath: "C:/Pre-Sales/fixture.xlsx",
    sheetName: "Sheet1",
    lineNumber: 1,
    evidenceNote: "fixture evidence",
  };
}

function child(overrides: Partial<ConfigExpansionChildRule> = {}): ConfigExpansionChildRule {
  return {
    sku: "CHILD-1",
    description: "Child one",
    relationshipType: "service_or_support",
    quantityRule: "same_as_parent",
    includedItem: false,
    sourceRuleId: "rule-a",
    evidence: [citation()],
    approvalRequired: false,
    approved: true,
    ...overrides,
  };
}

function parent(overrides: Partial<ConfigExpansionParentRule> = {}): ConfigExpansionParentRule {
  return {
    ruleId: "rule-a",
    parentSku: "PARENT-A",
    parentDescription: "Parent A",
    evidence: [citation()],
    childLines: [child()],
    approvalRequired: false,
    approved: true,
    ...overrides,
  };
}

function approvedPack(parentRules: ConfigExpansionParentRule[]): ConfigExpansionRulePack {
  return {
    rulePackId: "fixture-pack",
    name: "Fixture approved pack",
    version: "1.0.0",
    status: "approved",
    approvalRequired: false,
    sourceScope: "fixture",
    parentRules,
  };
}

function line(overrides: Partial<CanonicalBoqLine> = {}): CanonicalBoqLine {
  return {
    sourceFormat: "format_2_number_part_qty",
    sourceFileId: "file-1",
    sourceRowNumber: 1,
    originalLineNumber: "1",
    sku: "PARENT-A",
    description: "Parent A",
    quantity: 3,
    originalCells: { "#": "1", "Part Number": "PARENT-A" },
    ...overrides,
  };
}

function accept(overrides: Partial<SkuResolutionDecision> = {}): SkuResolutionDecision {
  return {
    sourceFileId: "file-1",
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: "PARENT-A",
    status: "accepted",
    suggestions: [],
    acceptedSku: "PARENT-A",
    ...overrides,
  };
}

function build(input: BuildConfigurationExpansionDraftInput) {
  return buildConfigurationExpansionDraft(input);
}

function addedLines(draft: ConfigurationExpansionDraft): ConfigurationExpansionDraftLine[] {
  return draft.lines.filter((l) => l.origin === "expansion");
}

// --- Rule-pack rejection ----------------------------------------------------

describe("buildConfigurationExpansionDraft - rule pack rejection", () => {
  it("rejects a candidate rule pack", () => {
    const candidate: ConfigExpansionRulePack = {
      ...approvedPack([parent({ approved: false, approvalRequired: true })]),
      status: "candidate",
      approvalRequired: true,
    };
    expect(() =>
      build({ lines: [], decisions: [], rulePack: candidate })
    ).toThrow(/rule pack must be approved/);
  });

  it("rejects an approved pack with an unapproved parent rule", () => {
    expect(() =>
      build({ lines: [], decisions: [], rulePack: approvedPack([parent({ approved: false })]) })
    ).toThrow(/parent rule must be approved/);
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([parent({ approvalRequired: true })]),
      })
    ).toThrow(/parent rule must be approved/);
  });

  it("rejects an approved pack with an unapproved child rule", () => {
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([parent({ childLines: [child({ approved: false })] })]),
      })
    ).toThrow(/child rule must be approved/);
  });

  it("rejects parent or child rules missing evidence", () => {
    expect(() =>
      build({ lines: [], decisions: [], rulePack: approvedPack([parent({ evidence: [] })]) })
    ).toThrow(/parent rule must carry evidence/);
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([parent({ childLines: [child({ evidence: [] })] })]),
      })
    ).toThrow(/child rule must carry evidence/);
  });

  it("rejects fixed/fixed_per_parent child rules without quantityValue", () => {
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([parent({ childLines: [child({ sku: "X", quantityRule: "fixed" })] })]),
      })
    ).toThrow(/quantityValue/);
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([
          parent({ childLines: [child({ sku: "X", quantityRule: "fixed_per_parent" })] }),
        ]),
      })
    ).toThrow(/quantityValue/);
  });

  it("rejects duplicate SKU-resolution decisions", () => {
    expect(() =>
      build({
        lines: [line()],
        decisions: [accept(), accept()],
        rulePack: approvedPack([parent()]),
      })
    ).toThrow(/Duplicate/);
  });

  it("rejects an approved pack with duplicate parent ruleIds", () => {
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([
          parent({ ruleId: "dup", parentSku: "P1", childLines: [] }),
          parent({ ruleId: "dup", parentSku: "P2", childLines: [] }),
        ]),
      })
    ).toThrow(/duplicate parent ruleId/);
  });

  it("rejects an approved pack with duplicate parent SKUs", () => {
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([
          parent({ ruleId: "r1", parentSku: "SAME", childLines: [] }),
          parent({ ruleId: "r2", parentSku: "SAME", childLines: [] }),
        ]),
      })
    ).toThrow(/duplicate parent SKU/);
  });

  it("rejects a child whose sourceRuleId does not match its parent ruleId", () => {
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([
          parent({ ruleId: "rule-a", childLines: [child({ sourceRuleId: "rule-b" })] }),
        ]),
      })
    ).toThrow(/sourceRuleId must match/);
  });
});

// --- Customer line preservation --------------------------------------------

describe("buildConfigurationExpansionDraft - customer lines", () => {
  it("preserves every customer line in order with its source identity", () => {
    const l = line({
      sku: "UNKNOWN",
      sourceRowNumber: 5,
      sourceSheetName: "BoQ",
      originalLineNumber: "5",
      originalCells: { "#": "5", "Part Number": "UNKNOWN" },
    });
    const draft = build({ lines: [l], decisions: [], rulePack: approvedPack([parent()]) });

    expect(draft.lines).toHaveLength(1);
    const c = draft.lines[0];
    expect(c.origin).toBe("customer");
    expect(c.lineId).toBe("line-1");
    expect(c.sku).toBe("UNKNOWN");
    expect(c.originalSku).toBe("UNKNOWN");
    expect(c.acceptedSku).toBeUndefined();
    expect(c.sourceFileId).toBe("file-1");
    expect(c.sourceRowNumber).toBe(5);
    expect(c.sourceSheetName).toBe("BoQ");
    expect(c.originalLineNumber).toBe("5");
    expect(c.originalCells).toEqual({ "#": "5", "Part Number": "UNKNOWN" });
    // The draft copies cells; it does not alias the input line.
    expect(c.originalCells).not.toBe(l.originalCells);
    expect(draft.summary.customerLineCount).toBe(1);
    expect(draft.summary.addedLineCount).toBe(0);
  });

  it("carries the human-accepted SKU onto the preserved customer line", () => {
    const l = line({ sku: "RAW-X" });
    const d = accept({ originalSku: "RAW-X", acceptedSku: "PARENT-A" });
    const draft = build({ lines: [l], decisions: [d], rulePack: approvedPack([parent()]) });
    expect(draft.lines[0].originalSku).toBe("RAW-X");
    expect(draft.lines[0].acceptedSku).toBe("PARENT-A");
  });
});

// --- Parent matching --------------------------------------------------------

describe("buildConfigurationExpansionDraft - parent rule matching", () => {
  it("matches on acceptedSku, not originalSku", () => {
    // Original SKU equals the parent SKU but the row was never accepted: no match.
    const notAccepted = build({
      lines: [line({ sku: "PARENT-A" })],
      decisions: [],
      rulePack: approvedPack([parent()]),
    });
    expect(notAccepted.summary.addedLineCount).toBe(0);

    // Original SKU differs but the accepted SKU matches the parent rule: expands.
    const accepted = build({
      lines: [line({ sku: "RAW-X" })],
      decisions: [accept({ originalSku: "RAW-X", acceptedSku: "PARENT-A" })],
      rulePack: approvedPack([parent()]),
    });
    expect(accepted.summary.addedLineCount).toBe(1);
    expect(accepted.lines[1].origin).toBe("expansion");
  });

  it("adds missing child lines with correct parentLineId, sourceRuleId, and evidence", () => {
    const p = parent({ childLines: [child({ sku: "CHILD-1", sourceRuleId: "rule-a" })] });
    const draft = build({
      lines: [line()],
      decisions: [accept()],
      rulePack: approvedPack([p]),
    });

    expect(draft.lines).toHaveLength(2);
    const exp = draft.lines[1];
    expect(exp.origin).toBe("expansion");
    expect(exp.sku).toBe("CHILD-1");
    expect(exp.lineId).toBe("line-1-x1");
    expect(exp.parentLineId).toBe("line-1");
    expect(exp.parentLineNumber).toBe("1");
    expect(exp.sourceRuleId).toBe("rule-a");
    expect(exp.evidence).toHaveLength(1);
    expect(exp.evidence?.[0].evidenceNote).toBe("fixture evidence");
    // Evidence is copied, not aliased from the rule pack.
    expect(exp.evidence).not.toBe(p.childLines[0].evidence);
  });

  it("does not alias the rule pack's evidence array or citation objects", () => {
    const p = parent({ childLines: [child({ sku: "CHILD-1" })] });
    const draft = build({ lines: [line()], decisions: [accept()], rulePack: approvedPack([p]) });
    const exp = addedLines(draft)[0];
    const sourceCitation = p.childLines[0].evidence[0];
    // Neither the array nor the citation object is shared with the rule pack.
    expect(exp.evidence).not.toBe(p.childLines[0].evidence);
    expect(exp.evidence?.[0]).not.toBe(sourceCitation);
    // Mutating the draft citation must not bleed back into the rule pack.
    if (exp.evidence) exp.evidence[0].evidenceNote = "mutated";
    expect(sourceCitation.evidenceNote).toBe("fixture evidence");
  });

  it("adds no children for a standalone parent rule", () => {
    const p = parent({
      ruleId: "rule-s",
      parentSku: "OPTIC-1",
      relationshipType: "standalone",
      childLines: [],
    });
    const draft = build({
      lines: [line({ sku: "OPTIC-1" })],
      decisions: [accept({ acceptedSku: "OPTIC-1" })],
      rulePack: approvedPack([p]),
    });
    expect(draft.lines).toHaveLength(1);
    expect(draft.summary.addedLineCount).toBe(0);
  });
});

// --- Segment / present-SKU handling ----------------------------------------

describe("buildConfigurationExpansionDraft - parent segments", () => {
  it("skips a child whose SKU is already present in the parent segment", () => {
    const l1 = line({ sourceRowNumber: 1, originalLineNumber: "1", sku: "PARENT-A" });
    const l2 = line({ sourceRowNumber: 2, originalLineNumber: "2", sku: "CHILD-1" });
    const p = parent({ childLines: [child({ sku: "CHILD-1" }), child({ sku: "CHILD-2" })] });
    const draft = build({
      lines: [l1, l2],
      decisions: [accept({ sourceRowNumber: 1, acceptedSku: "PARENT-A" })],
      rulePack: approvedPack([p]),
    });
    // CHILD-1 already present as the next customer line; only CHILD-2 is added.
    expect(addedLines(draft).map((l) => l.sku)).toEqual(["CHILD-2"]);
  });

  it("skips a child present via a segment line's accepted SKU, not its original", () => {
    const l1 = line({ sourceRowNumber: 1, originalLineNumber: "1", sku: "PARENT-A" });
    const l2 = line({ sourceRowNumber: 2, originalLineNumber: "2", sku: "RAW" });
    const p = parent({ childLines: [child({ sku: "CHILD-1" }), child({ sku: "CHILD-2" })] });
    const draft = build({
      lines: [l1, l2],
      decisions: [
        accept({ sourceRowNumber: 1, acceptedSku: "PARENT-A" }),
        accept({ sourceRowNumber: 2, originalSku: "RAW", acceptedSku: "CHILD-1" }),
      ],
      rulePack: approvedPack([p]),
    });
    // CHILD-1 is present via l2's accepted SKU (its original "RAW" differs); skipped.
    expect(addedLines(draft).map((l) => l.sku)).toEqual(["CHILD-2"]);
  });

  it("does not globally skip a shared child SKU across different parent segments", () => {
    const pA = parent({
      ruleId: "rule-a",
      parentSku: "PARENT-A",
      childLines: [child({ sku: "SHARED", sourceRuleId: "rule-a" })],
    });
    const pB = parent({
      ruleId: "rule-b",
      parentSku: "PARENT-B",
      childLines: [child({ sku: "SHARED", sourceRuleId: "rule-b" })],
    });
    const l1 = line({ sourceRowNumber: 1, originalLineNumber: "1", sku: "PARENT-A" });
    const l2 = line({ sourceRowNumber: 2, originalLineNumber: "2", sku: "PARENT-B" });
    const draft = build({
      lines: [l1, l2],
      decisions: [
        accept({ sourceRowNumber: 1, acceptedSku: "PARENT-A" }),
        accept({ sourceRowNumber: 2, acceptedSku: "PARENT-B" }),
      ],
      rulePack: approvedPack([pA, pB]),
    });
    const added = addedLines(draft);
    expect(added).toHaveLength(2);
    expect(added.every((l) => l.sku === "SHARED")).toBe(true);
    expect(added.map((l) => l.parentLineId)).toEqual(["line-1", "line-2"]);
  });
});

// --- Quantity rules ---------------------------------------------------------

describe("buildConfigurationExpansionDraft - quantity rules", () => {
  it("applies same_as_parent, fixed, and fixed_per_parent", () => {
    const p = parent({
      childLines: [
        child({ sku: "SAP", quantityRule: "same_as_parent" }),
        child({ sku: "FIX", quantityRule: "fixed", quantityValue: 5 }),
        child({ sku: "FPP", quantityRule: "fixed_per_parent", quantityValue: 2 }),
      ],
    });
    const draft = build({
      lines: [line({ quantity: 4 })],
      decisions: [accept()],
      rulePack: approvedPack([p]),
    });
    const qtyBySku = Object.fromEntries(addedLines(draft).map((l) => [l.sku, l.quantity]));
    expect(qtyBySku.SAP).toBe(4);
    expect(qtyBySku.FIX).toBe(5);
    expect(qtyBySku.FPP).toBe(8);
  });
});

// --- Approval gate + summary counts ----------------------------------------

describe("buildConfigurationExpansionDraft - review gate and summary", () => {
  it("marks every added expansion line approvalRequired:true and approved:false", () => {
    const p = parent({ childLines: [child({ sku: "C1" }), child({ sku: "C2" })] });
    const draft = build({ lines: [line()], decisions: [accept()], rulePack: approvedPack([p]) });
    const added = addedLines(draft);
    expect(added.length).toBeGreaterThan(0);
    for (const a of added) {
      expect(a.approvalRequired).toBe(true);
      expect(a.approved).toBe(false);
    }
  });

  it("rolls up customer, added, review, and included-item counts", () => {
    const p = parent({
      childLines: [child({ sku: "INC", includedItem: true }), child({ sku: "OPT", includedItem: false })],
    });
    const draft = build({ lines: [line()], decisions: [accept()], rulePack: approvedPack([p]) });
    expect(draft.summary).toEqual({
      customerLineCount: 1,
      addedLineCount: 2,
      totalLineCount: 3,
      requiresReviewCount: 2,
      includedItemCount: 1,
    });
  });
});

// --- Purity / hygiene -------------------------------------------------------

describe("config-expansion module - decoupling and hygiene", () => {
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
