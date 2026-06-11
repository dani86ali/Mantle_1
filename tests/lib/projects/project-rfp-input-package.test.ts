import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectFile,
  ProjectFileRole,
} from "@/types/project";

// Mock only the three store boundaries; keep the input-package service real.
const {
  mockGetProjectById,
  mockListProjectFiles,
  mockCreateProjectArtifactVersion,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockListProjectFiles: vi.fn(),
  mockCreateProjectArtifactVersion: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-file-store", () => ({
  listProjectFiles: mockListProjectFiles,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  createProjectArtifactVersion: mockCreateProjectArtifactVersion,
}));

import {
  createRfpInputPackageDraft,
  type CreateRfpInputPackageDraftInput,
} from "@/lib/projects/project-rfp-input-package";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const UPLOADED_A = new Date("2026-06-07T09:00:00.000Z");
const UPLOADED_B = new Date("2026-06-07T10:15:00.000Z");
const RETAIN_A = new Date("2027-06-07T09:00:00.000Z");
const RETAIN_B = new Date("2027-06-07T10:15:00.000Z");
const CREATED = new Date("2026-06-08T12:00:00.000Z");
const EMPTY_ROLE_COUNTS = {
  rfp: 0,
  boq: 0,
  scope_of_work: 0,
  compliance: 0,
  addendum: 0,
  other: 0,
};

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP Bid",
    customerName: "STC",
    mode: "rfp",
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

function makeFile(
  id: string,
  fileRole: ProjectFileRole,
  overrides: Partial<ProjectFile> = {}
): ProjectFile {
  return {
    id,
    projectId: PROJECT,
    fileRole,
    fileName: id + ".pdf",
    storagePath: "/tmp/bomatic-project-uploads/" + id + ".pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    uploadedAt: UPLOADED_A,
    retainUntil: RETAIN_A,
    ...overrides,
  };
}

// Echo the create input back as a stored ProjectArtifact (id/version/dates
// stamped by the store), matching createProjectArtifactVersion's real shape.
function echoArtifact(input: {
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  payload: Record<string, unknown>;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
}): ProjectArtifact {
  return {
    id: "artifact-1",
    projectId: input.projectId,
    stageId: input.stageId,
    type: input.type,
    status: input.status,
    version: 1,
    payload: input.payload,
    sourceFileIds: input.sourceFileIds,
    sourceArtifactIds: input.sourceArtifactIds,
    createdAt: CREATED,
    updatedAt: CREATED,
  };
}

function draftInput(): CreateRfpInputPackageDraftInput {
  return { tenantId: TENANT, projectId: PROJECT };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockListProjectFiles
    .mockReset()
    .mockResolvedValue([makeFile("file-rfp-1", "rfp")]);
  mockCreateProjectArtifactVersion
    .mockReset()
    .mockImplementation(async (arg) => echoArtifact(arg));
});

describe("createRfpInputPackageDraft - project verification", () => {
  it("returns not_found and never lists files or creates an artifact when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await createRfpInputPackageDraft(draftInput());

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockListProjectFiles).not.toHaveBeenCalled();
    expect(mockCreateProjectArtifactVersion).not.toHaveBeenCalled();
  });

  it("returns a wrong_mode lean summary (no tenantId) and never lists files or creates an artifact for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({
        mode: "quick_bom",
        name: "Honeywell Quick BoM",
        customerName: undefined,
      })
    );

    const result = await createRfpInputPackageDraft(draftInput());

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "Honeywell Quick BoM",
      mode: "quick_bom",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect("customerName" in result.project).toBe(false);
    expect(mockListProjectFiles).not.toHaveBeenCalled();
    expect(mockCreateProjectArtifactVersion).not.toHaveBeenCalled();
  });
});

