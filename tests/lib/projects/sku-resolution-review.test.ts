import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import * as mod from "@/lib/projects/sku-resolution-review";
import {
  getSkuResolutionDecisionKey,
  isSkuResolutionDecisionReviewable,
  applySkuResolutionReviewAction,
  applySkuResolutionReviewActions,
  type SkuResolutionReviewAction,
} from "@/lib/projects/sku-resolution-review";
import type {
  SkuResolutionDecision,
  SkuResolutionStatus,
  SkuResolutionSuggestion,
} from "@/types/project";

function makeSuggestion(
  overrides: Partial<SkuResolutionSuggestion> = {}
): SkuResolutionSuggestion {
  return { suggestedSku: "C9300-48P-E", source: "exact", ...overrides };
}

function makeDecision(
  overrides: Partial<SkuResolutionDecision> = {}
): SkuResolutionDecision {
  return {
    sourceFileId: "file-1",
    sourceRowNumber: 2,
    originalLineNumber: "1",
    originalSku: "C9300-48P-E",
    status: "needs_review",
    suggestions: [makeSuggestion()],
    ...overrides,
  };
}

function acceptAction(
  overrides: Partial<Extract<SkuResolutionReviewAction, { decision: "accept" }>> = {}
): SkuResolutionReviewAction {
  return {
    decision: "accept",
    sourceFileId: "file-1",
    sourceRowNumber: 2,
    decidedBy: "engineer@stc.com",
    acceptedSku: "C9300-48P-E",
    ...overrides,
  };
}

function rejectAction(
  overrides: Partial<Extract<SkuResolutionReviewAction, { decision: "reject" }>> = {}
): SkuResolutionReviewAction {
  return {
    decision: "reject",
    sourceFileId: "file-1",
    sourceRowNumber: 2,
    decidedBy: "engineer@stc.com",
    ...overrides,
  };
}

function manualAction(
  overrides: Partial<Extract<SkuResolutionReviewAction, { decision: "manual" }>> = {}
): SkuResolutionReviewAction {
  return {
    decision: "manual",
    sourceFileId: "file-1",
    sourceRowNumber: 2,
    decidedBy: "engineer@stc.com",
    ...overrides,
  };
}

function outOfScopeAction(
  overrides: Partial<Extract<SkuResolutionReviewAction, { decision: "out_of_scope" }>> = {}
): SkuResolutionReviewAction {
  return {
    decision: "out_of_scope",
    sourceFileId: "file-1",
    sourceRowNumber: 2,
    decidedBy: "engineer@stc.com",
    ...overrides,
  };
}

describe("getSkuResolutionDecisionKey", () => {
  it("is derived from sourceFileId and sourceRowNumber", () => {
    expect(getSkuResolutionDecisionKey({ sourceFileId: "f-9", sourceRowNumber: 42 })).toBe(
      getSkuResolutionDecisionKey({ sourceFileId: "f-9", sourceRowNumber: 42 })
    );
    expect(getSkuResolutionDecisionKey({ sourceFileId: "f-9", sourceRowNumber: 42 })).toContain("f-9");
    expect(getSkuResolutionDecisionKey({ sourceFileId: "f-9", sourceRowNumber: 42 })).toContain("42");
    // Distinct file/row pairs produce distinct keys.
    expect(getSkuResolutionDecisionKey({ sourceFileId: "a", sourceRowNumber: 1 })).not.toBe(
      getSkuResolutionDecisionKey({ sourceFileId: "a", sourceRowNumber: 2 })
    );
    expect(getSkuResolutionDecisionKey({ sourceFileId: "a", sourceRowNumber: 1 })).not.toBe(
      getSkuResolutionDecisionKey({ sourceFileId: "b", sourceRowNumber: 1 })
    );
  });
});

describe("isSkuResolutionDecisionReviewable", () => {
  it("returns true only for needs_review", () => {
    expect(isSkuResolutionDecisionReviewable(makeDecision({ status: "needs_review" }))).toBe(true);
    for (const status of ["accepted", "rejected", "unresolved"] as SkuResolutionStatus[]) {
      expect(isSkuResolutionDecisionReviewable(makeDecision({ status }))).toBe(false);
    }
  });
});

