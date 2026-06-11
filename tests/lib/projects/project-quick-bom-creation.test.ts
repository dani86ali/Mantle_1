import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectStage } from "@/types/project";

// Mock only the Project store (createProject); the pricing helper stays REAL so
// the "full SAR pricingConfig from createProjectPricingConfig" assertion is a
// true integration check (it proves the SAR/VAT-15/rounding-2 defaults).
const { mockCreateProject, mockNameExists } = vi.hoisted(() => ({
  mockCreateProject: vi.fn(),
  mockNameExists: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  createProject: mockCreateProject,
  quickBomProjectNameExists: mockNameExists,
}));

import {
  createQuickBomProject,
  type CreateQuickBomProjectInput,
} from "@/lib/projects/project-quick-bom-creation";
import { createProjectPricingConfig } from "@/lib/projects/pricing";

const TENANT = "11111111-1111-1111-1111-111111111111";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");

const SAR_MARGIN_30 = {
  currency: "SAR" as const,
  mode: "margin" as const,
  ratePercent: 30,
  vatRatePercent: 15,
  roundingDecimals: 2,
};

function validInput(
  overrides: Partial<CreateQuickBomProjectInput> = {}
): CreateQuickBomProjectInput {
  return {
    tenantId: TENANT,
    name: "Honeywell Refresh",
    customerName: "Honeywell",
    pricingConfig: { mode: "margin", ratePercent: 30 },
    ...overrides,
  };
}

function makeStage(
  stageId: ProjectStage["stageId"],
  order: number
): ProjectStage {
  return {
    id: `stage-${stageId}`,
    projectId: "proj-1",
    stageId,
    order,
    status: "not_started",
    createdAt: TS1,
    updatedAt: TS2,
  };
}

function makeReturnedProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    tenantId: TENANT,
    name: "Honeywell Refresh",
    customerName: "Honeywell",
    mode: "quick_bom",
    pricingConfig: { ...SAR_MARGIN_30 },
    files: [],
    evidence: [],
    stages: [
      makeStage("boq_format_validation", 10),
      makeStage("sku_resolution", 20),
    ],
    artifacts: [],
    approvals: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

beforeEach(() => {
  mockCreateProject.mockReset().mockResolvedValue(makeReturnedProject());
  mockNameExists.mockReset().mockResolvedValue(false);
});

describe("createQuickBomProject - input validation", () => {
  it("returns invalid_input for a blank or missing name and never calls createProject", async () => {
    const names: unknown[] = ["", "   ", undefined];
    for (const name of names) {
      mockCreateProject.mockClear();
      const result = await createQuickBomProject(
        validInput({ name: name as string })
      );
      expect(result.status).toBe("invalid_input");
      if (result.status !== "invalid_input") throw new Error("unreachable");
      expect(result.code).toBe("project_name_required");
      expect(result.error).toBe("Project name is required.");
      expect(mockCreateProject).not.toHaveBeenCalled();
    }
  });

  it("returns invalid_input with the helper guard message for an out-of-range pricing config and never calls createProject", async () => {
    const badPricing = { mode: "margin" as const, ratePercent: 100 };
    // Derive the expected message from the REAL helper so the test proves the
    // service preserves the exact guard string without hardcoding it.
    let expectedMessage = "";
    try {
      createProjectPricingConfig(badPricing);
    } catch (error) {
      expectedMessage = error instanceof Error ? error.message : "";
    }
    expect(expectedMessage).not.toBe("");

    const result = await createQuickBomProject(
      validInput({ pricingConfig: badPricing })
    );

    expect(result.status).toBe("invalid_input");
    if (result.status !== "invalid_input") throw new Error("unreachable");
    expect(result.code).toBe("invalid_pricing_config");
    expect(result.error).toBe(expectedMessage);
    expect(mockCreateProject).not.toHaveBeenCalled();
  });
});