describe("createRfpInputPackageDraft - file preconditions", () => {
  it("returns no_files and creates no artifact when the project has no recorded files", async () => {
    mockListProjectFiles.mockResolvedValue([]);

    const result = await createRfpInputPackageDraft(draftInput());

    expect(result).toEqual({ status: "no_files" });
    expect(mockListProjectFiles).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockCreateProjectArtifactVersion).not.toHaveBeenCalled();
  });

  it("returns missing_rfp_file and creates no artifact when no recorded file has the rfp role", async () => {
    mockListProjectFiles.mockResolvedValue([
      makeFile("file-boq-1", "boq"),
      makeFile("file-sow-1", "scope_of_work"),
      makeFile("file-other-1", "other"),
    ]);

    const result = await createRfpInputPackageDraft(draftInput());

    expect(result).toEqual({ status: "missing_rfp_file" });
    expect(mockCreateProjectArtifactVersion).not.toHaveBeenCalled();
  });
});

describe("createRfpInputPackageDraft - draft creation", () => {
  it("creates exactly one needs_review input_package version for intake_package_review with every file id in store order and no source artifacts", async () => {
    mockListProjectFiles.mockResolvedValue([
      makeFile("file-rfp-1", "rfp"),
      makeFile("file-boq-1", "boq", { fileName: "boq.xlsx" }),
    ]);

    const result = await createRfpInputPackageDraft(draftInput());

    expect(result.status).toBe("ok");
    expect(mockCreateProjectArtifactVersion).toHaveBeenCalledTimes(1);
    const arg = mockCreateProjectArtifactVersion.mock.calls[0][0];
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.stageId).toBe("intake_package_review");
    expect(arg.type).toBe("input_package");
    expect(arg.status).toBe("needs_review");
    expect(arg.sourceFileIds).toEqual(["file-rfp-1", "file-boq-1"]);
    expect(arg.sourceArtifactIds).toEqual([]);
  });

  it("builds the payload from file record metadata only: marker, counts, per-file metadata with ISO dates, no storagePath", async () => {
    mockListProjectFiles.mockResolvedValue([
      makeFile("file-rfp-1", "rfp", { fileName: "STC_RFP.pdf" }),
      makeFile("file-boq-1", "boq", {
        fileName: "boq.xlsx",
        mimeType: undefined,
        sizeBytes: undefined,
        uploadedAt: UPLOADED_B,
        retainUntil: RETAIN_B,
        roleCorrectedBy: "u-engineer",
      }),
    ]);

    await createRfpInputPackageDraft(draftInput());

    const payload = mockCreateProjectArtifactVersion.mock.calls[0][0].payload;
    expect(payload.payloadKind).toBe("rfp_input_package");
    expect(payload.fileCount).toBe(2);
    expect(payload.roleCounts).toEqual({
      ...EMPTY_ROLE_COUNTS,
      rfp: 1,
      boq: 1,
    });
    expect(payload.warnings).toEqual([]);
    expect(payload.files).toEqual([
      {
        fileId: "file-rfp-1",
        fileRole: "rfp",
        fileName: "STC_RFP.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        uploadedAt: UPLOADED_A.toISOString(),
        retainUntil: RETAIN_A.toISOString(),
      },
      {
        fileId: "file-boq-1",
        fileRole: "boq",
        fileName: "boq.xlsx",
        uploadedAt: UPLOADED_B.toISOString(),
        retainUntil: RETAIN_B.toISOString(),
        roleCorrectedBy: "u-engineer",
      },
    ]);
    // Absent optionals are omitted keys, not undefined values.
    expect("mimeType" in payload.files[1]).toBe(false);
    expect("sizeBytes" in payload.files[1]).toBe(false);
    expect("roleCorrectedBy" in payload.files[0]).toBe(false);
    const json = JSON.stringify(payload);
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain("/tmp/");
  });

  it("warns boq_file_not_present in payload and summary but still creates the draft when an rfp file exists without a boq", async () => {
    mockListProjectFiles.mockResolvedValue([makeFile("file-rfp-1", "rfp")]);

    const result = await createRfpInputPackageDraft(draftInput());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(mockCreateProjectArtifactVersion).toHaveBeenCalledTimes(1);
    const payload = mockCreateProjectArtifactVersion.mock.calls[0][0].payload;
    expect(payload.warnings).toEqual(["boq_file_not_present"]);
    expect(payload.roleCounts.boq).toBe(0);
    expect(result.payloadSummary.warnings).toEqual(["boq_file_not_present"]);
  });

  it("allows multiple rfp and addendum files and includes them all in store order", async () => {
    mockListProjectFiles.mockResolvedValue([
      makeFile("file-rfp-1", "rfp"),
      makeFile("file-addendum-1", "addendum"),
      makeFile("file-rfp-2", "rfp"),
      makeFile("file-addendum-2", "addendum"),
    ]);

    const result = await createRfpInputPackageDraft(draftInput());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const arg = mockCreateProjectArtifactVersion.mock.calls[0][0];
    expect(arg.sourceFileIds).toEqual([
      "file-rfp-1",
      "file-addendum-1",
      "file-rfp-2",
      "file-addendum-2",
    ]);
    expect(arg.payload.fileCount).toBe(4);
    expect(arg.payload.roleCounts).toEqual({
      ...EMPTY_ROLE_COUNTS,
      rfp: 2,
      addendum: 2,
    });
    expect(arg.payload.warnings).toEqual(["boq_file_not_present"]);
    expect(result.payloadSummary.fileCount).toBe(4);
  });
});

