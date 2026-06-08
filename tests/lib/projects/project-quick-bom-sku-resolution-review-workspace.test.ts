import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
}));

import { loadQuickBomSkuResolutionReviewWorkspace } from "@/lib/projects/project-quick-bom-sku-resolution-review-workspace";
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";

const getProjectMock = vi.mocked(getProjectById);
const getArtifactMock = vi.mocked(getProjectArtifactById);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const ARTIFACT_ID = "art-skur-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const ART_CREATED = new Date("2026-05-21T08:00:00.000Z");
const ART_UPDATED = new Date("2026-05-21T08:30:00.000Z");

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Honeywell Quick BoM",
    customerName: "Honeywell",
    mode: "quick_bom",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function goodPayload(): Record<string, unknown> {
  return {
    sourceNormalizedBoqArtifactId: "art-nb-7",
    sourceNormalizedBoqArtifactVersion: 5,
    sourceFileIds: ["file-1"],
    lineCount: 2,
    summary: { totalLines: 2, needsReviewCount: 1, acceptedCount: 1 },
    decisions: [
      {
        sourceFileId: "file-1",
        sourceRowNumber: 2,
        originalLineNumber: "L-002",
        originalSku: "WS-C3650-48FD-E",
        status: "needs_review",
        suggestions: [
          { suggestedSku: "C9300-48P-A", source: "exact", confidence: 0.99, rationale: "Exact match" },
        ],
      },
      {
        sourceFileId: "file-1",
        sourceRowNumber: 3,
        originalLineNumber: "L-003",
        originalSku: "OLD-SKU",
        status: "accepted",
        acceptedSku: "NEW-SKU",
        decidedBy: "engineer@stc.com",
        decidedAt: "2026-05-22T10:00:00.000Z",
        suggestions: [
          { suggestedSku: "NEW-SKU", source: "normalized" },
        ],
      },
    ],
  };
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT_ID,
    projectId: PROJECT,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: "needs_review",
    version: 2,
    sourceFileIds: ["file-1"],
    sourceArtifactIds: ["art-nb-1"],
    payload: goodPayload(),
    createdAt: ART_CREATED,
    updatedAt: ART_UPDATED,
    ...overrides,
  };
}

beforeEach(() => {
  getProjectMock.mockReset().mockResolvedValue(makeProject());
  getArtifactMock.mockReset().mockResolvedValue(makeArtifact());
});

