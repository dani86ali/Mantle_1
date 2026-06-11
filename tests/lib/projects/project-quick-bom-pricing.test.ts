import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact, ProjectPricingConfig } from "@/types/project";

// Mock the three composed boundaries: the project store (verify the Project + read its
// pricingConfig), the deterministic priced-boq artifact service (load + gate + price +
// persist), and the committed demo price fixture getter (the only unit-price source).
// No real DB and no real pricing run here; the wrapper is exercised in isolation.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/projects/priced-boq-artifact", () => ({
  createPricedBoqArtifact: vi.fn(),
}));
vi.mock("@/lib/projects/honeywell-demo-pricing-fixture", () => ({
  getHoneywellDemoUnitListPriceSarBySku: vi.fn(),
}));
vi.mock("@/lib/projects/honeywell-demo-pricing-authority", () => ({
  getHoneywellDemoPricingAuthorityProfile: vi.fn(),
}));

import * as serviceModule from "@/lib/projects/project-quick-bom-pricing";
import {
  createProjectQuickBomPricedBoq,
  type CreateProjectQuickBomPricedBoqInput,
  type CreateProjectQuickBomPricedBoqResult,
} from "@/lib/projects/project-quick-bom-pricing";
import { getProjectById } from "@/lib/db/project-store";
import {
  createPricedBoqArtifact,
  type CreatePricedBoqArtifactResult,
} from "@/lib/projects/priced-boq-artifact";
import { getHoneywellDemoUnitListPriceSarBySku } from "@/lib/projects/honeywell-demo-pricing-fixture";
import { getHoneywellDemoPricingAuthorityProfile } from "@/lib/projects/honeywell-demo-pricing-authority";
import type { PricingAuthorityTrace, ConfigurationAuthorityTrace } from "@/lib/projects/priced-boq-artifact";

const getProjectMock = vi.mocked(getProjectById);
const createMock = vi.mocked(createPricedBoqArtifact);
const getPriceMapMock = vi.mocked(getHoneywellDemoUnitListPriceSarBySku);
const getProfileMock = vi.mocked(getHoneywellDemoPricingAuthorityProfile);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const EXPANSION_ID = "art-ce-7";
const EXPANSION_VERSION = 3;
const NORM_ID = "art-nb-7";
const NORM_VERSION = 5;
const SKU_ID = "art-skur-3";
const SKU_VERSION = 2;
const FILE_ID = "file-1";
const CREATED_ID = "art-pb-1";

const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const CREATED_CREATED = new Date("2026-05-21T09:00:00.000Z");
const CREATED_UPDATED = new Date("2026-05-21T09:30:00.000Z");

// Secrets planted on the delegate's priced payload. The lean summaries drop all
// lines, amounts, and the per-SKU price map, so none of these may surface.
const SECRET_PRICE_SKU = "LEAKED-PRICE-SKU";
const SECRET_LINE_SKU = "LEAKED-LINE-SKU";
const SECRET_CELL = "LEAKED-CELL-VALUE";

const PRICED_SUMMARY = {
  inputLineCount: 2,
  pricedLineCount: 1,
  unpricedLineCount: 1,
  missingDecisionCount: 0,
  notAcceptedCount: 0,
  missingPriceCount: 1,
  totals: {
    currency: "SAR" as const,
    lineCount: 1,
    subtotalListPriceSar: 200,
    subtotalSellPriceSar: 240,
    vatAmountSar: 36,
    totalIncVatSar: 276,
  },
};

const PRICING_AUTHORITY_TRACE: PricingAuthorityTrace = {
  profileId: "honeywell-mvp-demo-pricing-authority-profile",
  scope: "honeywell_mvp_demo_only",
  approvalRecordId: "prompt-119-user-approved-honeywell-demo-pricing-authority",
  activeSource: "committed_honeywell_demo_pricing_fixture",
  activeSourceFixtureId: "honeywell-mvp-demo-pricing-fixture",
  activeSourceStatus: "approved_demo_fixture",
  activeSourceWorkbookPath: "C:/Pre-Sales/Benchmarck_Files/Estimate_NB167337237YA.xlsx",
  activeSourceSheetName: "EstimateDetails_NB167337237YA",
  currency: "SAR",
  pricedSkuCount: 50,
  missingPriceSkuCount: 0,
  boundary: {
    deterministicPricingAuthority: true,
    demoFixtureAuthority: true,
    currentLocalGplSarCsvTemporarilyApproved: true,
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
  },
};