describe("createQuickBomProject - duplicate name guard (QBM-LOG-001)", () => {
  it("returns invalid_input duplicate_project_name and never calls createProject when a duplicate Quick BoM name exists", async () => {
    mockNameExists.mockResolvedValue(true);

    const result = await createQuickBomProject(validInput());

    expect(result.status).toBe("invalid_input");
    if (result.status !== "invalid_input") throw new Error("unreachable");
    expect(result.code).toBe("duplicate_project_name");
    expect(result.error).toBe(
      "Duplicate Project Name. Honeywell Refresh already exists in your projects."
    );
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it("names the trimmed (not collapsed) entered name in the duplicate message", async () => {
    mockNameExists.mockResolvedValue(true);

    // Leading/trailing whitespace is trimmed for display; internal whitespace is
    // preserved verbatim. (Comparison normalization collapses runs - that lives
    // in the store, not in this user-facing message.)
    const result = await createQuickBomProject(
      validInput({ name: "  Acme   Core  " })
    );

    expect(result.status).toBe("invalid_input");
    if (result.status !== "invalid_input") throw new Error("unreachable");
    expect(result.error).toBe(
      "Duplicate Project Name. Acme   Core already exists in your projects."
    );
  });

  it("checks the duplicate guard with the input tenant and the trimmed name", async () => {
    await createQuickBomProject(
      validInput({ name: "  Honeywell Refresh  " })
    );

    expect(mockNameExists).toHaveBeenCalledWith(TENANT, "Honeywell Refresh");
  });

  it("creates the project when no duplicate name exists", async () => {
    mockNameExists.mockResolvedValue(false);

    const result = await createQuickBomProject(validInput());

    expect(result.status).toBe("ok");
    expect(mockCreateProject).toHaveBeenCalledTimes(1);
  });

  it("does not consult the duplicate guard when the name is blank", async () => {
    const result = await createQuickBomProject(validInput({ name: "   " }));

    expect(result.status).toBe("invalid_input");
    expect(mockNameExists).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });
});

describe("createQuickBomProject - createProject call", () => {
  it("creates a quick_bom project with the input tenant, trimmed name, omitted blank customerName, and full SAR pricingConfig", async () => {
    await createQuickBomProject({
      tenantId: TENANT,
      name: "  Honeywell Refresh  ",
      customerName: "   ",
      pricingConfig: { mode: "margin", ratePercent: 30 },
    });

    expect(mockCreateProject).toHaveBeenCalledTimes(1);
    const arg = mockCreateProject.mock.calls[0][0];
    expect(arg).toEqual({
      tenantId: TENANT,
      name: "Honeywell Refresh",
      mode: "quick_bom",
      pricingConfig: SAR_MARGIN_30,
    });
    expect("customerName" in arg).toBe(false);
  });

  it("passes the trimmed customerName through when present", async () => {
    await createQuickBomProject(validInput({ customerName: "  Honeywell  " }));

    const arg = mockCreateProject.mock.calls[0][0];
    expect(arg.customerName).toBe("Honeywell");
  });

  it("materializes explicit VAT and rounding through the pricing helper", async () => {
    await createQuickBomProject(
      validInput({
        pricingConfig: {
          mode: "markup",
          ratePercent: 12,
          vatRatePercent: 5,
          roundingDecimals: 3,
        },
      })
    );

    const arg = mockCreateProject.mock.calls[0][0];
    expect(arg.pricingConfig).toEqual({
      currency: "SAR",
      mode: "markup",
      ratePercent: 12,
      vatRatePercent: 5,
      roundingDecimals: 3,
    });
  });
});

describe("createQuickBomProject - ok result", () => {
  it("returns a serializable project summary with tenantId, copied pricingConfig, ISO dates, and no aggregate children", async () => {
    const returned = makeReturnedProject();
    mockCreateProject.mockResolvedValue(returned);

    const result = await createQuickBomProject(validInput());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: "proj-1",
      tenantId: TENANT,
      name: "Honeywell Refresh",
      customerName: "Honeywell",
      mode: "quick_bom",
      pricingConfig: SAR_MARGIN_30,
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    // No files / evidence / artifacts / approvals leak into the summary.
    for (const key of ["files", "evidence", "artifacts", "approvals"]) {
      expect(key in result.project).toBe(false);
    }
    // pricingConfig is copied, not aliased to the created aggregate.
    expect(result.project.pricingConfig).not.toBe(returned.pricingConfig);
    expect(typeof result.project.createdAt).toBe("string");
    expect(typeof result.project.updatedAt).toBe("string");
  });

  it("returns serializable stage summaries with ISO dates and no tenantId/projectId", async () => {
    const result = await createQuickBomProject(validInput());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.stages).toEqual([
      {
        id: "stage-boq_format_validation",
        stageId: "boq_format_validation",
        order: 10,
        status: "not_started",
        createdAt: TS1.toISOString(),
        updatedAt: TS2.toISOString(),
      },
      {
        id: "stage-sku_resolution",
        stageId: "sku_resolution",
        order: 20,
        status: "not_started",
        createdAt: TS1.toISOString(),
        updatedAt: TS2.toISOString(),
      },
    ]);
    expect("projectId" in result.stages[0]).toBe(false);
    expect("tenantId" in result.stages[0]).toBe(false);
  });

  it("does not mutate its input object", async () => {
    const input = validInput();
    const snapshot = structuredClone(input);

    await createQuickBomProject(input);

    expect(input).toEqual(snapshot);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-quick-bom-creation.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-quick-bom-creation.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports no artifact/approval/file/evidence store, runner, config expansion, priced BoQ, export, AI, catalog, coordinator, engine, or adapter module", () => {
    for (const forbidden of [
      'from "@/lib/db/project-artifact-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/mantle',
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
