import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Isolate from real DB: mock only getProjectById and getProjectArtifactById.
const { mockGetProject, mockGetArtifact } = vi.hoisted(() => ({
  mockGetProject: vi.fn(),
  mockGetArtifact: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-artifact-store", () => ({ getProjectArtifactById: mockGetArtifact }));

import { loadProjectBoqConfigurationExpansionReviewWorkspaceCore } from "@/lib/projects/project-boq-config-expansion-review-workspace-core";
import type { ProjectMode } from "@/types/project";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "proj-ce-1";
const ARTIFACT_ID = "art-ce-draft-1";

/** Behavioral coverage drives the shared core with the Quick BoM expectedMode. */
function loadCore(
  overrides: Partial<{
    tenantId: string;
    projectId: string;
    artifactId: string;
    expectedMode: ProjectMode;
  }> = {}
) {
  return loadProjectBoqConfigurationExpansionReviewWorkspaceCore({
    tenantId: TENANT,
    projectId: PROJECT_ID,
    artifactId: ARTIFACT_ID,
    expectedMode: "quick_bom",
    ...overrides,
  });
}

const BASE_PROJECT = {
  id: PROJECT_ID,
  tenantId: TENANT,
  name: "Honeywell Test",
  mode: "quick_bom",
  createdAt: new Date("2026-06-01T10:00:00.000Z"),
  updatedAt: new Date("2026-06-02T11:30:00.000Z"),
};

const DRAFT_PAYLOAD = {
  payloadKind: "configuration_expansion_draft",
  sourceNormalizedBoqArtifactId: "art-nb-7",
  sourceNormalizedBoqArtifactVersion: 3,
  sourceSkuResolutionArtifactId: "art-skur-3",
  sourceSkuResolutionArtifactVersion: 2,
  sourceFileIds: ["file-1"],
  rulePackId: "honeywell-scope-rules",
  rulePackVersion: "1.0.0",
  rulePackStatus: "approved",
  rulePackSourceScope: "honeywell_mvp_demo_only",
  lineCount: 2,
  summary: {
    customerLineCount: 1,
    addedLineCount: 1,
    totalLineCount: 2,
    requiresReviewCount: 1,
    includedItemCount: 0,
  },
  lines: [
    {
      lineId: "line-cust-1",
      origin: "customer",
      sku: "C9300-48P-A",
      description: "Customer switch",
      quantity: 2,
      sourceFileId: "file-1",
      sourceRowNumber: 3,
      evidence: [],
    },
    {
      lineId: "line-exp-1",
      origin: "expansion",
      sku: "C9300-NM-4G",
      description: "Network module",
      quantity: 2,
      parentLineId: "line-cust-1",
      relationshipType: "default_selected",
      quantityRule: "same_as_parent",
      sourceRuleId: "rule-nm-4g",
      includedItem: false,
      approvalRequired: true,
      approved: false,
      evidence: [
        {
          sourceType: "ccw_estimate",
          sourcePath: "EVIDENCE-PATH-CANARY",
          sheetName: "EVIDENCE-SHEET-CANARY",
          lineNumber: 42,
          pageNumber: 1,
          evidenceNote: "EVIDENCE-NOTE-CANARY",
        },
      ],
    },
  ],
};

const BASE_ARTIFACT = {
  id: ARTIFACT_ID,
  projectId: PROJECT_ID,
  stageId: "configuration_expansion_review",
  type: "configuration_expansion",
  status: "needs_review",
  version: 4,
  sourceFileIds: ["file-1"],
  sourceArtifactIds: ["art-nb-7", "art-skur-3"],
  payload: DRAFT_PAYLOAD,
  createdAt: new Date("2026-06-01T10:00:00.000Z"),
  updatedAt: new Date("2026-06-01T10:30:00.000Z"),
};

// A reviewed (non-draft) artifact: no payloadKind marker; carries acceptedLines
// (customer preserved + accepted expansion) and rejectedLines (rejected expansion).
// Every line keeps full draft-line internals (originalCells/evidence paths) so the
// reviewed projection's leak-safety can be proven.
const REVIEWED_PAYLOAD = {
  sourceNormalizedBoqArtifactId: "art-nb-7",
  sourceNormalizedBoqArtifactVersion: 3,
  sourceSkuResolutionArtifactId: "art-skur-3",
  sourceSkuResolutionArtifactVersion: 2,
  sourceConfigurationExpansionDraftArtifactId: "art-ce-draft-1",
  sourceConfigurationExpansionDraftArtifactVersion: 4,
  sourceFileIds: ["file-1"],
  rulePackId: "honeywell-scope-rules",
  rulePackVersion: "1.0.0",
  rulePackStatus: "approved",
  lineCount: 2,
  acceptedLines: [
    {
      lineId: "line-cust-1",
      origin: "customer",
      sku: "C9300-48P-A",
      description: "Customer switch",
      quantity: 2,
      sourceFileId: "file-1",
      sourceRowNumber: 3,
      originalCells: { A: "REVIEWED-CUST-ORIGINALCELLS-CANARY" },
      evidence: [],
    },
    {
      lineId: "line-exp-1",
      origin: "expansion",
      sku: "C9300-NM-4G",
      description: "Network module",
      quantity: 2,
      parentLineId: "line-cust-1",
      relationshipType: "default_selected",
      quantityRule: "same_as_parent",
      sourceRuleId: "rule-nm-4g",
      includedItem: false,
      approvalRequired: false,
      approved: true,
      originalCells: { A: "REVIEWED-EXP-ORIGINALCELLS-CANARY" },
      evidence: [
        {
          sourceType: "ccw_estimate",
          sourcePath: "REVIEWED-EVIDENCE-PATH-CANARY",
          sheetName: "REVIEWED-EVIDENCE-SHEET-CANARY",
          lineNumber: 7,
          pageNumber: 2,
          evidenceNote: "REVIEWED-EVIDENCE-NOTE-CANARY",
        },
      ],
    },
  ],
  rejectedLines: [
    {
      lineId: "line-exp-2",
      origin: "expansion",
      sku: "PWR-C1-715WAC",
      description: "Power supply",
      quantity: 2,
      parentLineId: "line-cust-1",
      relationshipType: "default_selected",
      sourceRuleId: "rule-pwr",
      originalCells: { A: "REJECTED-ORIGINALCELLS-CANARY" },
      evidence: [
        {
          sourceType: "ccw_estimate",
          sourcePath: "REJECTED-EVIDENCE-PATH-CANARY",
          sheetName: "REJECTED-EVIDENCE-SHEET-CANARY",
          lineNumber: 9,
          pageNumber: 3,
          evidenceNote: "REJECTED-EVIDENCE-NOTE-CANARY",
        },
      ],
    },
  ],
  summary: {
    customerLineCount: 1,
    acceptedExpansionLineCount: 1,
    rejectedExpansionLineCount: 1,
    totalAcceptedLineCount: 2,
    reviewedExpansionLineCount: 2,
  },
};

const REVIEWED_ARTIFACT = {
  ...BASE_ARTIFACT,
  id: "art-ce-reviewed-1",
  status: "needs_review",
  version: 5,
  sourceArtifactIds: ["art-nb-7", "art-skur-3", "art-ce-draft-1"],
  payload: REVIEWED_PAYLOAD,
};

beforeEach(() => {
  mockGetProject.mockReset().mockResolvedValue(BASE_PROJECT);
  mockGetArtifact.mockReset().mockResolvedValue(BASE_ARTIFACT);
});

describe("loadProjectBoqConfigurationExpansionReviewWorkspaceCore - error statuses", () => {
  it("returns not_found when the project is absent", async () => {
    mockGetProject.mockResolvedValue(null);
    const result = await loadCore();
    expect(result.status).toBe("not_found");
    expect(mockGetArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode when the project mode is not the expectedMode", async () => {
    mockGetProject.mockResolvedValue({ ...BASE_PROJECT, mode: "rfp" });
    const result = await loadCore();
    expect(result.status).toBe("wrong_mode");
  });

  it("returns configuration_expansion_draft_not_found when the artifact is absent", async () => {
    mockGetArtifact.mockResolvedValue(null);
    const result = await loadCore();
    expect(result.status).toBe("configuration_expansion_draft_not_found");
  });

  it("returns artifact_not_configuration_expansion when the artifact is a different type", async () => {
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, type: "normalized_boq" });
    const result = await loadCore();
    expect(result.status).toBe("artifact_not_configuration_expansion");
  });

  it("projects a reviewed (non-draft) artifact read-only instead of rejecting it", async () => {
    mockGetArtifact.mockResolvedValue(REVIEWED_ARTIFACT);
    const result = await loadCore();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.review.mode).toBe("reviewed");
  });

  it("returns configuration_expansion_draft_not_reviewable when a DRAFT status is not needs_review", async () => {
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, status: "generated" });
    const result = await loadCore();
    expect(result.status).toBe("configuration_expansion_draft_not_reviewable");
  });

  it("reads a reviewed (non-draft) artifact regardless of status (incl. approved)", async () => {
    mockGetArtifact.mockResolvedValue({ ...REVIEWED_ARTIFACT, status: "approved" });
    const result = await loadCore();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.review.mode).toBe("reviewed");
  });

  it("returns invalid_configuration_expansion_draft_payload when the payload is malformed", async () => {
    const bad = { ...BASE_ARTIFACT, payload: { payloadKind: "configuration_expansion_draft" } };
    mockGetArtifact.mockResolvedValue(bad);
    const result = await loadCore();
    expect(result.status).toBe("invalid_configuration_expansion_draft_payload");
  });
});