// Full profile shape (with skuStatusMap) returned by the mock
const PROFILE_FIXTURE = {
  ...PRICING_AUTHORITY_TRACE,
  skuStatusMap: {},
};

const PRICING_SOURCE_SUMMARY = {
  source: "honeywell_mvp_demo_pricing_fixture",
  scope: "honeywell_mvp_demo_only",
  currency: "SAR",
  demoFixtureAuthority: true,
  productionPricingAuthority: false,
  runtimeAiPricing: false,
  runtimeCatalogLookup: false,
  replacementAuthority: false,
  silentSkuSubstitution: false,
};

function pricingConfig(
  overrides: Partial<ProjectPricingConfig> = {}
): ProjectPricingConfig {
  return {
    currency: "SAR",
    mode: "markup",
    ratePercent: 20,
    vatRatePercent: 15,
    roundingDecimals: 2,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Honeywell Quick BoM",
    customerName: "Honeywell",
    mode: "quick_bom",
    pricingConfig: pricingConfig(),
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

/** A fresh demo price map (the getter returns a fresh deep copy in production). */
function makePriceMap(): Record<string, { currency: "SAR"; unitListPriceSar: number }> {
  return {
    "PARENT-A": { currency: "SAR", unitListPriceSar: 100 },
    "CHILD-1": { currency: "SAR", unitListPriceSar: 50 },
  };
}

function makeCreatedArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: CREATED_ID,
    projectId: PROJECT,
    stageId: "boq_pricing_review",
    type: "priced_boq",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [EXPANSION_ID],
    createdAt: CREATED_CREATED,
    updatedAt: CREATED_UPDATED,
    ...overrides,
  };
}

function makeSourceArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: EXPANSION_ID,
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "approved",
    version: EXPANSION_VERSION,
    payload: {},
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [NORM_ID, SKU_ID],
    createdAt: CREATED_CREATED,
    updatedAt: CREATED_UPDATED,
    ...overrides,
  };
}

/** The priced payload the delegate persists; line/price secrets must not leak. */
function makePricedPayload(): CreatePricedBoqArtifactResult["payload"] {
  return {
    sourceConfigurationExpansionArtifactId: EXPANSION_ID,
    sourceConfigurationExpansionArtifactVersion: EXPANSION_VERSION,
    sourceNormalizedBoqArtifactId: NORM_ID,
    sourceNormalizedBoqArtifactVersion: NORM_VERSION,
    sourceSkuResolutionArtifactId: SKU_ID,
    sourceSkuResolutionArtifactVersion: SKU_VERSION,
    sourceFileIds: [FILE_ID],
    pricingConfig: pricingConfig(),
    pricingAuthority: { ...PRICING_AUTHORITY_TRACE, boundary: { ...PRICING_AUTHORITY_TRACE.boundary } },
    unitListPriceSarBySku: {
      [SECRET_PRICE_SKU]: { currency: "SAR", unitListPriceSar: 987654 },
    },
    lineCount: 2,
    lines: [
      {
        sourceFileId: FILE_ID,
        sourceRowNumber: 1,
        originalLineNumber: "1",
        originalSku: "PARENT-A",
        description: "Parent A",
        quantity: 2,
        originalCells: { secret: SECRET_CELL },
        status: "priced",
        acceptedSku: SECRET_LINE_SKU,
        amounts: {
          currency: "SAR",
          quantity: 2,
          unitListPriceSar: 100,
          extendedListPriceSar: 200,
          unitSellPriceSar: 120,
          extendedSellPriceSar: 240,
          pricingMode: "markup",
          ratePercent: 20,
          vatRatePercent: 15,
          vatAmountSar: 36,
          totalIncVatSar: 276,
        },
      },
    ],
    summary: PRICED_SUMMARY,
  };
}

function makeServiceResult(
  overrides: Partial<CreatePricedBoqArtifactResult> = {}
): CreatePricedBoqArtifactResult {
  return {
    artifact: makeCreatedArtifact(),
    configurationExpansionArtifact: makeSourceArtifact(),
    payload: makePricedPayload(),
    // The wrapper never reads the draft; a minimal valid shape keeps the type honest.
    draft: { lines: [], summary: PRICED_SUMMARY },
    ...overrides,
  };
}

