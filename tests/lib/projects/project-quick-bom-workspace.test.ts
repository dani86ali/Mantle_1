import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
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

const STAGE_BY_TYPE: Partial<Record<ProjectArtifactType, ProjectStageId>> = {
  input_package: "intake_package_review",
  normalized_boq: "boq_format_validation",
  sku_resolution: "sku_resolution",
  configuration_expansion: "configuration_expansion_review",
  priced_boq: "boq_pricing_review",
  export_package: "export_approval",
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

  it("returns wrong_mode with a project summary for an rfp project, without loading artifacts/approvals", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({ mode: "rfp", customerName: "Marafiq", name: "RFP Bid" })
    );

    const result = await loadProjectQuickBomWorkspace(TENANT, PROJECT);

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "RFP Bid",
      customerName: "Marafiq",
      mode: "rfp",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
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

  it("includes the project summary with ISO dates", async () => {
    const ws = expectOk(await loadProjectQuickBomWorkspace(TENANT, PROJECT));
    expect(ws.project).toEqual({
      id: PROJECT,
      name: "Honeywell Quick BoM",
      customerName: "Honeywell",
      mode: "quick_bom",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
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
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockListArtifacts).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockListApprovals).toHaveBeenCalledWith(TENANT, PROJECT);
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