describe("loadProjectBoqConfigurationExpansionReviewWorkspaceCore - mode gate", () => {
  it("returns wrong_mode for a quick_bom project when expectedMode is rfp, before any artifact load", async () => {
    const result = await loadCore({ expectedMode: "rfp" });
    expect(result.status).toBe("wrong_mode");
    expect(mockGetArtifact).not.toHaveBeenCalled();
  });

  it("proceeds past the mode gate for an rfp project when expectedMode is rfp", async () => {
    mockGetProject.mockResolvedValue({ ...BASE_PROJECT, mode: "rfp" });
    const result = await loadCore({ expectedMode: "rfp" });
    expect(result.status).toBe("ok");
    expect(mockGetArtifact).toHaveBeenCalledWith(TENANT, PROJECT_ID, ARTIFACT_ID);
  });
});

describe("loadProjectBoqConfigurationExpansionReviewWorkspaceCore - ok projection", () => {
  it("returns ok with a review that contains project/artifact/payloadSummary/reviewSummary/lines", async () => {
    const result = await loadCore();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const { review } = result;
    expect(review.mode).toBe("draft");
    const { payloadSummary, reviewSummary } = review;
    if (!payloadSummary || !reviewSummary) throw new Error("expected draft summaries");

    expect(review.project.id).toBe(PROJECT_ID);
    expect(review.project.tenantId).toBe(TENANT);
    expect(review.project.name).toBe("Honeywell Test");
    expect(review.project.mode).toBe("quick_bom");
    expect(typeof review.project.createdAt).toBe("string");

    expect(review.artifact.id).toBe(ARTIFACT_ID);
    expect(review.artifact.type).toBe("configuration_expansion");
    expect(review.artifact.status).toBe("needs_review");

    expect(payloadSummary.rulePackId).toBe("honeywell-scope-rules");
    expect(payloadSummary.rulePackStatus).toBe("approved");
    expect(payloadSummary.lineCount).toBe(2);

    expect(reviewSummary.totalLineCount).toBe(2);
    expect(reviewSummary.customerLineCount).toBe(1);
    expect(reviewSummary.expansionLineCount).toBe(1);
    expect(reviewSummary.requiresDecisionCount).toBe(1);

    expect(review.lines).toHaveLength(2);
  });

  it("projects customer and expansion lines with correct origin field", async () => {
    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");

    const customer = result.review.lines.find((l) => l.origin === "customer");
    const expansion = result.review.lines.find((l) => l.origin === "expansion");
    expect(customer).toBeTruthy();
    expect(expansion).toBeTruthy();
  });

  it("scopes both store calls to the passed tenantId, project mode read with includeArchived true", async () => {
    await loadCore();
    expect(mockGetProject).toHaveBeenCalledWith(TENANT, PROJECT_ID, {
      includeArchived: true,
    });
    expect(mockGetArtifact).toHaveBeenCalledWith(TENANT, PROJECT_ID, ARTIFACT_ID);
  });
});

