import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import ExcelJS from "exceljs";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Only the DB repository is mocked. buildMantlePriceEstimateModel,
// writeMantlePriceEstimateWorkbook, locateMantlePriceEstimateLayout, and the
// ExcelJS reads all run for real, so the accepted priced expanded BoM path is
// exercised end-to-end: approved priced_boq artifact -> createMantleExportArtifact
// -> model -> writer -> committed sanitized Mantle template -> generated .xlsx ->
// export_package artifact with filePath. This complements the Prompt 41 service
// test (which mocks the writer); it does not re-test isolation/surface/guards.
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
  createProjectArtifactVersion: vi.fn(),
}));

import {
  createMantleExportArtifact,
  type CreateMantleExportArtifactInput,
} from "@/lib/projects/mantle-export-artifact";
import {
  getProjectArtifactById,
  createProjectArtifactVersion,
} from "@/lib/db/project-artifact-store";
import {
  locateMantlePriceEstimateLayout,
  MANTLE_PRICE_ESTIMATE_SHEET_NAME,
  MANTLE_PRICE_ESTIMATE_HEADERS,
} from "@/lib/projects/mantle-layout-locator";
import type { MantleLineCategory } from "@/lib/projects/mantle-price-estimate-model";
import type { PricedBoqDraftLine, PricedBoqDraftSummary } from "@/lib/projects/priced-boq";
import type { PricedBoqArtifactPayload } from "@/lib/projects/priced-boq-artifact";
import type { ProjectArtifact } from "@/types/project";

const getArtifactMock = vi.mocked(getProjectArtifactById);
const createMock = vi.mocked(createProjectArtifactVersion);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const PRICED_ID = "art-pb-42";
const PRICED_VERSION = 4;
const EXPANSION_ID = "art-ce-42";
const EXPANSION_VERSION = 3;
const NORMALIZED_ID = "art-nb-42";
const NORMALIZED_VERSION = 5;
const SKU_ID = "art-skur-42";
const SKU_VERSION = 2;
const FILE_ID = "file-1";

const PROJECT_ID_LABEL = "PRJ-42";
const DEAL_ID = "DEAL-99";
const PRICE_LIST = "STC SAR Price List";

const UNPRICED_WARNING = "Accepted SKU has no SAR unit price.";

// Explicit Mantle line category per accepted SKU. NO entry for NO-PRICE: it is an
// unpriced (missing_price) row and never reaches the category split.
const CATEGORY_BY_ACCEPTED_SKU: Readonly<Record<string, MantleLineCategory>> = {
  "PARENT-HW": "product",
  "CON-SVC": "service",
  "LIC-SUB": "subscription",
};

// --- Priced expanded-BoM line fixtures (customer-then-children order) --------

/** Customer/product line, accepted "PARENT-HW": list 100, sell 80, qty 2 -> 160. */
function parentProductLine(): PricedBoqDraftLine {
  return {
    sourceFileId: FILE_ID,
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: "PARENT-HW",
    description: "Core routing platform",
    quantity: 2,
    originalCells: { Line: "1" },
    status: "priced",
    acceptedSku: "PARENT-HW",
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
  };
}

/** Service/support expansion child of line 1, accepted "CON-SVC": qty 3 -> 135. */
function serviceChildLine(): PricedBoqDraftLine {
  return {
    sourceFileId: FILE_ID,
    sourceRowNumber: 2,
    originalLineNumber: "1.1",
    parentLineNumber: "1",
    originalSku: "CON-SVC",
    description: "SmartNet Total Care support",
    quantity: 3,
    originalCells: { Line: "1.1" },
    status: "priced",
    acceptedSku: "CON-SVC",
    amounts: {
      currency: "SAR",
      quantity: 3,
      unitListPriceSar: 50,
      extendedListPriceSar: 150,
      unitSellPriceSar: 45,
      extendedSellPriceSar: 135,
      pricingMode: "markup",
      ratePercent: 10,
      vatRatePercent: 15,
      vatAmountSar: 20.25,
      totalIncVatSar: 155.25,
    },
  };
}

