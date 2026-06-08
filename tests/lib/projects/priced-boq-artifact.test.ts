import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Only the DB repository is mocked: the priced-expanded-BoQ helper runs for real so its
// pricing math, line statuses, and errors are exercised end-to-end (it is pure).
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
  createProjectArtifactVersion: vi.fn(),
}));

import * as service from "@/lib/projects/priced-boq-artifact";
import {
  createPricedBoqArtifact,
  buildPricedBoqArtifactPayload,
  type CreatePricedBoqArtifactInput,
  type PricingAuthorityTrace,
  type ConfigurationAuthorityTrace,
} from "@/lib/projects/priced-boq-artifact";
import {
  getProjectArtifactById,
  createProjectArtifactVersion,
} from "@/lib/db/project-artifact-store";
import { type ExplicitSarUnitPrice } from "@/lib/projects/priced-boq";
import type { ConfigurationExpansionDraftLine } from "@/lib/projects/config-expansion-types";
import type { ProjectArtifact, ProjectPricingConfig } from "@/types/project";

const getArtifactMock = vi.mocked(getProjectArtifactById);
const createMock = vi.mocked(createProjectArtifactVersion);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const EXPANSION_ID = "art-ce-7";
const EXPANSION_VERSION = 3;
const NORMALIZED_ID = "art-nb-7";
const NORMALIZED_VERSION = 5;
const SKU_ID = "art-skur-3";
const SKU_VERSION = 2;
const FILE_ID = "file-1";

function sar(unitListPriceSar: number): ExplicitSarUnitPrice {
  return { currency: "SAR", unitListPriceSar };
}

function trace(overrides: Partial<PricingAuthorityTrace> = {}): PricingAuthorityTrace {
  return {
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
    ...overrides,
  };
}

function config(overrides: Partial<ProjectPricingConfig> = {}): ProjectPricingConfig {
  return {
    currency: "SAR",
    mode: "markup",
    ratePercent: 20,
    vatRatePercent: 15,
    roundingDecimals: 2,
    ...overrides,
  };
}

// --- Accepted expanded-BoM line fixtures -----------------------------------

function customer(
  overrides: Partial<ConfigurationExpansionDraftLine> = {}
): ConfigurationExpansionDraftLine {
  return {
    lineId: "line-1",
    origin: "customer",
    sku: "PARENT-A",
    description: "Parent A",
    quantity: 2,
    sourceFileId: FILE_ID,
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: "PARENT-A",
    acceptedSku: "PARENT-A",
    originalCells: { "#": "1", "Part Number": "PARENT-A" },
    ...overrides,
  };
}

function expansion(
  overrides: Partial<ConfigurationExpansionDraftLine> = {}
): ConfigurationExpansionDraftLine {
  return {
    lineId: "line-1-x1",
    origin: "expansion",
    sku: "CHILD-1",
    description: "Child one",
    quantity: 2,
    parentLineId: "line-1",
    parentLineNumber: "1",
    relationshipType: "service_or_support",
    quantityRule: "same_as_parent",
    includedItem: false,
    sourceRuleId: "rule-a",
    evidence: [
      {
        sourceType: "ccw_export",
        sourcePath: "C:/Pre-Sales/fixture.xlsx",
        sheetName: "Sheet1",
        lineNumber: 1,
        evidenceNote: "fixture evidence",
      },
    ],
    approvalRequired: false,
    approved: true,
    ...overrides,
  };
}

// --- Artifact fixtures ------------------------------------------------------

function expansionPayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    sourceNormalizedBoqArtifactId: NORMALIZED_ID,
    sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION,
    sourceSkuResolutionArtifactId: SKU_ID,
    sourceSkuResolutionArtifactVersion: SKU_VERSION,
    sourceFileIds: [FILE_ID],
    rulePackId: "honeywell-scope-rules",
    rulePackVersion: "1.0.0",
    rulePackStatus: "approved",
    lineCount: 2,
    acceptedLines: [customer(), expansion()],
    rejectedLines: [],
    summary: {
      customerLineCount: 1,
      acceptedExpansionLineCount: 1,
      rejectedExpansionLineCount: 0,
      totalAcceptedLineCount: 2,
      reviewedExpansionLineCount: 1,
    },
    ...overrides,
  };
}

function expansionArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  const now = new Date("2026-05-21T08:30:00.000Z");
  return {
    id: EXPANSION_ID,
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    // Pricing consumes only an approved source artifact (Project approval gate);
    // happy-path fixtures use an approved configuration_expansion artifact.
    status: "approved",
    version: EXPANSION_VERSION,
    payload: expansionPayload(),
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [NORMALIZED_ID, SKU_ID],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createdArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  const now = new Date("2026-05-21T09:00:00.000Z");
  return {
    id: "art-pb-1",
    projectId: PROJECT,
    stageId: "boq_pricing_review",
    type: "priced_boq",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [EXPANSION_ID],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function input(
  overrides: Partial<CreatePricedBoqArtifactInput> = {}
): CreatePricedBoqArtifactInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    configurationExpansionArtifactId: EXPANSION_ID,
    pricingConfig: config(),
    unitListPriceSarBySku: { "PARENT-A": sar(100), "CHILD-1": sar(50) },
    ...overrides,
  };
}

/** Resolve the configuration_expansion artifact for the single lookup. */
function mockArtifact(expansionArt: ProjectArtifact | null): void {
  getArtifactMock.mockReset();
  getArtifactMock.mockImplementation(async (_t, _p, id) =>
    id === EXPANSION_ID ? expansionArt : null
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockResolvedValue(createdArtifact());
});

describe("createPricedBoqArtifact - source contract", () => {
  it("loads exactly one configuration_expansion artifact by id, not normalized/sku ids", async () => {
    mockArtifact(expansionArtifact());
    await createPricedBoqArtifact(input());
    // The input carries only configurationExpansionArtifactId; the service performs a
    // single lookup against it and never resolves a normalized_boq or sku_resolution id.
    expect(getArtifactMock).toHaveBeenCalledTimes(1);
    expect(getArtifactMock).toHaveBeenCalledWith(TENANT, PROJECT, EXPANSION_ID);
  });
});

