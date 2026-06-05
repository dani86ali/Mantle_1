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

// --- Batch 1: same_as_related_sku_total (project scope) --------------------

describe("buildConfigurationExpansionDraft - same_as_related_sku_total (project scope)", () => {
  // Wireless license child whose quantity tracks the related AP total. The legacy
  // quantityRule "fixed" / quantityValue 12 is deliberately set to a value that
  // DIFFERS from the derived total, so a test that emits 12 would prove the frozen
  // value leaked through; emitting the related total proves the model override.
  function licChild(overrides: Partial<ConfigExpansionChildRule> = {}): ConfigExpansionChildRule {
    return child({
      sku: "LIC-CW-A",
      description: "Cisco Wireless License - Advantage",
      relationshipType: "subscription",
      sourceRuleId: "rule-sub",
      quantityRule: "fixed",
      quantityValue: 12,
      quantityModel: { type: "same_as_related_sku_total", relatedSku: "CW9178I-CFG", scope: "project" },
      ...overrides,
    });
  }

  // AP customer line (row 1) plus the subscription parent line (row 2). The license
  // lives under CISCO-NETWORK-SUB; its quantity must track the CW9178I-CFG total.
  function buildScenario(
    apQuantity: number,
    apAcceptedSku: string = "CW9178I-CFG",
    apOriginalSku: string = "CW9178I-CFG"
  ) {
    return build({
      lines: [
        line({ sourceRowNumber: 1, originalLineNumber: "1", sku: apOriginalSku, quantity: apQuantity, originalCells: { "#": "1", "Part Number": apOriginalSku } }),
        line({ sourceRowNumber: 2, originalLineNumber: "2", sku: "CISCO-NETWORK-SUB", quantity: 1, originalCells: { "#": "2", "Part Number": "CISCO-NETWORK-SUB" } }),
      ],
      decisions: [
        accept({ sourceRowNumber: 1, originalLineNumber: "1", originalSku: apOriginalSku, acceptedSku: apAcceptedSku }),
        accept({ sourceRowNumber: 2, originalLineNumber: "2", originalSku: "CISCO-NETWORK-SUB", acceptedSku: "CISCO-NETWORK-SUB" }),
      ],
      rulePack: approvedPack([
        parent({ ruleId: "rule-sub", parentSku: "CISCO-NETWORK-SUB", childLines: [licChild()] }),
      ]),
    });
  }

  it("derives 12 licenses from 12 related access points (not the frozen legacy value)", () => {
    const lic = addedLines(buildScenario(12)).find((l) => l.sku === "LIC-CW-A");
    expect(lic?.quantity).toBe(12);
  });

  it("tracks the related AP quantity deterministically when it changes", () => {
    // 20 access points -> 20 licenses; the frozen quantityValue 12 is ignored.
    const lic = addedLines(buildScenario(20)).find((l) => l.sku === "LIC-CW-A");
    expect(lic?.quantity).toBe(20);
  });

  it("matches the related SKU on the accepted SKU, not the original", () => {
    // Original SKU "RAW-AP" but accepted "CW9178I-CFG": the related total still counts it.
    const lic = addedLines(buildScenario(15, "CW9178I-CFG", "RAW-AP")).find((l) => l.sku === "LIC-CW-A");
    expect(lic?.quantity).toBe(15);
  });

  it("adds no license line when the related SKU total is zero", () => {
    // Original SKU "CW9178I-CFG" but accepted to something else: zero effective total.
    // The frozen 12 must NOT leak through as a fallback.
    const draft = buildScenario(12, "OTHER-AP", "CW9178I-CFG");
    expect(addedLines(draft).some((l) => l.sku === "LIC-CW-A")).toBe(false);
    expect(draft.summary.addedLineCount).toBe(0);
  });
});

// --- Batch 1: selected_option_count ----------------------------------------

