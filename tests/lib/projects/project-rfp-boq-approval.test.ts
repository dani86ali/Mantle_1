import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReviewProjectBoqArtifactCoreResult } from "@/lib/projects/project-boq-approval-core";
import type { ProjectArtifact, ProjectFile } from "@/types/project";

const {
  mockReviewProjectBoqArtifact,
  mockListProjectFiles,
  mockListProjectArtifacts,
} = vi.hoisted(() => ({
  mockReviewProjectBoqArtifact: vi.fn(),
  mockListProjectFiles: vi.fn(),
  mockListProjectArtifacts: vi.fn(),
}));

// Mock the shared core (so the wrapper never hits the DB) and the two stores the
// injected loader uses. The pure RFP BoQ readiness helper is left REAL so the
// loader test exercises its real, storagePath-free output.
vi.mock("@/lib/projects/project-boq-approval-core", () => ({
  reviewProjectBoqArtifact: mockReviewProjectBoqArtifact,
}));

vi.mock("@/lib/db/project-file-store", () => ({
  listProjectFiles: mockListProjectFiles,
}));

vi.mock("@/lib/db/project-artifact-store", () => ({
  listProjectArtifacts: mockListProjectArtifacts,
}));

import {
  reviewProjectRfpBoqArtifact,
  type ProjectRfpBoqWorkspaceResult,
  type ReviewProjectRfpBoqArtifactInput,
  type ReviewProjectRfpBoqArtifactResult,
} from "@/lib/projects/project-rfp-boq-approval";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const ARTIFACT = "sku_resolution-v2";
const DECIDER = "engineer-7";
const DECIDED_AT = new Date("2026-06-03T09:00:00.000Z");

const OK_RESULT = {
  status: "ok",
  approval: {
    id: "approval-1",
    projectId: PROJECT,
    stageId: "sku_resolution",
    artifactId: ARTIFACT,
    artifactVersion: 2,
    decision: "approved",
    decidedBy: DECIDER,
    decidedAt: DECIDED_AT,
  },
  artifactStatus: "approved",
  stageStatus: "approved",
  workspace: { readiness: { projectId: PROJECT } },
} as unknown as ReviewProjectBoqArtifactCoreResult<ProjectRfpBoqWorkspaceResult>;

function input(
  overrides: Partial<ReviewProjectRfpBoqArtifactInput> = {}
): ReviewProjectRfpBoqArtifactInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: ARTIFACT,
    decision: "approved",
    decidedBy: DECIDER,
    decidedAt: DECIDED_AT,
    note: "ready",
    allowedArtifactTypes: ["priced_boq"],
    ...overrides,
  };
}

function boqFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    id: "boq-1",
    projectId: PROJECT,
    fileRole: "boq",
    fileName: "boq-1.xlsx",
    storagePath: "s3://bucket/boq-1",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 2048,
    uploadedAt: new Date("2026-06-01T00:00:00.000Z"),
    retainUntil: new Date("2027-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

function normalizedArtifact(): ProjectArtifact {
  const ts = new Date("2026-06-04T00:00:00.000Z");
  return {
    id: "normalized_boq-v1",
    projectId: PROJECT,
    stageId: "boq_format_validation",
    type: "normalized_boq",
    status: "generated",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

beforeEach(() => {
  mockReviewProjectBoqArtifact.mockReset().mockResolvedValue(OK_RESULT);
  mockListProjectFiles.mockReset().mockResolvedValue([]);
  mockListProjectArtifacts.mockReset().mockResolvedValue([]);
});

describe("reviewProjectRfpBoqArtifact", () => {
  it("passes all caller input through and pins expectedMode to rfp", async () => {
    const request = input({ decision: "rejected", note: "fix scope" });

    await reviewProjectRfpBoqArtifact(request);

    expect(mockReviewProjectBoqArtifact).toHaveBeenCalledTimes(1);
    const arg = mockReviewProjectBoqArtifact.mock.calls[0][0];
    expect(arg).toMatchObject({ ...request, expectedMode: "rfp" });
    // Every caller field is forwarded verbatim (no silent drops).
    expect(arg.tenantId).toBe(request.tenantId);
    expect(arg.projectId).toBe(request.projectId);
    expect(arg.artifactId).toBe(request.artifactId);
    expect(arg.decision).toBe("rejected");
    expect(arg.decidedBy).toBe(request.decidedBy);
    expect(arg.decidedAt).toBe(DECIDED_AT);
    expect(arg.note).toBe("fix scope");
    expect(arg.allowedArtifactTypes).toEqual(["priced_boq"]);
  });

  it("injects a workspace loader function without calling the stores in the wrapper", async () => {
    await reviewProjectRfpBoqArtifact(input());

    const arg = mockReviewProjectBoqArtifact.mock.calls[0][0];
    expect(typeof arg.loadWorkspace).toBe("function");
    expect(mockListProjectFiles).not.toHaveBeenCalled();
    expect(mockListProjectArtifacts).not.toHaveBeenCalled();
  });

  it("returns the shared core result unchanged", async () => {
    const result: ReviewProjectRfpBoqArtifactResult =
      await reviewProjectRfpBoqArtifact(input());

    expect(result).toBe(OK_RESULT);
  });
});

describe("injected RFP BoQ workspace loader", () => {
  async function captureLoader(): Promise<
    (tenantId: string, projectId: string) => Promise<ProjectRfpBoqWorkspaceResult>
  > {
    await reviewProjectRfpBoqArtifact(input());
    return mockReviewProjectBoqArtifact.mock.calls[0][0].loadWorkspace;
  }

  it("lists files and artifacts tenant-scoped and returns readiness from getRfpBoqReadinessReport", async () => {
    mockListProjectFiles.mockResolvedValue([boqFile(), boqFile({ id: "rfp-1", fileRole: "rfp" })]);
    mockListProjectArtifacts.mockResolvedValue([normalizedArtifact()]);

    const loader = await captureLoader();
    const workspace = await loader(TENANT, PROJECT);

    expect(mockListProjectFiles).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockListProjectArtifacts).toHaveBeenCalledWith(TENANT, PROJECT);
    // The real readiness helper ran over the loaded files/artifacts.
    expect(workspace.readiness.projectId).toBe(PROJECT);
    expect(workspace.readiness.boqFileCount).toBe(1);
    expect(workspace.readiness.boqFiles[0].id).toBe("boq-1");
    expect(workspace.readiness.boqFiles[0].fileRole).toBe("boq");
  });

  it("does not leak storagePath into the returned BoQ file summaries", async () => {
    mockListProjectFiles.mockResolvedValue([boqFile()]);
    mockListProjectArtifacts.mockResolvedValue([]);

    const loader = await captureLoader();
    const workspace = await loader(TENANT, PROJECT);

    expect("storagePath" in workspace.readiness.boqFiles[0]).toBe(false);
    expect(JSON.stringify(workspace)).not.toContain("storagePath");
    expect(JSON.stringify(workspace)).not.toContain("s3://");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-boq-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-boq-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the shared core, the RFP readiness helper, and the file/artifact stores", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms.sort()).toEqual([
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-file-store",
      "@/lib/projects/project-boq-approval-core",
      "@/lib/projects/project-rfp-boq-readiness",
    ]);
  });

  it("does not import the approval mutation, pricing, export, config-expansion, runner, AI, catalog, engine, coordinator, adapter, route, or Quick BoM modules", () => {
    for (const forbidden of [
      "createProjectApproval",
      "createProjectArtifactVersion",
      'from "@/lib/db/project-approval-store',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/project-quick-bom',
      'from "@/lib/projects/honeywell',
      'from "@/lib/projects/export',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/app',
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