function input(
  overrides: Partial<CreateProjectQuickBomPricedBoqInput> = {}
): CreateProjectQuickBomPricedBoqInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    configurationExpansionArtifactId: EXPANSION_ID,
    ...overrides,
  };
}

let priceMap: Record<string, { currency: "SAR"; unitListPriceSar: number }>;

beforeEach(() => {
  vi.clearAllMocks();
  priceMap = makePriceMap();
  getProjectMock.mockResolvedValue(makeProject());
  getPriceMapMock.mockReturnValue(priceMap);
  getProfileMock.mockReturnValue(PROFILE_FIXTURE as ReturnType<typeof getHoneywellDemoPricingAuthorityProfile>);
  createMock.mockResolvedValue(makeServiceResult());
});

describe("createProjectQuickBomPricedBoq - project verification", () => {
  it("returns not_found and never prices or loads the fixture when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await createProjectQuickBomPricedBoq(input());

    expect(result).toEqual({ status: "not_found" });
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(getPriceMapMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and does not price for a non-quick_bom project", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "rfp", name: "RFP Bid", customerName: "Acme" })
    );

    const result = await createProjectQuickBomPricedBoq(input());

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "RFP Bid",
      customerName: "Acme",
      mode: "rfp",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect(getPriceMapMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "rfp", customerName: undefined }));

    const result = await createProjectQuickBomPricedBoq(input());

    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });
});

