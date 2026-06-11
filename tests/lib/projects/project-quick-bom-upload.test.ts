import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectFile } from "@/types/project";

// Mock only the store + filesystem boundaries; keep the upload service real.
// node:os and node:crypto are partially mocked (real exports preserved) so the
// generated temp path is stable and fully assertable.
const {
  mockMkdir,
  mockWriteFile,
  mockRm,
  mockGetProjectById,
  mockCreateProjectFileRecord,
} = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
  mockRm: vi.fn(),
  mockGetProjectById: vi.fn(),
  mockCreateProjectFileRecord: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  rm: mockRm,
}));
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, tmpdir: () => "/tmp" };
});
vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof import("node:crypto")>(
    "node:crypto"
  );
  return { ...actual, randomUUID: () => "test-generated-id" };
});
vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-file-store", () => ({
  createProjectFileRecord: mockCreateProjectFileRecord,
}));

import {
  uploadQuickBomBoqFile,
  type UploadQuickBomBoqFileInput,
} from "@/lib/projects/project-quick-bom-upload";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const TMP = "/tmp";
const GEN_ID = "test-generated-id";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const UPLOADED = new Date("2026-06-07T09:00:00.000Z");
const RETAIN = new Date("2027-06-07T09:00:00.000Z");
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// A dirty filename: leading path segments must be stripped and the control
// character (built at runtime via String.fromCharCode so the source stays ASCII)
// replaced with "_", yielding SAFE_NAME.
const CONTROL_CHAR = String.fromCharCode(1);
const DIRTY_NAME = "sub/dir/Honeywell" + CONTROL_CHAR + "BoQ.xlsx";
const SAFE_NAME = "Honeywell_BoQ.xlsx";

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

// Echo the insert input back as a stored ProjectFile (id + dates stamped by the
// store), matching createProjectFileRecord's real shape (no tenantId surfaced).
function echoFileRecord(rec: {
  projectId: string;
  fileRole: ProjectFile["fileRole"];
  fileName: string;
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
}): ProjectFile {
  return {
    id: "file-1",
    projectId: rec.projectId,
    fileRole: rec.fileRole,
    fileName: rec.fileName,
    storagePath: rec.storagePath,
    ...(rec.mimeType !== undefined ? { mimeType: rec.mimeType } : {}),
    ...(rec.sizeBytes !== undefined ? { sizeBytes: rec.sizeBytes } : {}),
    uploadedAt: UPLOADED,
    retainUntil: RETAIN,
  };
}

function validInput(
  overrides: Partial<UploadQuickBomBoqFileInput> = {}
): UploadQuickBomBoqFileInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    fileName: "Honeywell_BoQ.xlsx",
    mimeType: XLSX_MIME,
    sizeBytes: 4,
    bytes: new Uint8Array([1, 2, 3, 4]),
    ...overrides,
  };
}

beforeEach(() => {
  mockMkdir.mockReset().mockResolvedValue(undefined);
  mockWriteFile.mockReset().mockResolvedValue(undefined);
  mockRm.mockReset().mockResolvedValue(undefined);
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockCreateProjectFileRecord
    .mockReset()
    .mockImplementation(async (rec) => echoFileRecord(rec));
});

describe("uploadQuickBomBoqFile - project verification", () => {
  it("returns not_found and does not mkdir/write/create a record when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await uploadQuickBomBoqFile(validInput());

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
  });

  it("returns a wrong_mode project summary (no tenantId) and does not mkdir/write/create a record for a non-quick_bom project", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({ mode: "rfp", name: "RFP Bid", customerName: undefined })
    );

    const result = await uploadQuickBomBoqFile(validInput());

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "RFP Bid",
      mode: "rfp",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect("customerName" in result.project).toBe(false);
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
  });
});

describe("uploadQuickBomBoqFile - file validation", () => {
  it("returns invalid_file (no write/record) for a blank filename", async () => {
    for (const fileName of ["", "   "]) {
      mockMkdir.mockClear();
      mockWriteFile.mockClear();
      mockCreateProjectFileRecord.mockClear();

      const result = await uploadQuickBomBoqFile(validInput({ fileName }));

      expect(result.status).toBe("invalid_file");
      expect(mockMkdir).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
    }
  });

  it("returns invalid_file (no write/record) for unsupported extensions .xls and .txt", async () => {
    for (const fileName of [
      "legacy.xls",
      "notes.txt",
      "no-extension",
      "data.csv.zip",
    ]) {
      mockMkdir.mockClear();
      mockWriteFile.mockClear();
      mockCreateProjectFileRecord.mockClear();

      const result = await uploadQuickBomBoqFile(validInput({ fileName }));

      expect(result.status).toBe("invalid_file");
      expect(mockMkdir).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
    }
  });

  it("returns invalid_file (no write/record) for an invalid size", async () => {
    const cases: Array<{ sizeBytes: number; bytes: Uint8Array }> = [
      { sizeBytes: -1, bytes: new Uint8Array([1, 2, 3, 4]) },
      { sizeBytes: 1.5, bytes: new Uint8Array([1, 2, 3, 4]) },
      { sizeBytes: Number.NaN, bytes: new Uint8Array([1, 2, 3, 4]) },
    ];
    for (const { sizeBytes, bytes } of cases) {
      mockMkdir.mockClear();
      mockWriteFile.mockClear();
      mockCreateProjectFileRecord.mockClear();

      const result = await uploadQuickBomBoqFile(
        validInput({ sizeBytes, bytes })
      );

      expect(result.status).toBe("invalid_file");
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
    }
  });

  it("rejects a zero-byte BoQ upload as invalid_file with no write/record", async () => {
    const result = await uploadQuickBomBoqFile(
      validInput({ sizeBytes: 0, bytes: new Uint8Array([]) })
    );

    expect(result.status).toBe("invalid_file");
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
  });

  it("returns invalid_file (no write/record) when bytes length does not match sizeBytes", async () => {
    const result = await uploadQuickBomBoqFile(
      validInput({ sizeBytes: 10, bytes: new Uint8Array([1, 2, 3, 4]) })
    );

    expect(result.status).toBe("invalid_file");
    if (result.status === "invalid_file") {
      expect(result.reason).toBe("size_mismatch");
    }
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
  });
});

