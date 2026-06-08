import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Isolate from real DB: mock only the two store helpers.
const { mockGetProject, mockGetArtifact } = vi.hoisted(() => ({
  mockGetProject: vi.fn(),
  mockGetArtifact: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-artifact-store", () => ({ getProjectArtifactById: mockGetArtifact }));

import { loadQuickBomPricedBoqReviewWorkspace } from "@/lib/projects/project-quick-bom-pricing-review-workspace";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "proj-pb-1";
const ARTIFACT_ID = "art-pb-1";

const BASE_PROJECT = {
  id: PROJECT_ID,
  tenantId: TENANT,
  name: "Honeywell Priced BoQ",
  mode: "quick_bom",
  pricingConfig: {
    currency: "SAR",
    mode: "margin",
    ratePercent: 30,
    vatRatePercent: 15,
    roundingDecimals: 2,
  },
  createdAt: new Date("2026-06-01T10:00:00.000Z"),
  updatedAt: new Date("2026-06-02T11:30:00.000Z"),
};

const BASE_AMOUNTS = {
  currency: "SAR",
  quantity: 2,
  unitListPriceSar: 1000,
  extendedListPriceSar: 2000,
  unitSellPriceSar: 700,
  extendedSellPriceSar: 1400,
  pricingMode: "margin",
  ratePercent: 30,
  vatRatePercent: 15,
  vatAmountSar: 210,
  totalIncVatSar: 1610,
};

const BASE_PAYLOAD = {
  sourceConfigurationExpansionArtifactId: "art-ce-7",
  sourceConfigurationExpansionArtifactVersion: 3,
  sourceNormalizedBoqArtifactId: "art-nb-2",
  sourceNormalizedBoqArtifactVersion: 1,
  sourceSkuResolutionArtifactId: "art-skur-5",
  sourceSkuResolutionArtifactVersion: 2,
  sourceFileIds: ["file-1"],
  pricingConfig: {
    currency: "SAR",
    mode: "margin",
    ratePercent: 30,
    vatRatePercent: 15,
    roundingDecimals: 2,
  },
  lineCount: 2,
  summary: {
    inputLineCount: 2,
    pricedLineCount: 1,
    unpricedLineCount: 1,
    missingDecisionCount: 0,
    notAcceptedCount: 0,
    missingPriceCount: 1,
    totals: {
      currency: "SAR",
      lineCount: 1,
      subtotalListPriceSar: 2000,
      subtotalSellPriceSar: 1400,
      vatAmountSar: 210,
      totalIncVatSar: 1610,
    },
  },
  pricingAuthority: {
    profileId: "honeywell-pricing",
    scope: "honeywell_mvp_demo_only",
    approvalRecordId: "appr-pricing-1",
    activeSource: "committed_honeywell_demo_pricing_fixture",
    activeSourceFixtureId: "honeywell-mvp-demo-pricing-fixture",
    activeSourceStatus: "approved_demo_fixture",
    activeSourceWorkbookPath: "WORKBOOK-PATH-CANARY",
    activeSourceSheetName: "SHEET-NAME-CANARY",
    currency: "SAR",
    pricedSkuCount: 1,
    missingPriceSkuCount: 1,
    boundary: {
      deterministicPricingAuthority: true,
      demoFixtureAuthority: true,
      activeRuntimeSourceReadsExternalGplCsv: false,
      productionCiscoPricingAuthority: false,
      broadCiscoGeneralPricingAuthority: false,
      runtimeAiPricing: false,
      runtimeCatalogLookup: false,
      configurationAuthority: false,
      replacementAuthority: false,
      skuSubstitutionAuthority: false,
      silentSkuSubstitution: false,
      missingPricesReported: true,
      canaryBoundaryKey: true,
    },
  },
  configurationAuthority: {
    scope: "honeywell_mvp_demo_only",
    approvalRecordId: "appr-cfg-1",
    rulePackId: "honeywell-scope-rules",
    rulePackVersion: "1.0.0",
    rulePackStatus: "approved",
    rulePackSourceScope: "honeywell_mvp_demo_only",
    dispositionSummary: {
      expandByApprovedRulePackCount: 12,
      preserveKnownRulePackChildCount: 4,
      preserveStandaloneCustomerLineCount: 2,
      deferUnknownRelationshipCount: 1,
      canaryDispositionKey: 999,
    },
    runtimeAi: false,
    replacementAuthority: false,
    skuSubstitutionAuthority: false,
    unknownRelationshipsDeferred: true,
    attachesOpticsUnderSwitches: false,
  },
  unitListPriceSarBySku: { "C9300-48P-A": { currency: "SAR", unitListPriceSar: 1000 } },
  lines: [
    {
      sourceFileId: "file-1",
      sourceRowNumber: 3,
      originalLineNumber: "L-003",
      originalSku: "WS-OLD",
      acceptedSku: "C9300-48P-A",
      description: "Catalyst 9300 switch",
      quantity: 2,
      status: "priced",
      decisionStatus: "accepted",
      amounts: BASE_AMOUNTS,
      originalCells: { A1: "ORIGINALCELLS-CANARY" },
    },
    {
      sourceFileId: "file-1",
      sourceRowNumber: 4,
      originalLineNumber: "L-004",
      originalSku: "UNKNOWN-SKU",
      description: "Unknown SKU line",
      quantity: 1,
      status: "missing_price",
      warning: "No price found for SKU UNKNOWN-SKU",
      originalCells: { A2: "ORIGINALCELLS-CANARY-2" },
    },
  ],
};

const BASE_ARTIFACT = {
  id: ARTIFACT_ID,
  projectId: PROJECT_ID,
  stageId: "boq_pricing_review",
  type: "priced_boq",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-1"],
  sourceArtifactIds: ["art-ce-7"],
  payload: BASE_PAYLOAD,
  createdAt: new Date("2026-06-01T10:00:00.000Z"),
  updatedAt: new Date("2026-06-01T10:30:00.000Z"),
};

beforeEach(() => {
  mockGetProject.mockReset().mockResolvedValue(BASE_PROJECT);
  mockGetArtifact.mockReset().mockResolvedValue(BASE_ARTIFACT);
});

describe("loadQuickBomPricedBoqReviewWorkspace - error statuses", () => {
  it("returns not_found when the project is absent", async () => {
    mockGetProject.mockResolvedValue(null);
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("not_found");
    expect(mockGetArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode when the project is not quick_bom", async () => {
    mockGetProject.mockResolvedValue({ ...BASE_PROJECT, mode: "rfp" });
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("wrong_mode");
    expect(mockGetArtifact).not.toHaveBeenCalled();
  });

  it("returns priced_boq_not_found when the artifact is absent", async () => {
    mockGetArtifact.mockResolvedValue(null);
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("priced_boq_not_found");
  });

  it("returns artifact_not_priced_boq when the artifact is a different type", async () => {
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, type: "sku_resolution" });
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("artifact_not_priced_boq");
  });

  it("returns priced_boq_not_reviewable when status is not needs_review", async () => {
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, status: "approved" });
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("priced_boq_not_reviewable");
  });

  it("returns priced_boq_not_reviewable for generated status", async () => {
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, status: "generated" });
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("priced_boq_not_reviewable");
  });

  it("returns invalid_priced_boq_payload when the payload is missing required fields", async () => {
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, payload: { sourceConfigurationExpansionArtifactId: "art-ce-7" } });
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("invalid_priced_boq_payload");
  });

  it("returns invalid_priced_boq_payload when pricingConfig has wrong currency", async () => {
    const bad = {
      ...BASE_PAYLOAD,
      pricingConfig: { ...BASE_PAYLOAD.pricingConfig, currency: "USD" },
    };
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, payload: bad });
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("invalid_priced_boq_payload");
  });

  it("returns invalid_priced_boq_payload when a line has an unknown status", async () => {
    const bad = {
      ...BASE_PAYLOAD,
      lines: [{ ...BASE_PAYLOAD.lines[0], status: "unknown_status" }],
    };
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, payload: bad });
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("invalid_priced_boq_payload");
  });
});