describe("loadProjectBoqConfigurationExpansionReviewWorkspaceCore - array copying", () => {
  it("returned sourceFileIds are a copy, not the artifact array reference", async () => {
    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review.artifact.sourceFileIds).not.toBe(BASE_ARTIFACT.sourceFileIds);
    expect(result.review.artifact.sourceFileIds).toEqual(BASE_ARTIFACT.sourceFileIds);
  });

  it("returned payloadSummary.sourceFileIds are a copy, not the payload array reference", async () => {
    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");
    if (!result.review.payloadSummary) throw new Error("expected draft payloadSummary");
    expect(result.review.payloadSummary.sourceFileIds).not.toBe(DRAFT_PAYLOAD.sourceFileIds);
    expect(result.review.payloadSummary.sourceFileIds).toEqual(DRAFT_PAYLOAD.sourceFileIds);
  });

  it("returned lines array is a copy, not the payload lines reference", async () => {
    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review.lines).not.toBe(DRAFT_PAYLOAD.lines);
  });

  it("evidenceSourceTypes is a new array", async () => {
    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");
    const expLine = result.review.lines.find((l) => l.origin === "expansion");
    expect(expLine).toBeTruthy();
    // The source evidence array is not aliased
    expect(expLine!.evidenceSourceTypes).not.toBe(DRAFT_PAYLOAD.lines[1].evidence);
  });
});

