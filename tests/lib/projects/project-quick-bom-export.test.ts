import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// The Quick BoM export service is now a thin wrapper over the shared, mode-gated Project
// BoQ export-package core. Mock ONLY the core: the wrapper's whole job is to pin
// expectedMode = "quick_bom" and the existing "bomatic-quick-bom-export" filename prefix,
// forward the caller-facing ids unchanged, return the core's result verbatim, and
// re-export the legacy QuickBomExport* / CreateProjectQuickBomExportPackage* public names
// so the Quick BoM export route keeps a stable surface. All deterministic behavior
// (project verification, server-side path generation, fixture delegation, error
// translation, best-effort cleanup, lean summaries) is proven in the core's own test;
// here we prove the wrapper adds nothing, hides nothing, and keeps the public API.
vi.mock("@/lib/projects/project-boq-export-core", () => ({
  createProjectBoqExportPackageCore: vi.fn(),
}));

import * as serviceModule from "@/lib/projects/project-quick-bom-export";
import {
  createProjectQuickBomExportPackage,
  type CreateProjectQuickBomExportPackageInput,
  type CreateProjectQuickBomExportPackageResult,
  type QuickBomExportArtifactSummary,
  type QuickBomExportPayloadSummary,
  type QuickBomExportSummary,
} from "@/lib/projects/project-quick-bom-export";
import { createProjectBoqExportPackageCore } from "@/lib/projects/project-boq-export-core";

const coreMock = vi.mocked(createProjectBoqExportPackageCore);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const PRICED_ID = "art-pb-7";

// Typed against the re-exported legacy aliases: this only compiles if the wrapper still
// exports the QuickBomExport* projection names with the shared shapes.
const ARTIFACT: QuickBomExportArtifactSummary = {
  id: "art-ep-1",
  projectId: PROJECT,
  stageId: "export_approval",
  type: "export_package",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-1"],
  sourceArtifactIds: [PRICED_ID],
  createdAt: "2026-05-21T10:00:00.000Z",
  updatedAt: "2026-05-21T10:30:00.000Z",
};

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

const PAYLOAD_SUMMARY: QuickBomExportPayloadSummary = {
  exportType: "mantle_price_estimate_workbook",
  sourcePricedBoqArtifactId: PRICED_ID,
  sourcePricedBoqArtifactVersion: 4,
  sourceConfigurationExpansionArtifactId: "art-ce-7",
  sourceConfigurationExpansionArtifactVersion: 3,
  sourceNormalizedBoqArtifactId: "art-nb-7",
  sourceNormalizedBoqArtifactVersion: 5,
  sourceSkuResolutionArtifactId: "art-skur-3",
  sourceSkuResolutionArtifactVersion: 2,
  sourceFileIds: ["file-1"],
  workbookFilePath: "C:/Pre-Sales/out/written-mantle.xlsx",
  rowCount: 3,
  totals: TOTALS,
  warnings: ["demo-export-warning-1"],
  categorySource: {
    source: "honeywell_mvp_demo_mantle_category_fixture",
    scope: "honeywell_mvp_demo_only",
    demoFixtureAuthority: true,
    productionPricingAuthority: false,
    configurationAuthority: false,
    runtimeAi: false,
    runtimeCatalogLookup: false,
    replacementAuthority: false,
    silentSkuSubstitution: false,
  },
};

const EXPORT_SUMMARY: QuickBomExportSummary = {
  rowCount: 3,
  totals: TOTALS,
  warnings: ["demo-export-warning-1"],
  workbookFilePath: "C:/Pre-Sales/out/written-mantle.xlsx",
};

const OK_RESULT: CreateProjectQuickBomExportPackageResult = {
  status: "ok",
  artifact: ARTIFACT,
  payloadSummary: PAYLOAD_SUMMARY,
  exportSummary: EXPORT_SUMMARY,
};

function input(
  overrides: Partial<CreateProjectQuickBomExportPackageInput> = {}
): CreateProjectQuickBomExportPackageInput {
  return { tenantId: TENANT, projectId: PROJECT, pricedBoqArtifactId: PRICED_ID, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  coreMock.mockResolvedValue(OK_RESULT);
});

