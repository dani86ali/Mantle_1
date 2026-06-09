import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Only the DB repository and the workbook writer are mocked. buildMantlePriceEstimateModel
// runs for real (it is pure with type-only deps), so the category split, warnings, and
// row mapping are exercised end-to-end.
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
  createProjectArtifactVersion: vi.fn(),
}));
vi.mock("@/lib/projects/mantle-workbook-writer", () => ({
  writeMantlePriceEstimateWorkbook: vi.fn(),
}));

import * as service from "@/lib/projects/mantle-export-artifact";
import {
  createMantleExportArtifact,
  buildMantleExportArtifactPayload,
  type CreateMantleExportArtifactInput,
} from "@/lib/projects/mantle-export-artifact";
import {
  getProjectArtifactById,
  createProjectArtifactVersion,
} from "@/lib/db/project-artifact-store";
import { writeMantlePriceEstimateWorkbook } from "@/lib/projects/mantle-workbook-writer";
import { buildMantlePriceEstimateModel } from "@/lib/projects/mantle-price-estimate-model";
import type { MantleLineCategory } from "@/lib/projects/mantle-price-estimate-model";
import type { PricedBoqDraftLine, PricedBoqDraftSummary } from "@/lib/projects/priced-boq";
import type { PricedBoqArtifactPayload } from "@/lib/projects/priced-boq-artifact";
import type { ProjectArtifact } from "@/types/project";

const getArtifactMock = vi.mocked(getProjectArtifactById);
const createMock = vi.mocked(createProjectArtifactVersion);
const writeMock = vi.mocked(writeMantlePriceEstimateWorkbook);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const PRICED_ID = "art-pb-7";
const PRICED_VERSION = 4;
const EXPANSION_ID = "art-ce-7";
const EXPANSION_VERSION = 3;
const NORMALIZED_ID = "art-nb-7";
const NORMALIZED_VERSION = 5;
const SKU_ID = "art-skur-3";
const SKU_VERSION = 2;
const FILE_ID = "file-1";
const OUTPUT_PATH = "C:/Pre-Sales/out/requested-mantle.xlsx";
// Deliberately different from OUTPUT_PATH so tests prove filePath comes from the writer
// return value, not from the requested output path.
const WRITTEN_PATH = "C:/Pre-Sales/out/written-mantle.xlsx";

const MISSING_CATEGORY_WARNING =
  "Mantle line category metadata was not supplied for one or more priced rows; defaulted those rows to product totals.";

// --- Priced-line / payload fixtures ----------------------------------------

/** A priced expanded-BoM line (unitList 100, unitNet 80 -> 20% disc, qty 2). */
function pricedLine(overrides: Partial<PricedBoqDraftLine> = {}): PricedBoqDraftLine {
  return {
    sourceFileId: FILE_ID,
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: "ACC-1",
    description: "Item one",
    quantity: 2,
    originalCells: { "#": "1" },
    status: "priced",
    acceptedSku: "ACC-1",
    amounts: {
      currency: "SAR",
      quantity: 2,
      unitListPriceSar: 100,
      extendedListPriceSar: 200,
      unitSellPriceSar: 80,
      extendedSellPriceSar: 160,
      pricingMode: "markup",
      ratePercent: 20,
      vatRatePercent: 15,
      vatAmountSar: 24,
      totalIncVatSar: 184,
    },
    ...overrides,
  };
}

/** Derive a priced_boq summary from lines, with explicit totals for copy-through. */
function summaryFor(
  lines: PricedBoqDraftLine[],
  totalsOverrides: Partial<PricedBoqDraftSummary["totals"]> = {}
): PricedBoqDraftSummary {
  const pricedLineCount = lines.filter((l) => l.status === "priced").length;
  const missingDecisionCount = lines.filter((l) => l.status === "missing_decision").length;
  const notAcceptedCount = lines.filter((l) => l.status === "not_accepted").length;
  const missingPriceCount = lines.filter((l) => l.status === "missing_price").length;
  return {
    inputLineCount: lines.length,
    pricedLineCount,
    unpricedLineCount: missingDecisionCount + notAcceptedCount + missingPriceCount,
    missingDecisionCount,
    notAcceptedCount,
    missingPriceCount,
    totals: {
      currency: "SAR",
      lineCount: pricedLineCount,
      subtotalListPriceSar: 0,
      subtotalSellPriceSar: 0,
      vatAmountSar: 24,
      totalIncVatSar: 184,
      ...totalsOverrides,
    },
  };
}

