/**
 * Evidence: overlay suggestions from the Honeywell demo catalog still require
 * explicit human SKU review actions to become accepted decisions. Proves that
 * accepted same-SKU decisions are not auto-accepted and that no pricing,
 * configuration-expansion, replacement, or substitution fields are introduced.
 *
 * Pure helper imports only - no DB, API/UI, engines, coordinators, adapters,
 * artifact stores, approval stores, pricing, configuration expansion, export,
 * runner, or AI/LLM.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildSkuResolutionDraft,
} from "@/lib/projects/sku-resolution";
import {
  getHoneywellDemoCatalogLookupIndex,
  HONEYWELL_DEMO_CATALOG_LOOKUP_SOURCE,
} from "@/lib/projects/honeywell-demo-catalog-lookup";
import {
  applySkuResolutionReviewActions,
} from "@/lib/projects/sku-resolution-review";
import type { CanonicalBoqLine } from "@/types/project";
import type { SkuResolutionReviewAction } from "@/lib/projects/sku-resolution-review";

const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-sku-resolution-review-evidence.test.ts");
const DOC_PATH = join(process.cwd(), "docs/quick-bom/HONEYWELL_DEMO_CATALOG_FIXTURE.md");

const SUBSET_BOQ: CanonicalBoqLine[] = [
  {
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-review-evidence",
    sourceRowNumber: 2,
    originalLineNumber: "1",
    sku: "C9300X-48HX-A",
    description: "Catalyst 9300X 48p mGig UPOE+ Network Advantage",
    quantity: 2,
    originalCells: {},
  },
  {
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-review-evidence",
    sourceRowNumber: 3,
    originalLineNumber: "2",
    sku: "CW9178I-CFG",
    description: "Catalyst Center Wi-Fi 6E AP",
    quantity: 10,
    originalCells: {},
  },
  {
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-review-evidence",
    sourceRowNumber: 4,
    originalLineNumber: "3",
    sku: "CP-7841-K9=",
    description: "Cisco IP Phone 7841",
    quantity: 5,
    originalCells: {},
  },
  {
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-review-evidence",
    sourceRowNumber: 5,
    originalLineNumber: "4",
    sku: "SFP-10G-LR-S=",
    description: "10GBASE-LR SFP Module",
    quantity: 4,
    originalCells: {},
  },
];

const DECIDED_AT = new Date("2026-06-08T09:00:00.000Z");

function buildDraft() {
  return buildSkuResolutionDraft({
    lines: SUBSET_BOQ,
    catalogIndex: getHoneywellDemoCatalogLookupIndex(),
  });
}

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

describe("draft has one needs_review decision per input line", () => {
  it("catalogSource is HONEYWELL_DEMO_CATALOG_LOOKUP_SOURCE", () => {
    const draft = buildDraft();
    expect(draft.summary.catalogSource).toBe(HONEYWELL_DEMO_CATALOG_LOOKUP_SOURCE);
    expect(draft.summary.catalogSource).toBe("honeywell_mvp_demo_catalog_supplement");
  });

  it("each draft decision status is needs_review", () => {
    const draft = buildDraft();
    expect(draft.decisions).toHaveLength(4);
    for (const decision of draft.decisions) {
      expect(decision.status).toBe("needs_review");
    }
  });

  it("each draft decision has exactly one same-SKU suggestion", () => {
    const draft = buildDraft();
    for (let i = 0; i < SUBSET_BOQ.length; i++) {
      const decision = draft.decisions[i];
      expect(decision.suggestions).toHaveLength(1);
      expect(decision.suggestions[0].suggestedSku).toBe(SUBSET_BOQ[i].sku);
    }
  });
});

describe("explicit human accept actions move decisions to accepted", () => {
  it("accepted decisions preserve input order", () => {
    const draft = buildDraft();
    const result = applySkuResolutionReviewActions(draft.decisions, buildAcceptActions());
    const skus = result.decisions.map((d) => d.originalSku);
    expect(skus).toEqual(SUBSET_BOQ.map((l) => l.sku));
  });

  it("every accepted decision has status accepted", () => {
    const draft = buildDraft();
    const result = applySkuResolutionReviewActions(draft.decisions, buildAcceptActions());
    for (const decision of result.decisions) {
      expect(decision.status).toBe("accepted");
    }
  });

  it("every accepted decision has acceptedSku equal to original input SKU", () => {
    const draft = buildDraft();
    const result = applySkuResolutionReviewActions(draft.decisions, buildAcceptActions());
    for (let i = 0; i < result.decisions.length; i++) {
      expect(result.decisions[i].acceptedSku).toBe(SUBSET_BOQ[i].sku);
    }
  });

  it("every accepted decision has decidedBy engineer@stc.com", () => {
    const draft = buildDraft();
    const result = applySkuResolutionReviewActions(draft.decisions, buildAcceptActions());
    for (const decision of result.decisions) {
      expect(decision.decidedBy).toBe("engineer@stc.com");
    }
  });

  it("every accepted decision has the deterministic decidedAt", () => {
    const draft = buildDraft();
    const result = applySkuResolutionReviewActions(draft.decisions, buildAcceptActions());
    for (const decision of result.decisions) {
      expect(decision.decidedAt).toBe(DECIDED_AT);
    }
  });

  it("review result counts are correct", () => {
    const draft = buildDraft();
    const result = applySkuResolutionReviewActions(draft.decisions, buildAcceptActions());
    expect(result.appliedCount).toBe(4);
    expect(result.acceptedCount).toBe(4);
    expect(result.needsReviewCount).toBe(0);
    expect(result.rejectedCount).toBe(0);
    expect(result.unresolvedCount).toBe(0);
  });
});

describe("immutability: draft decisions and action inputs are not mutated", () => {
  it("original draft decisions are not mutated by accept actions", () => {
    const draft = buildDraft();
    const snapshot = structuredClone(draft.decisions);
    applySkuResolutionReviewActions(draft.decisions, buildAcceptActions());
    expect(draft.decisions).toEqual(snapshot);
  });

  it("action inputs are not mutated", () => {
    const draft = buildDraft();
    const actions = buildAcceptActions();
    const snapshot = structuredClone(actions);
    applySkuResolutionReviewActions(draft.decisions, actions);
    expect(actions).toEqual(snapshot);
  });
});

describe("accepting a SKU not in the row suggestions throws", () => {
  it("throws 'Accepted SKU must match an existing suggestion.'", () => {
    const draft = buildDraft();
    const actions: SkuResolutionReviewAction[] = [{
      decision: "accept",
      sourceFileId: "honeywell-review-evidence",
      sourceRowNumber: 2,
      acceptedSku: "NOT-IN-SUGGESTIONS",
      decidedBy: "engineer@stc.com",
      decidedAt: DECIDED_AT,
    }];
    expect(() => applySkuResolutionReviewActions(draft.decisions, actions)).toThrow(
      "Accepted SKU must match an existing suggestion."
    );
  });
});

describe("no forbidden fields on draft or reviewed decisions", () => {
  it("no pricing fields on draft decisions", () => {
    const draft = buildDraft();
    for (const decision of draft.decisions) {
      expect(decision).not.toHaveProperty("unitPrice");
      expect(decision).not.toHaveProperty("extendedPrice");
      expect(decision).not.toHaveProperty("listPrice");
      expect(decision).not.toHaveProperty("discountedPrice");
    }
  });

  it("no pricing fields on reviewed decisions", () => {
    const draft = buildDraft();
    const result = applySkuResolutionReviewActions(draft.decisions, buildAcceptActions());
    for (const decision of result.decisions) {
      expect(decision).not.toHaveProperty("unitPrice");
      expect(decision).not.toHaveProperty("extendedPrice");
      expect(decision).not.toHaveProperty("listPrice");
      expect(decision).not.toHaveProperty("discountedPrice");
    }
  });

  it("no configuration-expansion, parent/child, replacement, or substitution fields on draft decisions", () => {
    const draft = buildDraft();
    for (const decision of draft.decisions) {
      expect(decision).not.toHaveProperty("parentSku");
      expect(decision).not.toHaveProperty("parentLineId");
      expect(decision).not.toHaveProperty("children");
      expect(decision).not.toHaveProperty("configExpansion");
      expect(decision).not.toHaveProperty("replacementFor");
      expect(decision).not.toHaveProperty("substitutedSku");
    }
  });

  it("no configuration-expansion, parent/child, replacement, or substitution fields on reviewed decisions", () => {
    const draft = buildDraft();
    const result = applySkuResolutionReviewActions(draft.decisions, buildAcceptActions());
    for (const decision of result.decisions) {
      expect(decision).not.toHaveProperty("parentSku");
      expect(decision).not.toHaveProperty("parentLineId");
      expect(decision).not.toHaveProperty("children");
      expect(decision).not.toHaveProperty("configExpansion");
      expect(decision).not.toHaveProperty("replacementFor");
      expect(decision).not.toHaveProperty("substitutedSku");
    }
  });
});

describe("SFP-10G-LR-S= remains standalone after review", () => {
  it("accepted optic decision has no parent/child fields", () => {
    const draft = buildDraft();
    const result = applySkuResolutionReviewActions(draft.decisions, buildAcceptActions());
    const optic = result.decisions.find((d) => d.originalSku === "SFP-10G-LR-S=");
    expect(optic).toBeDefined();
    expect(optic!.status).toBe("accepted");
    expect(optic!.acceptedSku).toBe("SFP-10G-LR-S=");
    expect(optic).not.toHaveProperty("parentSku");
    expect(optic).not.toHaveProperty("parentLineId");
    expect(optic).not.toHaveProperty("children");
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
