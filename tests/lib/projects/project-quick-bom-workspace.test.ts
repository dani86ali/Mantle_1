import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectPricingConfig,
  ProjectStage,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";

// Mock the three Project stores; the readiness helper stays REAL (it is pure),
// so the workspace.readiness assertion is a true integration check.
const { mockGetProjectById, mockListArtifacts, mockListApprovals } = vi.hoisted(
  () => ({
    mockGetProjectById: vi.fn(),
    mockListArtifacts: vi.fn(),
    mockListApprovals: vi.fn(),
  })
);

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  listProjectArtifacts: mockListArtifacts,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  listProjectApprovals: mockListApprovals,
}));

import {
  loadProjectQuickBomWorkspace,
  type ProjectQuickBomWorkspace,
  type ProjectQuickBomWorkspaceResult,
} from "@/lib/projects/project-quick-bom-workspace";
import { getQuickBomReadinessReport } from "@/lib/projects/quick-bom-readiness";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const PAYLOAD_SENTINEL = "payload-only-do-not-leak";

const PRICING: ProjectPricingConfig = {
  currency: "SAR",
  mode: "margin",
  ratePercent: 30,
  vatRatePercent: 15,
  roundingDecimals: 2,
};

const STAGE_BY_TYPE: Partial<Record<ProjectArtifactType, ProjectStageId>> = {
  input_package: "intake_package_review",
  normalized_boq: "boq_format_validation",
  sku_resolution: "sku_resolution",
  configuration_expansion: "configuration_expansion_review",
  priced_boq: "boq_pricing_review",
  export_package: "export_approval",
};

const VALID_CONFIG_AUTHORITY = {
  scope: "honeywell_mvp_demo_only",
  approvalRecordId: "appr-cfg-1",
  rulePackId: "rp-honeywell-v1",
  rulePackVersion: "1.0.0",
  rulePackStatus: "approved",
  rulePackSourceScope: "honeywell_mvp_demo_only",
  dispositionSummary: {
    expandByApprovedRulePackCount: 12,
    preserveKnownRulePackChildCount: 3,
    preserveStandaloneCustomerLineCount: 5,
    deferUnknownRelationshipCount: 0,
  },
  runtimeAi: false,
  replacementAuthority: false,
  skuSubstitutionAuthority: false,
  unknownRelationshipsDeferred: true,
  attachesOpticsUnderSwitches: false,
};