function pricedPayload(
  lines: PricedBoqDraftLine[] = [pricedLine()],
  overrides: Partial<PricedBoqArtifactPayload> = {}
): PricedBoqArtifactPayload {
  return {
    sourceConfigurationExpansionArtifactId: EXPANSION_ID,
    sourceConfigurationExpansionArtifactVersion: EXPANSION_VERSION,
    sourceNormalizedBoqArtifactId: NORMALIZED_ID,
    sourceNormalizedBoqArtifactVersion: NORMALIZED_VERSION,
    sourceSkuResolutionArtifactId: SKU_ID,
    sourceSkuResolutionArtifactVersion: SKU_VERSION,
    sourceFileIds: [FILE_ID],
    pricingConfig: {
      currency: "SAR",
      mode: "markup",
      ratePercent: 20,
      vatRatePercent: 15,
      roundingDecimals: 2,
    },
    unitListPriceSarBySku: { "ACC-1": { currency: "SAR", unitListPriceSar: 100 } },
    lineCount: lines.length,
    lines,
    summary: summaryFor(lines),
    ...overrides,
  };
}

// --- Artifact fixtures ------------------------------------------------------

function pricedArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  const now = new Date("2026-05-21T09:00:00.000Z");
  return {
    id: PRICED_ID,
    projectId: PROJECT,
    stageId: "boq_pricing_review",
    type: "priced_boq",
    status: "approved",
    version: PRICED_VERSION,
    payload: pricedPayload() as unknown as Record<string, unknown>,
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [EXPANSION_ID],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createdExportArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  const now = new Date("2026-05-21T10:00:00.000Z");
  return {
    id: "art-ep-1",
    projectId: PROJECT,
    stageId: "export_approval",
    type: "export_package",
    status: "needs_review",
    version: 1,
    payload: {},
    filePath: WRITTEN_PATH,
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [PRICED_ID],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function input(
  overrides: Partial<CreateMantleExportArtifactInput> = {}
): CreateMantleExportArtifactInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    pricedBoqArtifactId: PRICED_ID,
    outputPath: OUTPUT_PATH,
    ...overrides,
  };
}

/** Resolve the priced_boq artifact for the single lookup. */
function mockArtifact(pricedArt: ProjectArtifact | null): void {
  getArtifactMock.mockReset();
  getArtifactMock.mockImplementation(async (_t, _p, id) =>
    id === PRICED_ID ? pricedArt : null
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockResolvedValue(createdExportArtifact());
  writeMock.mockReset();
  writeMock.mockResolvedValue(WRITTEN_PATH);
});

describe("createMantleExportArtifact - source contract", () => {
  it("loads exactly one priced_boq artifact by pricedBoqArtifactId", async () => {
    mockArtifact(pricedArtifact());
    await createMantleExportArtifact(input());
    expect(getArtifactMock).toHaveBeenCalledTimes(1);
    expect(getArtifactMock).toHaveBeenCalledWith(TENANT, PROJECT, PRICED_ID);
  });
});

