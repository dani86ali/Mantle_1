/**
 * Tests for the Honeywell Quick BoM DEMO Project fixture (Prompt 78).
 *
 * The fixture is an orchestrator: every persistence boundary is mocked here, so the
 * real approval gates inside the gated services never execute. The test therefore
 * proves the wiring the gates would otherwise enforce - the id hand-off at each step
 * and the approve-before-next-gated-step ordering - plus the demo BoQ shape, the
 * authority split, and source isolation. The pure builders (the active Honeywell rule
 * pack + the configuration-expansion draft) and the committed demo pricing fixture run
 * for real, so the expansion line set and the price/category maps are the real ones.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("@/lib/db/project-store", () => ({ createProject: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({ createProjectArtifactVersion: vi.fn() }));
vi.mock("@/lib/db/project-approval-store", () => ({ createProjectApproval: vi.fn() }));
vi.mock("@/lib/projects/sku-resolution-review-artifact", () => ({ createReviewedSkuResolutionArtifact: vi.fn() }));
vi.mock("@/lib/projects/config-expansion-artifact", () => ({ createConfigurationExpansionArtifact: vi.fn() }));
vi.mock("@/lib/projects/priced-boq-artifact", () => ({ createPricedBoqArtifact: vi.fn() }));
vi.mock("@/lib/projects/mantle-export-artifact", () => ({ createMantleExportArtifact: vi.fn() }));
vi.mock("@/lib/projects/project-quick-bom-workspace", () => ({ loadProjectQuickBomWorkspace: vi.fn() }));

import {
  createHoneywellQuickBomDemoProjectFixture,
  type CreateHoneywellQuickBomDemoProjectFixtureInput,
} from "@/lib/projects/honeywell-demo-project-fixture";
import { createProject } from "@/lib/db/project-store";
import { createProjectArtifactVersion } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { createReviewedSkuResolutionArtifact } from "@/lib/projects/sku-resolution-review-artifact";
import { createConfigurationExpansionArtifact } from "@/lib/projects/config-expansion-artifact";
import { createPricedBoqArtifact } from "@/lib/projects/priced-boq-artifact";
import { createMantleExportArtifact } from "@/lib/projects/mantle-export-artifact";
import { loadProjectQuickBomWorkspace } from "@/lib/projects/project-quick-bom-workspace";
import {
  getHoneywellDemoMantleCategoryByAcceptedSku,
  getHoneywellDemoUnitListPriceSarBySku,
} from "@/lib/projects/honeywell-demo-pricing-fixture";
import {
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
} from "@/lib/projects/honeywell-config-expansion-rule-pack";
import type { Project, ProjectArtifact, ProjectArtifactType, ProjectStageId } from "@/types/project";

// --- Constants / ids --------------------------------------------------------

const TENANT = "tenant-honeywell";
const DECIDED_BY = "engineer@stc.example";
const OUTPUT_PATH = "C:/Pre-Sales/out/honeywell-quick-bom-demo.xlsx";
const DECIDED_AT = new Date("2026-06-06T09:00:00.000Z");

const PROJECT_ID = "proj-hw-demo";
const NB_ID = "art-nb";
const DRAFT_SKU_ID = "art-sku-draft";
const REVIEWED_SKU_ID = "art-sku-reviewed";
const CE_ID = "art-ce";
const PRICED_ID = "art-priced";
const EXPORT_ID = "art-export";

const OPTIC_A = "SFP-10G-LR-S=";
const OPTIC_B = "SFP-10/25G-LR-S=";

/** The seven customer rows in customer order: [SKU, quantity]. */
const EXPECTED_ROWS: ReadonlyArray<readonly [string, number]> = [
  ["CW9178I-CFG", 12],
  ["CISCO-NETWORK-SUB", 1],
  ["C9300X-48HX-A", 7],
  ["C9300L-24P-4X-A", 6],
  [OPTIC_A, 12],
  [OPTIC_B, 14],
  ["CP-7841-K9=", 59],
];

const DEMO_PRICING_CONFIG = { currency: "SAR", mode: "markup", ratePercent: 0, vatRatePercent: 15, roundingDecimals: 2 };

// --- Mock fixtures ----------------------------------------------------------

function artifact(
  over: Partial<ProjectArtifact> & { id: string; type: ProjectArtifactType; stageId: ProjectStageId }
): ProjectArtifact {
  return {
    projectId: PROJECT_ID,
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: DECIDED_AT,
    updatedAt: DECIDED_AT,
    ...over,
  };
}

