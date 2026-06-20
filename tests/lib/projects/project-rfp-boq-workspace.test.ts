import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectFile,
  ProjectFileRole,
  ProjectStage,
  ProjectStageId,
} from "@/types/project";

const {
  mockGetProjectById,
  mockListProjectFiles,
  mockListProjectArtifacts,
  mockListProjectApprovals,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockListProjectFiles: vi.fn(),
  mockListProjectArtifacts: vi.fn(),
  mockListProjectApprovals: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProjectById }));
vi.mock("@/lib/db/project-file-store", () => ({
  listProjectFiles: mockListProjectFiles,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  listProjectArtifacts: mockListProjectArtifacts,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  listProjectApprovals: mockListProjectApprovals,
}));

import {
  loadProjectRfpBoqWorkspace,
  type LoadProjectRfpBoqWorkspaceResult,
} from "@/lib/projects/project-rfp-boq-workspace";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const OTHER_PROJECT = "proj-other";
const CREATED = new Date("2026-06-01T10:00:00.000Z");
const UPDATED = new Date("2026-06-02T11:30:00.000Z");
const ARCHIVED = new Date("2026-06-03T12:00:00.000Z");
const ART_TS = new Date("2026-06-04T09:00:00.000Z");
const APPROVED_AT = new Date("2026-06-05T15:00:00.000Z");

const STAGE_BY_TYPE: Partial<Record<ProjectArtifactType, ProjectStageId>> = {
  normalized_boq: "boq_format_validation",
  sku_resolution: "sku_resolution",
  configuration_expansion: "configuration_expansion_review",
  priced_boq: "boq_pricing_review",
  export_package: "export_approval",
};

function stage(
  stageId: ProjectStageId,
  order: number,
  overrides: Partial<ProjectStage> = {}
): ProjectStage {
  return {
    id: `stage-${stageId}`,
    projectId: PROJECT,
    stageId,
    order,
    status: "not_started",
    createdAt: CREATED,
    updatedAt: UPDATED,
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP",
    customerName: "STC",
    mode: "rfp",
    pricingConfig: {
      currency: "SAR",
      mode: "margin",
      ratePercent: 12,
      vatRatePercent: 15,
      roundingDecimals: 2,
    },
    files: [],
    evidence: [],
    stages: [
      stage("intake_package_review", 10, { status: "approved" }),
      stage("boq_format_validation", 20, { status: "in_progress" }),
    ],
    artifacts: [],
    approvals: [],
    createdAt: CREATED,
    updatedAt: UPDATED,
    ...overrides,
  };
}