describe("buildConfigurationExpansionDraft - selected_option_count", () => {
  function psuChild(sku: string, optionGroupId: string, relationshipType: ConfigExpansionChildRule["relationshipType"] = "default_selected"): ConfigExpansionChildRule {
    return child({ sku, optionGroupId, relationshipType, sourceRuleId: "rule-sw" });
  }
  // Power cord whose quantity follows the SUM of the selected AC PSU quantities. The
  // legacy fixed_per_parent multiplier (5) is chosen so 5 * parent never equals the
  // derived option-sum, so a test asserting the derived value proves the model
  // overrides the frozen legacy rule (and that it is a sum, not a bare count).
  function cableChild(optionGroupId: string): ConfigExpansionChildRule {
    return child({
      sku: "CAB-C15-CBN",
      description: "Cabinet Jumper Power Cord",
      relationshipType: "default_selected",
      sourceRuleId: "rule-sw",
      quantityRule: "fixed_per_parent",
      quantityValue: 5,
      quantityModel: { type: "selected_option_count", optionGroupId },
    });
  }
  function switchScenario(parentSku: string, cableGroupId: string, psus: ConfigExpansionChildRule[], parentQuantity: number) {
    return build({
      lines: [line({ sku: parentSku, quantity: parentQuantity, originalCells: { "#": "1", "Part Number": parentSku } })],
      decisions: [accept({ originalSku: parentSku, acceptedSku: parentSku })],
      rulePack: approvedPack([
        parent({ ruleId: "rule-sw", parentSku, childLines: [...psus, cableChild(cableGroupId)] }),
      ]),
    });
  }

  it("sums the selected AC PSU quantities for a C9300X switch (parent 7, two PSUs -> 14)", () => {
    const draft = switchScenario("C9300X-48HX-A", "c9300x-ac-power-supplies", [
      psuChild("PWR-C1-1100WAC-P", "c9300x-ac-power-supplies", "included_zero_price"),
      psuChild("PWR-C1-1100WAC-P/2", "c9300x-ac-power-supplies"),
    ], 7);
    const cable = addedLines(draft).find((l) => l.sku === "CAB-C15-CBN");
    // 2 PSUs, each same_as_parent (7) -> 14; not a bare count (2) and not legacy 5 * 7 = 35.
    expect(cable?.quantity).toBe(14);
  });

  it("sums the selected AC PSU quantities for a C9300L switch (parent 6, two PSUs -> 12)", () => {
    const draft = switchScenario("C9300L-24P-4X-A", "c9300l-ac-power-supplies", [
      psuChild("PWR-C1-715WAC-P", "c9300l-ac-power-supplies", "included_zero_price"),
      psuChild("PWR-C1-715WAC-P/2", "c9300l-ac-power-supplies"),
    ], 6);
    const cable = addedLines(draft).find((l) => l.sku === "CAB-C15-CBN");
    expect(cable?.quantity).toBe(12);
  });

  it("follows the selected quantity down when the secondary PSU is removed (parent 7 -> 7)", () => {
    const draft = switchScenario("C9300X-48HX-A", "c9300x-ac-power-supplies", [
      psuChild("PWR-C1-1100WAC-P", "c9300x-ac-power-supplies", "included_zero_price"),
    ], 7);
    const cable = addedLines(draft).find((l) => l.sku === "CAB-C15-CBN");
    // One PSU (7) -> 7, proving the sum is over selected option quantities, not 2 * parent.
    expect(cable?.quantity).toBe(7);
  });

  it("proves per-device logic at parent quantity 1 (two PSUs -> 2)", () => {
    const draft = switchScenario("C9300X-48HX-A", "c9300x-ac-power-supplies", [
      psuChild("PWR-C1-1100WAC-P", "c9300x-ac-power-supplies", "included_zero_price"),
      psuChild("PWR-C1-1100WAC-P/2", "c9300x-ac-power-supplies"),
    ], 1);
    const cable = addedLines(draft).find((l) => l.sku === "CAB-C15-CBN");
    // 2 PSUs, each same_as_parent (1) -> 2: one cord per selected supply per device.
    expect(cable?.quantity).toBe(2);
  });

  it("excludes the cable itself from the sum when it shares the option group id", () => {
    const cableInGroup = child({
      sku: "CAB-C15-CBN",
      description: "Cabinet Jumper Power Cord",
      relationshipType: "default_selected",
      sourceRuleId: "rule-sw",
      quantityRule: "fixed_per_parent",
      quantityValue: 5,
      optionGroupId: "c9300x-ac-power-supplies",
      quantityModel: { type: "selected_option_count", optionGroupId: "c9300x-ac-power-supplies" },
    });
    const draft = build({
      lines: [line({ sku: "C9300X-48HX-A", quantity: 7, originalCells: { "#": "1", "Part Number": "C9300X-48HX-A" } })],
      decisions: [accept({ originalSku: "C9300X-48HX-A", acceptedSku: "C9300X-48HX-A" })],
      rulePack: approvedPack([
        parent({
          ruleId: "rule-sw",
          parentSku: "C9300X-48HX-A",
          childLines: [
            psuChild("PWR-C1-1100WAC-P", "c9300x-ac-power-supplies", "included_zero_price"),
            psuChild("PWR-C1-1100WAC-P/2", "c9300x-ac-power-supplies"),
            cableInGroup,
          ],
        }),
      ]),
    });
    const cable = addedLines(draft).find((l) => l.sku === "CAB-C15-CBN");
    // Sum is the two PSUs only (14); the cable's own contribution (legacy 5 * 7 = 35) is excluded.
    expect(cable?.quantity).toBe(14);
  });

  it("adds no cable line when the referenced option group has no selected options", () => {
    // The cable references c9300x-ac-power-supplies but the only PSU is in another
    // group, so the selected quantity is zero and no cable line is produced.
    const draft = switchScenario("C9300X-48HX-A", "c9300x-ac-power-supplies", [
      psuChild("PWR-OTHER", "some-other-group"),
    ], 7);
    expect(addedLines(draft).some((l) => l.sku === "CAB-C15-CBN")).toBe(false);
  });
});