describe("createProjectQuickBomPricedBoq - pricing config gate", () => {
  it("returns pricing_config_missing BEFORE loading the fixture or pricing when the project has no pricingConfig", async () => {
    getProjectMock.mockResolvedValue(makeProject({ pricingConfig: undefined }));

    const result = await createProjectQuickBomPricedBoq(input());

    expect(result).toEqual({ status: "pricing_config_missing" });
    expect(getPriceMapMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("loads the project before pricing", async () => {
    await createProjectQuickBomPricedBoq(input());

    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      createMock.mock.invocationCallOrder[0]
    );
  });
});

describe("createProjectQuickBomPricedBoq - pricing authority + delegation", () => {
  it("delegates with tenant/project/source ids, a COPY of the Project pricingConfig, and the demo fixture price map", async () => {
    const project = makeProject();
    getProjectMock.mockResolvedValue(project);

    await createProjectQuickBomPricedBoq(input());

    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.configurationExpansionArtifactId).toBe(EXPANSION_ID);

    // pricingConfig is sourced from the Project and copied (not the live reference).
    expect(arg.pricingConfig).toEqual(project.pricingConfig);
    expect(arg.pricingConfig).not.toBe(project.pricingConfig);

    // The unit price map is sourced ONLY from the demo fixture getter.
    expect(getPriceMapMock).toHaveBeenCalledTimes(1);
    expect(arg.unitListPriceSarBySku).toBe(priceMap);
  });

  it("never accepts price/config authority from caller input (the input shape carries none)", async () => {
    // Even a caller that spreads in stray fields cannot inject pricing authority: the
    // service reads only tenantId/projectId/configurationExpansionArtifactId, and the
    // pricingConfig + price map come from the Project and the fixture.
    const sneaky = {
      ...input(),
      pricingConfig: { currency: "USD", mode: "margin", ratePercent: 99 },
      unitListPriceSarBySku: { HACK: { currency: "USD", unitListPriceSar: 1 } },
      decidedBy: "attacker",
    } as unknown as CreateProjectQuickBomPricedBoqInput;

    await createProjectQuickBomPricedBoq(sneaky);

    const arg = createMock.mock.calls[0][0];
    expect(arg.pricingConfig.currency).toBe("SAR");
    expect(arg.unitListPriceSarBySku).toBe(priceMap);
    expect("decidedBy" in arg).toBe(false);
  });
});

describe("createProjectQuickBomPricedBoq - pricing authority trace", () => {
  it("imports and calls getHoneywellDemoPricingAuthorityProfile", async () => {
    await createProjectQuickBomPricedBoq(input());
    expect(getProfileMock).toHaveBeenCalledTimes(1);
  });

  it("passes a copied pricingAuthority trace (not the profile object) to the delegate", async () => {
    await createProjectQuickBomPricedBoq(input());
    const arg = createMock.mock.calls[0][0];
    expect(arg.pricingAuthority).toBeDefined();
    expect(arg.pricingAuthority).not.toBe(PROFILE_FIXTURE);
    expect(arg.pricingAuthority!.profileId).toBe("honeywell-mvp-demo-pricing-authority-profile");
    expect(arg.pricingAuthority!.scope).toBe("honeywell_mvp_demo_only");
  });

  it("trace boundary is demo-only: no production, no AI, no catalog, no config or replacement authority", async () => {
    await createProjectQuickBomPricedBoq(input());
    const b = createMock.mock.calls[0][0].pricingAuthority!.boundary;
    expect(b.deterministicPricingAuthority).toBe(true);
    expect(b.demoFixtureAuthority).toBe(true);
    expect(b.activeRuntimeSourceReadsExternalGplCsv).toBe(false);
    expect(b.productionCiscoPricingAuthority).toBe(false);
    expect(b.broadCiscoGeneralPricingAuthority).toBe(false);
    expect(b.runtimeAiPricing).toBe(false);
    expect(b.runtimeCatalogLookup).toBe(false);
    expect(b.configurationAuthority).toBe(false);
    expect(b.replacementAuthority).toBe(false);
    expect(b.skuSubstitutionAuthority).toBe(false);
    expect(b.silentSkuSubstitution).toBe(false);
    expect(b.missingPricesReported).toBe(true);
  });

  it("payloadSummary includes a copied pricingAuthority and pricingSource", async () => {
    const result = await createProjectQuickBomPricedBoq(input());
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary.pricingAuthority).toEqual(PRICING_AUTHORITY_TRACE);
    expect(result.payloadSummary.pricingSource).toEqual(PRICING_SOURCE_SUMMARY);
  });

  it("mutating payloadSummary.pricingAuthority.boundary does not corrupt the delegate result", async () => {
    const serviceResult = makeServiceResult();
    createMock.mockResolvedValue(serviceResult);
    const result = await createProjectQuickBomPricedBoq(input());
    if (result.status !== "ok") throw new Error("unreachable");
    // Mutate the boundary on the returned summary
    (result.payloadSummary.pricingAuthority!.boundary as Record<string, unknown>).runtimeAiPricing = true;
    // The delegate payload's boundary should be unchanged
    expect(serviceResult.payload.pricingAuthority!.boundary.runtimeAiPricing).toBe(false);
  });

  it("caller-supplied stray pricingAuthority in input does not affect the delegate", async () => {
    const sneaky = {
      ...input(),
      pricingAuthority: { profileId: "attacker", boundary: { runtimeAiPricing: true } },
    } as unknown as CreateProjectQuickBomPricedBoqInput;

    await createProjectQuickBomPricedBoq(sneaky);

    const arg = createMock.mock.calls[0][0];
    expect(arg.pricingAuthority!.profileId).toBe("honeywell-mvp-demo-pricing-authority-profile");
    expect(arg.pricingAuthority!.boundary.runtimeAiPricing).toBe(false);
  });
});

describe("createProjectQuickBomPricedBoq - known delegate error translation", () => {
  const CASES: Array<[string, CreateProjectQuickBomPricedBoqResult]> = [
    ["Configuration expansion artifact not found.", { status: "configuration_expansion_not_found" }],
    ["Artifact is not a configuration_expansion artifact.", { status: "artifact_not_configuration_expansion" }],
    ["Configuration expansion artifact payload is invalid.", { status: "invalid_configuration_expansion_payload" }],
    ["Configuration expansion artifact must be approved before pricing.", { status: "configuration_expansion_not_approved" }],
    ["Configuration expansion artifact requires an approved rule pack.", { status: "rule_pack_not_approved" }],
    ["quantity must be a finite nonnegative number.", { status: "invalid_configuration_expansion_payload" }],
    ["Pricing currency must be SAR.", { status: "invalid_project_pricing_config" }],
    ["Pricing mode must be margin or markup.", { status: "invalid_project_pricing_config" }],
    [
      "Margin ratePercent must be a finite number from 0 up to, but not including, 100.",
      { status: "invalid_project_pricing_config" },
    ],
    ["Markup ratePercent must be a finite number from 0 to 100.", { status: "invalid_project_pricing_config" }],
    ["VAT ratePercent must be a finite number from 0 to 100.", { status: "invalid_project_pricing_config" }],
    ["roundingDecimals must be an integer from 0 to 6.", { status: "invalid_project_pricing_config" }],
    ["Accepted SKU price must be in SAR.", { status: "invalid_demo_pricing_fixture" }],
    ["unitListPriceSar must be a finite nonnegative number.", { status: "invalid_demo_pricing_fixture" }],
  ];

  it.each(CASES)("maps %s to the safe status", async (message, expected) => {
    createMock.mockRejectedValue(new Error(message));

    const result = await createProjectQuickBomPricedBoq(input());

    expect(result).toEqual(expected);
  });
});