function file(
  id: string,
  fileRole: ProjectFileRole,
  overrides: Partial<ProjectFile> = {}
): ProjectFile {
  return {
    id,
    projectId: PROJECT,
    fileRole,
    fileName: `${id}.xlsx`,
    storagePath: `s3://bucket/${id}`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 2048,
    uploadedAt: new Date("2026-06-01T00:00:00.000Z"),
    retainUntil: new Date("2027-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

function artifact(
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
    payload: { secret: `payload-${type}-${version}` },
    filePath: `C:/secret/${type}-${version}.xlsx`,
    sourceFileIds: ["boq-1"],
    sourceArtifactIds: version > 1 ? [`${type}-v${version - 1}`] : [],
    createdAt: ART_TS,
    updatedAt: new Date(ART_TS.getTime() + version * 1000),
    ...overrides,
  };
}

function approval(overrides: Partial<ProjectApproval> = {}): ProjectApproval {
  return {
    id: "approval-1",
    projectId: PROJECT,
    stageId: "sku_resolution",
    artifactId: "sku_resolution-v2",
    artifactVersion: 2,
    decision: "approved",
    decidedBy: "engineer-1",
    decidedAt: APPROVED_AT,
    note: "ready",
    ...overrides,
  };
}

const BOQ_FILE = file("boq-1", "boq", { roleCorrectedBy: "engineer-2" });
const FULL_APPROVED_CHAIN = [
  artifact("normalized_boq", 1, "generated"),
  artifact("sku_resolution", 1, "approved"),
  artifact("configuration_expansion", 1, "approved"),
  artifact("priced_boq", 1, "approved"),
  artifact("export_package", 1, "approved"),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProjectById.mockResolvedValue(project());
  mockListProjectFiles.mockResolvedValue([BOQ_FILE, file("rfp-1", "rfp")]);
  mockListProjectArtifacts.mockResolvedValue(FULL_APPROVED_CHAIN);
  mockListProjectApprovals.mockResolvedValue([approval()]);
});

describe("loadProjectRfpBoqWorkspace - project gate", () => {
  it("returns not_found and never lists files, artifacts, or approvals when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await loadProjectRfpBoqWorkspace(TENANT, PROJECT);

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT, {
      includeArchived: true,
    });
    expect(mockListProjectFiles).not.toHaveBeenCalled();
    expect(mockListProjectArtifacts).not.toHaveBeenCalled();
    expect(mockListProjectApprovals).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a lean project summary and does not list children", async () => {
    mockGetProjectById.mockResolvedValue(project({ mode: "quick_bom" }));

    const result = await loadProjectRfpBoqWorkspace(TENANT, PROJECT);

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "STC RFP",
      customerName: "STC",
      mode: "quick_bom",
      pricingConfig: {
        currency: "SAR",
        mode: "margin",
        ratePercent: 12,
        vatRatePercent: 15,
        roundingDecimals: 2,
      },
      createdAt: CREATED.toISOString(),
      updatedAt: UPDATED.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect(mockListProjectFiles).not.toHaveBeenCalled();
    expect(mockListProjectArtifacts).not.toHaveBeenCalled();
    expect(mockListProjectApprovals).not.toHaveBeenCalled();
  });
});

