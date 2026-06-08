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

import { loadQuickBomConfigurationExpansionReviewWorkspace } from "@/lib/projects/project-quick-bom-config-expansion-review-workspace";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "proj-ce-1";
const ARTIFACT_ID = "art-ce-draft-1";

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

beforeEach(() => {
  mockGetProject.mockReset().mockResolvedValue(BASE_PROJECT);
  mockGetArtifact.mockReset().mockResolvedValue(BASE_ARTIFACT);
});

describe("loadQuickBomConfigurationExpansionReviewWorkspace - error statuses", () => {
  it("returns not_found when the project is absent", async () => {
    mockGetProject.mockResolvedValue(null);
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("not_found");
    expect(mockGetArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode when the project is not quick_bom", async () => {
    mockGetProject.mockResolvedValue({ ...BASE_PROJECT, mode: "rfp" });
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("wrong_mode");
  });

  it("returns configuration_expansion_draft_not_found when the artifact is absent", async () => {
    mockGetArtifact.mockResolvedValue(null);
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("configuration_expansion_draft_not_found");
  });

  it("returns artifact_not_configuration_expansion when the artifact is a different type", async () => {
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, type: "normalized_boq" });
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("artifact_not_configuration_expansion");
  });

  it("returns configuration_expansion_not_draft when payloadKind is absent (reviewed artifact)", async () => {
    const reviewed = {
      ...BASE_ARTIFACT,
      payload: { ...DRAFT_PAYLOAD, payloadKind: undefined },
    };
    mockGetArtifact.mockResolvedValue(reviewed);
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("configuration_expansion_not_draft");
  });

  it("returns configuration_expansion_draft_not_reviewable when status is not needs_review", async () => {
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, status: "generated" });
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("configuration_expansion_draft_not_reviewable");
  });

  it("checks payloadKind (not_draft) before status (not_reviewable)", async () => {
    // status = generated AND no payloadKind: should return not_draft, not not_reviewable
    const artifact = {
      ...BASE_ARTIFACT,
      status: "generated",
      payload: { ...DRAFT_PAYLOAD, payloadKind: undefined },
    };
    mockGetArtifact.mockResolvedValue(artifact);
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("configuration_expansion_not_draft");
  });

  it("returns invalid_configuration_expansion_draft_payload when the payload is malformed", async () => {
    const bad = { ...BASE_ARTIFACT, payload: { payloadKind: "configuration_expansion_draft" } };
    mockGetArtifact.mockResolvedValue(bad);
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("invalid_configuration_expansion_draft_payload");
  });
});

describe("loadQuickBomConfigurationExpansionReviewWorkspace - ok projection", () => {
  it("returns ok with a review that contains project/artifact/payloadSummary/reviewSummary/lines", async () => {
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const { review } = result;

    expect(review.project.id).toBe(PROJECT_ID);
    expect(review.project.tenantId).toBe(TENANT);
    expect(review.project.name).toBe("Honeywell Test");
    expect(review.project.mode).toBe("quick_bom");
    expect(typeof review.project.createdAt).toBe("string");

    expect(review.artifact.id).toBe(ARTIFACT_ID);
    expect(review.artifact.type).toBe("configuration_expansion");
    expect(review.artifact.status).toBe("needs_review");

    expect(review.payloadSummary.rulePackId).toBe("honeywell-scope-rules");
    expect(review.payloadSummary.rulePackStatus).toBe("approved");
    expect(review.payloadSummary.lineCount).toBe(2);

    expect(review.reviewSummary.totalLineCount).toBe(2);
    expect(review.reviewSummary.customerLineCount).toBe(1);
    expect(review.reviewSummary.expansionLineCount).toBe(1);
    expect(review.reviewSummary.requiresDecisionCount).toBe(1);

    expect(review.lines).toHaveLength(2);
  });

  it("projects customer and expansion lines with correct origin field", async () => {
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");

    const customer = result.review.lines.find((l) => l.origin === "customer");
    const expansion = result.review.lines.find((l) => l.origin === "expansion");
    expect(customer).toBeTruthy();
    expect(expansion).toBeTruthy();
  });

  it("scopes both store calls to the passed tenantId", async () => {
    await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(mockGetProject).toHaveBeenCalledWith(TENANT, PROJECT_ID);
    expect(mockGetArtifact).toHaveBeenCalledWith(TENANT, PROJECT_ID, ARTIFACT_ID);
  });
});

describe("loadQuickBomConfigurationExpansionReviewWorkspace - array copying", () => {
  it("returned sourceFileIds are a copy, not the artifact array reference", async () => {
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review.artifact.sourceFileIds).not.toBe(BASE_ARTIFACT.sourceFileIds);
    expect(result.review.artifact.sourceFileIds).toEqual(BASE_ARTIFACT.sourceFileIds);
  });

  it("returned payloadSummary.sourceFileIds are a copy, not the payload array reference", async () => {
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review.payloadSummary.sourceFileIds).not.toBe(DRAFT_PAYLOAD.sourceFileIds);
    expect(result.review.payloadSummary.sourceFileIds).toEqual(DRAFT_PAYLOAD.sourceFileIds);
  });

  it("returned lines array is a copy, not the payload lines reference", async () => {
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review.lines).not.toBe(DRAFT_PAYLOAD.lines);
  });

  it("evidenceSourceTypes is a new array", async () => {
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const expLine = result.review.lines.find((l) => l.origin === "expansion");
    expect(expLine).toBeTruthy();
    // The source evidence array is not aliased
    expect(expLine!.evidenceSourceTypes).not.toBe(DRAFT_PAYLOAD.lines[1].evidence);
  });
});

describe("loadQuickBomConfigurationExpansionReviewWorkspace - evidence reduction", () => {
  it("reduces evidence to count and sourceTypes; never projects path/sheet/line/page/note", async () => {
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
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
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const json = JSON.stringify(result.review);
    expect(json).not.toContain("EVIDENCE-PATH-CANARY");
    expect(json).not.toContain("EVIDENCE-SHEET-CANARY");
    expect(json).not.toContain("EVIDENCE-NOTE-CANARY");
  });
});

describe("loadQuickBomConfigurationExpansionReviewWorkspace - field canary checks", () => {
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

    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
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

    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");

    const json = JSON.stringify(result.review);
    expect(json).not.toContain("LINE-ORIGINALCELLS-CANARY");
    expect(json).not.toContain("LINE-SHEETNAME-CANARY");
  });
});

describe("loadQuickBomConfigurationExpansionReviewWorkspace - summary allowlist", () => {
  it("projects only the allowed summary numeric fields, drops extras", async () => {
    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const summary = result.review.payloadSummary.summary;
    expect(summary.customerLineCount).toBe(1);
    expect(summary.addedLineCount).toBe(1);
    expect(summary.totalLineCount).toBe(2);
    expect(summary.requiresReviewCount).toBe(1);
    expect(summary.includedItemCount).toBe(0);
  });
});

describe("loadQuickBomConfigurationExpansionReviewWorkspace - static source purity", () => {
  const SRC = join(process.cwd(), "src/lib/projects/project-quick-bom-config-expansion-review-workspace.ts");
  const TEST = join(process.cwd(), "tests/lib/projects/project-quick-bom-config-expansion-review-workspace.test.ts");
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
