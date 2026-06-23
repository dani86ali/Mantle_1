import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

// Mock the composed boundaries: project store, file store, artifact store. The pure
// readiness report runs for real over the mocked artifacts/files.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-file-store", () => ({ listProjectFiles: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  createProjectArtifactVersion: vi.fn(),
  listProjectArtifacts: vi.fn(),
}));

import * as serviceModule from "@/lib/projects/project-rfp-hld-readiness-snapshot";
import {
  createRfpHldReadinessSnapshotDraft,
  type CreateRfpHldReadinessSnapshotDraftInput,
} from "@/lib/projects/project-rfp-hld-readiness-snapshot";
import { getProjectById } from "@/lib/db/project-store";
import { listProjectFiles } from "@/lib/db/project-file-store";
import {
  createProjectArtifactVersion,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";

const getProjectMock = vi.mocked(getProjectById);
const listFilesMock = vi.mocked(listProjectFiles);
const listArtifactsMock = vi.mocked(listProjectArtifacts);
const createMock = vi.mocked(createProjectArtifactVersion);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const CREATED_BY = "engineer-1";
const ARTIFACT_ID = "art-snapshot-1";

const TS = new Date("2026-06-12T00:00:00.000Z");
const FIXED_CREATED = new Date("2026-06-22T09:15:00.000Z");
const ART_CREATED = new Date("2026-06-22T09:15:01.000Z");
const ART_UPDATED = new Date("2026-06-22T09:15:02.000Z");

const STAGE_BY_TYPE: Partial<Record<ProjectArtifactType, ProjectStageId>> = {
  evidence_package: "intake_package_review",
  requirements_baseline: "requirements_baseline_review",
  compliance_matrix: "compliance_matrix_review",
  configuration_expansion: "configuration_expansion_review",
  hld_intake: "hld_design_delta_review",
};

function artifact(
  type: ProjectArtifactType,
  version: number,
  status: ProjectArtifactStatus,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: `${type}-v${version}`,
    projectId: PROJECT,
    stageId: STAGE_BY_TYPE[type] ?? "hld_design_delta_review",
    type,
    status,
    version,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function readyArtifacts(): ProjectArtifact[] {
  return [
    artifact("evidence_package", 1, "approved"),
    artifact("requirements_baseline", 1, "approved"),
    artifact("compliance_matrix", 1, "approved"),
    artifact("configuration_expansion", 1, "approved", {
      payload: { payloadKind: "rfp_no_boq_service_only_exception", reason: "Services only" },
    }),
    artifact("hld_intake", 1, "approved", {
      payload: {
        payloadKind: "rfp_hld_intake",
        answers: [
          { fieldId: "resiliency_expectations", label: "Resiliency expectations", status: "unknown", notes: "awaiting customer" },
        ],
      },
    }),
  ];
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Acme RFP Bid",
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

function makeCreatedArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_readiness_snapshot",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: ART_CREATED,
    updatedAt: ART_UPDATED,
    ...overrides,
  };
}

function input(
  overrides: Partial<CreateRfpHldReadinessSnapshotDraftInput> = {}
): CreateRfpHldReadinessSnapshotDraftInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    createdBy: CREATED_BY,
    createdAt: FIXED_CREATED,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(makeProject());
  listFilesMock.mockResolvedValue([]);
  listArtifactsMock.mockResolvedValue(readyArtifacts());
  createMock.mockResolvedValue(makeCreatedArtifact());
});