describe("applySkuResolutionReviewAction - accept", () => {
  it("returns accepted status with acceptedSku, decidedBy, decidedAt, and optional note", () => {
    const decidedAt = new Date("2026-05-21T10:00:00.000Z");
    const result = applySkuResolutionReviewAction(
      makeDecision(),
      acceptAction({ decidedAt, note: "verified against datasheet" })
    );
    expect(result.status).toBe("accepted");
    expect(result.acceptedSku).toBe("C9300-48P-E");
    expect(result.decidedBy).toBe("engineer@stc.com");
    expect(result.decidedAt).toBe(decidedAt);
    expect(result.note).toBe("verified against datasheet");
    // Source identity is preserved.
    expect(result.sourceFileId).toBe("file-1");
    expect(result.sourceRowNumber).toBe(2);
    expect(result.originalLineNumber).toBe("1");
    expect(result.originalSku).toBe("C9300-48P-E");
  });

  it("defaults decidedAt to now and omits note when not provided", () => {
    const before = Date.now();
    const result = applySkuResolutionReviewAction(makeDecision(), acceptAction());
    const after = Date.now();
    expect(result.decidedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.decidedAt!.getTime()).toBeLessThanOrEqual(after);
    expect("note" in result).toBe(false);
  });

  it("copies suggestions onto the accepted decision", () => {
    const decision = makeDecision({
      suggestions: [makeSuggestion({ suggestedSku: "A" }), makeSuggestion({ suggestedSku: "C9300-48P-E" })],
    });
    const result = applySkuResolutionReviewAction(decision, acceptAction());
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions.map((s) => s.suggestedSku)).toEqual(["A", "C9300-48P-E"]);
  });

  it("requires a nonblank decidedBy", () => {
    expect(() => applySkuResolutionReviewAction(makeDecision(), acceptAction({ decidedBy: "  " }))).toThrow(
      "decidedBy is required."
    );
  });

  it("requires a nonblank acceptedSku", () => {
    expect(() => applySkuResolutionReviewAction(makeDecision(), acceptAction({ acceptedSku: "  " }))).toThrow(
      "acceptedSku is required."
    );
  });

  it("requires acceptedSku to match an existing suggestion", () => {
    expect(() =>
      applySkuResolutionReviewAction(makeDecision(), acceptAction({ acceptedSku: "NOT-A-SUGGESTION" }))
    ).toThrow("Accepted SKU must match an existing suggestion.");
  });

  it("does not mutate the original decision or its suggestions", () => {
    const decision = makeDecision();
    const snapshot = structuredClone(decision);
    applySkuResolutionReviewAction(decision, acceptAction());
    expect(decision).toEqual(snapshot);
  });

  it("returns suggestion copies that cannot corrupt the original", () => {
    const decision = makeDecision();
    const result = applySkuResolutionReviewAction(decision, acceptAction());
    result.suggestions[0].suggestedSku = "MUTATED";
    expect(decision.suggestions[0].suggestedSku).toBe("C9300-48P-E");
  });
});