function projectStub(): Project {
  return {
    id: PROJECT_ID,
    tenantId: TENANT,
    name: "Honeywell Quick BoM Demo",
    customerName: "Honeywell",
    mode: "quick_bom",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: DECIDED_AT,
    updatedAt: DECIDED_AT,
  };
}

// A sentinel workspace result; the fixture must return exactly what the loader returns.
const WORKSPACE_RESULT = { status: "ok", workspace: { sentinel: true } } as unknown as Awaited<
  ReturnType<typeof loadProjectQuickBomWorkspace>
>;

function setupMocks(): void {
  vi.mocked(createProject).mockResolvedValue(projectStub());
  vi.mocked(createProjectArtifactVersion).mockImplementation(async (inp) =>
    inp.type === "normalized_boq"
      ? artifact({ id: NB_ID, type: "normalized_boq", stageId: "boq_format_validation", status: "generated" })
      : artifact({ id: DRAFT_SKU_ID, type: "sku_resolution", stageId: "sku_resolution", status: "needs_review" })
  );
  vi.mocked(createReviewedSkuResolutionArtifact).mockResolvedValue({
    artifact: artifact({ id: REVIEWED_SKU_ID, type: "sku_resolution", stageId: "sku_resolution", status: "generated" }),
  } as unknown as Awaited<ReturnType<typeof createReviewedSkuResolutionArtifact>>);
  vi.mocked(createConfigurationExpansionArtifact).mockResolvedValue({
    artifact: artifact({ id: CE_ID, type: "configuration_expansion", stageId: "configuration_expansion_review" }),
  } as unknown as Awaited<ReturnType<typeof createConfigurationExpansionArtifact>>);
  vi.mocked(createPricedBoqArtifact).mockResolvedValue({
    artifact: artifact({ id: PRICED_ID, type: "priced_boq", stageId: "boq_pricing_review" }),
  } as unknown as Awaited<ReturnType<typeof createPricedBoqArtifact>>);
  vi.mocked(createMantleExportArtifact).mockResolvedValue({
    artifact: artifact({ id: EXPORT_ID, type: "export_package", stageId: "export_approval" }),
  } as unknown as Awaited<ReturnType<typeof createMantleExportArtifact>>);
  vi.mocked(createProjectApproval).mockImplementation(async (inp) => ({
    approval: {
      id: `appr-${inp.artifactId}`,
      projectId: inp.projectId,
      stageId: "sku_resolution" as ProjectStageId,
      artifactId: inp.artifactId,
      artifactVersion: 1,
      decision: "approved",
      decidedBy: inp.decidedBy,
      decidedAt: inp.decidedAt ?? DECIDED_AT,
    },
    artifactStatus: "approved",
    stageStatus: "approved",
  }));
  vi.mocked(loadProjectQuickBomWorkspace).mockResolvedValue(WORKSPACE_RESULT);
}

function input(
  over: Partial<CreateHoneywellQuickBomDemoProjectFixtureInput> = {}
): CreateHoneywellQuickBomDemoProjectFixtureInput {
  return {
    tenantId: TENANT,
    decidedBy: DECIDED_BY,
    outputPath: OUTPUT_PATH,
    decidedAt: DECIDED_AT,
    projectIdLabel: "HW-DEMO",
    dealId: "DEAL-1",
    priceList: "STC SAR Price List",
    ...over,
  };
}

const run = () => createHoneywellQuickBomDemoProjectFixture(input());

// --- Typed accessors over recorded calls ------------------------------------

const artifactVersionArgs = () => vi.mocked(createProjectArtifactVersion).mock.calls.map((c) => c[0]);
const artifactArgByType = (type: ProjectArtifactType) => artifactVersionArgs().find((c) => c.type === type)!;
const ceArgs = () => vi.mocked(createConfigurationExpansionArtifact).mock.calls[0][0];
const pricedArgs = () => vi.mocked(createPricedBoqArtifact).mock.calls[0][0];
const exportArgs = () => vi.mocked(createMantleExportArtifact).mock.calls[0][0];
const reviewedArgs = () => vi.mocked(createReviewedSkuResolutionArtifact).mock.calls[0][0];

function approvalOrderFor(artifactId: string): number {
  const calls = vi.mocked(createProjectApproval).mock.calls;
  const idx = calls.findIndex((c) => c[0].artifactId === artifactId);
  expect(idx, `approval for ${artifactId}`).toBeGreaterThanOrEqual(0);
  return vi.mocked(createProjectApproval).mock.invocationCallOrder[idx];
}

const firstOrderOf = (fn: (...a: never[]) => unknown): number => vi.mocked(fn).mock.invocationCallOrder[0];

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