// --- Batch 1: project_sku duplicate policy ---------------------------------

describe("buildConfigurationExpansionDraft - project_sku duplicate policy", () => {
  function licChild(overrides: Partial<ConfigExpansionChildRule> = {}): ConfigExpansionChildRule {
    return child({
      sku: "LIC-CW-A",
      relationshipType: "subscription",
      sourceRuleId: "rule-sub",
      quantityRule: "fixed",
      quantityValue: 12,
      quantityModel: { type: "same_as_related_sku_total", relatedSku: "CW9178I-CFG", scope: "project" },
      duplicatePolicy: { scope: "project_sku", match: "sku", quantitySatisfaction: "existing_satisfies_required" },
      ...overrides,
    });
  }
  // Row 1: an existing LIC-CW-A customer line that sits OUTSIDE the subscription
  // segment. Row 2: the related AP total (12). Row 3: the subscription parent.
  function scenario(existingLicQuantity: number, licRule: ConfigExpansionChildRule) {
    return build({
      lines: [
        line({ sourceRowNumber: 1, originalLineNumber: "1", sku: "LIC-CW-A", quantity: existingLicQuantity, originalCells: { "#": "1", "Part Number": "LIC-CW-A" } }),
        line({ sourceRowNumber: 2, originalLineNumber: "2", sku: "CW9178I-CFG", quantity: 12, originalCells: { "#": "2", "Part Number": "CW9178I-CFG" } }),
        line({ sourceRowNumber: 3, originalLineNumber: "3", sku: "CISCO-NETWORK-SUB", quantity: 1, originalCells: { "#": "3", "Part Number": "CISCO-NETWORK-SUB" } }),
      ],
      decisions: [
        accept({ sourceRowNumber: 1, originalLineNumber: "1", originalSku: "LIC-CW-A", acceptedSku: "LIC-CW-A" }),
        accept({ sourceRowNumber: 2, originalLineNumber: "2", originalSku: "CW9178I-CFG", acceptedSku: "CW9178I-CFG" }),
        accept({ sourceRowNumber: 3, originalLineNumber: "3", originalSku: "CISCO-NETWORK-SUB", acceptedSku: "CISCO-NETWORK-SUB" }),
      ],
      rulePack: approvedPack([
        parent({ ruleId: "rule-sub", parentSku: "CISCO-NETWORK-SUB", childLines: [licRule] }),
      ]),
    });
  }

  it("does not re-add a project-unique SKU already satisfied in a different segment", () => {
    // Existing LIC-CW-A (row 1, qty 12) covers the required 12, so nothing is added -
    // even though the existing line is in a different parent segment.
    const draft = scenario(12, licChild());
    expect(addedLines(draft).some((l) => l.sku === "LIC-CW-A")).toBe(false);
    expect(draft.summary.addedLineCount).toBe(0);
  });

  it("widens detection beyond the parent segment vs a v1 rule with no policy", () => {
    // Same fixture, but the child carries NO duplicatePolicy: v1 only checks the
    // subscription segment (row 3), which does not contain the row-1 license, so the
    // license IS added. This contrast proves project_sku scope is broader.
    const draft = scenario(12, licChild({ duplicatePolicy: undefined }));
    expect(addedLines(draft).find((l) => l.sku === "LIC-CW-A")?.quantity).toBe(12);
  });

  it("adds the full required line for review when the existing quantity is insufficient", () => {
    // Existing 5 < required 12: surface the full 12 for engineer review, NOT a 7-unit
    // silent delta. The line stays approvalRequired/unapproved.
    const lic = addedLines(scenario(5, licChild())).find((l) => l.sku === "LIC-CW-A");
    expect(lic?.quantity).toBe(12);
    expect(lic?.approvalRequired).toBe(true);
    expect(lic?.approved).toBe(false);
  });

  it("leaves v1 parent-segment duplicate behavior unchanged", () => {
    // A plain v1 child whose SKU already appears in the same segment is skipped, with
    // no project_sku policy involved.
    const l1 = line({ sourceRowNumber: 1, originalLineNumber: "1", sku: "PARENT-A" });
    const l2 = line({ sourceRowNumber: 2, originalLineNumber: "2", sku: "CHILD-1" });
    const draft = build({
      lines: [l1, l2],
      decisions: [accept({ sourceRowNumber: 1, acceptedSku: "PARENT-A" })],
      rulePack: approvedPack([parent({ childLines: [child({ sku: "CHILD-1" }), child({ sku: "CHILD-2" })] })]),
    });
    expect(addedLines(draft).map((l) => l.sku)).toEqual(["CHILD-2"]);
  });
});