describe("createRfpHldReadinessSnapshotDraft - validation before any store call", () => {
  it("rejects a blank projectId before touching the stores", async () => {
    await expect(createRfpHldReadinessSnapshotDraft(input({ projectId: "   " }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a blank createdBy before touching the stores", async () => {
    await expect(createRfpHldReadinessSnapshotDraft(input({ createdBy: "  " }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createRfpHldReadinessSnapshotDraft - project gates", () => {
  it("returns not_found and never writes when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await createRfpHldReadinessSnapshotDraft(input());

    expect(result).toEqual({ status: "not_found" });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and never writes for a non-rfp project", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "quick_bom", name: "Quick BoM" }));

    const result = await createRfpHldReadinessSnapshotDraft(input());

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createRfpHldReadinessSnapshotDraft - blocked readiness", () => {
  it("returns blocked with the readiness report and writes nothing", async () => {
    listArtifactsMock.mockResolvedValue([artifact("evidence_package", 1, "approved")]);

    const result = await createRfpHldReadinessSnapshotDraft(input());

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("unreachable");
    expect(result.readiness.canCreateReadinessSnapshot).toBe(false);
    expect(result.readiness.missingInputs.length).toBeGreaterThan(0);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createRfpHldReadinessSnapshotDraft - ready creation", () => {
  it("writes exactly one needs_review hld_readiness_snapshot on hld_design_delta_review", async () => {
    await createRfpHldReadinessSnapshotDraft(input());

    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.stageId).toBe("hld_design_delta_review");
    expect(arg.type).toBe("hld_readiness_snapshot");
    expect(arg.status).toBe("needs_review");
    expect(arg.sourceFileIds).toEqual([]);
    expect(arg.sourceArtifactIds).toEqual([
      "evidence_package-v1",
      "requirements_baseline-v1",
      "compliance_matrix-v1",
      "configuration_expansion-v1",
      "hld_intake-v1",
    ]);
  });

  it("verifies the project before listing artifacts and writing", async () => {
    await createRfpHldReadinessSnapshotDraft(input());

    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      listArtifactsMock.mock.invocationCallOrder[0]
    );
    expect(listArtifactsMock.mock.invocationCallOrder[0]).toBeLessThan(
      createMock.mock.invocationCallOrder[0]
    );
  });

  it("persists a reviewable, deterministic payload with no raw paths or text dumps", async () => {
    await createRfpHldReadinessSnapshotDraft(input());

    const payload = createMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.payloadKind).toBe("rfp_hld_readiness_snapshot");
    expect(payload.createdBy).toBe(CREATED_BY);
    expect(payload.createdAt).toBe(FIXED_CREATED.toISOString());
    expect(payload.readinessStatus).toBe("ready");
    expect(payload.assumptions).toEqual([
      {
        fieldId: "resiliency_expectations",
        label: "Resiliency expectations",
        status: "unknown",
        note: "awaiting customer",
      },
    ]);
    expect(payload.missingInputs).toEqual([]);
    expect(Array.isArray(payload.coveredDomains)).toBe(true);
    expect(Array.isArray(payload.validationMessages)).toBe(true);

    const json = JSON.stringify(payload);
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain("s3://");
  });

  it("returns lean summaries (no full payload body) plus the readiness report", async () => {
    const result = await createRfpHldReadinessSnapshotDraft(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect(result.artifact.type).toBe("hld_readiness_snapshot");
    expect(result.payloadSummary).toEqual({
      payloadKind: "rfp_hld_readiness_snapshot",
      createdBy: CREATED_BY,
      createdAt: FIXED_CREATED.toISOString(),
      readinessStatus: "ready",
      sourceArtifactCount: 5,
      assumptionCount: 1,
    });
    expect(result.readiness.status).toBe("ready");
  });

  it("bubbles a store error from the artifact write", async () => {
    const boom = new Error("store boom");
    createMock.mockRejectedValue(boom);

    await expect(createRfpHldReadinessSnapshotDraft(input())).rejects.toBe(boom);
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-readiness-snapshot.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-readiness-snapshot.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");
  const importLines = source.split("\n").filter((l) => /^\s*import\b/.test(l));
  const joinedImports = importLines.join("\n");

  it("imports only the project/file/artifact stores, the readiness report, and canonical types", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/db/project-file-store"');
    expect(source).toContain('from "@/lib/db/project-artifact-store"');
    expect(source).toContain('from "@/lib/projects/project-rfp-hld-readiness"');
    expect(source).toContain('from "@/types/project"');
  });

  it("does not import fs/path, pricing/sku/catalog/config authority, AI/provider, or Next/React/app", () => {
    for (const forbidden of [
      "node:fs",
      "node:path",
      "@/lib/projects/pricing",
      "@/lib/projects/priced-boq",
      "@/lib/projects/sku-",
      "catalog",
      "config-expansion",
      "@/lib/adapters",
      "@/lib/agent",
      "@/lib/ai",
      "@/lib/llm",
      "@/coordinator",
      "@/engines",
      "@/app",
      "@/components",
      "next/server",
      "react",
      "anthropic",
      "openai",
      "@google/generative-ai",
    ]) {
      expect(joinedImports).not.toContain(forbidden);
    }
  });

  it("exposes the creation service and payload kind as runtime exports", () => {
    expect(Object.keys(serviceModule).sort()).toEqual(
      ["RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND", "createRfpHldReadinessSnapshotDraft"].sort()
    );
    expect(serviceModule.RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND).toBe("rfp_hld_readiness_snapshot");
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