const VALID_PRICING_AUTHORITY = {
  profileId: "honeywell-mvp-demo-pricing-authority-profile",
  scope: "honeywell_mvp_demo_only",
  approvalRecordId: "appr-pricing-1",
  activeSource: "committed_honeywell_demo_pricing_fixture",
  activeSourceFixtureId: "honeywell-mvp-demo-pricing-fixture",
  activeSourceStatus: "approved_demo_fixture",
  activeSourceWorkbookPath: "C:/Pre-Sales/Benchmarck_Files/Estimate_NB167337237YA.xlsx",
  activeSourceSheetName: "EstimateDetails_NB167337237YA",
  currency: "SAR",
  pricedSkuCount: 120,
  missingPriceSkuCount: 3,
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

function makeStage(
  stageId: ProjectStageId,
  order: number,
  status: ProjectStageStatus = "not_started"
): ProjectStage {
  return {
    id: `stage-${stageId}`,
    projectId: PROJECT,
    stageId,
    order,
    status,
    createdAt: TS1,
    updatedAt: TS2,
  };
}

function makeArtifact(
  type: ProjectArtifactType,
  version: number,
  status: ProjectArtifactStatus,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: `${type}-v${version}`,
    projectId: PROJECT,
    stageId: STAGE_BY_TYPE[type] ?? "boq_pricing_review",
    type,
    status,
    version,
    payload: { secret: PAYLOAD_SENTINEL },
    sourceFileIds: ["file-1"],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeApproval(overrides: Partial<ProjectApproval> = {}): ProjectApproval {
  return {
    id: "appr-1",
    projectId: PROJECT,
    stageId: "sku_resolution",
    artifactId: "sku_resolution-v1",
    artifactVersion: 1,
    decision: "approved",
    decidedBy: "engineer-1",
    decidedAt: TS2,
    note: "looks good",
    ...overrides,
  };
}

function expectOk(
  result: ProjectQuickBomWorkspaceResult
): ProjectQuickBomWorkspace {
  if (result.status !== "ok") {
    throw new Error(`expected ok workspace, got ${result.status}`);
  }
  return result.workspace;
}

beforeEach(() => {
  mockGetProjectById.mockReset();
  mockListArtifacts.mockReset().mockResolvedValue([]);
  mockListApprovals.mockReset().mockResolvedValue([]);
});

describe("loadProjectQuickBomWorkspace - discriminated result", () => {
  it("returns not_found and loads no artifacts/approvals when the project is null", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await loadProjectQuickBomWorkspace(TENANT, "missing");

    expect(result).toEqual({ status: "not_found" });
    expect(mockListArtifacts).not.toHaveBeenCalled();
    expect(mockListApprovals).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a project summary (tenantId + copied pricingConfig) for an rfp project, without loading artifacts/approvals", async () => {
    const source = makeProject({
      mode: "rfp",
      customerName: "Marafiq",
      name: "RFP Bid",
      pricingConfig: { ...PRICING },
    });
    mockGetProjectById.mockResolvedValue(source);

    const result = await loadProjectQuickBomWorkspace(TENANT, PROJECT);

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      tenantId: TENANT,
      name: "RFP Bid",
      customerName: "Marafiq",
      mode: "rfp",
      pricingConfig: PRICING,
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect(result.project.pricingConfig).not.toBe(source.pricingConfig);
    expect(mockListArtifacts).not.toHaveBeenCalled();
    expect(mockListApprovals).not.toHaveBeenCalled();
  });
});

describe("loadProjectQuickBomWorkspace - ok workspace", () => {
  const STAGES = [
    makeStage("boq_format_validation", 10),
    makeStage("sku_resolution", 20, "approved"),
  ];
  // sku_resolution v2 is listed BEFORE v1 to prove latest-by-version, not order.
  const ARTIFACTS = [
    makeArtifact("input_package", 1, "approved"),
    makeArtifact("normalized_boq", 1, "generated", {
      filePath: "out/normalized.json",
    }),
    makeArtifact("sku_resolution", 2, "needs_review"),
    makeArtifact("sku_resolution", 1, "approved"),
    makeArtifact("configuration_expansion", 1, "approved"),
  ];
  const APPROVALS = [makeApproval()];

  beforeEach(() => {
    mockGetProjectById.mockResolvedValue(makeProject({ stages: STAGES }));
    mockListArtifacts.mockResolvedValue(ARTIFACTS);
    mockListApprovals.mockResolvedValue(APPROVALS);
  });

  it("includes the project summary with tenantId and ISO dates, omitting pricingConfig when absent", async () => {
    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    expect(ws.project).toEqual({
      id: PROJECT,
      tenantId: TENANT,
      name: "Honeywell Quick BoM",
      customerName: "Honeywell",
      mode: "quick_bom",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("pricingConfig" in ws.project).toBe(false);
  });

  it("includes a copied pricingConfig on the project summary when present", async () => {
    const source = makeProject({ stages: STAGES, pricingConfig: { ...PRICING } });
    mockGetProjectById.mockResolvedValue(source);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));

    expect(ws.project.pricingConfig).toEqual(PRICING);
    expect(ws.project.pricingConfig).not.toBe(source.pricingConfig);
  });

  it("includes stage summaries with ISO dates", async () => {
    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    expect(ws.stages).toHaveLength(2);
    expect(ws.stages[0]).toEqual({
      id: "stage-boq_format_validation",
      stageId: "boq_format_validation",
      order: 10,
      status: "not_started",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect(ws.stages[1].stageId).toBe("sku_resolution");
    expect(ws.stages[1].status).toBe("approved");
  });

  it("includes artifact summaries with ISO dates and filePath only when present", async () => {
    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    expect(ws.artifacts).toHaveLength(ARTIFACTS.length);

    const input = ws.artifacts.find((a) => a.type === "input_package")!;
    expect(input).toEqual({
      id: "input_package-v1",
      stageId: "intake_package_review",
      type: "input_package",
      status: "approved",
      version: 1,
      sourceFileIds: ["file-1"],
      sourceArtifactIds: [],
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("filePath" in input).toBe(false);

    const normalized = ws.artifacts.find((a) => a.type === "normalized_boq")!;
    expect(normalized.filePath).toBe("out/normalized.json");
  });

  it("includes approval summaries with ISO dates", async () => {
    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    expect(ws.approvals).toEqual([
      {
        id: "appr-1",
        stageId: "sku_resolution",
        artifactId: "sku_resolution-v1",
        artifactVersion: 1,
        decision: "approved",
        decidedBy: "engineer-1",
        decidedAt: TS2.toISOString(),
        note: "looks good",
      },
    ]);
  });

  it("selects latest Quick BoM spine artifacts by highest version, not array order", async () => {
    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    expect(ws.spineArtifacts.normalized_boq?.version).toBe(1);
    // v2 wins even though v1 (approved) comes later in the array.
    expect(ws.spineArtifacts.sku_resolution?.version).toBe(2);
    expect(ws.spineArtifacts.sku_resolution?.status).toBe("needs_review");
    expect(ws.spineArtifacts.configuration_expansion?.version).toBe(1);
    expect(ws.spineArtifacts.priced_boq).toBeNull();
    expect(ws.spineArtifacts.export_package).toBeNull();
  });

  it("includes the readiness report from getQuickBomReadinessReport", async () => {
    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    expect(ws.readiness).toEqual(
      getQuickBomReadinessReport({ projectId: PROJECT, artifacts: ARTIFACTS })
    );
  });

  it("never exposes full artifact payloads", async () => {
    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    for (const summary of ws.artifacts) {
      expect("payload" in summary).toBe(false);
    }
    expect("payload" in (ws.spineArtifacts.sku_resolution ?? {})).toBe(false);
    expect(JSON.stringify(ws)).not.toContain(PAYLOAD_SENTINEL);
  });

  it("passes tenantId into every store call", async () => {
    await loadProjectQuickBomWorkspace(TENANT, PROJECT);
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT, {
      includeArchived: true,
    });
    expect(mockListArtifacts).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockListApprovals).toHaveBeenCalledWith(TENANT, PROJECT);
  });

  it("copies pricingConfig so mutating the workspace never mutates the source project", async () => {
    const source = makeProject({ stages: STAGES, pricingConfig: { ...PRICING } });
    mockGetProjectById.mockResolvedValue(source);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    expect(ws.project.pricingConfig).toEqual(PRICING);
    expect(ws.project.pricingConfig).not.toBe(source.pricingConfig);

    ws.project.pricingConfig!.ratePercent = 99;

    expect(source.pricingConfig!.ratePercent).toBe(PRICING.ratePercent);
  });
});

describe("loadProjectQuickBomWorkspace - authorityProvenance", () => {
  const STAGES = [makeStage("boq_pricing_review", 10)];

  it("exposes a lean configurationAuthority summary when the artifact payload has a valid trace", async () => {
    const artifact = makeArtifact("configuration_expansion", 1, "approved", {
      payload: { secret: PAYLOAD_SENTINEL, configurationAuthority: VALID_CONFIG_AUTHORITY },
    });
    mockGetProjectById.mockResolvedValue(makeProject({ stages: STAGES }));
    mockListArtifacts.mockResolvedValue([artifact]);
    mockListApprovals.mockResolvedValue([]);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    const summary = ws.artifacts.find((a) => a.type === "configuration_expansion")!;

    expect(summary.authorityProvenance).toBeDefined();
    expect(summary.authorityProvenance!.configurationAuthority).toEqual({
      scope: "honeywell_mvp_demo_only",
      approvalRecordId: "appr-cfg-1",
      rulePackId: "rp-honeywell-v1",
      rulePackVersion: "1.0.0",
      rulePackStatus: "approved",
      rulePackSourceScope: "honeywell_mvp_demo_only",
      dispositionSummary: {
        expandByApprovedRulePackCount: 12,
        preserveKnownRulePackChildCount: 3,
        preserveStandaloneCustomerLineCount: 5,
        deferUnknownRelationshipCount: 0,
      },
      runtimeAi: false,
      replacementAuthority: false,
      skuSubstitutionAuthority: false,
      unknownRelationshipsDeferred: true,
      attachesOpticsUnderSwitches: false,
    });
  });

  it("exposes a lean pricingAuthority summary when the artifact payload has a valid trace", async () => {
    const artifact = makeArtifact("priced_boq", 1, "approved", {
      payload: { secret: PAYLOAD_SENTINEL, pricingAuthority: VALID_PRICING_AUTHORITY },
    });
    mockGetProjectById.mockResolvedValue(makeProject({ stages: STAGES }));
    mockListArtifacts.mockResolvedValue([artifact]);
    mockListApprovals.mockResolvedValue([]);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    const summary = ws.artifacts.find((a) => a.type === "priced_boq")!;

    expect(summary.authorityProvenance).toBeDefined();
    const pa = summary.authorityProvenance!.pricingAuthority!;
    expect(pa.profileId).toBe("honeywell-mvp-demo-pricing-authority-profile");
    expect(pa.scope).toBe("honeywell_mvp_demo_only");
    expect(pa.approvalRecordId).toBe("appr-pricing-1");
    expect(pa.activeSourceFixtureId).toBe("honeywell-mvp-demo-pricing-fixture");
    expect(pa.pricedSkuCount).toBe(120);
    expect(pa.missingPriceSkuCount).toBe(3);
    expect(pa.boundary.deterministicPricingAuthority).toBe(true);
    expect(pa.boundary.runtimeAiPricing).toBe(false);
    expect(pa.boundary.missingPricesReported).toBe(true);
  });

  it("exposes both configurationAuthority and pricingAuthority when the priced_boq carries both", async () => {
    const artifact = makeArtifact("priced_boq", 1, "approved", {
      payload: {
        secret: PAYLOAD_SENTINEL,
        configurationAuthority: VALID_CONFIG_AUTHORITY,
        pricingAuthority: VALID_PRICING_AUTHORITY,
      },
    });
    mockGetProjectById.mockResolvedValue(makeProject({ stages: STAGES }));
    mockListArtifacts.mockResolvedValue([artifact]);
    mockListApprovals.mockResolvedValue([]);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    const summary = ws.artifacts.find((a) => a.type === "priced_boq")!;

    expect(summary.authorityProvenance!.configurationAuthority).toBeDefined();
    expect(summary.authorityProvenance!.pricingAuthority).toBeDefined();
  });

  it("omits authorityProvenance entirely when neither authority trace is present", async () => {
    const artifact = makeArtifact("sku_resolution", 1, "approved", {
      payload: { secret: PAYLOAD_SENTINEL },
    });
    mockGetProjectById.mockResolvedValue(makeProject({ stages: STAGES }));
    mockListArtifacts.mockResolvedValue([artifact]);
    mockListApprovals.mockResolvedValue([]);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    const summary = ws.artifacts.find((a) => a.type === "sku_resolution")!;

    expect("authorityProvenance" in summary).toBe(false);
  });

  it("omits a malformed configurationAuthority trace without failing workspace loading", async () => {
    const artifact = makeArtifact("configuration_expansion", 1, "approved", {
      payload: {
        secret: PAYLOAD_SENTINEL,
        configurationAuthority: { scope: "honeywell_mvp_demo_only" },
      },
    });
    mockGetProjectById.mockResolvedValue(makeProject({ stages: STAGES }));
    mockListArtifacts.mockResolvedValue([artifact]);
    mockListApprovals.mockResolvedValue([]);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    const summary = ws.artifacts.find((a) => a.type === "configuration_expansion")!;

    expect("authorityProvenance" in summary).toBe(false);
  });

  it("omits configurationAuthority when authority boundary flags are unsafe", async () => {
    const artifact = makeArtifact("configuration_expansion", 1, "approved", {
      payload: {
        secret: PAYLOAD_SENTINEL,
        configurationAuthority: { ...VALID_CONFIG_AUTHORITY, runtimeAi: true },
      },
    });
    mockGetProjectById.mockResolvedValue(makeProject({ stages: STAGES }));
    mockListArtifacts.mockResolvedValue([artifact]);
    mockListApprovals.mockResolvedValue([]);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    const summary = ws.artifacts.find((a) => a.type === "configuration_expansion")!;

    expect("authorityProvenance" in summary).toBe(false);
  });

  it("omits a malformed pricingAuthority trace without failing workspace loading", async () => {
    const artifact = makeArtifact("priced_boq", 1, "approved", {
      payload: {
        secret: PAYLOAD_SENTINEL,
        pricingAuthority: { profileId: "honeywell-mvp-demo-pricing-authority-profile" },
      },
    });
    mockGetProjectById.mockResolvedValue(makeProject({ stages: STAGES }));
    mockListArtifacts.mockResolvedValue([artifact]);
    mockListApprovals.mockResolvedValue([]);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    const summary = ws.artifacts.find((a) => a.type === "priced_boq")!;

    expect("authorityProvenance" in summary).toBe(false);
  });

  it("omits pricingAuthority when pricing boundary flags are unsafe", async () => {
    const artifact = makeArtifact("priced_boq", 1, "approved", {
      payload: {
        secret: PAYLOAD_SENTINEL,
        pricingAuthority: {
          ...VALID_PRICING_AUTHORITY,
          boundary: { ...VALID_PRICING_AUTHORITY.boundary, runtimeAiPricing: true },
        },
      },
    });
    mockGetProjectById.mockResolvedValue(makeProject({ stages: STAGES }));
    mockListArtifacts.mockResolvedValue([artifact]);
    mockListApprovals.mockResolvedValue([]);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    const summary = ws.artifacts.find((a) => a.type === "priced_boq")!;

    expect("authorityProvenance" in summary).toBe(false);
  });

  it("authorityProvenance nested objects are copies, not aliases to the artifact payload", async () => {
    const payload: Record<string, unknown> = {
      secret: PAYLOAD_SENTINEL,
      configurationAuthority: { ...VALID_CONFIG_AUTHORITY, dispositionSummary: { ...VALID_CONFIG_AUTHORITY.dispositionSummary } },
      pricingAuthority: { ...VALID_PRICING_AUTHORITY, boundary: { ...VALID_PRICING_AUTHORITY.boundary } },
    };
    const artifact = makeArtifact("priced_boq", 1, "approved", { payload });
    mockGetProjectById.mockResolvedValue(makeProject({ stages: STAGES }));
    mockListArtifacts.mockResolvedValue([artifact]);
    mockListApprovals.mockResolvedValue([]);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    const summary = ws.artifacts.find((a) => a.type === "priced_boq")!;
    const prov = summary.authorityProvenance!;

    expect(prov.configurationAuthority).not.toBe(payload["configurationAuthority"]);
    expect(prov.configurationAuthority!.dispositionSummary).not.toBe(
      (payload["configurationAuthority"] as Record<string, unknown>)["dispositionSummary"]
    );
    expect(prov.pricingAuthority).not.toBe(payload["pricingAuthority"]);
    expect(prov.pricingAuthority!.boundary).not.toBe(
      (payload["pricingAuthority"] as Record<string, unknown>)["boundary"]
    );
  });

  it("does not leak forbidden payload fields into workspace JSON", async () => {
    const artifact = makeArtifact("priced_boq", 1, "approved", {
      payload: {
        secret: PAYLOAD_SENTINEL,
        lines: [{ sku: "LEAK" }],
        acceptedLines: [{ sku: "LEAK" }],
        rejectedLines: [{ sku: "LEAK" }],
        evidence: [{ kind: "LEAK" }],
        originalCells: { A1: "LEAK" },
        amounts: { totalSar: 999 },
        unitListPriceSarBySku: { "C9300-48P": { sarUnitListPrice: 1 } },
        activeSourceWorkbookPath: "C:/Pre-Sales/Benchmarck_Files/Estimate_NB167337237YA.xlsx",
        activeSourceSheetName: "EstimateDetails_NB167337237YA",
        pricingAuthority: VALID_PRICING_AUTHORITY,
        configurationAuthority: VALID_CONFIG_AUTHORITY,
      },
    });
    mockGetProjectById.mockResolvedValue(makeProject({ stages: STAGES }));
    mockListArtifacts.mockResolvedValue([artifact]);
    mockListApprovals.mockResolvedValue([]);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    const json = JSON.stringify(ws);

    expect(json).not.toContain(PAYLOAD_SENTINEL);
    expect(json).not.toContain('"lines"');
    expect(json).not.toContain('"acceptedLines"');
    expect(json).not.toContain('"rejectedLines"');
    expect(json).not.toContain('"evidence"');
    expect(json).not.toContain('"originalCells"');
    expect(json).not.toContain('"amounts"');
    expect(json).not.toContain('"unitListPriceSarBySku"');
    expect(json).not.toContain("Estimate_NB167337237YA.xlsx");
    expect(json).not.toContain('"activeSourceWorkbookPath"');
    expect(json).not.toContain('"activeSourceSheetName"');
  });

  it("spineArtifacts carry the same authorityProvenance summary as the corresponding artifact summary", async () => {
    const artifact = makeArtifact("priced_boq", 1, "approved", {
      payload: {
        configurationAuthority: VALID_CONFIG_AUTHORITY,
        pricingAuthority: VALID_PRICING_AUTHORITY,
      },
    });
    mockGetProjectById.mockResolvedValue(makeProject({ stages: STAGES }));
    mockListArtifacts.mockResolvedValue([artifact]);
    mockListApprovals.mockResolvedValue([]);

    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    const fromList = ws.artifacts.find((a) => a.type === "priced_boq")!;
    const fromSpine = ws.spineArtifacts.priced_boq!;

    expect(fromSpine.authorityProvenance).toEqual(fromList.authorityProvenance);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-quick-bom-workspace.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-quick-bom-workspace.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports no mutation, pricing, export, runner, AI, catalog, engine, coordinator, or adapter module", () => {
    for (const forbidden of [
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/honeywell',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