describe("createRfpInputPackageDraft - returned summaries", () => {
  it("returns lean serializable summaries: ISO strings, no tenantId, no storage paths, copied arrays", async () => {
    mockListProjectFiles.mockResolvedValue([
      makeFile("file-rfp-1", "rfp"),
      makeFile("file-boq-1", "boq"),
    ]);

    const result = await createRfpInputPackageDraft(draftInput());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");

    expect(result.artifact).toEqual({
      id: "artifact-1",
      projectId: PROJECT,
      stageId: "intake_package_review",
      type: "input_package",
      status: "needs_review",
      version: 1,
      sourceFileIds: ["file-rfp-1", "file-boq-1"],
      sourceArtifactIds: [],
      createdAt: CREATED.toISOString(),
      updatedAt: CREATED.toISOString(),
    });
    expect(result.payloadSummary).toEqual({
      payloadKind: "rfp_input_package",
      fileCount: 2,
      roleCounts: { ...EMPTY_ROLE_COUNTS, rfp: 1, boq: 1 },
      warnings: [],
    });

    // Serializable end to end; tenant and storage details never surface.
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain("/tmp/");
    expect("tenantId" in result.artifact).toBe(false);

    // Arrays are copies, not aliases of the stored artifact or its payload.
    const stored = await mockCreateProjectArtifactVersion.mock.results[0].value;
    expect(result.artifact.sourceFileIds).toEqual(stored.sourceFileIds);
    expect(result.artifact.sourceFileIds).not.toBe(stored.sourceFileIds);
    expect(result.artifact.sourceArtifactIds).not.toBe(
      stored.sourceArtifactIds
    );
    const payload = mockCreateProjectArtifactVersion.mock.calls[0][0].payload;
    expect(result.payloadSummary.roleCounts).not.toBe(payload.roleCounts);
    expect(result.payloadSummary.warnings).not.toBe(payload.warnings);
  });
});

describe("createRfpInputPackageDraft - immutability", () => {
  it("does not mutate the input or the listed file records", async () => {
    const files = [
      makeFile("file-rfp-1", "rfp"),
      makeFile("file-boq-1", "boq"),
    ];
    const filesSnapshot = structuredClone(files);
    mockListProjectFiles.mockResolvedValue(files);
    const input = draftInput();
    const inputSnapshot = structuredClone(input);

    await createRfpInputPackageDraft(input);

    expect(input).toEqual(inputSnapshot);
    expect(files).toEqual(filesSnapshot);
    expect(files.map((file) => file.id)).toEqual(["file-rfp-1", "file-boq-1"]);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-input-package.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-input-package.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project store, project file store, artifact store, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-file-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
    ]);
  });

  it("imports no filesystem, sibling helper, approval/evidence store, export, runner, AI, catalog, coordinator, engine, or adapter module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/projects/',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-evidence-store"',
      "createProjectApproval",
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
      "@google/generative-ai",
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