describe("applySkuResolutionReviewAction - reject", () => {
  it("returns rejected status with decidedBy/decidedAt/note and no acceptedSku", () => {
    const decidedAt = new Date("2026-05-21T11:00:00.000Z");
    const result = applySkuResolutionReviewAction(
      makeDecision(),
      rejectAction({ decidedAt, note: "no valid catalog match" })
    );
    expect(result.status).toBe("rejected");
    expect(result.decidedBy).toBe("engineer@stc.com");
    expect(result.decidedAt).toBe(decidedAt);
    expect(result.note).toBe("no valid catalog match");
    expect("acceptedSku" in result).toBe(false);
    expect(result.acceptedSku).toBeUndefined();
    // Source identity and suggestions are preserved.
    expect(result.originalSku).toBe("C9300-48P-E");
    expect(result.suggestions).toHaveLength(1);
  });

  it("requires a nonblank decidedBy", () => {
    expect(() => applySkuResolutionReviewAction(makeDecision(), rejectAction({ decidedBy: "" }))).toThrow(
      "decidedBy is required."
    );
  });

  it("rejects an action that carries acceptedSku", () => {
    const action = { ...rejectAction(), acceptedSku: "C9300-48P-E" } as SkuResolutionReviewAction;
    expect(() => applySkuResolutionReviewAction(makeDecision(), action)).toThrow(
      "Rejected SKU resolution cannot include acceptedSku."
    );
  });

  it("does not mutate the original decision or its suggestions", () => {
    const decision = makeDecision();
    const snapshot = structuredClone(decision);
    applySkuResolutionReviewAction(decision, rejectAction());
    expect(decision).toEqual(snapshot);
  });
});

describe("applySkuResolutionReviewAction - deferred non-priced accept guard", () => {
  // A deferred/non-priced row from the deferred review set, deliberately carrying a
  // same-SKU suggestion so it would otherwise pass the suggestion-match check.
  const DEFERRED_SKU = "SC9300UK9-1712";
  function deferredDecision(): SkuResolutionDecision {
    return makeDecision({
      originalSku: DEFERRED_SKU,
      suggestions: [makeSuggestion({ suggestedSku: DEFERRED_SKU })],
    });
  }

  it("refuses to accept a deferred row even when the acceptedSku matches a suggestion", () => {
    expect(() =>
      applySkuResolutionReviewAction(
        deferredDecision(),
        acceptAction({ acceptedSku: DEFERRED_SKU })
      )
    ).toThrow("Deferred non-priced SKU resolution row cannot be accepted.");
  });

  it("still allows rejecting a deferred row (only accept is guarded)", () => {
    const result = applySkuResolutionReviewAction(deferredDecision(), rejectAction());
    expect(result.status).toBe("rejected");
    expect("acceptedSku" in result).toBe(false);
  });

  it("blocks a deferred accept inside a batch before any decision is applied", () => {
    const decisions = [
      makeDecision({ sourceFileId: "f", sourceRowNumber: 1 }),
      makeDecision({
        sourceFileId: "f",
        sourceRowNumber: 2,
        originalSku: DEFERRED_SKU,
        suggestions: [makeSuggestion({ suggestedSku: DEFERRED_SKU })],
      }),
    ];
    expect(() =>
      applySkuResolutionReviewActions(decisions, [
        acceptAction({ sourceFileId: "f", sourceRowNumber: 2, acceptedSku: DEFERRED_SKU }),
      ])
    ).toThrow("Deferred non-priced SKU resolution row cannot be accepted.");
  });
});

describe("applySkuResolutionReviewAction - reviewability guard", () => {
  it("throws not-reviewable for accepted, rejected, and unresolved decisions", () => {
    for (const status of ["accepted", "rejected", "unresolved"] as SkuResolutionStatus[]) {
      expect(() => applySkuResolutionReviewAction(makeDecision({ status }), acceptAction())).toThrow(
        "SKU resolution decision is not reviewable."
      );
      expect(() => applySkuResolutionReviewAction(makeDecision({ status }), rejectAction())).toThrow(
        "SKU resolution decision is not reviewable."
      );
    }
  });
});