describe("createProjectQuickBomPricedBoq - unexpected errors", () => {
  it("re-throws an unexpected delegate error unchanged", async () => {
    const boom = new Error("boom-internal-stack-detail");
    createMock.mockRejectedValue(boom);

    await expect(createProjectQuickBomPricedBoq(input())).rejects.toBe(boom);
  });

  it("re-throws a non-Error rejection", async () => {
    createMock.mockRejectedValue("plain string failure");

    await expect(createProjectQuickBomPricedBoq(input())).rejects.toBe("plain string failure");
  });
});

describe("createProjectQuickBomPricedBoq - ok summaries", () => {
  it("returns a serializable created-artifact summary with ISO dates and no payload", async () => {
    const result = await createProjectQuickBomPricedBoq(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: CREATED_ID,
      projectId: PROJECT,
      stageId: "boq_pricing_review",
      type: "priced_boq",
      status: "needs_review",
      version: 1,
      sourceFileIds: [FILE_ID],
      sourceArtifactIds: [EXPANSION_ID],
      createdAt: CREATED_CREATED.toISOString(),
      updatedAt: CREATED_UPDATED.toISOString(),
    });
    expect("payload" in result.artifact).toBe(false);
  });

  it("returns a lean payloadSummary with provenance, copied pricingConfig, the demo pricing-source boundary, and no lines/amounts/price map", async () => {
    const result = await createProjectQuickBomPricedBoq(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary).toEqual({
      sourceConfigurationExpansionArtifactId: EXPANSION_ID,
      sourceConfigurationExpansionArtifactVersion: EXPANSION_VERSION,
      sourceNormalizedBoqArtifactId: NORM_ID,
      sourceNormalizedBoqArtifactVersion: NORM_VERSION,
      sourceSkuResolutionArtifactId: SKU_ID,
      sourceSkuResolutionArtifactVersion: SKU_VERSION,
      sourceFileIds: [FILE_ID],
      pricingConfig: pricingConfig(),
      pricingSource: PRICING_SOURCE_SUMMARY,
      pricingAuthority: PRICING_AUTHORITY_TRACE,
      lineCount: 2,
      summary: PRICED_SUMMARY,
    });
    for (const key of [
      "lines",
      "amounts",
      "unitListPriceSarBySku",
      "acceptedLines",
      "rejectedLines",
      "originalCells",
      "evidence",
    ]) {
      expect(key in result.payloadSummary).toBe(false);
    }
  });

  it("marks the pricing source as demo-only authority, never production/AI/catalog/replacement", async () => {
    const result = await createProjectQuickBomPricedBoq(input());

    if (result.status !== "ok") throw new Error("unreachable");
    const src = result.payloadSummary.pricingSource;
    expect(src.demoFixtureAuthority).toBe(true);
    expect(src.productionPricingAuthority).toBe(false);
    expect(src.runtimeAiPricing).toBe(false);
    expect(src.runtimeCatalogLookup).toBe(false);
    expect(src.replacementAuthority).toBe(false);
    expect(src.silentSkuSubstitution).toBe(false);
    expect(src.currency).toBe("SAR");
  });

  it("returns pricingSummary equal to the payload summary", async () => {
    const result = await createProjectQuickBomPricedBoq(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.pricingSummary).toEqual(PRICED_SUMMARY);
  });

  it("never leaks any priced-line sku, original cells, amounts, or per-SKU price into the response", async () => {
    const result = await createProjectQuickBomPricedBoq(input());

    const json = JSON.stringify(result);
    expect(json).not.toContain(SECRET_PRICE_SKU);
    expect(json).not.toContain(SECRET_LINE_SKU);
    expect(json).not.toContain(SECRET_CELL);
  });
});