describe("uploadQuickBomBoqFile - valid upload", () => {
  it("verifies the project first, sanitizes the filename, writes the exact bytes under a tenant/project temp path, records a boq row, and returns a serializable summary", async () => {
    const bytes = new Uint8Array([10, 20, 30, 40]);

    const result = await uploadQuickBomBoqFile(
      validInput({
        fileName: DIRTY_NAME,
        mimeType: XLSX_MIME,
        sizeBytes: 4,
        bytes,
      })
    );

    // Project verified before any filesystem work.
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockGetProjectById.mock.invocationCallOrder[0]).toBeLessThan(
      mockWriteFile.mock.invocationCallOrder[0]
    );

    const expectedDir = join(
      TMP,
      "bomatic-project-uploads",
      TENANT,
      PROJECT,
      GEN_ID
    );
    const expectedPath = join(expectedDir, SAFE_NAME);

    // Path carries every required component; separators/control chars sanitized.
    expect(expectedPath).toContain("bomatic-project-uploads");
    expect(expectedPath).toContain(TENANT);
    expect(expectedPath).toContain(PROJECT);
    expect(expectedPath).toContain(GEN_ID);
    expect(expectedPath).toContain(SAFE_NAME);
    expect(expectedPath).not.toContain(CONTROL_CHAR);
    expect(expectedPath).not.toContain("sub");

    // mkdir recursive, then write the exact bytes once.
    expect(mockMkdir).toHaveBeenCalledTimes(1);
    expect(mockMkdir).toHaveBeenCalledWith(expectedDir, { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).toHaveBeenCalledWith(expectedPath, bytes);
    expect(mockWriteFile.mock.calls[0][1]).toBe(bytes);

    // One project_files row with fileRole boq and the safe name/path.
    expect(mockCreateProjectFileRecord).toHaveBeenCalledTimes(1);
    expect(mockCreateProjectFileRecord).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      fileRole: "boq",
      fileName: SAFE_NAME,
      storagePath: expectedPath,
      mimeType: XLSX_MIME,
      sizeBytes: 4,
    });

    // Serializable summary: ISO dates, no tenantId.
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.file).toEqual({
      id: "file-1",
      projectId: PROJECT,
      fileRole: "boq",
      fileName: SAFE_NAME,
      storagePath: expectedPath,
      mimeType: XLSX_MIME,
      sizeBytes: 4,
      uploadedAt: UPLOADED.toISOString(),
      retainUntil: RETAIN.toISOString(),
    });
    expect("tenantId" in result.file).toBe(false);
    expect(typeof result.file.uploadedAt).toBe("string");
    expect(typeof result.file.retainUntil).toBe("string");
  });

  it("accepts a .csv upload and omits an absent mimeType from the record and summary", async () => {
    const result = await uploadQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileName: "prices.csv",
      sizeBytes: 3,
      bytes: new Uint8Array([7, 8, 9]),
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.file.fileName).toBe("prices.csv");
    expect(result.file.fileRole).toBe("boq");
    expect("mimeType" in result.file).toBe(false);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const recordArg = mockCreateProjectFileRecord.mock.calls[0][0];
    expect("mimeType" in recordArg).toBe(false);
  });
});

describe("uploadQuickBomBoqFile - record failure cleanup", () => {
  it("removes the stored file with force and rethrows when createProjectFileRecord fails after the write", async () => {
    const boom = new Error("insert failed");
    mockCreateProjectFileRecord.mockRejectedValue(boom);

    await expect(uploadQuickBomBoqFile(validInput())).rejects.toBe(boom);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writtenPath = mockWriteFile.mock.calls[0][0];
    expect(mockRm).toHaveBeenCalledTimes(1);
    expect(mockRm).toHaveBeenCalledWith(writtenPath, { force: true });
  });
});

describe("uploadQuickBomBoqFile - immutability", () => {
  it("does not mutate the input object or bytes", async () => {
    const input = validInput({
      fileName: DIRTY_NAME,
      sizeBytes: 4,
      bytes: new Uint8Array([9, 8, 7, 6]),
    });
    const snapshot = structuredClone(input);

    await uploadQuickBomBoqFile(input);

    expect(input).toEqual(snapshot);
    expect(Array.from(input.bytes)).toEqual([9, 8, 7, 6]);
    expect(input.fileName).toBe(DIRTY_NAME);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-quick-bom-upload.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-quick-bom-upload.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports the project store and project file store it needs", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/db/project-file-store"');
  });

  it("imports no BoQ loader/parser/normalizer, artifact/approval/evidence store, pricing, config expansion, mantle/export, runner, AI, catalog, coordinator, engine, or adapter module", () => {
    for (const forbidden of [
      'from "@/lib/projects/boq-file-loader"',
      'from "@/lib/projects/boq-formats"',
      'from "@/lib/projects/boq-normalization"',
      'from "@/lib/db/project-artifact-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-evidence-store"',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/config-expanded',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/catalog-lookup"',
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