describe("loadQuickBomPricedBoqReviewWorkspace - ok projection", () => {
  it("returns ok with project/artifact/payloadSummary/reviewSummary/lines", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const { review } = result;

    expect(review.project.id).toBe(PROJECT_ID);
    expect(review.project.tenantId).toBe(TENANT);
    expect(review.project.name).toBe("Honeywell Priced BoQ");
    expect(review.project.mode).toBe("quick_bom");
    expect(typeof review.project.createdAt).toBe("string");

    expect(review.artifact.id).toBe(ARTIFACT_ID);
    expect(review.artifact.type).toBe("priced_boq");
    expect(review.artifact.status).toBe("needs_review");

    expect(review.payloadSummary.sourceConfigurationExpansionArtifactId).toBe("art-ce-7");
    expect(review.payloadSummary.pricingConfig.currency).toBe("SAR");
    expect(review.payloadSummary.lineCount).toBe(2);
    expect(review.payloadSummary.pricingSummary.pricedLineCount).toBe(1);
    expect(review.payloadSummary.pricingSummary.totals.totalIncVatSar).toBe(1610);

    expect(review.reviewSummary.totalLineCount).toBe(2);
    expect(review.reviewSummary.pricedLineCount).toBe(1);
    expect(review.reviewSummary.unpricedLineCount).toBe(1);
    expect(review.reviewSummary.missingPriceCount).toBe(1);
    expect(review.reviewSummary.warningCount).toBe(1);

    expect(review.lines).toHaveLength(2);
  });

  it("scopes both store calls to the passed tenantId", async () => {
    await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(mockGetProject).toHaveBeenCalledWith(TENANT, PROJECT_ID);
    expect(mockGetArtifact).toHaveBeenCalledWith(TENANT, PROJECT_ID, ARTIFACT_ID);
  });

  it("projects ISO date strings for project dates", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review.project.createdAt).toBe("2026-06-01T10:00:00.000Z");
    expect(result.review.project.updatedAt).toBe("2026-06-02T11:30:00.000Z");
    expect(result.review.artifact.createdAt).toBe("2026-06-01T10:00:00.000Z");
    expect(result.review.artifact.updatedAt).toBe("2026-06-01T10:30:00.000Z");
  });

  it("projects the priced line with acceptedSku and amounts", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const priced = result.review.lines.find((l) => l.status === "priced");
    expect(priced).toBeTruthy();
    expect(priced!.acceptedSku).toBe("C9300-48P-A");
    expect(priced!.originalSku).toBe("WS-OLD");
    expect(priced!.amounts).toBeTruthy();
    expect(priced!.amounts!.unitSellPriceSar).toBe(700);
    expect(priced!.amounts!.totalIncVatSar).toBe(1610);
  });

  it("projects the missing_price line with warning and no amounts", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const missing = result.review.lines.find((l) => l.status === "missing_price");
    expect(missing).toBeTruthy();
    expect(missing!.warning).toBe("No price found for SKU UNKNOWN-SKU");
    expect(missing!.amounts).toBeUndefined();
  });

  it("projects pricingAuthority with allowed fields only (no workbook path or sheet name)", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const pa = result.review.payloadSummary.pricingAuthority!;
    expect(pa.profileId).toBe("honeywell-pricing");
    expect(pa.scope).toBe("honeywell_mvp_demo_only");
    expect(pa.currency).toBe("SAR");
    expect(pa.pricedSkuCount).toBe(1);
    expect(pa.boundary).toBeTruthy();
    expect(pa.boundary!.deterministicPricingAuthority).toBe(true);
    expect(pa.boundary!.missingPricesReported).toBe(true);
  });

  it("projects configurationAuthority with allowed fields only", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const ca = result.review.payloadSummary.configurationAuthority!;
    expect(ca.rulePackId).toBe("honeywell-scope-rules");
    expect(ca.rulePackStatus).toBe("approved");
    expect(ca.dispositionSummary).toBeTruthy();
    expect(ca.dispositionSummary!.expandByApprovedRulePackCount).toBe(12);
  });
});

