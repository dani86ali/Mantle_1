import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact, ProjectMode } from "@/types/project";

// Mock the three composed boundaries plus node:fs/promises: the project store (verify
// the Project), the deterministic Mantle export-artifact service (load + map + write +
// persist), the committed demo category/row-order fixture getters (the only such
// sources), and rm (so the best-effort cleanup on a delegate failure can be asserted). No
// real DB and no real workbook write here; the shared core is exercised in isolation.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/projects/mantle-export-artifact", () => ({
  createMantleExportArtifact: vi.fn(),
}));
vi.mock("@/lib/projects/honeywell-demo-pricing-fixture", () => ({
  getHoneywellDemoMantleCategoryByAcceptedSku: vi.fn(),
  getHoneywellDemoMantleRowOrderSkuSequence: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ rm: vi.fn() }));

import * as coreModule from "@/lib/projects/project-boq-export-core";
import {
  createProjectBoqExportPackageCore,
  type CreateProjectBoqExportPackageCoreInput,
  type CreateProjectBoqExportPackageResult,
} from "@/lib/projects/project-boq-export-core";
import { getProjectById } from "@/lib/db/project-store";
import {
  createMantleExportArtifact,
  type CreateMantleExportArtifactResult,
  type MantleExportArtifactPayload,
} from "@/lib/projects/mantle-export-artifact";
import {
  getHoneywellDemoMantleCategoryByAcceptedSku,
  getHoneywellDemoMantleRowOrderSkuSequence,
} from "@/lib/projects/honeywell-demo-pricing-fixture";
import { rm } from "node:fs/promises";

const getProjectMock = vi.mocked(getProjectById);
const createMock = vi.mocked(createMantleExportArtifact);
const getCategoryMock = vi.mocked(getHoneywellDemoMantleCategoryByAcceptedSku);
const getRowOrderMock = vi.mocked(getHoneywellDemoMantleRowOrderSkuSequence);
const rmMock = vi.mocked(rm);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const PRICED_ID = "art-pb-7";
const PRICED_VERSION = 4;
const EXPANSION_ID = "art-ce-7";
const EXPANSION_VERSION = 3;
const NORM_ID = "art-nb-7";
const NORM_VERSION = 5;
const SKU_ID = "art-skur-3";
const SKU_VERSION = 2;
const FILE_ID = "file-1";
const CREATED_ID = "art-ep-1";
const WRITTEN_PATH = "C:/Pre-Sales/out/written-mantle.xlsx";

// A distinctive, lane-neutral filename prefix proves the core honors WHATEVER prefix the
// lane config pins (never a hardcoded quick/rfp string).
const CORE_PREFIX = "bomatic-core-export";

const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const CREATED_CREATED = new Date("2026-05-21T10:00:00.000Z");
const CREATED_UPDATED = new Date("2026-05-21T10:30:00.000Z");

// Secrets planted on the delegate result. The lean summaries drop the created artifact
// payload, the category map, and the workbook label metadata, so none of these may leak.
const SECRET_CATEGORY_SKU = "LEAKED-CATEGORY-SKU";
const SECRET_LABEL = "LEAKED-LABEL-VALUE";
const SECRET_ARTIFACT_PAYLOAD = "LEAKED-ARTIFACT-PAYLOAD";

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

const WARNINGS = ["demo-export-warning-1"];

// Mirror of the core CATEGORY_SOURCE boundary block carried on every payload summary.
const CATEGORY_SOURCE_SUMMARY = {
  source: "honeywell_mvp_demo_mantle_category_fixture",
  scope: "honeywell_mvp_demo_only",
  demoFixtureAuthority: true,
  productionPricingAuthority: false,
  configurationAuthority: false,
  runtimeAi: false,
  runtimeCatalogLookup: false,
  replacementAuthority: false,
  silentSkuSubstitution: false,
};

/** A fresh demo category map (the getter returns a fresh deep copy in production). */
function makeCategoryMap(): Record<string, "product" | "service" | "subscription"> {
  return { "ACC-1": "service", "PARENT-A": "product" };
}

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

function makeCreatedArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: CREATED_ID,
    projectId: PROJECT,
    stageId: "export_approval",
    type: "export_package",
    status: "needs_review",
    version: 1,
    payload: { secret: SECRET_ARTIFACT_PAYLOAD },
    filePath: WRITTEN_PATH,
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [PRICED_ID],
    createdAt: CREATED_CREATED,
    updatedAt: CREATED_UPDATED,
    ...overrides,
  };
}

function makePricedArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: PRICED_ID,
    projectId: PROJECT,
    stageId: "boq_pricing_review",
    type: "priced_boq",
    status: "approved",
    version: PRICED_VERSION,
    payload: {},
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [EXPANSION_ID],
    createdAt: CREATED_CREATED,
    updatedAt: CREATED_UPDATED,
    ...overrides,
  };
}

/** The export payload the delegate persists; label/category secrets must not leak. */
function makeExportPayload(
  overrides: Partial<MantleExportArtifactPayload> = {}
): MantleExportArtifactPayload {
  return {
    exportType: "mantle_price_estimate_workbook",
    sourcePricedBoqArtifactId: PRICED_ID,
    sourcePricedBoqArtifactVersion: PRICED_VERSION,
    sourceConfigurationExpansionArtifactId: EXPANSION_ID,
    sourceConfigurationExpansionArtifactVersion: EXPANSION_VERSION,
    sourceNormalizedBoqArtifactId: NORM_ID,
    sourceNormalizedBoqArtifactVersion: NORM_VERSION,
    sourceSkuResolutionArtifactId: SKU_ID,
    sourceSkuResolutionArtifactVersion: SKU_VERSION,
    sourceFileIds: [FILE_ID],
    workbookFilePath: WRITTEN_PATH,
    projectIdLabel: SECRET_LABEL,
    dealId: SECRET_LABEL,
    priceList: SECRET_LABEL,
    categoryByAcceptedSku: { [SECRET_CATEGORY_SKU]: "service" },
    rowCount: 3,
    totals: { ...TOTALS },
    warnings: [...WARNINGS],
    ...overrides,
  };
}

function makeDelegateResult(
  overrides: Partial<CreateMantleExportArtifactResult> = {}
): CreateMantleExportArtifactResult {
  return {
    artifact: makeCreatedArtifact(),
    pricedBoqArtifact: makePricedArtifact(),
    payload: makeExportPayload(),
    // The core never reads the model; a minimal valid shape keeps the type honest.
    model: { rows: [], totals: { ...TOTALS }, warnings: [...WARNINGS] },
    workbookFilePath: WRITTEN_PATH,
    ...overrides,
  };
}

function input(
  overrides: Partial<CreateProjectBoqExportPackageCoreInput> = {}
): CreateProjectBoqExportPackageCoreInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    pricedBoqArtifactId: PRICED_ID,
    expectedMode: "quick_bom",
    fileNamePrefix: CORE_PREFIX,
    ...overrides,
  };
}

let categoryMap: Record<string, "product" | "service" | "subscription">;
let rowOrderSequence: string[];

beforeEach(() => {
  vi.clearAllMocks();
  categoryMap = makeCategoryMap();
  rowOrderSequence = ["PARENT-A", "ACC-1"];
  getProjectMock.mockResolvedValue(makeProject());
  getCategoryMock.mockReturnValue(categoryMap);
  getRowOrderMock.mockReturnValue(rowOrderSequence);
  createMock.mockResolvedValue(makeDelegateResult());
  rmMock.mockResolvedValue(undefined);
});

describe("createProjectBoqExportPackageCore - project verification", () => {
  it("returns not_found and never loads the fixture or exports when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await createProjectBoqExportPackageCore(input());

    expect(result).toEqual({ status: "not_found" });
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(getCategoryMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(rmMock).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and does not export for a mode mismatch", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "rfp", name: "RFP Bid", customerName: "Acme" })
    );

    const result = await createProjectBoqExportPackageCore(input());

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
    expect(getCategoryMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "rfp", customerName: undefined }));

    const result = await createProjectBoqExportPackageCore(input());

    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });
});