describe("loadQuickBomSkuResolutionReviewWorkspace - error statuses", () => {
  it("returns not_found when getProjectById returns null", async () => {
    getProjectMock.mockResolvedValue(null);
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    expect(result.status).toBe("not_found");
    expect(getArtifactMock).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a non-quick_bom project and skips the artifact store", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "rfp" }));
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    expect(result.status).toBe("wrong_mode");
    expect(getArtifactMock).not.toHaveBeenCalled();
  });

  it("returns sku_resolution_not_found when getProjectArtifactById returns null", async () => {
    getArtifactMock.mockResolvedValue(null);
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    expect(result.status).toBe("sku_resolution_not_found");
  });

  it("returns artifact_not_sku_resolution when artifact type is not sku_resolution", async () => {
    getArtifactMock.mockResolvedValue(makeArtifact({ type: "priced_boq" }));
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    expect(result.status).toBe("artifact_not_sku_resolution");
  });

  const BAD_PAYLOADS: Array<[string, Record<string, unknown>]> = [
    [
      "non-string sourceNormalizedBoqArtifactId",
      { sourceNormalizedBoqArtifactId: 42, sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [], summary: {}, decisions: [] },
    ],
    [
      "missing sourceNormalizedBoqArtifactId",
      { sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [], summary: {}, decisions: [] },
    ],
    [
      "non-number sourceNormalizedBoqArtifactVersion",
      { sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: "5", sourceFileIds: [], summary: {}, decisions: [] },
    ],
    [
      "sourceFileIds not an array",
      { sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: "file-1", summary: {}, decisions: [] },
    ],
    [
      "sourceFileIds contains non-string",
      { sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: ["file-1", 2], summary: {}, decisions: [] },
    ],
    [
      "decisions not an array",
      { sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [], summary: {}, decisions: "nope" },
    ],
    [
      "summary is not a plain object",
      { sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [], summary: "bad", decisions: [] },
    ],
    [
      "summary is an array",
      { sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [], summary: [], decisions: [] },
    ],
    [
      "decision missing sourceFileId",
      {
        sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [], summary: {},
        decisions: [{ sourceRowNumber: 2, originalLineNumber: "L-002", originalSku: "X", status: "needs_review", suggestions: [] }],
      },
    ],
    [
      "decision with unknown status",
      {
        sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [], summary: {},
        decisions: [{ sourceFileId: "f", sourceRowNumber: 1, originalLineNumber: "L-1", originalSku: "X", status: "pending", suggestions: [] }],
      },
    ],
    [
      "suggestion missing suggestedSku",
      {
        sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [], summary: {},
        decisions: [{ sourceFileId: "f", sourceRowNumber: 1, originalLineNumber: "L-1", originalSku: "X", status: "needs_review", suggestions: [{ source: "exact" }] }],
      },
    ],
    [
      "suggestion with invalid source",
      {
        sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [], summary: {},
        decisions: [{ sourceFileId: "f", sourceRowNumber: 1, originalLineNumber: "L-1", originalSku: "X", status: "needs_review", suggestions: [{ suggestedSku: "S", source: "catalog_lookup" }] }],
      },
    ],
  ];

  it.each(BAD_PAYLOADS)(
    "returns invalid_sku_resolution_payload for %s",
    async (_label, payload) => {
      getArtifactMock.mockResolvedValue(makeArtifact({ payload }));
      const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
      expect(result.status).toBe("invalid_sku_resolution_payload");
    }
  );
});

describe("loadQuickBomSkuResolutionReviewWorkspace - tenant scoping", () => {
  it("passes exact tenantId and projectId to getProjectById", async () => {
    await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    expect(getProjectMock).toHaveBeenCalledTimes(1);
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
  });

  it("passes exact tenantId, projectId, and artifactId to getProjectArtifactById", async () => {
    await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    expect(getArtifactMock).toHaveBeenCalledTimes(1);
    expect(getArtifactMock).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT_ID);
  });
});

describe("loadQuickBomSkuResolutionReviewWorkspace - ok result structure", () => {
  it("returns ok with a serializable project summary including tenantId", async () => {
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const { project } = result.review;
    expect(project.id).toBe(PROJECT);
    expect(project.tenantId).toBe(TENANT);
    expect(project.name).toBe("Honeywell Quick BoM");
    expect(project.mode).toBe("quick_bom");
    expect(typeof project.createdAt).toBe("string");
    expect(typeof project.updatedAt).toBe("string");
  });

  it("returns ok with a serializable artifact summary with no payload field", async () => {
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const { artifact } = result.review;
    expect(artifact.id).toBe(ARTIFACT_ID);
    expect(artifact.projectId).toBe(PROJECT);
    expect(artifact.type).toBe("sku_resolution");
    expect(artifact.version).toBe(2);
    expect(typeof artifact.createdAt).toBe("string");
    expect(typeof artifact.updatedAt).toBe("string");
    expect("payload" in artifact).toBe(false);
  });

  it("returns ok with a payload summary including provenance and counts but no decisions", async () => {
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const { payloadSummary } = result.review;
    expect(payloadSummary.sourceNormalizedBoqArtifactId).toBe("art-nb-7");
    expect(payloadSummary.sourceNormalizedBoqArtifactVersion).toBe(5);
    expect(payloadSummary.lineCount).toBe(2);
    expect("decisions" in payloadSummary).toBe(false);
  });

  it("returns deterministic review counts computed from projected line statuses", async () => {
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const { reviewSummary, lines } = result.review;
    expect(reviewSummary.totalLineCount).toBe(lines.length);
    expect(reviewSummary.totalLineCount).toBe(2);
    expect(reviewSummary.needsReviewCount).toBe(1);
    expect(reviewSummary.acceptedCount).toBe(1);
    expect(reviewSummary.rejectedCount).toBe(0);
    expect(reviewSummary.unresolvedCount).toBe(0);
  });

  it("returns lines in payload order with projected fields and correct suggestion shape", async () => {
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const [line1, line2] = result.review.lines;
    expect(line1.originalSku).toBe("WS-C3650-48FD-E");
    expect(line1.status).toBe("needs_review");
    expect(line1.suggestions).toHaveLength(1);
    expect(line1.suggestions[0].suggestedSku).toBe("C9300-48P-A");
    expect(line1.suggestions[0].source).toBe("exact");
    expect(line2.status).toBe("accepted");
    expect(line2.acceptedSku).toBe("NEW-SKU");
    expect(line2.decidedBy).toBe("engineer@stc.com");
    expect(line2.decidedAt).toBe("2026-05-22T10:00:00.000Z");
  });
});