describe("loadQuickBomPricedBoqReviewWorkspace - reviewSummary counts", () => {
  it("counts pricedLineCount from line statuses, not from payload summary", async () => {
    // Both lines have status priced in this override
    const twoMissing = {
      ...BASE_PAYLOAD,
      lines: [
        { ...BASE_PAYLOAD.lines[0], status: "priced" },
        { ...BASE_PAYLOAD.lines[1], status: "priced", warning: undefined },
      ],
    };
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, payload: twoMissing });
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review.reviewSummary.pricedLineCount).toBe(2);
    expect(result.review.reviewSummary.unpricedLineCount).toBe(0);
    expect(result.review.reviewSummary.missingPriceCount).toBe(0);
    expect(result.review.reviewSummary.warningCount).toBe(0);
  });

  it("counts warningCount from lines that have a warning field", async () => {
    const bothWarnings = {
      ...BASE_PAYLOAD,
      lines: [
        { ...BASE_PAYLOAD.lines[0], warning: "warn-1" },
        { ...BASE_PAYLOAD.lines[1], warning: "warn-2" },
      ],
    };
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, payload: bothWarnings });
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review.reviewSummary.warningCount).toBe(2);
  });
});

describe("loadQuickBomPricedBoqReviewWorkspace - array copying", () => {
  it("returned artifact.sourceFileIds is a copy, not the artifact array reference", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review.artifact.sourceFileIds).not.toBe(BASE_ARTIFACT.sourceFileIds);
    expect(result.review.artifact.sourceFileIds).toEqual(BASE_ARTIFACT.sourceFileIds);
  });

  it("returned payloadSummary.sourceFileIds is a copy, not the payload array reference", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review.payloadSummary.sourceFileIds).not.toBe(BASE_PAYLOAD.sourceFileIds);
    expect(result.review.payloadSummary.sourceFileIds).toEqual(BASE_PAYLOAD.sourceFileIds);
  });

  it("returned lines array is a copy, not the payload lines reference", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review.lines).not.toBe(BASE_PAYLOAD.lines);
  });
});