// --- Batch 1: unsupported advanced model cases -----------------------------

describe("buildConfigurationExpansionDraft - unsupported advanced model rejection", () => {
  function advChild(overrides: Partial<ConfigExpansionChildRule>): ConfigExpansionChildRule {
    return child({ sku: "LIC-CW-A", sourceRuleId: "rule-a", ...overrides });
  }

  it("rejects same_as_related_sku_total with a non-project scope", () => {
    for (const scope of ["parent_segment", "related_sku_group"] as const) {
      expect(() =>
        build({
          lines: [],
          decisions: [],
          rulePack: approvedPack([
            parent({ childLines: [advChild({ quantityModel: { type: "same_as_related_sku_total", relatedSku: "CW9178I-CFG", scope } })] }),
          ]),
        })
      ).toThrow(/only project scope/);
    }
  });

  it("rejects a related_sku_group duplicate policy scope", () => {
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([
          parent({ childLines: [advChild({ duplicatePolicy: { scope: "related_sku_group", match: "sku", quantitySatisfaction: "existing_satisfies_required" } })] }),
        ]),
      })
    ).toThrow(/duplicate policy supports only project_sku scope/);
  });

  it("rejects a parent_segment duplicate policy rather than silently ignoring it", () => {
    // parent_segment is NOT the one supported Batch 1 shape, so it must fail loudly -
    // it is not silently treated as default v1 segment behavior.
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([
          parent({ childLines: [advChild({ duplicatePolicy: { scope: "parent_segment", match: "sku", quantitySatisfaction: "existing_satisfies_required" } })] }),
        ]),
      })
    ).toThrow(/duplicate policy supports only project_sku scope/);
  });

  it("rejects a project_sku duplicate policy with an unsupported match or satisfaction", () => {
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([
          parent({ childLines: [advChild({ duplicatePolicy: { scope: "project_sku", match: "sku_and_parent", quantitySatisfaction: "existing_satisfies_required" } })] }),
        ]),
      })
    ).toThrow(/existing_satisfies_required/);
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([
          parent({ childLines: [advChild({ duplicatePolicy: { scope: "project_sku", match: "sku", quantitySatisfaction: "always_add_missing_delta" } })] }),
        ]),
      })
    ).toThrow(/existing_satisfies_required/);
  });

  it("still rejects an unapproved child even when it carries advanced model fields", () => {
    expect(() =>
      build({
        lines: [],
        decisions: [],
        rulePack: approvedPack([
          parent({ childLines: [child({ approved: false, quantityModel: { type: "selected_option_count", optionGroupId: "g" } })] }),
        ]),
      })
    ).toThrow(/child rule must be approved/);
  });
});