describe("createProjectBoqExportPackageCore - expectedMode gate is parameterized", () => {
  it("proceeds to export when the project mode equals the caller-supplied expectedMode (rfp)", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "rfp" }));

    const result = await createProjectBoqExportPackageCore(
      input({ expectedMode: "rfp" as ProjectMode })
    );

    expect(result.status).toBe("ok");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("returns wrong_mode when the project mode differs from the caller-supplied expectedMode", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await createProjectBoqExportPackageCore(
      input({ expectedMode: "rfp" as ProjectMode })
    );

    expect(result.status).toBe("wrong_mode");
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createProjectBoqExportPackageCore - server-side output path", () => {
  it("generates an .xlsx path under the OS temp dir and never accepts a caller output path", async () => {
    const sneaky = {
      ...input(),
      outputPath: "C:/attacker/evil.xlsx",
      filePath: "C:/attacker/also-evil.xlsx",
    } as unknown as CreateProjectBoqExportPackageCoreInput;

    await createProjectBoqExportPackageCore(sneaky);

    const arg = createMock.mock.calls[0][0];
    expect(typeof arg.outputPath).toBe("string");
    expect(arg.outputPath.startsWith(tmpdir())).toBe(true);
    expect(arg.outputPath.endsWith(".xlsx")).toBe(true);
    expect(arg.outputPath).toContain(`${CORE_PREFIX}-`);
    // The caller-supplied paths are ignored entirely.
    expect(arg.outputPath).not.toBe("C:/attacker/evil.xlsx");
    expect(arg.outputPath).not.toBe("C:/attacker/also-evil.xlsx");
    expect("filePath" in arg).toBe(false);
  });

  it("labels the generated workbook with the caller-supplied fileNamePrefix (no hardcoded lane prefix)", async () => {
    await createProjectBoqExportPackageCore(input({ fileNamePrefix: "bomatic-some-lane-export" }));

    const arg = createMock.mock.calls[0][0];
    const basename = arg.outputPath.split(/[\\/]/).pop() ?? "";
    expect(basename.startsWith("bomatic-some-lane-export-")).toBe(true);
    expect(basename).not.toContain("bomatic-core-export");
  });

  it("sanitizes unsafe characters in the lane filename prefix", async () => {
    await createProjectBoqExportPackageCore(input({ fileNamePrefix: "../bomatic/rfp:export" }));

    const arg = createMock.mock.calls[0][0];
    const basename = arg.outputPath.split(/[\\/]/).pop() ?? "";
    expect(basename).toMatch(/^\.\._bomatic_rfp_export-proj-1-art-pb-7-[0-9a-fA-F-]+\.xlsx$/);
    expect(basename).not.toContain("/");
    expect(basename).not.toContain("\\");
    expect(basename).not.toContain(":");
  });

  it("sanitizes unsafe characters in the project/priced-boq path segments", async () => {
    await createProjectBoqExportPackageCore(
      input({ projectId: "proj/../x", pricedBoqArtifactId: "art:pb*7" })
    );

    const arg = createMock.mock.calls[0][0];
    const basename = arg.outputPath.split(/[\\/]/).pop() ?? "";
    expect(basename).toMatch(
      /^bomatic-core-export-proj_\.\._x-art_pb_7-[0-9a-fA-F-]+\.xlsx$/
    );
  });

  it("generates a unique path per call (randomUUID)", async () => {
    await createProjectBoqExportPackageCore(input());
    await createProjectBoqExportPackageCore(input());

    expect(createMock.mock.calls[0][0].outputPath).not.toBe(
      createMock.mock.calls[1][0].outputPath
    );
  });
});