describe("createProjectQuickBomPricedBoq - immutability and copies", () => {
  it("does not mutate the Project pricingConfig", async () => {
    const project = makeProject();
    const snapshot = structuredClone(project.pricingConfig);
    getProjectMock.mockResolvedValue(project);

    await createProjectQuickBomPricedBoq(input());

    expect(project.pricingConfig).toEqual(snapshot);
  });

  it("does not mutate the demo fixture price map", async () => {
    const snapshot = structuredClone(priceMap);

    await createProjectQuickBomPricedBoq(input());

    expect(priceMap).toEqual(snapshot);
  });

  it("does not mutate the input object", async () => {
    const inp = input();
    const snapshot = structuredClone(inp);

    await createProjectQuickBomPricedBoq(inp);

    expect(inp).toEqual(snapshot);
  });

  it("copies payload arrays/summary so the response cannot corrupt the delegate result", async () => {
    const serviceResult = makeServiceResult();
    createMock.mockResolvedValue(serviceResult);

    const result = await createProjectQuickBomPricedBoq(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary.sourceFileIds).not.toBe(serviceResult.payload.sourceFileIds);
    expect(result.payloadSummary.summary).not.toBe(serviceResult.payload.summary);
    expect(result.payloadSummary.pricingConfig).not.toBe(serviceResult.payload.pricingConfig);
    expect(result.payloadSummary.pricingAuthority).not.toBe(serviceResult.payload.pricingAuthority);
    expect(result.payloadSummary.pricingAuthority!.boundary).not.toBe(serviceResult.payload.pricingAuthority!.boundary);

    result.payloadSummary.sourceFileIds.push("injected");
    result.payloadSummary.summary.totals.totalIncVatSar = 999;
    result.pricingSummary.pricedLineCount = 999;

    expect(serviceResult.payload.sourceFileIds).toEqual([FILE_ID]);
    expect(serviceResult.payload.summary.totals.totalIncVatSar).toBe(276);
    expect(serviceResult.payload.summary.pricedLineCount).toBe(1);
  });
});

const CONFIG_AUTHORITY_TRACE: ConfigurationAuthorityTrace = {
  scope: "honeywell_mvp_demo_only",
  approvalRecordId: "prompt-116-user-approved-honeywell-config-authority",
  rulePackId: "honeywell-scope-rules",
  rulePackVersion: "1.0.0",
  rulePackStatus: "approved",
  rulePackSourceScope: "honeywell_mvp_demo_only",
  dispositionSummary: {
    expandByApprovedRulePackCount: 5,
    preserveKnownRulePackChildCount: 2,
    preserveStandaloneCustomerLineCount: 1,
    deferUnknownRelationshipCount: 0,
  },
  runtimeAi: false,
  replacementAuthority: false,
  skuSubstitutionAuthority: false,
  unknownRelationshipsDeferred: true,
  attachesOpticsUnderSwitches: false,
};