describe("loadProjectBoqConfigurationExpansionReviewWorkspaceCore - evidence reduction", () => {
  it("reduces evidence to count and sourceTypes; never projects path/sheet/line/page/note", async () => {
    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");

    const expLine = result.review.lines.find((l) => l.origin === "expansion");
    expect(expLine).toBeTruthy();
    expect(expLine!.evidenceCount).toBe(1);
    expect(expLine!.evidenceSourceTypes).toEqual(["ccw_estimate"]);

    // Forbidden evidence internals must not be on the projected line
    const raw = expLine as unknown as Record<string, unknown>;
    expect("sourcePath" in raw).toBe(false);
    expect("sheetName" in raw).toBe(false);
    expect("lineNumber" in raw).toBe(false);
    expect("pageNumber" in raw).toBe(false);
    expect("evidenceNote" in raw).toBe(false);
  });

  it("projects evidence canary values as count/types only, never values", async () => {
    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");
    const json = JSON.stringify(result.review);
    expect(json).not.toContain("EVIDENCE-PATH-CANARY");
    expect(json).not.toContain("EVIDENCE-SHEET-CANARY");
    expect(json).not.toContain("EVIDENCE-NOTE-CANARY");
  });
});

describe("loadProjectBoqConfigurationExpansionReviewWorkspaceCore - field canary checks", () => {
  it("never projects originalCells, pricing, acceptedLines, rejectedLines, or configurationAuthority", async () => {
    const artifactWithCanaries = {
      ...BASE_ARTIFACT,
      payload: {
        ...DRAFT_PAYLOAD,
        originalCells: "ORIGINALCELLS-CANARY",
        pricing: "PRICING-CANARY",
        acceptedLines: ["ACCEPTEDLINES-CANARY"],
        rejectedLines: ["REJECTEDLINES-CANARY"],
        configurationAuthority: "CONFIGAUTH-CANARY",
        summary: {
          ...DRAFT_PAYLOAD.summary,
          originalCells: "SUMMARY-ORIGINALCELLS-CANARY",
          pricing: "SUMMARY-PRICING-CANARY",
        },
      },
    };
    mockGetArtifact.mockResolvedValue(artifactWithCanaries);

    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");

    const json = JSON.stringify(result.review);
    for (const canary of [
      "ORIGINALCELLS-CANARY",
      "PRICING-CANARY",
      "ACCEPTEDLINES-CANARY",
      "REJECTEDLINES-CANARY",
      "CONFIGAUTH-CANARY",
      "SUMMARY-ORIGINALCELLS-CANARY",
      "SUMMARY-PRICING-CANARY",
    ]) {
      expect(json).not.toContain(canary);
    }
  });

  it("never projects originalCells or source workbook path on individual lines", async () => {
    const lineWithCanaries = {
      ...DRAFT_PAYLOAD.lines[0],
      originalCells: "LINE-ORIGINALCELLS-CANARY",
      sourceSheetName: "LINE-SHEETNAME-CANARY",
    };
    const artifact = {
      ...BASE_ARTIFACT,
      payload: { ...DRAFT_PAYLOAD, lines: [lineWithCanaries, DRAFT_PAYLOAD.lines[1]] },
    };
    mockGetArtifact.mockResolvedValue(artifact);

    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");

    const json = JSON.stringify(result.review);
    expect(json).not.toContain("LINE-ORIGINALCELLS-CANARY");
    expect(json).not.toContain("LINE-SHEETNAME-CANARY");
  });
});

describe("loadProjectBoqConfigurationExpansionReviewWorkspaceCore - summary allowlist", () => {
  it("projects only the allowed summary numeric fields, drops extras", async () => {
    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");
    if (!result.review.payloadSummary) throw new Error("expected draft payloadSummary");
    const summary = result.review.payloadSummary.summary;
    expect(summary.customerLineCount).toBe(1);
    expect(summary.addedLineCount).toBe(1);
    expect(summary.totalLineCount).toBe(2);
    expect(summary.requiresReviewCount).toBe(1);
    expect(summary.includedItemCount).toBe(0);
  });
});

