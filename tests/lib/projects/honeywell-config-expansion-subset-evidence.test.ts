/**
 * Evidence: accepted Honeywell overlay SKU decisions feed the approved Honeywell
 * MVP Batch 1+2+3 configuration-expansion rule pack and produce a review-required
 * draft. Expansion is deterministic and rule-pack-only. No pricing, replacement,
 * substitution, catalog, API/UI, artifact, approval, export, or broad Cisco
 * authority is introduced.
 *
 * Pure helper imports only - no DB, API/UI, engines, coordinators, adapters,
 * artifact stores, approval stores, pricing, export, runner, or AI/LLM.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildSkuResolutionDraft,
} from "@/lib/projects/sku-resolution";
import {
  getHoneywellDemoCatalogLookupIndex,
} from "@/lib/projects/honeywell-demo-catalog-lookup";
import {
  applySkuResolutionReviewActions,
} from "@/lib/projects/sku-resolution-review";
import {
  buildConfigurationExpansionDraft,
} from "@/lib/projects/config-expansion";
import {
  getHoneywellMvpConfigExpansionRulePack,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
  HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE,
} from "@/lib/projects/honeywell-config-expansion-rule-pack";
import type { CanonicalBoqLine } from "@/types/project";
import type { SkuResolutionReviewAction } from "@/lib/projects/sku-resolution-review";

const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-config-expansion-subset-evidence.test.ts");
const DOC_PATH = join(process.cwd(), "docs/quick-bom/HONEYWELL_DEMO_CATALOG_FIXTURE.md");

const SUBSET_BOQ: CanonicalBoqLine[] = [
  {
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-config-expansion-subset-evidence",
    sourceRowNumber: 2,
    originalLineNumber: "1",
    sku: "C9300X-48HX-A",
    description: "Catalyst 9300X 48p mGig UPOE+ Network Advantage",
    quantity: 2,
    originalCells: {},
  },
  {
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-config-expansion-subset-evidence",
    sourceRowNumber: 3,
    originalLineNumber: "2",
    sku: "CW9178I-CFG",
    description: "Catalyst Center Wi-Fi 6E AP",
    quantity: 10,
    originalCells: {},
  },
  {
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-config-expansion-subset-evidence",
    sourceRowNumber: 4,
    originalLineNumber: "3",
    sku: "CP-7841-K9=",
    description: "Cisco IP Phone 7841",
    quantity: 5,
    originalCells: {},
  },
  {
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-config-expansion-subset-evidence",
    sourceRowNumber: 5,
    originalLineNumber: "4",
    sku: "SFP-10G-LR-S=",
    description: "10GBASE-LR SFP Module",
    quantity: 4,
    originalCells: {},
  },
];

const DECIDED_AT = new Date("2026-06-08T10:00:00.000Z");

function buildAcceptActions(): SkuResolutionReviewAction[] {
  return SUBSET_BOQ.map((line) => ({
    decision: "accept" as const,
    sourceFileId: line.sourceFileId,
    sourceRowNumber: line.sourceRowNumber,
    acceptedSku: line.sku,
    decidedBy: "engineer@stc.com",
    decidedAt: DECIDED_AT,
  }));
}

function buildExpansionDraft() {
  const skuDraft = buildSkuResolutionDraft({
    lines: SUBSET_BOQ,
    catalogIndex: getHoneywellDemoCatalogLookupIndex(),
  });
  const reviewed = applySkuResolutionReviewActions(skuDraft.decisions, buildAcceptActions());
  const rulePack = getHoneywellMvpConfigExpansionRulePack();
  return buildConfigurationExpansionDraft({
    lines: SUBSET_BOQ,
    decisions: reviewed.decisions,
    rulePack,
  });
}

describe("SKU resolution draft uses Honeywell overlay and starts as needs_review", () => {
  it("all four input decisions are needs_review before accept actions", () => {
    const skuDraft = buildSkuResolutionDraft({
      lines: SUBSET_BOQ,
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    expect(skuDraft.decisions).toHaveLength(4);
    for (const d of skuDraft.decisions) {
      expect(d.status).toBe("needs_review");
    }
  });
});

describe("explicit human review accepts each same-SKU suggestion before expansion", () => {
  it("all four decisions are accepted after explicit accept actions", () => {
    const skuDraft = buildSkuResolutionDraft({
      lines: SUBSET_BOQ,
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    const reviewed = applySkuResolutionReviewActions(skuDraft.decisions, buildAcceptActions());
    expect(reviewed.acceptedCount).toBe(4);
    expect(reviewed.needsReviewCount).toBe(0);
    for (const d of reviewed.decisions) {
      expect(d.status).toBe("accepted");
    }
  });
});

describe("rule pack is the approved Honeywell MVP pack", () => {
  it("rule pack status is approved", () => {
    const rulePack = getHoneywellMvpConfigExpansionRulePack();
    expect(rulePack.status).toBe("approved");
  });

  it("rule pack approvalRequired is false", () => {
    const rulePack = getHoneywellMvpConfigExpansionRulePack();
    expect(rulePack.approvalRequired).toBe(false);
  });

  it("rule pack rulePackId matches HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID", () => {
    const rulePack = getHoneywellMvpConfigExpansionRulePack();
    expect(rulePack.rulePackId).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID);
  });

  it("rule pack version matches HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION", () => {
    const rulePack = getHoneywellMvpConfigExpansionRulePack();
    expect(rulePack.version).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION);
  });

  it("rule pack sourceScope matches HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE", () => {
    const rulePack = getHoneywellMvpConfigExpansionRulePack();
    expect(rulePack.sourceScope).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE);
  });
});

describe("configuration expansion summary is correct", () => {
  it("summary.customerLineCount is 4", () => {
    const draft = buildExpansionDraft();
    expect(draft.summary.customerLineCount).toBe(4);
  });

  it("summary.addedLineCount is 27", () => {
    const draft = buildExpansionDraft();
    expect(draft.summary.addedLineCount).toBe(27);
  });

  it("summary.totalLineCount is 31", () => {
    const draft = buildExpansionDraft();
    expect(draft.summary.totalLineCount).toBe(31);
  });

  it("summary.requiresReviewCount is 27", () => {
    const draft = buildExpansionDraft();
    expect(draft.summary.requiresReviewCount).toBe(27);
  });

  it("summary.includedItemCount is 10", () => {
    const draft = buildExpansionDraft();
    expect(draft.summary.includedItemCount).toBe(10);
  });
});

describe("all 4 customer lines are preserved in input order", () => {
  it("four customer lines are present with origin customer", () => {
    const draft = buildExpansionDraft();
    const customerLines = draft.lines.filter((l) => l.origin === "customer");
    expect(customerLines).toHaveLength(4);
  });

  it("customer lines preserve input SKU order", () => {
    const draft = buildExpansionDraft();
    const customerLines = draft.lines.filter((l) => l.origin === "customer");
    const skus = customerLines.map((l) => l.sku);
    expect(skus).toEqual(SUBSET_BOQ.map((l) => l.sku));
  });

  it("each customer line has sku equal to input SKU", () => {
    const draft = buildExpansionDraft();
    const customerLines = draft.lines.filter((l) => l.origin === "customer");
    for (let i = 0; i < SUBSET_BOQ.length; i++) {
      expect(customerLines[i].sku).toBe(SUBSET_BOQ[i].sku);
    }
  });

  it("each customer line has acceptedSku equal to input SKU", () => {
    const draft = buildExpansionDraft();
    const customerLines = draft.lines.filter((l) => l.origin === "customer");
    for (let i = 0; i < SUBSET_BOQ.length; i++) {
      expect(customerLines[i].acceptedSku).toBe(SUBSET_BOQ[i].sku);
    }
  });
});

describe("expansion children per parent", () => {
  it("switch C9300X-48HX-A gets 22 expansion children under line-1", () => {
    const draft = buildExpansionDraft();
    const children = draft.lines.filter((l) => l.origin === "expansion" && l.parentLineId === "line-1");
    expect(children).toHaveLength(22);
  });

  it("AP CW9178I-CFG gets 4 expansion children under line-2", () => {
    const draft = buildExpansionDraft();
    const children = draft.lines.filter((l) => l.origin === "expansion" && l.parentLineId === "line-2");
    expect(children).toHaveLength(4);
  });

  it("phone CP-7841-K9= gets 1 expansion child under line-3", () => {
    const draft = buildExpansionDraft();
    const children = draft.lines.filter((l) => l.origin === "expansion" && l.parentLineId === "line-3");
    expect(children).toHaveLength(1);
  });

  it("optic SFP-10G-LR-S= is standalone under line-4 with no expansion children", () => {
    const draft = buildExpansionDraft();
    const children = draft.lines.filter((l) => l.origin === "expansion" && l.parentLineId === "line-4");
    expect(children).toHaveLength(0);
  });
});

describe("every expansion line has required fields", () => {
  it("every expansion line has origin expansion", () => {
    const draft = buildExpansionDraft();
    const expansionLines = draft.lines.filter((l) => l.origin === "expansion");
    expect(expansionLines.length).toBeGreaterThan(0);
    for (const line of expansionLines) {
      expect(line.origin).toBe("expansion");
    }
  });

  it("every expansion line has approvalRequired true", () => {
    const draft = buildExpansionDraft();
    for (const line of draft.lines.filter((l) => l.origin === "expansion")) {
      expect(line.approvalRequired).toBe(true);
    }
  });

  it("every expansion line has approved false", () => {
    const draft = buildExpansionDraft();
    for (const line of draft.lines.filter((l) => l.origin === "expansion")) {
      expect(line.approved).toBe(false);
    }
  });

  it("every expansion line has a parentLineId", () => {
    const draft = buildExpansionDraft();
    for (const line of draft.lines.filter((l) => l.origin === "expansion")) {
      expect(typeof line.parentLineId).toBe("string");
      expect(line.parentLineId!.length).toBeGreaterThan(0);
    }
  });

  it("every expansion line has a parentLineNumber", () => {
    const draft = buildExpansionDraft();
    for (const line of draft.lines.filter((l) => l.origin === "expansion")) {
      expect(typeof line.parentLineNumber).toBe("string");
      expect(line.parentLineNumber!.length).toBeGreaterThan(0);
    }
  });

  it("every expansion line has a sourceRuleId", () => {
    const draft = buildExpansionDraft();
    for (const line of draft.lines.filter((l) => l.origin === "expansion")) {
      expect(typeof line.sourceRuleId).toBe("string");
      expect(line.sourceRuleId!.length).toBeGreaterThan(0);
    }
  });

  it("every expansion line has at least one evidence citation", () => {
    const draft = buildExpansionDraft();
    for (const line of draft.lines.filter((l) => l.origin === "expansion")) {
      expect(Array.isArray(line.evidence)).toBe(true);
      expect(line.evidence!.length).toBeGreaterThan(0);
    }
  });
});

describe("every expansion line sourceRuleId starts with the composed pack prefix", () => {
  it("all expansion lines start with honeywell-mvp-composed-batch1-batch2-batch3::", () => {
    const draft = buildExpansionDraft();
    for (const line of draft.lines.filter((l) => l.origin === "expansion")) {
      expect(line.sourceRuleId).toMatch(/^honeywell-mvp-composed-batch1-batch2-batch3::/);
    }
  });
});

describe("representative derived quantities", () => {
  it("CAB-C15-CBN under the switch has quantity 4 for switch quantity 2", () => {
    const draft = buildExpansionDraft();
    const line = draft.lines.find(
      (l) => l.origin === "expansion" && l.sku === "CAB-C15-CBN" && l.parentLineId === "line-1"
    );
    expect(line).toBeDefined();
    expect(line!.quantity).toBe(4);
  });

  it("AIR-AP-BRACKET-2 under the AP has quantity 10", () => {
    const draft = buildExpansionDraft();
    const line = draft.lines.find(
      (l) => l.origin === "expansion" && l.sku === "AIR-AP-BRACKET-2" && l.parentLineId === "line-2"
    );
    expect(line).toBeDefined();
    expect(line!.quantity).toBe(10);
  });

  it("CON-L1NBD-P7PK94P1 under the phone has quantity 5", () => {
    const draft = buildExpansionDraft();
    const line = draft.lines.find(
      (l) => l.origin === "expansion" && l.sku === "CON-L1NBD-P7PK94P1" && l.parentLineId === "line-3"
    );
    expect(line).toBeDefined();
    expect(line!.quantity).toBe(5);
  });
});

describe("no forbidden fields on expansion draft lines", () => {
  it("no pricing fields on expansion lines", () => {
    const draft = buildExpansionDraft();
    for (const line of draft.lines.filter((l) => l.origin === "expansion")) {
      expect(line).not.toHaveProperty("unitPrice");
      expect(line).not.toHaveProperty("extendedPrice");
      expect(line).not.toHaveProperty("listPrice");
      expect(line).not.toHaveProperty("discountedPrice");
    }
  });

  it("no replacement or substitution fields on expansion lines", () => {
    const draft = buildExpansionDraft();
    for (const line of draft.lines.filter((l) => l.origin === "expansion")) {
      expect(line).not.toHaveProperty("replacementFor");
      expect(line).not.toHaveProperty("substitutedSku");
    }
  });

  it("no catalog lookup fields on expansion lines", () => {
    const draft = buildExpansionDraft();
    for (const line of draft.lines.filter((l) => l.origin === "expansion")) {
      expect(line).not.toHaveProperty("catalogSource");
      expect(line).not.toHaveProperty("catalogMatch");
      expect(line).not.toHaveProperty("catalogLookupSource");
    }
  });
});

describe("ASCII-only content", () => {
  it("test file is ASCII-only", () => {
    const src = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(src)).toBe(false);
  });

  it("doc file is ASCII-only", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(doc)).toBe(false);
  });
});