// --- Batch 1: out-of-scope tables stay inert -------------------------------

describe("buildConfigurationExpansionDraft - out-of-scope tables are inert", () => {
  it("ignores replacementCandidates: no SKU substitution, no extra lines", () => {
    const pack: ConfigExpansionRulePack = {
      ...approvedPack([parent()]),
      replacementCandidates: [
        { historicalSku: "PARENT-A", currentSkus: ["PARENT-A-NEW"], evidence: [citation()], evidenceScope: "quote_observed", approvalRequired: true, approved: false },
      ],
    };
    const draft = build({ lines: [line()], decisions: [accept()], rulePack: pack });
    // The customer SKU is preserved and the replacement is never applied.
    expect(draft.lines[0].sku).toBe("PARENT-A");
    expect(draft.lines.some((l) => l.sku === "PARENT-A-NEW")).toBe(false);
    expect(addedLines(draft).map((l) => l.sku)).toEqual(["CHILD-1"]);
  });

  it("ignores termOptionGroups and child termGroupId: no term expansion", () => {
    const pack: ConfigExpansionRulePack = {
      ...approvedPack([parent({ childLines: [child({ sku: "CHILD-1", termGroupId: "term-x", termMonths: 36 })] })]),
      termOptionGroups: [
        { termGroupId: "term-x", defaultTermMonths: 36, allowedTermMonths: [36, 60, 84], engineerReviewRequired: true, optionSkus: ["CHILD-1"] },
      ],
    };
    const draft = build({ lines: [line()], decisions: [accept()], rulePack: pack });
    // Exactly one child added; the term group neither multiplied nor added variants.
    expect(addedLines(draft).map((l) => l.sku)).toEqual(["CHILD-1"]);
  });

  it("emits no pricing keys on representative generated draft lines", () => {
    const pricingTokens = ["price", "cost", "discount", "margin", "markup", "vat", "currency", "msrp", "sell", "amount"];
    const draft = build({
      lines: [line({ sku: "C9300X-48HX-A", quantity: 7, originalCells: { "#": "1", "Part Number": "C9300X-48HX-A" } })],
      decisions: [accept({ originalSku: "C9300X-48HX-A", acceptedSku: "C9300X-48HX-A" })],
      rulePack: approvedPack([
        parent({
          ruleId: "rule-sw",
          parentSku: "C9300X-48HX-A",
          childLines: [
            child({ sku: "PWR-C1-1100WAC-P", optionGroupId: "c9300x-ac-power-supplies", sourceRuleId: "rule-sw" }),
            child({ sku: "CAB-C15-CBN", sourceRuleId: "rule-sw", quantityModel: { type: "selected_option_count", optionGroupId: "c9300x-ac-power-supplies" } }),
          ],
        }),
      ]),
    });
    for (const draftLine of draft.lines) {
      for (const key of Object.keys(draftLine)) {
        for (const token of pricingTokens) {
          expect(key.toLowerCase().includes(token), `line key "${key}" contains pricing token "${token}"`).toBe(false);
        }
      }
    }
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