describe("createProjectQuickBomExportPackage - delegation", () => {
  it("calls the shared core exactly once with the caller ids plus expectedMode quick_bom and the Quick prefix", async () => {
    await createProjectQuickBomExportPackage(input());

    expect(coreMock).toHaveBeenCalledTimes(1);
    expect(coreMock).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      pricedBoqArtifactId: PRICED_ID,
      expectedMode: "quick_bom",
      fileNamePrefix: "bomatic-quick-bom-export",
    });
  });

  it("passes ONLY the three caller ids plus the pinned lane config - no other authority", async () => {
    await createProjectQuickBomExportPackage(input());

    const arg = coreMock.mock.calls[0][0];
    expect(Object.keys(arg).sort()).toEqual([
      "expectedMode",
      "fileNamePrefix",
      "pricedBoqArtifactId",
      "projectId",
      "tenantId",
    ]);
    expect(arg.expectedMode).toBe("quick_bom");
    expect(arg.fileNamePrefix).toBe("bomatic-quick-bom-export");
  });

  it("forwards the caller tenant/project/priced-boq ids unchanged", async () => {
    await createProjectQuickBomExportPackage(
      input({ tenantId: "t-2", projectId: "p-2", pricedBoqArtifactId: "art-2" })
    );

    const arg = coreMock.mock.calls[0][0];
    expect(arg.tenantId).toBe("t-2");
    expect(arg.projectId).toBe("p-2");
    expect(arg.pricedBoqArtifactId).toBe("art-2");
  });
});

describe("createProjectQuickBomExportPackage - result pass-through", () => {
  it("returns the core ok result unchanged (same reference)", async () => {
    coreMock.mockResolvedValue(OK_RESULT);

    const result = await createProjectQuickBomExportPackage(input());

    expect(result).toBe(OK_RESULT);
  });

  it("returns the core not_found result unchanged", async () => {
    const notFound: CreateProjectQuickBomExportPackageResult = { status: "not_found" };
    coreMock.mockResolvedValue(notFound);

    const result = await createProjectQuickBomExportPackage(input());

    expect(result).toBe(notFound);
    expect(result).toEqual({ status: "not_found" });
  });

  it("returns the core wrong_mode result (with project summary) unchanged", async () => {
    const wrongMode: CreateProjectQuickBomExportPackageResult = {
      status: "wrong_mode",
      project: {
        id: PROJECT,
        name: "RFP Bid",
        mode: "rfp",
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-02T11:30:00.000Z",
      },
    };
    coreMock.mockResolvedValue(wrongMode);

    const result = await createProjectQuickBomExportPackage(input());

    expect(result).toBe(wrongMode);
  });

  it("returns each core error status unchanged", async () => {
    for (const status of [
      "priced_boq_not_found",
      "artifact_not_priced_boq",
      "priced_boq_not_approved",
      "invalid_priced_boq_payload",
      "export_workbook_failed",
    ] as const) {
      const err: CreateProjectQuickBomExportPackageResult = { status };
      coreMock.mockResolvedValue(err);

      const result = await createProjectQuickBomExportPackage(input());

      expect(result).toEqual({ status });
    }
  });

  it("re-throws whatever the core throws (no swallow, no remap)", async () => {
    const boom = new Error("boom-internal-stack-detail");
    coreMock.mockRejectedValue(boom);

    await expect(createProjectQuickBomExportPackage(input())).rejects.toBe(boom);
  });
});

describe("createProjectQuickBomExportPackage - module purity, public API, and surface (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-quick-bom-export.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-quick-bom-export.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports/re-exports from the shared export core and nothing else", () => {
    const froms = Array.from(new Set(Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1])));
    expect(froms).toEqual(["@/lib/projects/project-boq-export-core"]);
    expect(source).toContain("createProjectBoqExportPackageCore");
    expect(source).toContain('expectedMode: "quick_bom"');
    expect(source).toContain("bomatic-quick-bom-export");
  });

  it("re-exports the legacy QuickBomExport* / CreateProjectQuickBomExportPackage* public type names (stable API)", () => {
    for (const typeName of [
      "QuickBomExportType",
      "QuickBomExportTotals",
      "CreateProjectQuickBomExportPackageInput",
      "QuickBomExportProjectSummary",
      "QuickBomExportArtifactSummary",
      "QuickBomExportCategorySourceSummary",
      "QuickBomExportPayloadSummary",
      "QuickBomExportSummary",
      "CreateProjectQuickBomExportPackageResult",
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
    expect(Object.keys(serviceModule)).toEqual(["createProjectQuickBomExportPackage"]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