describe("applySkuResolutionReviewAction - manual and out_of_scope", () => {
  it("classifies a needs_review row as manual with no acceptedSku", () => {
    const result = applySkuResolutionReviewAction(
      makeDecision(),
      manualAction({ note: "third-party commercial line" })
    );
    expect(result.status).toBe("manual");
    expect("acceptedSku" in result).toBe(false);
    expect(result.acceptedSku).toBeUndefined();
    expect(result.decidedBy).toBe("engineer@stc.com");
    expect(result.note).toBe("third-party commercial line");
    // Source identity and suggestions are preserved.
    expect(result.originalSku).toBe("C9300-48P-E");
    expect(result.suggestions).toHaveLength(1);
  });

  it("classifies a needs_review row as out_of_scope with no acceptedSku", () => {
    const result = applySkuResolutionReviewAction(makeDecision(), outOfScopeAction());
    expect(result.status).toBe("out_of_scope");
    expect("acceptedSku" in result).toBe(false);
    expect(result.acceptedSku).toBeUndefined();
  });

  it("classifies an unresolved row as manual or out_of_scope", () => {
    const unresolved = makeDecision({ status: "unresolved", suggestions: [] });
    expect(applySkuResolutionReviewAction(unresolved, manualAction()).status).toBe("manual");
    expect(applySkuResolutionReviewAction(unresolved, outOfScopeAction()).status).toBe(
      "out_of_scope"
    );
  });

  it("rejects a manual action that carries acceptedSku", () => {
    const action = { ...manualAction(), acceptedSku: "C9300-48P-E" } as SkuResolutionReviewAction;
    expect(() => applySkuResolutionReviewAction(makeDecision(), action)).toThrow(
      "Manual or out-of-scope SKU resolution cannot include acceptedSku."
    );
  });

  it("rejects an out_of_scope action that carries acceptedSku", () => {
    const action = {
      ...outOfScopeAction(),
      acceptedSku: "C9300-48P-E",
    } as SkuResolutionReviewAction;
    expect(() => applySkuResolutionReviewAction(makeDecision(), action)).toThrow(
      "Manual or out-of-scope SKU resolution cannot include acceptedSku."
    );
  });

  it("requires a nonblank decidedBy", () => {
    expect(() =>
      applySkuResolutionReviewAction(makeDecision(), manualAction({ decidedBy: "  " }))
    ).toThrow("decidedBy is required.");
  });

  it("refuses accepted and rejected rows (only needs_review/unresolved are targetable)", () => {
    for (const status of ["accepted", "rejected"] as SkuResolutionStatus[]) {
      expect(() =>
        applySkuResolutionReviewAction(makeDecision({ status }), manualAction())
      ).toThrow("SKU resolution decision is not reviewable.");
      expect(() =>
        applySkuResolutionReviewAction(makeDecision({ status }), outOfScopeAction())
      ).toThrow("SKU resolution decision is not reviewable.");
    }
  });

  it("allows manual/out_of_scope on a deferred non-priced row (only accept is guarded)", () => {
    const deferred = makeDecision({ originalSku: "SC9300UK9-1712", suggestions: [] });
    expect(applySkuResolutionReviewAction(deferred, manualAction()).status).toBe("manual");
    expect(applySkuResolutionReviewAction(deferred, outOfScopeAction()).status).toBe(
      "out_of_scope"
    );
  });

  it("does not mutate the original decision or its suggestions", () => {
    const decision = makeDecision();
    const snapshot = structuredClone(decision);
    applySkuResolutionReviewAction(decision, manualAction());
    expect(decision).toEqual(snapshot);
  });
});