describe("createProjectBoqExportPackageCore - category fixture authority + delegation", () => {
  it("uses the demo category fixture map as the only categoryByAcceptedSku and ignores caller maps", async () => {
    const sneaky = {
      ...input(),
      categoryByAcceptedSku: { HACK: "subscription" },
    } as unknown as CreateProjectBoqExportPackageCoreInput;

    await createProjectBoqExportPackageCore(sneaky);

    expect(getCategoryMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.categoryByAcceptedSku).toBe(categoryMap);
  });

  it("delegates with tenant/project/priced-boq ids, the generated path, and the demo category map only", async () => {
    await createProjectBoqExportPackageCore(input());

    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.pricedBoqArtifactId).toBe(PRICED_ID);
    expect(arg.categoryByAcceptedSku).toBe(categoryMap);
    expect(arg.rowOrderSkuSequence).toBe(rowOrderSequence);
    expect(arg.outputPath.endsWith(".xlsx")).toBe(true);
    // Exactly the six server-derived authority fields; no caller body fields and no lane
    // config (expectedMode/fileNamePrefix are consumed by the core, never delegated).
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

  it("passes the committed demo row-order sequence (fresh copy) as the only export ordering source", async () => {
    await createProjectBoqExportPackageCore(input());

    expect(getRowOrderMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].rowOrderSkuSequence).toBe(rowOrderSequence);
  });

  it("verifies the project before generating a path or loading the category fixture", async () => {
    await createProjectBoqExportPackageCore(input());

    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      getCategoryMock.mock.invocationCallOrder[0]
    );
    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      createMock.mock.invocationCallOrder[0]
    );
  });
});

describe("createProjectBoqExportPackageCore - known delegate error translation", () => {
  const CASES: Array<[string, CreateProjectBoqExportPackageResult]> = [
    ["Priced BoQ artifact not found.", { status: "priced_boq_not_found" }],
    ["Artifact is not a priced_boq artifact.", { status: "artifact_not_priced_boq" }],
    ["Priced BoQ artifact must be approved before export.", { status: "priced_boq_not_approved" }],
    ["Priced BoQ artifact payload is invalid.", { status: "invalid_priced_boq_payload" }],
    ["Mantle workbook requires at least one row.", { status: "invalid_priced_boq_payload" }],
    ["Mantle workbook output path is required.", { status: "export_workbook_failed" }],
  ];

  it.each(CASES)("maps %s to the safe status", async (message, expected) => {
    createMock.mockRejectedValue(new Error(message));

    const result = await createProjectBoqExportPackageCore(input());

    expect(result).toEqual(expected);
  });
});

describe("createProjectBoqExportPackageCore - best-effort cleanup", () => {
  it("removes the generated output path best-effort and preserves the translated status on a known error", async () => {
    createMock.mockRejectedValue(new Error("Priced BoQ artifact not found."));

    const result = await createProjectBoqExportPackageCore(input());

    expect(result).toEqual({ status: "priced_boq_not_found" });
    const generatedPath = createMock.mock.calls[0][0].outputPath;
    expect(rmMock).toHaveBeenCalledTimes(1);
    expect(rmMock).toHaveBeenCalledWith(generatedPath, { force: true });
  });

  it("preserves the translated status even when cleanup (rm) itself fails", async () => {
    createMock.mockRejectedValue(new Error("Priced BoQ artifact not found."));
    rmMock.mockRejectedValue(new Error("rm boom"));

    const result = await createProjectBoqExportPackageCore(input());

    expect(result).toEqual({ status: "priced_boq_not_found" });
  });

  it("re-throws the original delegate error when cleanup fails, never surfacing the rm error", async () => {
    const boom = new Error("boom-internal-stack-detail");
    createMock.mockRejectedValue(boom);
    rmMock.mockRejectedValue(new Error("rm boom"));

    await expect(createProjectBoqExportPackageCore(input())).rejects.toBe(boom);
  });

  it("does not remove the workbook on success", async () => {
    await createProjectBoqExportPackageCore(input());

    expect(rmMock).not.toHaveBeenCalled();
  });
});

describe("createProjectBoqExportPackageCore - unexpected errors", () => {
  it("re-throws an unexpected delegate error unchanged", async () => {
    const boom = new Error("boom-internal-stack-detail");
    createMock.mockRejectedValue(boom);

    await expect(createProjectBoqExportPackageCore(input())).rejects.toBe(boom);
  });

  it("re-throws a non-Error rejection", async () => {
    createMock.mockRejectedValue("plain string failure");

    await expect(createProjectBoqExportPackageCore(input())).rejects.toBe("plain string failure");
  });
});