describe("loadQuickBomSkuResolutionReviewWorkspace - no forbidden fields leak", () => {
  it("drops canary fields from the summary projection (allowlist only)", async () => {
    const payloadWithDirtySummary: Record<string, unknown> = {
      sourceNormalizedBoqArtifactId: "art-nb-7",
      sourceNormalizedBoqArtifactVersion: 5,
      sourceFileIds: [],
      lineCount: 0,
      summary: {
        totalLines: 5,
        needsReviewCount: 2,
        acceptedCount: 3,
        catalogSource: "local_stc_historical_mock",
        activeSourceWorkbookPath: "CANARY_WORKBOOK_PATH_SUMMARY",
        activeSourceSheetName: "CANARY_SHEET_SUMMARY",
        unitListPriceSarBySku: { "SKU-X": 99999 },
        configExpansionRulePackId: "CANARY_RULE_PACK",
        replacementMap: "CANARY_REPLACEMENT_MAP",
      },
      decisions: [],
    };
    getArtifactMock.mockResolvedValue(makeArtifact({ payload: payloadWithDirtySummary }));
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const serialized = JSON.stringify(result.review.payloadSummary.summary);
    // Allowed fields survive
    expect(result.review.payloadSummary.summary.totalLines).toBe(5);
    expect(result.review.payloadSummary.summary.needsReviewCount).toBe(2);
    expect(result.review.payloadSummary.summary.catalogSource).toBe("local_stc_historical_mock");
    // Canary fields are dropped
    expect(serialized).not.toContain("CANARY_WORKBOOK_PATH_SUMMARY");
    expect(serialized).not.toContain("CANARY_SHEET_SUMMARY");
    expect(serialized).not.toContain("CANARY_RULE_PACK");
    expect(serialized).not.toContain("CANARY_REPLACEMENT_MAP");
    expect(serialized).not.toContain("99999");
    expect("activeSourceWorkbookPath" in result.review.payloadSummary.summary).toBe(false);
    expect("unitListPriceSarBySku" in result.review.payloadSummary.summary).toBe(false);
  });

  it("drops originalCells, pricing, file paths, replacement, and substitution fields from lines", async () => {
    const dirtyPayload: Record<string, unknown> = {
      sourceNormalizedBoqArtifactId: "art-nb-7",
      sourceNormalizedBoqArtifactVersion: 5,
      sourceFileIds: ["file-1"],
      lineCount: 1,
      summary: {},
      decisions: [
        {
          sourceFileId: "file-1",
          sourceRowNumber: 2,
          originalLineNumber: "L-002",
          originalSku: "WS-OLD",
          status: "needs_review",
          suggestions: [
            {
              suggestedSku: "C9300-48P-A",
              source: "exact",
              catalogSource: "CANARY_CATALOG_SOURCE",
              rawCatalogRow: "CANARY_RAW_ROW",
              configExpansionRuleId: "CANARY_RULE_ID",
            },
          ],
          originalCells: { A1: "CANARY_ORIGINAL_CELLS" },
          unitListPriceSar: 99999,
          workbookPath: "CANARY_WORKBOOK_PATH",
          sheetName: "CANARY_SHEET_NAME",
          replacementSku: "CANARY_REPLACEMENT",
          substitutionSku: "CANARY_SUBSTITUTION",
        },
      ],
    };
    getArtifactMock.mockResolvedValue(makeArtifact({ payload: dirtyPayload }));
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const serialized = JSON.stringify(result.review);
    expect(serialized).not.toContain("CANARY_ORIGINAL_CELLS");
    expect(serialized).not.toContain("CANARY_WORKBOOK_PATH");
    expect(serialized).not.toContain("CANARY_SHEET_NAME");
    expect(serialized).not.toContain("CANARY_REPLACEMENT");
    expect(serialized).not.toContain("CANARY_SUBSTITUTION");
    expect(serialized).not.toContain("CANARY_CATALOG_SOURCE");
    expect(serialized).not.toContain("CANARY_RAW_ROW");
    expect(serialized).not.toContain("CANARY_RULE_ID");
    expect(serialized).not.toContain("99999");
    const line = result.review.lines[0];
    expect("originalCells" in line).toBe(false);
    expect("unitListPriceSar" in line).toBe(false);
    expect("workbookPath" in line).toBe(false);
    expect("replacementSku" in line).toBe(false);
  });

  it("does not expose the full decisions array in the payloadSummary", async () => {
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    expect("decisions" in result.review.payloadSummary).toBe(false);
    const payloadSer = JSON.stringify(result.review.payloadSummary);
    expect(payloadSer).not.toContain("WS-C3650-48FD-E");
  });
});