describe("createMantleExportArtifact - guards", () => {
  it("throws the exact missing message and creates/writes nothing", async () => {
    mockArtifact(null);
    await expect(createMantleExportArtifact(input())).rejects.toThrow(
      "Priced BoQ artifact not found."
    );
    expect(writeMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact wrong-type message and creates/writes nothing", async () => {
    mockArtifact(pricedArtifact({ type: "configuration_expansion" }));
    await expect(createMantleExportArtifact(input())).rejects.toThrow(
      "Artifact is not a priced_boq artifact."
    );
    expect(writeMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact not-approved message for any non-approved status", async () => {
    for (const status of ["needs_review", "generated", "stale", "failed", "rejected"] as const) {
      mockArtifact(pricedArtifact({ status }));
      await expect(createMantleExportArtifact(input())).rejects.toThrow(
        "Priced BoQ artifact must be approved before export."
      );
    }
    expect(writeMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws invalid-payload when a provenance field, lines, or summary.totals is wrong", async () => {
    const bad: Record<string, unknown>[] = [
      pricedPayload(undefined, { sourceConfigurationExpansionArtifactId: 7 as unknown as string }),
      pricedPayload(undefined, {
        sourceConfigurationExpansionArtifactVersion: "3" as unknown as number,
      }),
      pricedPayload(undefined, { sourceNormalizedBoqArtifactId: undefined as unknown as string }),
      pricedPayload(undefined, {
        sourceSkuResolutionArtifactVersion: undefined as unknown as number,
      }),
      pricedPayload(undefined, { lines: "nope" as unknown as PricedBoqDraftLine[] }),
      pricedPayload(undefined, { summary: undefined as unknown as PricedBoqDraftSummary }),
      pricedPayload(undefined, {
        summary: { inputLineCount: 1 } as unknown as PricedBoqDraftSummary,
      }),
    ];
    for (const payload of bad) {
      mockArtifact(pricedArtifact({ payload: payload as unknown as Record<string, unknown> }));
      await expect(createMantleExportArtifact(input())).rejects.toThrow(
        "Priced BoQ artifact payload is invalid."
      );
    }
    expect(writeMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createMantleExportArtifact - writer errors bubble", () => {
  it("bubbles the writer error unchanged before any artifact is created", async () => {
    mockArtifact(pricedArtifact());
    writeMock.mockReset();
    writeMock.mockRejectedValue(new Error("Mantle workbook output path is required."));
    await expect(createMantleExportArtifact(input())).rejects.toThrow(
      "Mantle workbook output path is required."
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createMantleExportArtifact - composition", () => {
  beforeEach(() => {
    mockArtifact(pricedArtifact());
  });

  it("creates exactly one export_package at export_approval with needs_review", async () => {
    await createMantleExportArtifact(input());
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "export_approval",
      type: "export_package",
      status: "needs_review",
    });
  });

  it("sets filePath from the writer return value, not the requested outputPath", async () => {
    const result = await createMantleExportArtifact(input());
    expect(createMock.mock.calls[0][0].filePath).toBe(WRITTEN_PATH);
    expect(createMock.mock.calls[0][0].filePath).not.toBe(OUTPUT_PATH);
    expect(result.workbookFilePath).toBe(WRITTEN_PATH);
    expect(result.payload.workbookFilePath).toBe(WRITTEN_PATH);
  });

  it("passes the built model and the output path to the writer", async () => {
    const result = await createMantleExportArtifact(input());
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock.mock.calls[0][0].model).toBe(result.model);
    expect(writeMock.mock.calls[0][0].outputPath).toBe(OUTPUT_PATH);
  });

  it("forwards workbook metadata (projectIdLabel/dealId/priceList/templatePath) to the writer", async () => {
    await createMantleExportArtifact(
      input({
        projectIdLabel: "PRJ-42",
        dealId: "DEAL-99",
        priceList: "STC SAR Price List",
        templatePath: "C:/custom/template.xlsx",
      })
    );
    expect(writeMock.mock.calls[0][0]).toMatchObject({
      projectId: "PRJ-42",
      dealId: "DEAL-99",
      priceList: "STC SAR Price List",
      templatePath: "C:/custom/template.xlsx",
    });
  });

  it("sets sourceArtifactIds to exactly the priced_boq artifact id", async () => {
    await createMantleExportArtifact(input());
    expect(createMock.mock.calls[0][0].sourceArtifactIds).toEqual([PRICED_ID]);
  });

  it("copies sourceFileIds from the priced_boq artifact", async () => {
    mockArtifact(pricedArtifact({ sourceFileIds: ["file-x", "file-y"] }));
    const { payload } = await createMantleExportArtifact(input());
    expect(payload.sourceFileIds).toEqual(["file-x", "file-y"]);
    expect(createMock.mock.calls[0][0].sourceFileIds).toEqual(["file-x", "file-y"]);
  });

  it("returns the created artifact, the source priced_boq artifact, payload, and model", async () => {
    const pricedArt = pricedArtifact();
    const created = createdExportArtifact({ id: "art-ep-9", version: 2 });
    mockArtifact(pricedArt);
    createMock.mockResolvedValue(created);
    const result = await createMantleExportArtifact(input());
    expect(result.artifact).toBe(created);
    expect(result.pricedBoqArtifact).toBe(pricedArt);
    expect(result.payload).toBe(createMock.mock.calls[0][0].payload);
    expect(result.model.rows).toHaveLength(1);
  });
});

describe("createMantleExportArtifact - payload contents", () => {
  beforeEach(() => {
    mockArtifact(pricedArtifact());
  });

  it("records the exportType discriminator and rowCount", async () => {
    const { payload, model } = await createMantleExportArtifact(input());
    expect(payload.exportType).toBe("mantle_price_estimate_workbook");
    expect(payload.rowCount).toBe(model.rows.length);
  });

  it("preserves all priced/config/normalized/sku provenance ids and versions", async () => {
    const { payload } = await createMantleExportArtifact(input());
    expect(payload.sourcePricedBoqArtifactId).toBe(PRICED_ID);
    expect(payload.sourcePricedBoqArtifactVersion).toBe(PRICED_VERSION);
    expect(payload.sourceConfigurationExpansionArtifactId).toBe(EXPANSION_ID);
    expect(payload.sourceConfigurationExpansionArtifactVersion).toBe(EXPANSION_VERSION);
    expect(payload.sourceNormalizedBoqArtifactId).toBe(NORMALIZED_ID);
    expect(payload.sourceNormalizedBoqArtifactVersion).toBe(NORMALIZED_VERSION);
    expect(payload.sourceSkuResolutionArtifactId).toBe(SKU_ID);
    expect(payload.sourceSkuResolutionArtifactVersion).toBe(SKU_VERSION);
  });

  it("copies the Mantle model totals into the payload", async () => {
    const { payload, model } = await createMantleExportArtifact(input());
    expect(payload.totals).toEqual(model.totals);
    expect(payload.totals).not.toBe(model.totals);
  });

  it("copies the Mantle model warnings into the payload", async () => {
    const { payload, model } = await createMantleExportArtifact(input());
    expect(payload.warnings).toEqual(model.warnings);
    expect(payload.warnings).not.toBe(model.warnings);
  });

  it("includes workbook metadata when supplied, omits it otherwise", async () => {
    const withMeta = await createMantleExportArtifact(
      input({ projectIdLabel: "PRJ-42", dealId: "DEAL-99", priceList: "STC" })
    );
    expect(withMeta.payload).toMatchObject({
      projectIdLabel: "PRJ-42",
      dealId: "DEAL-99",
      priceList: "STC",
    });
    const withoutMeta = await createMantleExportArtifact(input());
    expect("projectIdLabel" in withoutMeta.payload).toBe(false);
    expect("dealId" in withoutMeta.payload).toBe(false);
    expect("priceList" in withoutMeta.payload).toBe(false);
  });
});

describe("createMantleExportArtifact - category map (no inference)", () => {
  it("passes categoryByAcceptedSku to the model and copies it into the payload without mutation", async () => {
    mockArtifact(pricedArtifact());
    const categoryByAcceptedSku: Record<string, MantleLineCategory> = { "ACC-1": "service" };
    const result = await createMantleExportArtifact(input({ categoryByAcceptedSku }));
    // The map reached the real model: the priced row took the explicit service category.
    expect(result.model.rows[0].category).toBe("service");
    expect(result.model.rows[0].categoryWasDefaulted).toBe(false);
    expect(result.model.warnings).toEqual([]);
    // ... and was copied fresh into the payload.
    expect(result.payload.categoryByAcceptedSku).toEqual({ "ACC-1": "service" });
    expect(result.payload.categoryByAcceptedSku).not.toBe(categoryByAcceptedSku);
    expect(categoryByAcceptedSku).toEqual({ "ACC-1": "service" });
  });

  it("does not infer categories: an absent map defaults priced rows to product and warns", async () => {
    mockArtifact(pricedArtifact());
    const result = await createMantleExportArtifact(input());
    expect(result.model.rows[0].category).toBe("product");
    expect(result.model.rows[0].categoryWasDefaulted).toBe(true);
    expect(result.model.warnings).toContain(MISSING_CATEGORY_WARNING);
    expect(result.payload.warnings).toContain(MISSING_CATEGORY_WARNING);
    expect("categoryByAcceptedSku" in result.payload).toBe(false);
  });
});

describe("createMantleExportArtifact - export row ordering (pass-through)", () => {
  it("passes rowOrderSkuSequence to the real model so the workbook rows are re-ordered", async () => {
    const lines = [
      pricedLine({ sourceRowNumber: 1, acceptedSku: "A" }),
      pricedLine({ sourceRowNumber: 2, acceptedSku: "B" }),
      pricedLine({ sourceRowNumber: 3, acceptedSku: "C" }),
    ];
    mockArtifact(pricedArtifact({ payload: pricedPayload(lines) as unknown as Record<string, unknown> }));
    const result = await createMantleExportArtifact(
      input({ rowOrderSkuSequence: ["C", "A", "B"] })
    );
    // The sequence reached the real model: rows follow the supplied occurrence order.
    expect(result.model.rows.map((r) => r.partNumber)).toEqual(["C", "A", "B"]);
    // The same model object is handed to the writer.
    expect(writeMock.mock.calls[0][0].model).toBe(result.model);
  });

  it("preserves priced_boq line order when no rowOrderSkuSequence is supplied", async () => {
    const lines = [
      pricedLine({ sourceRowNumber: 1, acceptedSku: "A" }),
      pricedLine({ sourceRowNumber: 2, acceptedSku: "B" }),
    ];
    mockArtifact(pricedArtifact({ payload: pricedPayload(lines) as unknown as Record<string, unknown> }));
    const result = await createMantleExportArtifact(input());
    expect(result.model.rows.map((r) => r.partNumber)).toEqual(["A", "B"]);
  });
});

describe("createMantleExportArtifact - freshness & purity", () => {
  it("passes fresh source arrays that cannot corrupt the source artifact", async () => {
    const pricedArt = pricedArtifact();
    mockArtifact(pricedArt);
    await createMantleExportArtifact(input());
    const arg = createMock.mock.calls[0][0];
    arg.sourceFileIds!.push("injected");
    arg.sourceArtifactIds!.push("injected");
    expect(pricedArt.sourceFileIds).toEqual([FILE_ID]);
    expect(pricedArt.sourceArtifactIds).toEqual([EXPANSION_ID]);
  });

  it("does not mutate the input, the category map, or the source artifact", async () => {
    const pricedArt = pricedArtifact();
    mockArtifact(pricedArt);
    const pricedSnapshot = structuredClone(pricedArt);
    const categoryByAcceptedSku: Record<string, MantleLineCategory> = { "ACC-1": "subscription" };
    const inp = input({ categoryByAcceptedSku, projectIdLabel: "PRJ", dealId: "D", priceList: "L" });
    const inputSnapshot = structuredClone(inp);
    const mapSnapshot = structuredClone(categoryByAcceptedSku);
    await createMantleExportArtifact(inp);
    expect(pricedArt).toEqual(pricedSnapshot);
    expect(inp).toEqual(inputSnapshot);
    expect(categoryByAcceptedSku).toEqual(mapSnapshot);
  });
});

describe("buildMantleExportArtifactPayload", () => {
  it("echoes provenance, copies model totals/warnings fresh, and copies the category map", () => {
    const pricedArt = pricedArtifact({ sourceFileIds: ["f1", "f2"] });
    const parsed = pricedPayload();
    const model = buildMantlePriceEstimateModel({ payload: parsed });
    const categoryByAcceptedSku: Record<string, MantleLineCategory> = { "ACC-1": "product" };
    const payload = buildMantleExportArtifactPayload({
      pricedBoqArtifact: pricedArt,
      pricedPayload: parsed,
      model,
      workbookFilePath: WRITTEN_PATH,
      projectIdLabel: "PRJ-1",
      dealId: "DEAL-1",
      priceList: "STC",
      categoryByAcceptedSku,
    });
    expect(payload.exportType).toBe("mantle_price_estimate_workbook");
    expect(payload.sourcePricedBoqArtifactId).toBe(PRICED_ID);
    expect(payload.sourcePricedBoqArtifactVersion).toBe(PRICED_VERSION);
    expect(payload.sourceConfigurationExpansionArtifactId).toBe(EXPANSION_ID);
    expect(payload.sourceNormalizedBoqArtifactId).toBe(NORMALIZED_ID);
    expect(payload.sourceSkuResolutionArtifactId).toBe(SKU_ID);
    expect(payload.sourceFileIds).toEqual(["f1", "f2"]);
    expect(payload.sourceFileIds).not.toBe(pricedArt.sourceFileIds);
    expect(payload.workbookFilePath).toBe(WRITTEN_PATH);
    expect(payload.rowCount).toBe(model.rows.length);
    expect(payload.totals).toEqual(model.totals);
    expect(payload.totals).not.toBe(model.totals);
    expect(payload.warnings).toEqual(model.warnings);
    expect(payload.warnings).not.toBe(model.warnings);
    expect(payload.categoryByAcceptedSku).toEqual({ "ACC-1": "product" });
    expect(payload.categoryByAcceptedSku).not.toBe(categoryByAcceptedSku);
  });

  it("is pure: it does not mutate the artifact, payload, model, or category map", () => {
    const pricedArt = pricedArtifact();
    const parsed = pricedPayload();
    const model = buildMantlePriceEstimateModel({ payload: parsed });
    const categoryByAcceptedSku: Record<string, MantleLineCategory> = { "ACC-1": "service" };
    const artSnapshot = structuredClone(pricedArt);
    const parsedSnapshot = structuredClone(parsed);
    const modelSnapshot = structuredClone(model);
    const mapSnapshot = structuredClone(categoryByAcceptedSku);
    buildMantleExportArtifactPayload({
      pricedBoqArtifact: pricedArt,
      pricedPayload: parsed,
      model,
      workbookFilePath: WRITTEN_PATH,
      categoryByAcceptedSku,
    });
    expect(pricedArt).toEqual(artSnapshot);
    expect(parsed).toEqual(parsedSnapshot);
    expect(model).toEqual(modelSnapshot);
    expect(categoryByAcceptedSku).toEqual(mapSnapshot);
  });
});

describe("module isolation & surface", () => {
  const MODULE_PATH = join(process.cwd(), "src/lib/projects/mantle-export-artifact.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/mantle-export-artifact.test.ts");
  const source = readFileSync(MODULE_PATH, "utf8");
  const importLines = source
    .split("\n")
    .filter((l) => /^\s*import\b/.test(l));

  it("imports no catalog, SKU/config-expansion service, pricing helper, engine, coordinator, AI, API/UI, or DB schema/index", () => {
    // Inspect import statements only - the docstring legitimately names these domains
    // to declare what the module deliberately omits. The artifact-store repository and
    // the Mantle model/writer are the allowed cross-module imports.
    const joined = importLines.join("\n");
    for (const forbidden of [
      "@/lib/db/index",
      "@/lib/db/schema",
      "drizzle",
      "catalog",
      "@/lib/projects/sku",
      "config-expansion",
      "approval",
      "staleness",
      "@/engines",
      "@/coordinator",
      "@/lib/agent",
      "@/lib/adapters",
      "anthropic",
      "openai",
      "@/app",
      "@/components",
    ]) {
      expect(joined).not.toContain(forbidden);
    }
    // The pricing helpers (priced-boq.ts / pricing.ts) must not be imported; only the
    // type-only PricedBoqArtifactPayload from the priced-boq-artifact service is allowed.
    expect(joined).not.toContain('"@/lib/projects/priced-boq"');
    expect(joined).not.toContain('"@/lib/projects/pricing"');
    for (const line of importLines) {
      if (line.includes("priced-boq")) expect(line).toContain("import type");
    }
  });

  it("exposes only the expected runtime exports", () => {
    expect(Object.keys(service).sort()).toEqual(
      ["buildMantleExportArtifactPayload", "createMantleExportArtifact"].sort()
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