describe("loadProjectBoqConfigurationExpansionReviewWorkspaceCore - reviewed (read-only) projection", () => {
  beforeEach(() => {
    mockGetArtifact.mockReset().mockResolvedValue(REVIEWED_ARTIFACT);
  });

  it("returns mode reviewed with no draft-only payloadSummary/reviewSummary", async () => {
    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review.mode).toBe("reviewed");
    expect(result.review.payloadSummary).toBeUndefined();
    expect(result.review.reviewSummary).toBeUndefined();
  });

  it("attaches accepted/rejected decisions to expansion lines and none to customer lines", async () => {
    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");
    const byId = new Map(result.review.lines.map((l) => [l.lineId, l]));
    expect(byId.get("line-cust-1")?.origin).toBe("customer");
    expect(byId.get("line-cust-1")?.decision).toBeUndefined();
    expect(byId.get("line-exp-1")?.decision).toBe("accepted");
    expect(byId.get("line-exp-2")?.decision).toBe("rejected");
    // Accepted lines precede rejected lines in display order.
    expect(result.review.lines.map((l) => l.lineId)).toEqual([
      "line-cust-1",
      "line-exp-1",
      "line-exp-2",
    ]);
  });

  it("counts reviewed roll-ups deterministically from the projected decisions", async () => {
    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");
    const counts = result.review.reviewedSummary;
    if (!counts) throw new Error("expected reviewedSummary");
    expect(counts.customerLineCount).toBe(1);
    expect(counts.acceptedExpansionLineCount).toBe(1);
    expect(counts.rejectedExpansionLineCount).toBe(1);
    expect(counts.totalAcceptedLineCount).toBe(2);
    expect(counts.reviewedExpansionLineCount).toBe(2);
  });

  it("never leaks originalCells or evidence path/sheet/note from accepted OR rejected lines", async () => {
    const result = await loadCore();
    if (result.status !== "ok") throw new Error("expected ok");
    const json = JSON.stringify(result.review);
    for (const canary of [
      "REVIEWED-CUST-ORIGINALCELLS-CANARY",
      "REVIEWED-EXP-ORIGINALCELLS-CANARY",
      "REVIEWED-EVIDENCE-PATH-CANARY",
      "REVIEWED-EVIDENCE-SHEET-CANARY",
      "REVIEWED-EVIDENCE-NOTE-CANARY",
      "REJECTED-ORIGINALCELLS-CANARY",
      "REJECTED-EVIDENCE-PATH-CANARY",
      "REJECTED-EVIDENCE-SHEET-CANARY",
      "REJECTED-EVIDENCE-NOTE-CANARY",
    ]) {
      expect(json).not.toContain(canary);
    }
    // Evidence is still reduced to count + sourceTypes on accepted expansion lines.
    const exp = result.review.lines.find((l) => l.lineId === "line-exp-1");
    expect(exp?.evidenceCount).toBe(1);
    expect(exp?.evidenceSourceTypes).toEqual(["ccw_estimate"]);
  });

  it("returns invalid_configuration_expansion_draft_payload when acceptedLines is absent", async () => {
    mockGetArtifact.mockResolvedValue({
      ...REVIEWED_ARTIFACT,
      payload: { ...REVIEWED_PAYLOAD, acceptedLines: undefined },
    });
    const result = await loadCore();
    expect(result.status).toBe("invalid_configuration_expansion_draft_payload");
  });
});

describe("loadProjectBoqConfigurationExpansionReviewWorkspaceCore - static source purity", () => {
  const SRC = join(process.cwd(), "src/lib/projects/project-boq-config-expansion-review-workspace-core.ts");
  const TEST = join(process.cwd(), "tests/lib/projects/project-boq-config-expansion-review-workspace-core.test.ts");
  const source = readFileSync(SRC, "utf8");

  it("imports only DB store helpers and type-only project/config-expansion-types; no artifact writes, AI, pricing, export, catalog, engine, adapter, or approval", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    for (const f of froms) {
      // Only these four imports are allowed
      expect(
        f === "@/lib/db/project-store" ||
        f === "@/lib/db/project-artifact-store" ||
        f === "@/types/project" ||
        f === "@/lib/projects/config-expansion-types"
      ).toBe(true);
    }
    for (const forbidden of [
      "createProjectArtifact",
      "createProjectApproval",
      "@anthropic-ai",
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/adapters',
      'from "@/lib/catalog',
      'from "@/lib/export',
      'from "@/lib/projects/pricing',
      'from "@/lib/projects/config-expansion-artifact',
      'from "@/lib/projects/config-expansion-review',
      'from "@/lib/projects/project-quick-bom-config-expansion-draft',
      'from "@/coordinator',
      'from "@/engines',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