describe("createProjectBoqExportPackageCore - ok summaries", () => {
  it("returns a serializable created-artifact summary with ISO dates and no payload/filePath", async () => {
    const result = await createProjectBoqExportPackageCore(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: CREATED_ID,
      projectId: PROJECT,
      stageId: "export_approval",
      type: "export_package",
      status: "needs_review",
      version: 1,
      sourceFileIds: [FILE_ID],
      sourceArtifactIds: [PRICED_ID],
      createdAt: CREATED_CREATED.toISOString(),
      updatedAt: CREATED_UPDATED.toISOString(),
    });
    expect("payload" in result.artifact).toBe(false);
    expect("filePath" in result.artifact).toBe(false);
  });

  it("returns a lean payloadSummary with provenance, workbook path, totals/warnings, and the category source", async () => {
    const result = await createProjectBoqExportPackageCore(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary).toEqual({
      exportType: "mantle_price_estimate_workbook",
      sourcePricedBoqArtifactId: PRICED_ID,
      sourcePricedBoqArtifactVersion: PRICED_VERSION,
      sourceConfigurationExpansionArtifactId: EXPANSION_ID,
      sourceConfigurationExpansionArtifactVersion: EXPANSION_VERSION,
      sourceNormalizedBoqArtifactId: NORM_ID,
      sourceNormalizedBoqArtifactVersion: NORM_VERSION,
      sourceSkuResolutionArtifactId: SKU_ID,
      sourceSkuResolutionArtifactVersion: SKU_VERSION,
      sourceFileIds: [FILE_ID],
      workbookFilePath: WRITTEN_PATH,
      rowCount: 3,
      totals: TOTALS,
      warnings: WARNINGS,
      categorySource: CATEGORY_SOURCE_SUMMARY,
    });
    for (const key of [
      "categoryByAcceptedSku",
      "projectIdLabel",
      "dealId",
      "priceList",
      "lines",
      "amounts",
      "unitListPriceSarBySku",
      "acceptedLines",
      "rejectedLines",
      "originalCells",
      "evidence",
      "payload",
    ]) {
      expect(key in result.payloadSummary).toBe(false);
    }
  });

  it("returns an exportSummary with rowCount/totals/warnings/workbookFilePath", async () => {
    const result = await createProjectBoqExportPackageCore(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.exportSummary).toEqual({
      rowCount: 3,
      totals: TOTALS,
      warnings: WARNINGS,
      workbookFilePath: WRITTEN_PATH,
    });
  });

  it("marks the category source as demo-only authority, never pricing/config/production/AI/catalog/replacement", async () => {
    const result = await createProjectBoqExportPackageCore(input());

    if (result.status !== "ok") throw new Error("unreachable");
    const src = result.payloadSummary.categorySource;
    expect(src.source).toBe("honeywell_mvp_demo_mantle_category_fixture");
    expect(src.scope).toBe("honeywell_mvp_demo_only");
    expect(src.demoFixtureAuthority).toBe(true);
    expect(src.productionPricingAuthority).toBe(false);
    expect(src.configurationAuthority).toBe(false);
    expect(src.runtimeAi).toBe(false);
    expect(src.runtimeCatalogLookup).toBe(false);
    expect(src.replacementAuthority).toBe(false);
    expect(src.silentSkuSubstitution).toBe(false);
  });

  it("never leaks the category map, label metadata, or the created artifact payload into the response", async () => {
    const result = await createProjectBoqExportPackageCore(input());

    const json = JSON.stringify(result);
    expect(json).not.toContain(SECRET_CATEGORY_SKU);
    expect(json).not.toContain(SECRET_LABEL);
    expect(json).not.toContain(SECRET_ARTIFACT_PAYLOAD);
  });
});