describe("createPricedBoqArtifact - guards", () => {
  it("throws the exact missing message and does not create", async () => {
    mockArtifact(null);
    await expect(createPricedBoqArtifact(input())).rejects.toThrow(
      "Configuration expansion artifact not found."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact wrong-type message and does not create", async () => {
    mockArtifact(expansionArtifact({ type: "sku_resolution" }));
    await expect(createPricedBoqArtifact(input())).rejects.toThrow(
      "Artifact is not a configuration_expansion artifact."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws invalid-payload when acceptedLines or a provenance field is wrong", async () => {
    const bad: Record<string, unknown>[] = [
      expansionPayload({ acceptedLines: "nope" }), // acceptedLines not an array
      expansionPayload({ sourceNormalizedBoqArtifactId: 7 }), // id not a string
      expansionPayload({ sourceNormalizedBoqArtifactVersion: "5" }), // version not a number
      expansionPayload({ sourceSkuResolutionArtifactId: undefined }), // missing sku id
      expansionPayload({ sourceSkuResolutionArtifactVersion: undefined }), // missing sku version
      expansionPayload({ rulePackStatus: undefined }), // missing rule-pack status
    ];
    for (const payload of bad) {
      mockArtifact(expansionArtifact({ payload }));
      await expect(createPricedBoqArtifact(input())).rejects.toThrow(
        "Configuration expansion artifact payload is invalid."
      );
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects every non-approved source artifact status before pricing", async () => {
    // Project-approval gate (section 16): pricing is blocked unless the source
    // configuration_expansion artifact version is approved. The default payload here
    // carries an APPROVED rule pack, so it is the artifact status - not rule authority -
    // that fails, and it fails before any priced_boq artifact is created.
    const nonApproved = [
      "generated",
      "needs_review",
      "rejected",
      "stale",
      "failed",
      "missing",
      "not_applicable",
    ] as const;
    for (const status of nonApproved) {
      mockArtifact(expansionArtifact({ status }));
      await expect(createPricedBoqArtifact(input())).rejects.toThrow(
        "Configuration expansion artifact must be approved before pricing."
      );
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a payload whose rulePackStatus is not approved, defensively", async () => {
    for (const rulePackStatus of ["candidate", "rejected"]) {
      mockArtifact(expansionArtifact({ payload: expansionPayload({ rulePackStatus }) }));
      await expect(createPricedBoqArtifact(input())).rejects.toThrow(
        "Configuration expansion artifact requires an approved rule pack."
      );
    }
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createPricedBoqArtifact - pricing-helper errors bubble", () => {
  beforeEach(() => {
    mockArtifact(expansionArtifact());
  });

  it("bubbles the non-SAR price error unchanged before any artifact is created", async () => {
    await expect(
      createPricedBoqArtifact(
        input({
          unitListPriceSarBySku: {
            "PARENT-A": { currency: "USD" as unknown as "SAR", unitListPriceSar: 100 },
          },
        })
      )
    ).rejects.toThrow("Accepted SKU price must be in SAR.");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("bubbles the invalid-price error unchanged before any artifact is created", async () => {
    await expect(
      createPricedBoqArtifact(input({ unitListPriceSarBySku: { "PARENT-A": sar(-5) } }))
    ).rejects.toThrow("unitListPriceSar must be a finite nonnegative number.");
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createPricedBoqArtifact - composition", () => {
  beforeEach(() => {
    mockArtifact(expansionArtifact());
  });

  it("creates exactly one artifact with the expected stage/type/status", async () => {
    await createPricedBoqArtifact(input());
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "boq_pricing_review",
      type: "priced_boq",
      status: "needs_review",
    });
  });

  it("sets sourceArtifactIds to exactly the configuration_expansion artifact id", async () => {
    await createPricedBoqArtifact(input());
    expect(createMock.mock.calls[0][0].sourceArtifactIds).toEqual([EXPANSION_ID]);
  });

  it("copies sourceFileIds from the configuration_expansion artifact", async () => {
    mockArtifact(expansionArtifact({ sourceFileIds: ["file-x", "file-y"] }));
    const { payload } = await createPricedBoqArtifact(input());
    expect(payload.sourceFileIds).toEqual(["file-x", "file-y"]);
    expect(createMock.mock.calls[0][0].sourceFileIds).toEqual(["file-x", "file-y"]);
  });

  it("returns the created artifact, the source expansion artifact, payload, and draft", async () => {
    const expansionArt = expansionArtifact();
    const created = createdArtifact({ id: "art-pb-9", version: 4 });
    mockArtifact(expansionArt);
    createMock.mockResolvedValue(created);
    const result = await createPricedBoqArtifact(input());
    expect(result.artifact).toBe(created);
    expect(result.configurationExpansionArtifact).toBe(expansionArt);
    expect(result.payload).toBe(createMock.mock.calls[0][0].payload);
    expect(result.draft.lines).toHaveLength(2);
    expect(result.draft.lines.map((l) => l.status)).toEqual(["priced", "priced"]);
  });
});

describe("createPricedBoqArtifact - pricing from acceptedLines only", () => {
  it("prices the accepted customer line and accepted expansion line", async () => {
    mockArtifact(expansionArtifact());
    const { payload } = await createPricedBoqArtifact(input());
    expect(payload.lines.map((l) => l.status)).toEqual(["priced", "priced"]);
    expect(payload.lines.map((l) => l.acceptedSku)).toEqual(["PARENT-A", "CHILD-1"]);
    expect(payload.lines[0].amounts?.unitListPriceSar).toBe(100);
    expect(payload.lines[1].amounts?.unitListPriceSar).toBe(50);
    expect(payload.summary.pricedLineCount).toBe(2);
  });

  it("does not price rejected expansion lines", async () => {
    mockArtifact(
      expansionArtifact({
        payload: expansionPayload({
          acceptedLines: [customer()],
          rejectedLines: [
            expansion({ lineId: "line-1-x2", sku: "REJECTED-CHILD", approved: false }),
          ],
          lineCount: 1,
        }),
      })
    );
    const { payload } = await createPricedBoqArtifact(
      input({
        // A price for the rejected SKU exists but must never be applied or recorded.
        unitListPriceSarBySku: { "PARENT-A": sar(100), "REJECTED-CHILD": sar(999) },
      })
    );
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines.map((l) => l.acceptedSku)).toEqual(["PARENT-A"]);
    expect(payload.lines.map((l) => l.originalSku)).not.toContain("REJECTED-CHILD");
    expect(Object.keys(payload.unitListPriceSarBySku)).toEqual(["PARENT-A"]);
  });

  it("preserves customer-then-children order from acceptedLines", async () => {
    mockArtifact(
      expansionArtifact({
        payload: expansionPayload({
          acceptedLines: [
            customer({ lineId: "line-1", acceptedSku: "P1", originalSku: "P1" }),
            expansion({ lineId: "line-1-x1", sku: "C1", parentLineId: "line-1" }),
            customer({ lineId: "line-2", acceptedSku: "P2", originalSku: "P2", sourceRowNumber: 2 }),
            expansion({ lineId: "line-2-x1", sku: "C2", parentLineId: "line-2" }),
          ],
          lineCount: 4,
        }),
      })
    );
    const { payload } = await createPricedBoqArtifact(
      input({
        unitListPriceSarBySku: { P1: sar(10), C1: sar(20), P2: sar(30), C2: sar(40) },
      })
    );
    expect(payload.lines.map((l) => l.acceptedSku)).toEqual(["P1", "C1", "P2", "C2"]);
    expect(payload.lineCount).toBe(4);
  });
});

describe("createPricedBoqArtifact - payload provenance and prices", () => {
  beforeEach(() => {
    mockArtifact(expansionArtifact());
  });

  it("records the configuration expansion, normalized, and sku source ids/versions", async () => {
    const { payload } = await createPricedBoqArtifact(input());
    expect(payload.sourceConfigurationExpansionArtifactId).toBe(EXPANSION_ID);
    expect(payload.sourceConfigurationExpansionArtifactVersion).toBe(EXPANSION_VERSION);
    expect(payload.sourceNormalizedBoqArtifactId).toBe(NORMALIZED_ID);
    expect(payload.sourceNormalizedBoqArtifactVersion).toBe(NORMALIZED_VERSION);
    expect(payload.sourceSkuResolutionArtifactId).toBe(SKU_ID);
    expect(payload.sourceSkuResolutionArtifactVersion).toBe(SKU_VERSION);
  });

  it("copies the pricing config, lineCount, lines, and summary", async () => {
    const cfg = config({ ratePercent: 30 });
    const { payload } = await createPricedBoqArtifact(input({ pricingConfig: cfg }));
    expect(payload.pricingConfig).toEqual(cfg);
    expect(payload.pricingConfig).not.toBe(cfg);
    expect(payload.lineCount).toBe(2);
    expect(payload.lines).toHaveLength(2);
    expect(payload.summary.totals.lineCount).toBe(2);
  });

  it("stores only the SAR prices applied to priced lines, copied fresh", async () => {
    const used = sar(100);
    const unitListPriceSarBySku: Record<string, ExplicitSarUnitPrice> = {
      "PARENT-A": used,
      "CHILD-1": sar(50),
      UNUSED: sar(999),
    };
    const { payload } = await createPricedBoqArtifact(input({ unitListPriceSarBySku }));
    expect(Object.keys(payload.unitListPriceSarBySku)).toEqual(["PARENT-A", "CHILD-1"]);
    expect(payload.unitListPriceSarBySku["PARENT-A"]).toEqual(used);
    expect(payload.unitListPriceSarBySku["PARENT-A"]).not.toBe(used);
  });

  it("does not record a price for an orderable SKU that has no SAR entry", async () => {
    const { payload } = await createPricedBoqArtifact(
      input({ unitListPriceSarBySku: { "PARENT-A": sar(100) } })
    );
    // CHILD-1 has no SAR price: its line is retained missing_price, not recorded.
    const childLine = payload.lines.find((l) => l.acceptedSku === "CHILD-1");
    expect(childLine?.status).toBe("missing_price");
    expect(Object.keys(payload.unitListPriceSarBySku)).toEqual(["PARENT-A"]);
  });
});

describe("createPricedBoqArtifact - no field leakage", () => {
  // priced_boq legitimately carries pricing fields, so a token scan is wrong here.
  // Guard instead that no configuration-AUTHORITY field leaks from the accepted
  // expansion lines into the priced payload: assert each key is in a known allowlist.
  const ALLOWED_TOP_LEVEL = [
    "sourceConfigurationExpansionArtifactId",
    "sourceConfigurationExpansionArtifactVersion",
    "sourceNormalizedBoqArtifactId",
    "sourceNormalizedBoqArtifactVersion",
    "sourceSkuResolutionArtifactId",
    "sourceSkuResolutionArtifactVersion",
    "sourceFileIds",
    "pricingConfig",
    "unitListPriceSarBySku",
    "lineCount",
    "lines",
    "summary",
    "pricingAuthority",
    "configurationAuthority",
  ];
  const ALLOWED_LINE_KEYS = [
    "sourceFormat",
    "sourceFileId",
    "sourceSheetName",
    "sourceRowNumber",
    "originalLineNumber",
    "parentLineNumber",
    "originalSku",
    "description",
    "quantity",
    "originalCells",
    "status",
    "acceptedSku",
    "decisionStatus",
    "amounts",
    "warning",
  ];

  it("emits only known priced_boq payload keys and known priced-line keys", async () => {
    mockArtifact(expansionArtifact());
    const { payload } = await createPricedBoqArtifact(input());
    for (const key of Object.keys(payload)) {
      expect(ALLOWED_TOP_LEVEL, `unexpected payload key "${key}"`).toContain(key);
    }
    for (const line of payload.lines) {
      for (const key of Object.keys(line)) {
        // originalCells holds verbatim customer headers, not service-authored keys.
        expect(ALLOWED_LINE_KEYS, `unexpected priced-line key "${key}"`).toContain(key);
      }
    }
  });
});

describe("createPricedBoqArtifact - freshness & purity", () => {
  it("emits fresh line objects that do not alias the draft", async () => {
    mockArtifact(expansionArtifact());
    const result = await createPricedBoqArtifact(input());
    for (let i = 0; i < result.payload.lines.length; i += 1) {
      expect(result.payload.lines[i]).not.toBe(result.draft.lines[i]);
      expect(result.payload.lines[i]).toEqual(result.draft.lines[i]);
    }
    expect(result.payload.summary.totals).not.toBe(result.draft.summary.totals);
    expect(result.payload.summary.totals).toEqual(result.draft.summary.totals);
  });

  it("passes fresh source arrays that cannot corrupt the source artifact", async () => {
    const expansionArt = expansionArtifact();
    mockArtifact(expansionArt);
    await createPricedBoqArtifact(input());
    const arg = createMock.mock.calls[0][0];
    arg.sourceFileIds!.push("injected");
    arg.sourceArtifactIds!.push("injected");
    expect(expansionArt.sourceFileIds).toEqual([FILE_ID]);
    expect(expansionArt.sourceArtifactIds).toEqual([NORMALIZED_ID, SKU_ID]);
  });

  it("does not mutate the input or the source artifact", async () => {
    const expansionArt = expansionArtifact();
    mockArtifact(expansionArt);
    const expansionSnapshot = structuredClone(expansionArt);
    const inp = input();
    const inputSnapshot = structuredClone(inp);
    await createPricedBoqArtifact(inp);
    expect(expansionArt).toEqual(expansionSnapshot);
    expect(inp).toEqual(inputSnapshot);
  });
});

describe("buildPricedBoqArtifactPayload", () => {
  it("is pure over a hand-built draft and echoes the provenance ids/versions", () => {
    const expansionArt = expansionArtifact({ sourceFileIds: ["f1", "f2"] });
    const cfg = config();
    const draft = {
      lines: [
        {
          sourceFileId: FILE_ID,
          sourceRowNumber: 1,
          originalLineNumber: "1",
          originalSku: "PARENT-A",
          description: "Parent A",
          quantity: 2,
          originalCells: { A: "1" },
          status: "priced" as const,
          acceptedSku: "PARENT-A",
          amounts: {
            currency: "SAR" as const,
            quantity: 2,
            unitListPriceSar: 100,
            extendedListPriceSar: 200,
            unitSellPriceSar: 120,
            extendedSellPriceSar: 240,
            pricingMode: "markup" as const,
            ratePercent: 20,
            vatRatePercent: 15,
            vatAmountSar: 36,
            totalIncVatSar: 276,
          },
        },
      ],
      summary: {
        inputLineCount: 1,
        pricedLineCount: 1,
        unpricedLineCount: 0,
        missingDecisionCount: 0,
        notAcceptedCount: 0,
        missingPriceCount: 0,
        totals: {
          currency: "SAR" as const,
          lineCount: 1,
          subtotalListPriceSar: 200,
          subtotalSellPriceSar: 240,
          vatAmountSar: 36,
          totalIncVatSar: 276,
        },
      },
    };
    const payload = buildPricedBoqArtifactPayload({
      configurationExpansionArtifact: expansionArt,
      sourceNormalizedBoqArtifactId: NORMALIZED_ID,
      sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION,
      sourceSkuResolutionArtifactId: SKU_ID,
      sourceSkuResolutionArtifactVersion: SKU_VERSION,
      pricingConfig: cfg,
      unitListPriceSarBySku: { "PARENT-A": sar(100) },
      draft,
    });
    expect(payload.sourceConfigurationExpansionArtifactId).toBe(EXPANSION_ID);
    expect(payload.sourceConfigurationExpansionArtifactVersion).toBe(EXPANSION_VERSION);
    expect(payload.sourceNormalizedBoqArtifactId).toBe(NORMALIZED_ID);
    expect(payload.sourceSkuResolutionArtifactId).toBe(SKU_ID);
    expect(payload.sourceFileIds).toEqual(["f1", "f2"]);
    expect(payload.lineCount).toBe(1);
    expect(payload.lines[0]).not.toBe(draft.lines[0]);
    expect(payload.lines[0].originalCells).not.toBe(draft.lines[0].originalCells);
    expect(payload.lines[0].amounts).not.toBe(draft.lines[0].amounts);
    expect(payload.summary.totals).not.toBe(draft.summary.totals);
    expect(payload.unitListPriceSarBySku["PARENT-A"]).toEqual(sar(100));
  });
});

describe("pricingAuthority trace - buildPricedBoqArtifactPayload", () => {
  const expansionArt = expansionArtifact({ sourceFileIds: ["f1"] });
  const minimalDraft = {
    lines: [],
    summary: {
      inputLineCount: 0,
      pricedLineCount: 0,
      unpricedLineCount: 0,
      missingDecisionCount: 0,
      notAcceptedCount: 0,
      missingPriceCount: 0,
      totals: {
        currency: "SAR" as const,
        lineCount: 0,
        subtotalListPriceSar: 0,
        subtotalSellPriceSar: 0,
        vatAmountSar: 0,
        totalIncVatSar: 0,
      },
    },
  };

  function baseInput() {
    return {
      configurationExpansionArtifact: expansionArt,
      sourceNormalizedBoqArtifactId: NORMALIZED_ID,
      sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION,
      sourceSkuResolutionArtifactId: SKU_ID,
      sourceSkuResolutionArtifactVersion: SKU_VERSION,
      pricingConfig: config(),
      unitListPriceSarBySku: {},
      draft: minimalDraft,
    };
  }

  it("omits pricingAuthority from the payload when not supplied", () => {
    const payload = buildPricedBoqArtifactPayload(baseInput());
    expect("pricingAuthority" in payload).toBe(false);
  });

  it("copies a supplied pricingAuthority trace into the payload", () => {
    const t = trace();
    const payload = buildPricedBoqArtifactPayload({ ...baseInput(), pricingAuthority: t });
    expect(payload.pricingAuthority).toEqual(t);
  });

  it("does not alias the supplied trace or its boundary", () => {
    const t = trace();
    const payload = buildPricedBoqArtifactPayload({ ...baseInput(), pricingAuthority: t });
    expect(payload.pricingAuthority).not.toBe(t);
    expect(payload.pricingAuthority!.boundary).not.toBe(t.boundary);
  });

  it("mutating the input trace after the call does not corrupt the payload", () => {
    const t = trace();
    const payload = buildPricedBoqArtifactPayload({ ...baseInput(), pricingAuthority: t });
    (t as { approvalRecordId: string }).approvalRecordId = "mutated";
    expect(payload.pricingAuthority!.approvalRecordId).toBe(
      "prompt-119-user-approved-honeywell-demo-pricing-authority"
    );
  });
});

describe("pricingAuthority trace - createPricedBoqArtifact", () => {
  beforeEach(() => {
    mockArtifact(expansionArtifact());
  });

  it("persists the pricingAuthority trace in the payload when supplied", async () => {
    const t = trace();
    const { payload } = await createPricedBoqArtifact(input({ pricingAuthority: t }));
    expect(payload.pricingAuthority).toEqual(t);
    expect(payload.pricingAuthority).not.toBe(t);
    expect(payload.pricingAuthority!.boundary).not.toBe(t.boundary);
  });

  it("omits pricingAuthority from the payload when not supplied", async () => {
    const { payload } = await createPricedBoqArtifact(input());
    expect("pricingAuthority" in payload).toBe(false);
  });
});

function configTrace(
  overrides: Partial<ConfigurationAuthorityTrace> = {}
): ConfigurationAuthorityTrace {
  return {
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
    ...overrides,
  };
}

describe("configurationAuthority trace - buildPricedBoqArtifactPayload", () => {
  const expansionArt = expansionArtifact({ sourceFileIds: ["f1"] });
  const minimalDraft = {
    lines: [],
    summary: {
      inputLineCount: 0,
      pricedLineCount: 0,
      unpricedLineCount: 0,
      missingDecisionCount: 0,
      notAcceptedCount: 0,
      missingPriceCount: 0,
      totals: {
        currency: "SAR" as const,
        lineCount: 0,
        subtotalListPriceSar: 0,
        subtotalSellPriceSar: 0,
        vatAmountSar: 0,
        totalIncVatSar: 0,
      },
    },
  };

  function baseInput() {
    return {
      configurationExpansionArtifact: expansionArt,
      sourceNormalizedBoqArtifactId: NORMALIZED_ID,
      sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION,
      sourceSkuResolutionArtifactId: SKU_ID,
      sourceSkuResolutionArtifactVersion: SKU_VERSION,
      pricingConfig: config(),
      unitListPriceSarBySku: {},
      draft: minimalDraft,
    };
  }

  it("omits configurationAuthority from the payload when not supplied", () => {
    const payload = buildPricedBoqArtifactPayload(baseInput());
    expect("configurationAuthority" in payload).toBe(false);
  });

  it("copies a supplied configurationAuthority trace into the payload", () => {
    const ct = configTrace();
    const payload = buildPricedBoqArtifactPayload({ ...baseInput(), configurationAuthority: ct });
    expect(payload.configurationAuthority).toEqual(ct);
  });

  it("does not alias the supplied trace or its dispositionSummary", () => {
    const ct = configTrace();
    const payload = buildPricedBoqArtifactPayload({ ...baseInput(), configurationAuthority: ct });
    expect(payload.configurationAuthority).not.toBe(ct);
    expect(payload.configurationAuthority!.dispositionSummary).not.toBe(ct.dispositionSummary);
  });

  it("mutating the input trace after the call does not corrupt the payload", () => {
    const ct = configTrace();
    const payload = buildPricedBoqArtifactPayload({ ...baseInput(), configurationAuthority: ct });
    (ct as { approvalRecordId: string }).approvalRecordId = "mutated";
    expect(payload.configurationAuthority!.approvalRecordId).toBe(
      "prompt-116-user-approved-honeywell-config-authority"
    );
  });

  it("configurationAuthority and pricingAuthority can both be present and remain distinct", () => {
    const ct = configTrace();
    const pt = trace();
    const payload = buildPricedBoqArtifactPayload({
      ...baseInput(),
      configurationAuthority: ct,
      pricingAuthority: pt,
    });
    expect(payload.configurationAuthority).toEqual(ct);
    expect(payload.pricingAuthority).toEqual(pt);
    expect((payload.configurationAuthority as unknown as Record<string, unknown>)["boundary"]).toBeUndefined();
    expect((payload.pricingAuthority as unknown as Record<string, unknown>)["dispositionSummary"]).toBeUndefined();
  });

  it("does not copy stray fields from a supplied configurationAuthority trace", () => {
    const ct = {
      ...configTrace(),
      pricingAuthority: true,
      currency: "SAR",
      boundary: { runtimeAiPricing: true },
    } as unknown as ConfigurationAuthorityTrace;
    const payload = buildPricedBoqArtifactPayload({ ...baseInput(), configurationAuthority: ct });
    const copied = payload.configurationAuthority as unknown as Record<string, unknown>;
    expect(copied.pricingAuthority).toBeUndefined();
    expect(copied.currency).toBeUndefined();
    expect(copied.boundary).toBeUndefined();
  });
});

describe("configurationAuthority trace - createPricedBoqArtifact", () => {
  it("omits configurationAuthority from the payload when the source does not carry one", async () => {
    mockArtifact(expansionArtifact());
    const { payload } = await createPricedBoqArtifact(input());
    expect("configurationAuthority" in payload).toBe(false);
  });

  it("copies a valid source configurationAuthority trace into the priced_boq payload", async () => {
    const ct = configTrace();
    mockArtifact(expansionArtifact({ payload: expansionPayload({ configurationAuthority: ct }) }));
    const { payload } = await createPricedBoqArtifact(input());
    expect(payload.configurationAuthority).toEqual(ct);
    expect(payload.configurationAuthority).not.toBe(ct);
    expect(payload.configurationAuthority!.dispositionSummary).not.toBe(ct.dispositionSummary);
  });

  it("throws the invalid-payload error and creates no artifact when configurationAuthority is malformed", async () => {
    const badCases: unknown[] = [
      "bad-string",
      42,
      [],
      { scope: "wrong_scope", approvalRecordId: "x", rulePackId: "r", rulePackVersion: "1", rulePackStatus: "approved", rulePackSourceScope: "s", dispositionSummary: {} },
      { scope: "honeywell_mvp_demo_only", approvalRecordId: 99, rulePackId: "r", rulePackVersion: "1", rulePackStatus: "approved", rulePackSourceScope: "s", dispositionSummary: {} },
      { scope: "honeywell_mvp_demo_only", approvalRecordId: "x", rulePackId: "r", rulePackVersion: "1", rulePackStatus: "candidate", rulePackSourceScope: "s", dispositionSummary: {} },
      { scope: "honeywell_mvp_demo_only", approvalRecordId: "x", rulePackId: "r", rulePackVersion: "1", rulePackStatus: "approved", rulePackSourceScope: "s", dispositionSummary: null },
      { ...configTrace(), runtimeAi: true },
      { ...configTrace(), replacementAuthority: true },
      { ...configTrace(), skuSubstitutionAuthority: true },
      { ...configTrace(), unknownRelationshipsDeferred: false },
      { ...configTrace(), attachesOpticsUnderSwitches: true },
      {
        ...configTrace(),
        dispositionSummary: {
          ...configTrace().dispositionSummary,
          expandByApprovedRulePackCount: "not-a-number",
        },
      },
    ];
    for (const bad of badCases) {
      mockArtifact(expansionArtifact({ payload: expansionPayload({ configurationAuthority: bad }) }));
      await expect(createPricedBoqArtifact(input())).rejects.toThrow(
        "Configuration expansion artifact payload is invalid."
      );
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it("configurationAuthority and pricingAuthority can both be present, remain distinct, and keep their nested objects separate", async () => {
    const ct = configTrace();
    mockArtifact(expansionArtifact({ payload: expansionPayload({ configurationAuthority: ct }) }));
    const pt = trace();
    const { payload } = await createPricedBoqArtifact(input({ pricingAuthority: pt }));
    expect(payload.configurationAuthority).toEqual(ct);
    expect(payload.pricingAuthority).toEqual(pt);
    expect(payload.configurationAuthority!.dispositionSummary).not.toBe(ct.dispositionSummary);
    expect(payload.pricingAuthority!.boundary).not.toBe(pt.boundary);
  });

  it("does not carry stray pricing-like fields from the source configurationAuthority", async () => {
    const ct = {
      ...configTrace(),
      pricingAuthority: true,
      currency: "SAR",
      boundary: { runtimeAiPricing: true },
    };
    mockArtifact(expansionArtifact({ payload: expansionPayload({ configurationAuthority: ct }) }));
    const { payload } = await createPricedBoqArtifact(input());
    const copied = payload.configurationAuthority as unknown as Record<string, unknown>;
    expect(copied.pricingAuthority).toBeUndefined();
    expect(copied.currency).toBeUndefined();
    expect(copied.boundary).toBeUndefined();
  });
});

describe("module isolation & surface", () => {
  const MODULE_PATH = join(process.cwd(), "src/lib/projects/priced-boq-artifact.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/priced-boq-artifact.test.ts");
  const source = readFileSync(MODULE_PATH, "utf8");

  it("does not import DB schema/index, catalog, approvals, staleness, engines, AI, Mantle/export, the Cisco adapter, or API/UI", () => {
    // Inspect import statements only - the docstring legitimately names these
    // domains to declare what the module deliberately omits. The artifact-store
    // repository is the one allowed DB import.
    const importLines = source
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l))
      .join("\n");
    for (const forbidden of [
      "@/lib/db/index",
      "@/lib/db/schema",
      "drizzle",
      "catalog",
      "approval",
      "staleness",
      "mantle",
      "export",
      "@/engines",
      "@/coordinator",
      "@/lib/agent",
      "@/lib/adapters",
      "anthropic",
      "openai",
      "@/app",
      "@/components",
    ]) {
      expect(importLines).not.toContain(forbidden);
    }
  });

  it("exposes only the expected runtime exports", () => {
    expect(Object.keys(service).sort()).toEqual(
      ["buildPricedBoqArtifactPayload", "createPricedBoqArtifact"].sort()
    );
  });

  it("keeps the module source ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