/** Subscription expansion child of line 1, accepted "LIC-SUB": qty 1 -> 25. */
function subscriptionChildLine(): PricedBoqDraftLine {
  return {
    sourceFileId: FILE_ID,
    sourceRowNumber: 3,
    originalLineNumber: "1.2",
    parentLineNumber: "1",
    originalSku: "LIC-SUB",
    description: "Threat intelligence subscription",
    quantity: 1,
    originalCells: { Line: "1.2" },
    status: "priced",
    acceptedSku: "LIC-SUB",
    amounts: {
      currency: "SAR",
      quantity: 1,
      unitListPriceSar: 30,
      extendedListPriceSar: 30,
      unitSellPriceSar: 25,
      extendedSellPriceSar: 25,
      pricingMode: "markup",
      ratePercent: 20,
      vatRatePercent: 15,
      vatAmountSar: 3.75,
      totalIncVatSar: 28.75,
    },
  };
}

/** Retained unpriced expansion child of line 1, accepted "NO-PRICE", no amounts. */
function unpricedChildLine(): PricedBoqDraftLine {
  return {
    sourceFileId: FILE_ID,
    sourceRowNumber: 4,
    originalLineNumber: "1.3",
    parentLineNumber: "1",
    originalSku: "NO-PRICE",
    description: "Optional spares kit",
    quantity: 1,
    originalCells: { Line: "1.3" },
    status: "missing_price",
    acceptedSku: "NO-PRICE",
    warning: UNPRICED_WARNING,
  };
}

/** The four priced lines in customer-then-children order. */
function pricedLines(): PricedBoqDraftLine[] {
  return [parentProductLine(), serviceChildLine(), subscriptionChildLine(), unpricedChildLine()];
}

/** Derive a priced_boq summary from lines, with explicit VAT totals for copy-through. */
function summaryFor(lines: PricedBoqDraftLine[]): PricedBoqDraftSummary {
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
      subtotalListPriceSar: 380,
      subtotalSellPriceSar: 320,
      vatAmountSar: 48,
      totalIncVatSar: 368,
    },
  };
}

/** The accepted priced expanded BoM payload: required provenance + the four lines. */
function pricedPayload(): PricedBoqArtifactPayload {
  const lines = pricedLines();
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
    unitListPriceSarBySku: {
      "PARENT-HW": { currency: "SAR", unitListPriceSar: 100 },
      "CON-SVC": { currency: "SAR", unitListPriceSar: 50 },
      "LIC-SUB": { currency: "SAR", unitListPriceSar: 30 },
    },
    lineCount: lines.length,
    lines,
    summary: summaryFor(lines),
  };
}

/** An APPROVED priced_boq artifact carrying the priced expanded BoM payload. */
function pricedArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  const now = new Date("2026-05-22T09:00:00.000Z");
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