describe("createProjectQuickBomPricedBoq - configurationAuthority trace", () => {
  it("payloadSummary includes a copied configurationAuthority when the delegate payload has one", async () => {
    const payloadWithConfig = {
      ...makePricedPayload(),
      configurationAuthority: { ...CONFIG_AUTHORITY_TRACE, dispositionSummary: { ...CONFIG_AUTHORITY_TRACE.dispositionSummary } },
    };
    createMock.mockResolvedValue(makeServiceResult({ payload: payloadWithConfig }));

    const result = await createProjectQuickBomPricedBoq(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary.configurationAuthority).toEqual(CONFIG_AUTHORITY_TRACE);
  });

  it("omits configurationAuthority from payloadSummary when the delegate payload has none", async () => {
    const result = await createProjectQuickBomPricedBoq(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect("configurationAuthority" in result.payloadSummary).toBe(false);
  });

  it("mutating returned payloadSummary.configurationAuthority.dispositionSummary does not corrupt the delegate payload", async () => {
    const payloadWithConfig = {
      ...makePricedPayload(),
      configurationAuthority: { ...CONFIG_AUTHORITY_TRACE, dispositionSummary: { ...CONFIG_AUTHORITY_TRACE.dispositionSummary } },
    };
    const serviceResult = makeServiceResult({ payload: payloadWithConfig });
    createMock.mockResolvedValue(serviceResult);

    const result = await createProjectQuickBomPricedBoq(input());
    if (result.status !== "ok") throw new Error("unreachable");
    (result.payloadSummary.configurationAuthority!.dispositionSummary as Record<string, unknown>).expandByApprovedRulePackCount = 999;
    expect(serviceResult.payload.configurationAuthority!.dispositionSummary.expandByApprovedRulePackCount).toBe(5);
  });

  it("caller-supplied stray configurationAuthority in input cannot influence the delegate", async () => {
    const sneaky = {
      ...input(),
      configurationAuthority: { scope: "attacker", approvalRecordId: "evil" },
    } as unknown as CreateProjectQuickBomPricedBoqInput;

    await createProjectQuickBomPricedBoq(sneaky);

    const arg = createMock.mock.calls[0][0];
    expect("configurationAuthority" in arg).toBe(false);
  });

  it("configurationAuthority and pricingAuthority are both present and remain separate", async () => {
    const payloadWithBoth = {
      ...makePricedPayload(),
      configurationAuthority: { ...CONFIG_AUTHORITY_TRACE, dispositionSummary: { ...CONFIG_AUTHORITY_TRACE.dispositionSummary } },
    };
    createMock.mockResolvedValue(makeServiceResult({ payload: payloadWithBoth }));

    const result = await createProjectQuickBomPricedBoq(input());
    if (result.status !== "ok") throw new Error("unreachable");

    expect(result.payloadSummary.configurationAuthority).toEqual(CONFIG_AUTHORITY_TRACE);
    expect(result.payloadSummary.pricingAuthority).toEqual(PRICING_AUTHORITY_TRACE);
    expect(result.payloadSummary.configurationAuthority).not.toBe(result.payloadSummary.pricingAuthority);
    expect((result.payloadSummary.configurationAuthority as unknown as Record<string, unknown>)["boundary"]).toBeUndefined();
    expect((result.payloadSummary.pricingAuthority as unknown as Record<string, unknown>)["dispositionSummary"]).toBeUndefined();
  });

  it("no lines/evidence/acceptedLines/originalCells/amounts/unitListPriceSarBySku leak even when configurationAuthority is present", async () => {
    const payloadWithConfig = {
      ...makePricedPayload(),
      configurationAuthority: { ...CONFIG_AUTHORITY_TRACE, dispositionSummary: { ...CONFIG_AUTHORITY_TRACE.dispositionSummary } },
    };
    createMock.mockResolvedValue(makeServiceResult({ payload: payloadWithConfig }));

    const result = await createProjectQuickBomPricedBoq(input());
    const json = JSON.stringify(result);
    expect(json).not.toContain(SECRET_PRICE_SKU);
    expect(json).not.toContain(SECRET_LINE_SKU);
    expect(json).not.toContain(SECRET_CELL);
    for (const key of ["lines", "amounts", "unitListPriceSarBySku", "acceptedLines", "rejectedLines", "originalCells", "evidence"]) {
      if (result.status === "ok") {
        expect(key in result.payloadSummary).toBe(false);
      }
    }
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-quick-bom-pricing.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-quick-bom-pricing.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports the project store, the priced-boq artifact service, the demo pricing fixture, pricing authority, and project types", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/projects/priced-boq-artifact"');
    expect(source).toContain('from "@/lib/projects/honeywell-demo-pricing-fixture"');
    expect(source).toContain('from "@/lib/projects/honeywell-demo-pricing-authority"');
    expect(source).toContain('from "@/types/project"');
  });

  it("does not import the artifact/approval stores, DB schema/barrel, pricing math, the pure priced-boq helper, catalog, config-expansion, mantle/export, runner, AI, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db/project-artifact-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/schema"',
      'from "@/lib/db/index"',
      'from "@/lib/db"',
      "createProjectArtifactVersion",
      "getProjectArtifactById",
      "createProjectApproval",
      'from "@/lib/projects/priced-boq"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/config-expansion"',
      'from "@/lib/projects/config-expansion-artifact"',
      'from "@/lib/projects/config-expansion-review"',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/export',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
      "@google/generative-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("exposes only the wrapper service as a runtime export", () => {
    expect(Object.keys(serviceModule)).toEqual(["createProjectQuickBomPricedBoq"]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