describe("loadProjectRfpBoqWorkspace - ok workspace", () => {
  async function ok(): Promise<Extract<LoadProjectRfpBoqWorkspaceResult, { status: "ok" }>> {
    const result = await loadProjectRfpBoqWorkspace(TENANT, PROJECT);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    return result;
  }

  it("lists files, artifacts, and approvals tenant-scoped only after the RFP project is verified", async () => {
    await ok();

    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT, {
      includeArchived: true,
    });
    expect(mockListProjectFiles).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockListProjectArtifacts).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockListProjectApprovals).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockGetProjectById.mock.invocationCallOrder[0]).toBeLessThan(
      mockListProjectFiles.mock.invocationCallOrder[0]
    );
  });

  it("returns lean project and stage summaries with ISO dates and no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(project({ archivedAt: ARCHIVED }));

    const { workspace } = await ok();

    expect(workspace.project).toEqual({
      id: PROJECT,
      name: "STC RFP",
      customerName: "STC",
      mode: "rfp",
      pricingConfig: {
        currency: "SAR",
        mode: "margin",
        ratePercent: 12,
        vatRatePercent: 15,
        roundingDecimals: 2,
      },
      archivedAt: ARCHIVED.toISOString(),
      createdAt: CREATED.toISOString(),
      updatedAt: UPDATED.toISOString(),
    });
    expect("tenantId" in workspace.project).toBe(false);
    expect(workspace.stages).toEqual([
      {
        id: "stage-intake_package_review",
        stageId: "intake_package_review",
        order: 10,
        status: "approved",
        createdAt: CREATED.toISOString(),
        updatedAt: UPDATED.toISOString(),
      },
      {
        id: "stage-boq_format_validation",
        stageId: "boq_format_validation",
        order: 20,
        status: "in_progress",
        createdAt: CREATED.toISOString(),
        updatedAt: UPDATED.toISOString(),
      },
    ]);
  });

  it("returns artifact summaries and spine artifacts without payloads or file paths", async () => {
    mockListProjectArtifacts.mockResolvedValue([
      artifact("normalized_boq", 1, "generated"),
      artifact("sku_resolution", 1, "approved"),
      artifact("sku_resolution", 2, "approved", {
        sourceFileIds: ["boq-1", "boq-2"],
        sourceArtifactIds: ["normalized_boq-v1"],
      }),
      artifact("configuration_expansion", 1, "approved"),
      artifact("priced_boq", 1, "approved"),
      artifact("export_package", 1, "approved"),
    ]);

    const { workspace } = await ok();

    expect(workspace.artifacts).toHaveLength(6);
    for (const summary of workspace.artifacts) {
      expect("payload" in summary).toBe(false);
      expect("filePath" in summary).toBe(false);
    }
    expect(workspace.spineArtifacts.sku_resolution).toMatchObject({
      id: "sku_resolution-v2",
      type: "sku_resolution",
      version: 2,
      status: "approved",
      sourceFileIds: ["boq-1", "boq-2"],
      sourceArtifactIds: ["normalized_boq-v1"],
    });
    expect(workspace.spineArtifacts.export_package).toMatchObject({
      id: "export_package-v1",
      type: "export_package",
      status: "approved",
    });
    expect("payload" in workspace.spineArtifacts.sku_resolution!).toBe(false);
    expect("filePath" in workspace.spineArtifacts.export_package!).toBe(false);
    expect(JSON.stringify(workspace)).not.toContain("payload-sku_resolution");
    expect(JSON.stringify(workspace)).not.toContain("C:/secret");
  });

  it("returns approval summaries with ISO dates", async () => {
    const { workspace } = await ok();

    expect(workspace.approvals).toEqual([
      {
        id: "approval-1",
        stageId: "sku_resolution",
        artifactId: "sku_resolution-v2",
        artifactVersion: 2,
        decision: "approved",
        decidedBy: "engineer-1",
        decidedAt: APPROVED_AT.toISOString(),
        note: "ready",
      },
    ]);
  });

  it("uses the real RFP BoQ readiness helper over loaded files/artifacts and omits storagePath", async () => {
    const { workspace } = await ok();

    expect(workspace.boqFiles).toEqual(workspace.readiness.boqFiles);
    expect(workspace.readiness.projectId).toBe(PROJECT);
    expect(workspace.readiness.boqFileCount).toBe(1);
    expect(workspace.readiness.boqFiles[0]).toMatchObject({
      id: "boq-1",
      projectId: PROJECT,
      fileRole: "boq",
      fileName: "boq-1.xlsx",
      roleCorrectedBy: "engineer-2",
    });
    expect(workspace.readiness.isCustomerDeliverableReady).toBe(true);
    expect(JSON.stringify(workspace)).not.toContain("storagePath");
    expect(JSON.stringify(workspace)).not.toContain("s3://bucket");
  });

  it("returns lean uploadedFiles across all roles without storage paths, retainUntil, or tenantId, and leaves boqFiles readiness unchanged", async () => {
    mockListProjectFiles.mockResolvedValue([
      BOQ_FILE,
      file("rfp-1", "rfp", { roleCorrectedBy: "engineer-3" }),
      file("sow-1", "scope_of_work"),
    ]);

    const { workspace } = await ok();

    expect(workspace.uploadedFiles).toEqual([
      {
        id: "boq-1",
        fileName: "boq-1.xlsx",
        fileRole: "boq",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 2048,
        uploadedAt: new Date("2026-06-01T00:00:00.000Z").toISOString(),
        roleCorrectedBy: "engineer-2",
      },
      {
        id: "rfp-1",
        fileName: "rfp-1.xlsx",
        fileRole: "rfp",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 2048,
        uploadedAt: new Date("2026-06-01T00:00:00.000Z").toISOString(),
        roleCorrectedBy: "engineer-3",
      },
      {
        id: "sow-1",
        fileName: "sow-1.xlsx",
        fileRole: "scope_of_work",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 2048,
        uploadedAt: new Date("2026-06-01T00:00:00.000Z").toISOString(),
      },
    ]);
    expect(workspace.uploadedFiles.map((f) => f.fileRole)).toEqual([
      "boq",
      "rfp",
      "scope_of_work",
    ]);
    for (const summary of workspace.uploadedFiles) {
      expect("storagePath" in summary).toBe(false);
      expect("retainUntil" in summary).toBe(false);
      expect("tenantId" in summary).toBe(false);
      expect("projectId" in summary).toBe(false);
    }
    // BoQ readiness is unchanged: still one BoQ file with its retainUntil-bearing summary.
    expect(workspace.boqFiles).toEqual(workspace.readiness.boqFiles);
    expect(workspace.readiness.boqFileCount).toBe(1);
    expect(workspace.readiness.boqFiles[0]).toMatchObject({
      id: "boq-1",
      fileRole: "boq",
    });
  });

  it("defensively copies arrays and nested project pricing config", async () => {
    const storedProject = project();
    const storedArtifact = artifact("sku_resolution", 1, "approved");
    const storedApproval = approval();
    const files = [BOQ_FILE];
    const artifacts = [storedArtifact];
    const approvals = [storedApproval];
    const projectSnapshot = structuredClone(storedProject);
    const filesSnapshot = structuredClone(files);
    const artifactsSnapshot = structuredClone(artifacts);
    const approvalsSnapshot = structuredClone(approvals);
    mockGetProjectById.mockResolvedValue(storedProject);
    mockListProjectFiles.mockResolvedValue(files);
    mockListProjectArtifacts.mockResolvedValue(artifacts);
    mockListProjectApprovals.mockResolvedValue(approvals);

    const { workspace } = await ok();

    expect(storedProject).toEqual(projectSnapshot);
    expect(files).toEqual(filesSnapshot);
    expect(artifacts).toEqual(artifactsSnapshot);
    expect(approvals).toEqual(approvalsSnapshot);
    expect(workspace.project.pricingConfig).not.toBe(storedProject.pricingConfig);
    expect(workspace.artifacts[0].sourceFileIds).not.toBe(storedArtifact.sourceFileIds);
    workspace.artifacts[0].sourceFileIds.push("mutated");
    expect(storedArtifact.sourceFileIds).toEqual(["boq-1"]);
  });

  it("ignores other-project files and artifacts via the readiness helper", async () => {
    mockListProjectFiles.mockResolvedValue([
      BOQ_FILE,
      file("boq-other", "boq", { projectId: OTHER_PROJECT }),
    ]);
    mockListProjectArtifacts.mockResolvedValue([
      artifact("normalized_boq", 1, "generated"),
      artifact("normalized_boq", 2, "stale", { projectId: OTHER_PROJECT }),
    ]);

    const { workspace } = await ok();

    expect(workspace.readiness.boqFileCount).toBe(1);
    expect(workspace.readiness.normalizationCandidateFileIds).toEqual(["boq-1"]);
    expect(workspace.readiness.status).toBe("quick_bom_in_progress");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-boq-workspace.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-boq-workspace.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the project stores, RFP BoQ readiness helper, and project types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms.sort()).toEqual([
      "@/lib/db/project-approval-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-file-store",
      "@/lib/db/project-store",
      "@/lib/projects/project-rfp-boq-readiness",
      "@/types/project",
    ]);
  });

  it("does not import route/UI, mutation, pricing/config/priced-boq/Mantle/export generation, runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/app',
      "next/server",
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/db/project-approval-store/create',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/honeywell',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/rfp-runner"',
      'from "@/lib/projects/project-quick-bom',
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
      "openai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("does not read or copy storage/file path fields into the workspace output", () => {
    expect(source).not.toMatch(/\.storagePath\b/);
    expect(source).not.toMatch(/\bstoragePath\s*:/);
    expect(source).not.toMatch(/\.filePath\b/);
    expect(source).not.toMatch(/\bfilePath\s*:/);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