/** The export_package artifact the mocked repository returns for the new version. */
function createdExportArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  const now = new Date("2026-05-22T10:00:00.000Z");
  return {
    id: "art-ep-1",
    projectId: PROJECT,
    stageId: "export_approval",
    type: "export_package",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [PRICED_ID],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Resolve only the priced_boq artifact for the single lookup. */
function mockApprovedArtifact(): void {
  getArtifactMock.mockImplementation(async (_t, _p, id) =>
    id === PRICED_ID ? pricedArtifact() : null
  );
}

/** Open a written workbook's Price Estimate sheet for assertions. */
async function openSheet(path: string): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const worksheet = workbook.getWorksheet(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
  if (!worksheet) throw new Error("missing Price Estimate sheet");
  return worksheet;
}

describe("createMantleExportArtifact - real Mantle workbook integration", () => {
  let tmpDir: string;
  let outputPath: string;
  let result: Awaited<ReturnType<typeof createMantleExportArtifact>>;
  let layout: Awaited<ReturnType<typeof locateMantlePriceEstimateLayout>>;
  let worksheet: ExcelJS.Worksheet;
  // Snapshot the mock interactions right after the single run so the assertions are
  // immune to any future per-test mock clearing (this run happens in beforeAll).
  let createArg: Parameters<typeof createProjectArtifactVersion>[0];
  let createCallCount: number;
  let getArtifactCallCount: number;
  let getArtifactCallArgs: Parameters<typeof getProjectArtifactById>;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "bomatic-mantle-export-"));
    outputPath = join(tmpDir, "mantle-export.xlsx");

    mockApprovedArtifact();
    // Echo the generated path onto the returned artifact so result.artifact.filePath
    // mirrors the service contract; the writer (real) returns the same outputPath.
    createMock.mockResolvedValue(createdExportArtifact({ filePath: outputPath }));

    const inputArgs: CreateMantleExportArtifactInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      pricedBoqArtifactId: PRICED_ID,
      outputPath,
      projectIdLabel: PROJECT_ID_LABEL,
      dealId: DEAL_ID,
      priceList: PRICE_LIST,
      categoryByAcceptedSku: CATEGORY_BY_ACCEPTED_SKU,
    };
    result = await createMantleExportArtifact(inputArgs);

    createCallCount = createMock.mock.calls.length;
    createArg = createMock.mock.calls[0][0];
    getArtifactCallCount = getArtifactMock.mock.calls.length;
    getArtifactCallArgs = getArtifactMock.mock.calls[0];

    // Re-locate and re-read the GENERATED file (never hardcoded row numbers).
    layout = await locateMantlePriceEstimateLayout(result.workbookFilePath);
    worksheet = await openSheet(result.workbookFilePath);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const headerColumn = (header: string): number => {
    const column = layout.columns.find((c) => c.header === header);
    if (!column) throw new Error(`missing column ${header}`);
    return column.columnNumber;
  };
  const dataCell = (rowOffset: number, header: string): ExcelJS.Cell =>
    worksheet.getRow(layout.dataStartRowNumber + rowOffset).getCell(headerColumn(header));
  const footerCell = (label: string): ExcelJS.Cell => {
    const footer = layout.footerRows.find((f) => f.label === label);
    if (!footer) throw new Error(`missing footer ${label}`);
    return worksheet.getRow(footer.rowNumber).getCell(headerColumn("Extended Net Price"));
  };

  // --- Service behavior ------------------------------------------------------

  it("reads exactly one priced_boq artifact and creates exactly one export_package version", () => {
    expect(getArtifactCallCount).toBe(1);
    expect(getArtifactCallArgs).toEqual([TENANT, PROJECT, PRICED_ID]);
    expect(createCallCount).toBe(1);
  });

  it("creates an export_package at export_approval needs_review sourced from the priced_boq artifact", () => {
    expect(createArg).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "export_approval",
      type: "export_package",
      status: "needs_review",
    });
    expect(createArg.sourceArtifactIds).toEqual([PRICED_ID]);
    expect(createArg.sourceFileIds).toEqual([FILE_ID]);
  });

  it("sets the artifact filePath and payload.workbookFilePath to the generated workbook path on disk", async () => {
    expect(createArg.filePath).toBe(result.workbookFilePath);
    expect(result.payload.workbookFilePath).toBe(createArg.filePath);
    expect(result.payload.workbookFilePath).toBe(result.artifact.filePath);
    const stats = await stat(result.workbookFilePath);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });

  it("preserves priced/config/normalized/sku provenance and rowCount in the payload", () => {
    expect(result.payload.sourcePricedBoqArtifactId).toBe(PRICED_ID);
    expect(result.payload.sourcePricedBoqArtifactVersion).toBe(PRICED_VERSION);
    expect(result.payload.sourceConfigurationExpansionArtifactId).toBe(EXPANSION_ID);
    expect(result.payload.sourceConfigurationExpansionArtifactVersion).toBe(EXPANSION_VERSION);
    expect(result.payload.sourceNormalizedBoqArtifactId).toBe(NORMALIZED_ID);
    expect(result.payload.sourceNormalizedBoqArtifactVersion).toBe(NORMALIZED_VERSION);
    expect(result.payload.sourceSkuResolutionArtifactId).toBe(SKU_ID);
    expect(result.payload.sourceSkuResolutionArtifactVersion).toBe(SKU_VERSION);
    expect(result.model.rows).toHaveLength(4);
    expect(result.payload.rowCount).toBe(result.model.rows.length);
  });

  // --- Real workbook behavior ------------------------------------------------

  it("locates the Price Estimate sheet and Mantle headers in the generated workbook", () => {
    expect(layout.sheetName).toBe(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
    expect(layout.columns.map((c) => c.header)).toEqual([...MANTLE_PRICE_ESTIMATE_HEADERS]);
  });

  it("preserves the accepted priced expanded BoM row order", () => {
    expect([
      dataCell(0, "Part Number").value,
      dataCell(1, "Part Number").value,
      dataCell(2, "Part Number").value,
      dataCell(3, "Part Number").value,
    ]).toEqual(["PARENT-HW", "CON-SVC", "LIC-SUB", "NO-PRICE"]);
  });

  it("keeps the unpriced NO-PRICE row in place with blank price cells", () => {
    expect(dataCell(3, "Part Number").value).toBe("NO-PRICE");
    for (const header of ["Unit List Price", "Unit Net Price", "Disc(%)", "Extended Net Price"]) {
      const value = dataCell(3, header).value;
      expect(value === null || value === undefined || value === "").toBe(true);
    }
  });

  it("appends the status and warning to the unpriced row description", () => {
    const text = String(dataCell(3, "Description").value);
    expect(text).toContain("Optional spares kit");
    expect(text).toContain(`[status: missing_price; warning: ${UNPRICED_WARNING}]`);
  });

  it("writes the Project ID, Deal ID, and Price List metadata cells when supplied", () => {
    expect(worksheet.getCell(layout.summaryCells.projectId!.valueAddress).value).toBe(
      PROJECT_ID_LABEL
    );
    expect(worksheet.getCell(layout.summaryCells.dealId!.valueAddress).value).toBe(DEAL_ID);
    expect(worksheet.getCell(layout.summaryCells.priceList!.valueAddress).value).toBe(PRICE_LIST);
  });

  it("caches Product/Service/Subscription/Total footer results matching the model totals", () => {
    // The model split follows the explicit category map; the writer caches those
    // totals as footer formula results. Lock both the math and the cache-through.
    expect(result.model.totals.productTotalSar).toBe(160);
    expect(result.model.totals.serviceTotalSar).toBe(135);
    expect(result.model.totals.subscriptionTotalSar).toBe(25);
    expect(result.model.totals.totalPriceSar).toBe(320);
    expect(footerCell("Product Total").result).toBe(result.model.totals.productTotalSar);
    expect(footerCell("Service Total :").result).toBe(result.model.totals.serviceTotalSar);
    expect(footerCell("Subscription Total").result).toBe(result.model.totals.subscriptionTotalSar);
    expect(footerCell("Total Price:").result).toBe(result.model.totals.totalPriceSar);
  });
});

describe("createMantleExportArtifact - real writer failure bubbles", () => {
  beforeEach(() => {
    // Re-establish the approved-artifact lookup so the run reaches the real writer
    // (independent of any prior describe's mock state).
    mockApprovedArtifact();
    createMock.mockReset();
    createMock.mockResolvedValue(createdExportArtifact());
  });

  it("bubbles a blank-output-path writer error before any export_package is created", async () => {
    await expect(
      createMantleExportArtifact({
        tenantId: TENANT,
        projectId: PROJECT,
        pricedBoqArtifactId: PRICED_ID,
        outputPath: "",
        categoryByAcceptedSku: CATEGORY_BY_ACCEPTED_SKU,
      })
    ).rejects.toThrow("Mantle workbook output path is required.");
    expect(createMock).not.toHaveBeenCalled();
  });
});
