import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectStage } from "@/types/project";

// Mock only the Project store (createProject); the service has no other
// runtime dependency. There is no pricing helper involved - the RFP shell
// selects no pricing config at creation.
const { mockCreateProject } = vi.hoisted(() => ({
  mockCreateProject: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  createProject: mockCreateProject,
}));

import {
  createRfpProject,
  type CreateRfpProjectInput,
} from "@/lib/projects/project-rfp-creation";

const TENANT = "11111111-1111-1111-1111-111111111111";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");

function validInput(
  overrides: Partial<CreateRfpProjectInput> = {}
): CreateRfpProjectInput {
  return {
    tenantId: TENANT,
    name: "Aramco Edge RFP",
    customerName: "Saudi Aramco",
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
    name: "Aramco Edge RFP",
    customerName: "Saudi Aramco",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [
      makeStage("intake_package_review", 10),
      makeStage("requirements_baseline_review", 40),
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
});

describe("createRfpProject - input validation", () => {
  it("returns invalid_input for a blank or missing name and never calls createProject", async () => {
    const names: unknown[] = ["", "   ", undefined];
    for (const name of names) {
      mockCreateProject.mockClear();
      const result = await createRfpProject(
        validInput({ name: name as string })
      );
      expect(result.status).toBe("invalid_input");
      if (result.status !== "invalid_input") throw new Error("unreachable");
      expect(result.code).toBe("project_name_required");
      expect(result.error).toBe("Project name is required.");
      expect(mockCreateProject).not.toHaveBeenCalled();
    }
  });
});

describe("createRfpProject - createProject call", () => {
  it("creates an rfp project with the input tenant, trimmed name, omitted blank customerName, and no pricingConfig", async () => {
    await createRfpProject({
      tenantId: TENANT,
      name: "  Aramco Edge RFP  ",
      customerName: "   ",
    });

    expect(mockCreateProject).toHaveBeenCalledTimes(1);
    const arg = mockCreateProject.mock.calls[0][0];
    expect(arg).toEqual({
      tenantId: TENANT,
      name: "Aramco Edge RFP",
      mode: "rfp",
    });
    expect("customerName" in arg).toBe(false);
    expect("pricingConfig" in arg).toBe(false);
  });

  it("passes the trimmed customerName through when present", async () => {
    await createRfpProject(validInput({ customerName: "  Saudi Aramco  " }));

    const arg = mockCreateProject.mock.calls[0][0];
    expect(arg.customerName).toBe("Saudi Aramco");
  });
});

describe("createRfpProject - ok result", () => {
  it("returns a serializable project summary with ISO dates and no pricingConfig or aggregate children", async () => {
    const result = await createRfpProject(validInput());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: "proj-1",
      tenantId: TENANT,
      name: "Aramco Edge RFP",
      customerName: "Saudi Aramco",
      mode: "rfp",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    // No files / evidence / artifacts / approvals / pricingConfig leak into
    // the summary.
    for (const key of [
      "files",
      "evidence",
      "artifacts",
      "approvals",
      "pricingConfig",
    ]) {
      expect(key in result.project).toBe(false);
    }
    expect(typeof result.project.createdAt).toBe("string");
    expect(typeof result.project.updatedAt).toBe("string");
  });

  it("omits customerName from the summary when the created project has none", async () => {
    mockCreateProject.mockResolvedValue(
      makeReturnedProject({ customerName: undefined })
    );

    const result = await createRfpProject(validInput({ customerName: "  " }));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });

  it("returns serializable stage summaries with ISO dates and no tenantId/projectId", async () => {
    const result = await createRfpProject(validInput());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.stages).toEqual([
      {
        id: "stage-intake_package_review",
        stageId: "intake_package_review",
        order: 10,
        status: "not_started",
        createdAt: TS1.toISOString(),
        updatedAt: TS2.toISOString(),
      },
      {
        id: "stage-requirements_baseline_review",
        stageId: "requirements_baseline_review",
        order: 40,
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

    await createRfpProject(input);

    expect(input).toEqual(snapshot);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-creation.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-creation.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports no artifact/approval/file/evidence store, pricing, runner, config expansion, priced BoQ, export, AI, catalog, coordinator, engine, or adapter module", () => {
    for (const forbidden of [
      'from "@/lib/db/project-artifact-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/pricing"',
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

  it("imports the read-model summary shapes type-only", () => {
    // The workspace module is DB-coupled at runtime; the service may take its
    // summary TYPES only. An import type clause is erased at compile time.
    // Negated char classes span CRLF/LF, so these are line-ending safe.
    expect(
      /import type \{[^}]+\} from "@\/lib\/projects\/project-quick-bom-workspace"/.test(
        source
      )
    ).toBe(true);
    expect(
      /import \{[^}]+\} from "@\/lib\/projects\/project-quick-bom-workspace"/.test(
        source
      )
    ).toBe(false);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