describe("loadQuickBomSkuResolutionReviewWorkspace - arrays/objects are copies", () => {
  it("artifact.sourceFileIds is a copy; mutating the store object does not affect the result", async () => {
    const artifact = makeArtifact();
    getArtifactMock.mockResolvedValue(artifact);
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const before = [...result.review.artifact.sourceFileIds];
    artifact.sourceFileIds.push("MUTATION");
    expect(result.review.artifact.sourceFileIds).toEqual(before);
  });

  it("payloadSummary.sourceFileIds is a copy; mutating the stored payload array does not affect the result", async () => {
    const artifact = makeArtifact();
    getArtifactMock.mockResolvedValue(artifact);
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const before = [...result.review.payloadSummary.sourceFileIds];
    (artifact.payload["sourceFileIds"] as string[]).push("MUTATION");
    expect(result.review.payloadSummary.sourceFileIds).toEqual(before);
  });

  it("payloadSummary.summary is a copy; mutating the stored payload summary does not affect the result", async () => {
    const artifact = makeArtifact();
    getArtifactMock.mockResolvedValue(artifact);
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const before = Object.keys(result.review.payloadSummary.summary);
    (artifact.payload["summary"] as Record<string, unknown>)["MUTATION"] = "injected";
    expect(Object.keys(result.review.payloadSummary.summary)).toEqual(before);
  });

  it("project.pricingConfig is a copy; mutating the store project does not affect the result", async () => {
    const project = makeProject({
      pricingConfig: { currency: "SAR", mode: "margin", ratePercent: 30, vatRatePercent: 15, roundingDecimals: 2 },
    });
    getProjectMock.mockResolvedValue(project);
    const result = await loadQuickBomSkuResolutionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const before = result.review.project.pricingConfig?.ratePercent;
    (project.pricingConfig as unknown as Record<string, unknown>)["ratePercent"] = 999;
    expect(result.review.project.pricingConfig?.ratePercent).toBe(before);
  });
});

describe("loadQuickBomSkuResolutionReviewWorkspace - static source purity", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-quick-bom-sku-resolution-review-workspace.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-quick-bom-sku-resolution-review-workspace.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only DB store getters and type-only project types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
    ]);
  });

  it("does not import artifact writers, approvals, AI, catalog, pricing, config-expansion, or engine modules", () => {
    for (const forbidden of [
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps both the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