describe("applySkuResolutionReviewActions", () => {
  function batchDecisions(): SkuResolutionDecision[] {
    return [
      makeDecision({ sourceRowNumber: 2, originalSku: "A", suggestions: [makeSuggestion({ suggestedSku: "A" })] }),
      makeDecision({ sourceRowNumber: 3, originalSku: "B", suggestions: [makeSuggestion({ suggestedSku: "B" })] }),
      makeDecision({ sourceRowNumber: 4, originalSku: "C", status: "unresolved", suggestions: [] }),
    ];
  }

  it("preserves decision order", () => {
    const result = applySkuResolutionReviewActions(batchDecisions(), []);
    expect(result.decisions.map((d) => d.originalSku)).toEqual(["A", "B", "C"]);
    expect(result.decisions.map((d) => d.sourceRowNumber)).toEqual([2, 3, 4]);
  });

  it("applies multiple actions and reports correct counts", () => {
    const result = applySkuResolutionReviewActions(batchDecisions(), [
      acceptAction({ sourceRowNumber: 2, acceptedSku: "A" }),
      rejectAction({ sourceRowNumber: 3 }),
    ]);
    expect(result.decisions[0].status).toBe("accepted");
    expect(result.decisions[0].acceptedSku).toBe("A");
    expect(result.decisions[1].status).toBe("rejected");
    expect(result.decisions[2].status).toBe("unresolved");
    expect(result).toMatchObject({
      appliedCount: 2,
      needsReviewCount: 0,
      acceptedCount: 1,
      rejectedCount: 1,
      unresolvedCount: 1,
    });
  });

  it("leaves untargeted needs_review and unresolved rows unchanged", () => {
    const result = applySkuResolutionReviewActions(batchDecisions(), [
      acceptAction({ sourceRowNumber: 2, acceptedSku: "A" }),
    ]);
    expect(result.decisions[1].status).toBe("needs_review");
    expect(result.decisions[2].status).toBe("unresolved");
    expect(result).toMatchObject({
      appliedCount: 1,
      needsReviewCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      unresolvedCount: 1,
    });
  });

  it("classifies needs_review and unresolved rows via manual/out_of_scope and counts them", () => {
    const result = applySkuResolutionReviewActions(batchDecisions(), [
      manualAction({ sourceRowNumber: 2 }),
      outOfScopeAction({ sourceRowNumber: 4 }),
    ]);
    // Row 2 was needs_review -> manual; row 4 was unresolved -> out_of_scope.
    expect(result.decisions[0].status).toBe("manual");
    expect(result.decisions[2].status).toBe("out_of_scope");
    // Row 3 (needs_review) is untargeted and unchanged.
    expect(result.decisions[1].status).toBe("needs_review");
    expect(result).toMatchObject({
      appliedCount: 2,
      needsReviewCount: 1,
      acceptedCount: 0,
      rejectedCount: 0,
      unresolvedCount: 0,
      manualCount: 1,
      outOfScopeCount: 1,
    });
  });

  it("throws the exact duplicate message for two actions on one decision", () => {
    expect(() =>
      applySkuResolutionReviewActions(batchDecisions(), [
        acceptAction({ sourceRowNumber: 2, acceptedSku: "A" }),
        rejectAction({ sourceRowNumber: 2 }),
      ])
    ).toThrow("Duplicate SKU resolution action for decision.");
  });

  it("throws the exact missing-target message when no decision matches", () => {
    expect(() =>
      applySkuResolutionReviewActions(batchDecisions(), [acceptAction({ sourceRowNumber: 99, acceptedSku: "A" })])
    ).toThrow("SKU resolution action target was not found.");
  });

  it("does not mutate input decisions, their suggestions, or actions", () => {
    const decisions = batchDecisions();
    const actions = [acceptAction({ sourceRowNumber: 2, acceptedSku: "A" }), rejectAction({ sourceRowNumber: 3 })];
    const decisionsSnapshot = structuredClone(decisions);
    const actionsSnapshot = structuredClone(actions);
    applySkuResolutionReviewActions(decisions, actions);
    expect(decisions).toEqual(decisionsSnapshot);
    expect(actions).toEqual(actionsSnapshot);
  });
});

describe("module isolation & surface", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/sku-resolution-review.ts"),
    "utf8"
  );

  it("does not import DB, artifact store, approvals, staleness, engines, AI, pricing, API, UI, catalog lookup, or the Cisco adapter", () => {
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    for (const forbidden of [
      "@/lib/db",
      "/db/",
      "artifact-store",
      "artifact",
      "approval",
      "staleness",
      "@/engines",
      "@/coordinator",
      "pricing",
      "catalog-lookup",
      "adapter",
      "anthropic",
      "@/app",
      "@/components",
    ]) {
      expect(importLines).not.toContain(forbidden);
    }
  });

  it("exposes only the expected runtime exports", () => {
    expect(Object.keys(mod).sort()).toEqual(
      [
        "getSkuResolutionDecisionKey",
        "isSkuResolutionDecisionReviewable",
        "applySkuResolutionReviewAction",
        "applySkuResolutionReviewActions",
      ].sort()
    );
  });
});