// --- Guards (throw before creating anything) --------------------------------

describe("createHoneywellQuickBomDemoProjectFixture - guards", () => {
  it("throws and creates nothing when decidedBy is blank", async () => {
    await expect(createHoneywellQuickBomDemoProjectFixture(input({ decidedBy: "   " }))).rejects.toThrow(
      "decidedBy is required."
    );
    expect(createProject).not.toHaveBeenCalled();
    expect(createProjectArtifactVersion).not.toHaveBeenCalled();
  });

  it("throws and creates nothing when outputPath is blank", async () => {
    await expect(createHoneywellQuickBomDemoProjectFixture(input({ outputPath: "  " }))).rejects.toThrow(
      "outputPath is required."
    );
    expect(createProject).not.toHaveBeenCalled();
    expect(createProjectArtifactVersion).not.toHaveBeenCalled();
  });
});

// --- Project creation -------------------------------------------------------

describe("createHoneywellQuickBomDemoProjectFixture - project", () => {
  it("creates a quick_bom project with the demo pricing config and default names", async () => {
    await run();
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createProject).mock.calls[0][0]).toMatchObject({
      tenantId: TENANT,
      mode: "quick_bom",
      name: "Honeywell Quick BoM Demo",
      customerName: "Honeywell",
    });
    expect(vi.mocked(createProject).mock.calls[0][0].pricingConfig).toEqual(DEMO_PRICING_CONFIG);
  });

  it("uses caller-supplied project/customer names when provided", async () => {
    await createHoneywellQuickBomDemoProjectFixture(input({ projectName: "Custom P", customerName: "Custom C" }));
    expect(vi.mocked(createProject).mock.calls[0][0]).toMatchObject({ name: "Custom P", customerName: "Custom C" });
  });
});

// --- normalized_boq + draft sku_resolution ----------------------------------

