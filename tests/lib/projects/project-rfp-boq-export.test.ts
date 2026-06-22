import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// The RFP BoQ export service is a thin wrapper over the shared, mode-gated Project BoQ
// export-package core. Per the task, the RFP lane must reject quick_bom projects as
// wrong_mode and pass rfp projects THROUGH THE CORE BEHAVIOR, so this test drives the
// REAL core (mocking only the project store, the deterministic Mantle export delegate,
// the combined approved category/export source getters, and rm) rather than mocking the core. That proves
// the wrapper truly pins expectedMode = "rfp" and the "bomatic-rfp-boq-export" filename
// prefix: an rfp project exports, a quick_bom project is rejected before any fixture or
// delegate read, the caller ids are forwarded tenant-scoped, and the lane adds no pricing
// or export authority (the delegate still receives only the combined approved category
// map, row-order sequence, and the six server-derived fields). The full summary / canary / cleanup behavior is proven
// exhaustively in the core's own test.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/projects/mantle-export-artifact", () => ({
  createMantleExportArtifact: vi.fn(),
}));
vi.mock("@/lib/projects/quick-bom-approved-pricing-sources", () => ({
  getQuickBomApprovedMantleCategoryByAcceptedSku: vi.fn(),
  getQuickBomApprovedMantleRowOrderSkuSequence: vi.fn(),
  getQuickBomApprovedCategorySourceSummary: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ rm: vi.fn() }));

import * as serviceModule from "@/lib/projects/project-rfp-boq-export";
import { createProjectRfpBoqExportPackage } from "@/lib/projects/project-rfp-boq-export";
import { getProjectById } from "@/lib/db/project-store";
import {
  createMantleExportArtifact,
  type CreateMantleExportArtifactResult,
  type MantleExportArtifactPayload,
} from "@/lib/projects/mantle-export-artifact";
import {
  getQuickBomApprovedMantleCategoryByAcceptedSku,
  getQuickBomApprovedMantleRowOrderSkuSequence,
  getQuickBomApprovedCategorySourceSummary,
} from "@/lib/projects/quick-bom-approved-pricing-sources";
import { rm } from "node:fs/promises";

const getProjectMock = vi.mocked(getProjectById);
const createMock = vi.mocked(createMantleExportArtifact);
const getCategoryMock = vi.mocked(getQuickBomApprovedMantleCategoryByAcceptedSku);
const getRowOrderMock = vi.mocked(getQuickBomApprovedMantleRowOrderSkuSequence);
const getCategorySourceSummaryMock = vi.mocked(getQuickBomApprovedCategorySourceSummary);
const rmMock = vi.mocked(rm);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const PRICED_ID = "art-rfp-pb-1";
const FILE_ID = "file-1";
const WRITTEN_PATH = "C:/Pre-Sales/out/written-mantle.xlsx";
const TS = new Date("2026-06-01T10:00:00.000Z");

const TOTALS = {
  totalPriceSar: 1000,
  productTotalSar: 600,
  serviceTotalSar: 300,
  subscriptionTotalSar: 100,
  vatAmountSar: 150,
  totalIncVatSar: 1150,
  pricedLineCount: 3,
  unpricedLineCount: 1,
  missingDecisionCount: 0,
  notAcceptedCount: 1,
  missingPriceCount: 0,
};

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "RFP Priced BoQ",
    customerName: "Acme",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeCreatedArtifact(): ProjectArtifact {
  return {
    id: "art-ep-rfp-1",
    projectId: PROJECT,
    stageId: "export_approval",
    type: "export_package",
    status: "needs_review",
    version: 1,
    payload: { secret: "no-leak" },
    filePath: WRITTEN_PATH,
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [PRICED_ID],
    createdAt: TS,
    updatedAt: TS,
  };
}

function makePricedArtifact(): ProjectArtifact {
  return {
    id: PRICED_ID,
    projectId: PROJECT,
    stageId: "boq_pricing_review",
    type: "priced_boq",
    status: "approved",
    version: 4,
    payload: {},
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: ["art-ce-7"],
    createdAt: TS,
    updatedAt: TS,
  };
}

function makeExportPayload(): MantleExportArtifactPayload {
  return {
    exportType: "mantle_price_estimate_workbook",
    sourcePricedBoqArtifactId: PRICED_ID,
    sourcePricedBoqArtifactVersion: 4,
    sourceConfigurationExpansionArtifactId: "art-ce-7",
    sourceConfigurationExpansionArtifactVersion: 3,
    sourceNormalizedBoqArtifactId: "art-nb-7",
    sourceNormalizedBoqArtifactVersion: 5,
    sourceSkuResolutionArtifactId: "art-skur-3",
    sourceSkuResolutionArtifactVersion: 2,
    sourceFileIds: [FILE_ID],
    workbookFilePath: WRITTEN_PATH,
    rowCount: 3,
    totals: { ...TOTALS },
    warnings: ["demo-export-warning-1"],
  };
}

function makeDelegateResult(): CreateMantleExportArtifactResult {
  return {
    artifact: makeCreatedArtifact(),
    pricedBoqArtifact: makePricedArtifact(),
    payload: makeExportPayload(),
    model: { rows: [], totals: { ...TOTALS }, warnings: [] },
    workbookFilePath: WRITTEN_PATH,
  };
}