describe("createProjectBoqExportPackageCore - immutability and copies", () => {
  it("does not mutate the input object", async () => {
    const inp = input();
    const snapshot = structuredClone(inp);

    await createProjectBoqExportPackageCore(inp);

    expect(inp).toEqual(snapshot);
  });

  it("does not mutate the Project", async () => {
    const project = makeProject();
    const snapshot = structuredClone(project);
    getProjectMock.mockResolvedValue(project);

    await createProjectBoqExportPackageCore(input());

    expect(project).toEqual(snapshot);
  });

  it("does not mutate the demo category fixture map", async () => {
    const snapshot = structuredClone(categoryMap);

    await createProjectBoqExportPackageCore(input());

    expect(categoryMap).toEqual(snapshot);
  });

  it("copies payload arrays/objects so the response cannot corrupt the delegate result", async () => {
    const delegateResult = makeDelegateResult();
    createMock.mockResolvedValue(delegateResult);

    const result = await createProjectBoqExportPackageCore(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary.sourceFileIds).not.toBe(delegateResult.payload.sourceFileIds);
    expect(result.payloadSummary.totals).not.toBe(delegateResult.payload.totals);
    expect(result.payloadSummary.warnings).not.toBe(delegateResult.payload.warnings);
    expect(result.exportSummary.totals).not.toBe(delegateResult.payload.totals);
    expect(result.artifact.sourceFileIds).not.toBe(delegateResult.artifact.sourceFileIds);

    result.payloadSummary.sourceFileIds.push("injected");
    result.payloadSummary.totals.totalIncVatSar = 999;
    result.payloadSummary.warnings.push("injected");
    result.exportSummary.totals.totalPriceSar = 999;

    expect(delegateResult.payload.sourceFileIds).toEqual([FILE_ID]);
    expect(delegateResult.payload.totals.totalIncVatSar).toBe(1150);
    expect(delegateResult.payload.totals.totalPriceSar).toBe(1000);
    expect(delegateResult.payload.warnings).toEqual(WARNINGS);
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-boq-export-core.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-boq-export-core.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");
  const importLines = source.split("\n").filter((l) => /^\s*import\b/.test(l));
  const joinedImports = importLines.join("\n");

  it("imports the node builtins, the project store, the mantle export service, the demo fixture, and project types", () => {
    expect(source).toContain('from "node:crypto"');
    expect(source).toContain('from "node:fs/promises"');
    expect(source).toContain('from "node:os"');
    expect(source).toContain('from "node:path"');
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/projects/mantle-export-artifact"');
    expect(source).toContain('from "@/lib/projects/honeywell-demo-pricing-fixture"');
    expect(source).toContain('from "@/types/project"');
  });

  it("does not import the artifact/approval stores, DB schema/barrel, pricing/catalog/config/priced-boq/mantle-model/writer, runner, AI, engine, coordinator, adapter, or API/UI modules", () => {
    // Inspect import lines only - the docstring legitimately names these domains to
    // declare what the module deliberately omits.
    for (const forbidden of [
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-approval-store",
      "@/lib/db/schema",
      "@/lib/db/index",
      'from "@/lib/db"',
      "priced-boq",
      "@/lib/projects/pricing",
      "config-expansion",
      "@/lib/projects/mantle-price-estimate-model",
      "@/lib/projects/mantle-workbook-writer",
      "quick-bom-runner",
      "rfp-runner",
      "@/lib/export",
      "@/lib/adapters",
      "@/lib/agent",
      "@/lib/ai",
      "@/lib/llm",
      "@/lib/catalog",
      "catalog",
      "@/coordinator",
      "@/engines",
      "@/app",
      "@/components",
      "anthropic",
      "openai",
      "@google/generative-ai",
      "drizzle",
    ]) {
      expect(joinedImports).not.toContain(forbidden);
    }
  });

  it("does no byte-streaming/download or artifact/approval writes (forbidden runtime behavior)", () => {
    for (const forbidden of [
      "createReadStream",
      "createWriteStream",
      "readFile",
      "writeFile",
      'from "node:fs"',
      "next/server",
      "createProjectArtifactVersion",
      "getProjectArtifactById",
      "createProjectApproval",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("exposes only the shared core service as a runtime export", () => {
    expect(Object.keys(coreModule)).toEqual(["createProjectBoqExportPackageCore"]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