describe("loadQuickBomPricedBoqReviewWorkspace - field canary checks", () => {
  it("never projects unitListPriceSarBySku (source price map)", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const json = JSON.stringify(result.review);
    expect(json).not.toContain("unitListPriceSarBySku");
    expect(json).not.toContain("C9300-48P-A\": {"); // the map key
  });

  it("never projects pricingAuthority workbook path or sheet name canaries", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const json = JSON.stringify(result.review);
    expect(json).not.toContain("WORKBOOK-PATH-CANARY");
    expect(json).not.toContain("SHEET-NAME-CANARY");
    expect(json).not.toContain("activeSourceWorkbookPath");
    expect(json).not.toContain("activeSourceSheetName");
  });

  it("never projects canary key in boundary (drops unknown keys)", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const json = JSON.stringify(result.review);
    expect(json).not.toContain("canaryBoundaryKey");
  });

  it("never projects canary key in dispositionSummary (drops unknown keys)", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const json = JSON.stringify(result.review);
    expect(json).not.toContain("canaryDispositionKey");
    expect(json).not.toContain("999");
  });

  it("never projects originalCells on lines", async () => {
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const json = JSON.stringify(result.review);
    expect(json).not.toContain("originalCells");
    expect(json).not.toContain("ORIGINALCELLS-CANARY");
  });

  it("never projects payload-level canary fields injected in the payload object", async () => {
    const payloadWithCanaries = {
      ...BASE_PAYLOAD,
      exportPath: "EXPORT-PATH-CANARY",
      sourceSheetName: "SOURCE-SHEET-CANARY",
      rawCells: "RAW-CELLS-CANARY",
    };
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, payload: payloadWithCanaries });
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const json = JSON.stringify(result.review);
    expect(json).not.toContain("EXPORT-PATH-CANARY");
    expect(json).not.toContain("SOURCE-SHEET-CANARY");
    expect(json).not.toContain("RAW-CELLS-CANARY");
  });

  it("never projects summary canary fields injected in the summary object", async () => {
    const payloadWithCanaries = {
      ...BASE_PAYLOAD,
      summary: {
        ...BASE_PAYLOAD.summary,
        canaryField: "SUMMARY-CANARY-VALUE",
      },
    };
    mockGetArtifact.mockResolvedValue({ ...BASE_ARTIFACT, payload: payloadWithCanaries });
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const json = JSON.stringify(result.review);
    expect(json).not.toContain("SUMMARY-CANARY-VALUE");
  });

  it("never projects canary fields injected on individual lines", async () => {
    const lineWithCanaries = {
      ...BASE_PAYLOAD.lines[0],
      sourceSheetName: "LINE-SHEET-CANARY",
      sourceFormat: "LINE-FORMAT-CANARY",
      replacedBySku: "REPLACED-SKU-CANARY",
      substitutedBySku: "SUBSTITUTED-SKU-CANARY",
    };
    mockGetArtifact.mockResolvedValue({
      ...BASE_ARTIFACT,
      payload: { ...BASE_PAYLOAD, lines: [lineWithCanaries, BASE_PAYLOAD.lines[1]] },
    });
    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    if (result.status !== "ok") throw new Error("expected ok");
    const json = JSON.stringify(result.review);
    expect(json).not.toContain("LINE-SHEET-CANARY");
    expect(json).not.toContain("LINE-FORMAT-CANARY");
    expect(json).not.toContain("REPLACED-SKU-CANARY");
    expect(json).not.toContain("SUBSTITUTED-SKU-CANARY");
  });
});

describe("loadQuickBomPricedBoqReviewWorkspace - static source purity", () => {
  const SRC = join(process.cwd(), "src/lib/projects/project-quick-bom-pricing-review-workspace.ts");
  const TEST = join(process.cwd(), "tests/lib/projects/project-quick-bom-pricing-review-workspace.test.ts");
  const source = readFileSync(SRC, "utf8");

  it("imports only DB store helpers and type-only project types; no artifact writes, AI, pricing, export, catalog, engine, adapter, or approval", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    for (const f of froms) {
      expect(
        f === "@/lib/db/project-store" ||
        f === "@/lib/db/project-artifact-store" ||
        f === "@/types/project"
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
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/project-quick-bom-pricing',
      'from "@/lib/projects/project-quick-bom-approval',
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