let categoryMap: Record<string, "product" | "service" | "subscription">;
let rowOrderSequence: string[];

function input() {
  return { tenantId: TENANT, projectId: PROJECT, pricedBoqArtifactId: PRICED_ID };
}

beforeEach(() => {
  vi.clearAllMocks();
  categoryMap = { "ACC-1": "service", "PARENT-A": "product" };
  rowOrderSequence = ["PARENT-A", "ACC-1"];
  getProjectMock.mockResolvedValue(makeProject());
  getCategoryMock.mockReturnValue(categoryMap);
  getRowOrderMock.mockReturnValue(rowOrderSequence);
  getCategorySourceSummaryMock.mockReturnValue({
    source: "quick_bom_approved_mantle_category_sources",
    honeywellDemoFixtureIncluded: true,
    scopedCiscoFixtureIncluded: true,
    demoFixtureAuthority: true,
    scopedCiscoCategoryAuthority: true,
    productionPricingAuthority: false,
    configurationAuthority: false,
    runtimeAi: false,
    runtimeCatalogLookup: false,
    replacementAuthority: false,
    silentSkuSubstitution: false,
  });
  createMock.mockResolvedValue(makeDelegateResult());
  rmMock.mockResolvedValue(undefined);
});

describe("createProjectRfpBoqExportPackage - pins rfp (through core behavior)", () => {
  it("passes the mode gate for an rfp project and delegates the export", async () => {
    const result = await createProjectRfpBoqExportPackage(input());

    expect(result.status).toBe("ok");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a quick_bom project as wrong_mode before any fixture or delegate read", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await createProjectRfpBoqExportPackage(input());

    expect(result.status).toBe("wrong_mode");
    expect(getCategoryMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("labels the generated workbook with the RFP prefix under the OS temp dir", async () => {
    await createProjectRfpBoqExportPackage(input());

    const arg = createMock.mock.calls[0][0];
    expect(arg.outputPath.startsWith(tmpdir())).toBe(true);
    expect(arg.outputPath.endsWith(".xlsx")).toBe(true);
    const basename = arg.outputPath.split(/[\\/]/).pop() ?? "";
    expect(basename.startsWith("bomatic-rfp-boq-export-")).toBe(true);
    // Never the Quick lane's prefix.
    expect(basename).not.toContain("bomatic-quick-bom-export");
  });

  it("forwards the caller ids tenant-scoped into the project read and the delegate", async () => {
    await createProjectRfpBoqExportPackage(input());

    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
    const arg = createMock.mock.calls[0][0];
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.pricedBoqArtifactId).toBe(PRICED_ID);
  });

  it("adds no pricing/export authority: the delegate gets only the combined approved category sources and the six server-derived fields", async () => {
    await createProjectRfpBoqExportPackage(input());

    const arg = createMock.mock.calls[0][0];
    expect(arg.categoryByAcceptedSku).toBe(categoryMap);
    expect(arg.rowOrderSkuSequence).toBe(rowOrderSequence);
    expect(Object.keys(arg).sort()).toEqual(
      [
        "categoryByAcceptedSku",
        "outputPath",
        "pricedBoqArtifactId",
        "projectId",
        "rowOrderSkuSequence",
        "tenantId",
      ].sort()
    );
  });

  it("surfaces the core's exact priced_boq status names unchanged", async () => {
    createMock.mockRejectedValue(new Error("Priced BoQ artifact must be approved before export."));

    const result = await createProjectRfpBoqExportPackage(input());

    expect(result.status).toBe("priced_boq_not_approved");
  });

  it("returns not_found when the project is absent (no delegate)", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await createProjectRfpBoqExportPackage(input());

    expect(result.status).toBe("not_found");
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createProjectRfpBoqExportPackage - module purity and surface (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-boq-export.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-boq-export.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports/re-exports from the shared export core and nothing else", () => {
    const froms = Array.from(new Set(Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1])));
    expect(froms).toEqual(["@/lib/projects/project-boq-export-core"]);
    expect(source).toContain("createProjectBoqExportPackageCore");
    expect(source).toContain('expectedMode: "rfp"');
    expect(source).toContain("bomatic-rfp-boq-export");
  });

  it("re-exports the RFP-specific public type aliases over the shared shapes", () => {
    for (const typeName of [
      "RfpBoqExportType",
      "RfpBoqExportTotals",
      "CreateProjectRfpBoqExportPackageInput",
      "RfpBoqExportProjectSummary",
      "RfpBoqExportArtifactSummary",
      "RfpBoqExportCategorySourceSummary",
      "RfpBoqExportPayloadSummary",
      "RfpBoqExportSummary",
      "CreateProjectRfpBoqExportPackageResult",
    ]) {
      expect(source).toContain(`export type ${typeName}`);
    }
  });

  it("does not import the stores, the mantle export service/helpers, the fixture, the runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "@/types/project"',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/mantle-export-artifact"',
      'from "@/lib/projects/honeywell',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/rfp-runner"',
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
      'from "node:fs',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("exposes only the wrapper service as a runtime export", () => {
    expect(Object.keys(serviceModule)).toEqual(["createProjectRfpBoqExportPackage"]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