describe("createHoneywellQuickBomDemoProjectFixture - normalized BoQ and draft SKU resolution", () => {
  it("creates exactly two artifact versions: normalized_boq then draft sku_resolution", async () => {
    await run();
    const calls = vi.mocked(createProjectArtifactVersion).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toMatchObject({ type: "normalized_boq", stageId: "boq_format_validation", status: "generated" });
    expect(calls[1][0]).toMatchObject({ type: "sku_resolution", stageId: "sku_resolution", status: "needs_review" });
  });

  it("writes exactly the seven Honeywell customer lines in order and quantity", async () => {
    await run();
    const payload = artifactArgByType("normalized_boq").payload as unknown as { lines: Array<{ sku: string; quantity: number; originalLineNumber: string }> };
    expect(payload.lines.map((l) => [l.sku, l.quantity])).toEqual(EXPECTED_ROWS.map((r) => [r[0], r[1]]));
    expect(payload.lines.map((l) => l.originalLineNumber)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("keeps the optics as customer-origin BoQ lines, never expansion children", async () => {
    await run();
    // In the normalized BoQ both optics are plain customer rows.
    const nb = artifactArgByType("normalized_boq").payload as unknown as { lines: Array<{ sku: string }> };
    expect(nb.lines.filter((l) => l.sku === OPTIC_A || l.sku === OPTIC_B)).toHaveLength(2);
    // In the configuration-expansion draft they stay origin "customer" and never appear as expansion lines.
    const optics = ceArgs().lines.filter((l) => l.sku === OPTIC_A || l.sku === OPTIC_B);
    expect(optics).toHaveLength(2);
    expect(optics.every((l) => l.origin === "customer")).toBe(true);
    expect(ceArgs().lines.some((l) => l.origin === "expansion" && (l.sku === OPTIC_A || l.sku === OPTIC_B))).toBe(false);
  });

  it("draft sku_resolution carries an exact same-SKU suggestion per row and no acceptedSku", async () => {
    await run();
    const payload = artifactArgByType("sku_resolution").payload as unknown as {
      decisions: Array<{ originalSku: string; status: string; acceptedSku?: string; suggestions: Array<{ suggestedSku: string; source: string }> }>;
    };
    expect(payload.decisions).toHaveLength(7);
    for (const decision of payload.decisions) {
      expect(decision.status).toBe("needs_review");
      expect(decision.acceptedSku).toBeUndefined();
      expect(decision.suggestions).toHaveLength(1);
      expect(decision.suggestions[0].suggestedSku).toBe(decision.originalSku);
      expect(decision.suggestions[0].source).toBe("exact");
    }
  });
});

// --- SKU review (accept each row as itself) ---------------------------------

describe("createHoneywellQuickBomDemoProjectFixture - SKU review", () => {
  it("reviews the DRAFT artifact with an explicit accept (acceptedSku === original) for all seven rows", async () => {
    await run();
    const args = reviewedArgs();
    expect(args.skuResolutionArtifactId).toBe(DRAFT_SKU_ID);
    expect(args.actions).toHaveLength(7);
    for (const action of args.actions) {
      expect(action.decision).toBe("accept");
      if (action.decision !== "accept") continue; // narrow to the accept variant
      expect(action.acceptedSku).toBe(EXPECTED_ROWS[action.sourceRowNumber - 1][0]);
      expect(action.decidedBy).toBe(DECIDED_BY);
      expect(action.decidedAt).toBe(DECIDED_AT);
    }
  });

  it("approves the REVIEWED sku_resolution artifact before configuration expansion runs", async () => {
    await run();
    // Id hand-off: the reviewed (not draft) artifact id is what gets approved and consumed.
    expect(ceArgs().skuResolutionArtifactId).toBe(REVIEWED_SKU_ID);
    expect(approvalOrderFor(REVIEWED_SKU_ID)).toBeLessThan(firstOrderOf(createConfigurationExpansionArtifact));
  });
});

// --- Configuration expansion ------------------------------------------------

describe("createHoneywellQuickBomDemoProjectFixture - configuration expansion", () => {
  it("passes the approved active rule-pack id/version/status", async () => {
    await run();
    const args = ceArgs();
    expect(args.rulePackId).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID);
    expect(args.rulePackVersion).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION);
    expect(args.rulePackStatus).toBe("approved");
    expect(args.normalizedBoqArtifactId).toBe(NB_ID);
  });

  it("supplies one explicit accept decision for every expansion line (7 customer + 53 expansion = 60)", async () => {
    await run();
    const args = ceArgs();
    const expansionLines = args.lines.filter((l) => l.origin === "expansion");
    expect(args.lines).toHaveLength(60);
    expect(expansionLines).toHaveLength(53);
    expect(args.decisions).toHaveLength(expansionLines.length);
    expect(args.decisions.every((d) => d.action === "accept")).toBe(true);
    expect(new Set(args.decisions.map((d) => d.lineId))).toEqual(new Set(expansionLines.map((l) => l.lineId)));
  });

  it("approves configuration_expansion before pricing runs, threading its id into pricing", async () => {
    await run();
    expect(pricedArgs().configurationExpansionArtifactId).toBe(CE_ID);
    expect(approvalOrderFor(CE_ID)).toBeLessThan(firstOrderOf(createPricedBoqArtifact));
  });
});

// --- Pricing ----------------------------------------------------------------

describe("createHoneywellQuickBomDemoProjectFixture - pricing", () => {
  it("prices from the committed demo SAR price map and the demo pricing config", async () => {
    await run();
    const args = pricedArgs();
    expect(args.pricingConfig).toEqual(DEMO_PRICING_CONFIG);
    expect(args.unitListPriceSarBySku).toEqual(getHoneywellDemoUnitListPriceSarBySku());
  });

  it("approves priced_boq before the Mantle export runs, threading its id into the export", async () => {
    await run();
    expect(exportArgs().pricedBoqArtifactId).toBe(PRICED_ID);
    expect(approvalOrderFor(PRICED_ID)).toBeLessThan(firstOrderOf(createMantleExportArtifact));
  });
});

// --- Mantle export + workspace ----------------------------------------------

describe("createHoneywellQuickBomDemoProjectFixture - export and workspace", () => {
  it("exports to the output path with the committed category map and workbook metadata", async () => {
    await run();
    const args = exportArgs();
    expect(args.outputPath).toBe(OUTPUT_PATH);
    expect(args.categoryByAcceptedSku).toEqual(getHoneywellDemoMantleCategoryByAcceptedSku());
    expect(args.projectIdLabel).toBe("HW-DEMO");
    expect(args.dealId).toBe("DEAL-1");
    expect(args.priceList).toBe("STC SAR Price List");
  });

  it("never approves the export package; it stays needs_review for a later prompt", async () => {
    await run();
    expect(createProjectApproval).toHaveBeenCalledTimes(3);
    const approvedIds = vi.mocked(createProjectApproval).mock.calls.map((c) => c[0].artifactId);
    expect(approvedIds).toEqual([REVIEWED_SKU_ID, CE_ID, PRICED_ID]);
    expect(approvedIds).not.toContain(EXPORT_ID);
  });

  it("loads the Quick BoM workspace after export, with the same tenant/project", async () => {
    await run();
    expect(loadProjectQuickBomWorkspace).toHaveBeenCalledTimes(1);
    expect(vi.mocked(loadProjectQuickBomWorkspace).mock.calls[0]).toEqual([TENANT, PROJECT_ID]);
    expect(firstOrderOf(loadProjectQuickBomWorkspace)).toBeGreaterThan(firstOrderOf(createMantleExportArtifact));
  });
});

// --- Result + tenant scoping ------------------------------------------------

describe("createHoneywellQuickBomDemoProjectFixture - result and tenant scoping", () => {
  it("returns the project, all six spine artifacts, the three approvals, and the workspace", async () => {
    const result = await run();
    expect(result.project.id).toBe(PROJECT_ID);
    expect(result.normalizedBoqArtifact.id).toBe(NB_ID);
    expect(result.skuResolutionDraftArtifact.id).toBe(DRAFT_SKU_ID);
    expect(result.skuResolutionReviewedArtifact.id).toBe(REVIEWED_SKU_ID);
    expect(result.configurationExpansionArtifact.id).toBe(CE_ID);
    expect(result.pricedBoqArtifact.id).toBe(PRICED_ID);
    expect(result.exportPackageArtifact.id).toBe(EXPORT_ID);
    expect(result.approvals.skuResolution.artifactId).toBe(REVIEWED_SKU_ID);
    expect(result.approvals.configurationExpansion.artifactId).toBe(CE_ID);
    expect(result.approvals.pricedBoq.artifactId).toBe(PRICED_ID);
    expect(result.workspace).toBe(WORKSPACE_RESULT);
  });

  it("passes tenantId through every store/service call", async () => {
    await run();
    const objectArgMocks: { mock: { calls: unknown[][] } }[] = [
      vi.mocked(createProject),
      vi.mocked(createProjectArtifactVersion),
      vi.mocked(createReviewedSkuResolutionArtifact),
      vi.mocked(createConfigurationExpansionArtifact),
      vi.mocked(createPricedBoqArtifact),
      vi.mocked(createMantleExportArtifact),
      vi.mocked(createProjectApproval),
    ];
    for (const m of objectArgMocks) {
      expect(m.mock.calls.length).toBeGreaterThan(0);
      for (const call of m.mock.calls) {
        expect((call[0] as { tenantId?: string }).tenantId).toBe(TENANT);
      }
    }
    // loadProjectQuickBomWorkspace takes positional (tenantId, projectId).
    expect(vi.mocked(loadProjectQuickBomWorkspace).mock.calls[0][0]).toBe(TENANT);
  });
});

// --- Source isolation & ASCII -----------------------------------------------

describe("createHoneywellQuickBomDemoProjectFixture - source isolation", () => {
  const MODULE_PATH = join(process.cwd(), "src/lib/projects/honeywell-demo-project-fixture.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-demo-project-fixture.test.ts");
  const source = readFileSync(MODULE_PATH, "utf8");

  function importSpecifiers(text: string): string[] {
    const specs: string[] = [];
    const re = /import\s+(?:type\s+)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) specs.push(m[1]);
    return specs;
  }

  it("imports no API/UI, coordinator, engine, adapter, catalog, AI/LLM, DB schema/index, cisco_gpl, benchmark, or legacy intake/estimate pipeline module", () => {
    const specs = importSpecifiers(source);
    expect(specs.length).toBeGreaterThan(0);
    // Specific forbidden specifiers/substrings (scanned over import specifiers only, so the
    // legitimate *-artifact / *-export / db store imports are not self-matched).
    const FORBIDDEN = [
      "@/lib/db/index", "@/lib/db/schema", "drizzle",
      "catalog", "coordinator", "@/engines", "@/lib/agent", "@/lib/adapters",
      "anthropic", "open" + "ai", "/llm", "claude", "generative",
      "@/app", "@/components", ".tsx", "/api", "/route",
      "cisco_gpl", "gpl", "benchmark", "intake", "estimate", "pipeline",
    ];
    for (const spec of specs) {
      const lower = spec.toLowerCase();
      for (const token of FORBIDDEN) {
        expect(lower.includes(token), `import "${spec}" matches forbidden "${token}"`).toBe(false);
      }
    }
    // Positive: the orchestrated stores/services and types are imported.
    expect(specs).toContain("@/lib/db/project-store");
    expect(specs).toContain("@/lib/projects/mantle-export-artifact");
    expect(specs).toContain("@/lib/projects/project-quick-bom-workspace");
    expect(specs).toContain("@/types/project");
  });

  it("keeps the module source ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(readFileSync(TEST_PATH, "utf8"))).toBe(false);
  });
});
