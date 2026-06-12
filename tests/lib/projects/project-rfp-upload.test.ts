import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectFile, ProjectFileRole } from "@/types/project";

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
  suggestRfpProjectFileRoleFromFileName,
  uploadRfpProjectFile,
  validateRfpProjectFileNameRoleLock,
  type UploadRfpProjectFileInput,
} from "@/lib/projects/project-rfp-upload";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const TMP = "/tmp";
const GEN_ID = "test-generated-id";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const UPLOADED = new Date("2026-06-07T09:00:00.000Z");
const RETAIN = new Date("2027-06-07T09:00:00.000Z");
const PDF_MIME = "application/pdf";

// A dirty filename: leading path segments must be stripped and the control
// character (built at runtime via String.fromCharCode so the source stays
// ASCII) replaced with "_", yielding SAFE_NAME.
const CONTROL_CHAR = String.fromCharCode(1);
const DIRTY_NAME = "sub/dir/STC" + CONTROL_CHAR + "RFP.pdf";
const SAFE_NAME = "STC_RFP.pdf";

function existingFile(fileRole: ProjectFileRole): ProjectFile {
  return {
    id: "file-existing",
    projectId: PROJECT,
    fileRole,
    fileName: "existing.pdf",
    storagePath: "/tmp/existing.pdf",
    uploadedAt: UPLOADED,
    retainUntil: RETAIN,
  };
}

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
  overrides: Partial<UploadRfpProjectFileInput> = {}
): UploadRfpProjectFileInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    fileName: "STC_RFP.pdf",
    fileRole: "rfp",
    mimeType: PDF_MIME,
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

describe("uploadRfpProjectFile - project verification", () => {
  it("returns not_found and does not mkdir/write/create a record when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await uploadRfpProjectFile(validInput());

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
  });

  it("returns a wrong_mode project summary (no tenantId) and does not mkdir/write/create a record for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({
        mode: "quick_bom",
        name: "Honeywell Quick BoM",
        customerName: undefined,
      })
    );

    const result = await uploadRfpProjectFile(validInput());

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
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
  });
});

describe("uploadRfpProjectFile - file validation", () => {
  it("returns invalid_file (no write/record) for a blank filename", async () => {
    for (const fileName of ["", "   "]) {
      mockMkdir.mockClear();
      mockWriteFile.mockClear();
      mockCreateProjectFileRecord.mockClear();

      const result = await uploadRfpProjectFile(validInput({ fileName }));

      expect(result.status).toBe("invalid_file");
      expect(mockMkdir).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
    }
  });

  it("returns invalid_file (no write/record) for an unknown file role", async () => {
    for (const fileRole of ["", "RFP", "boq ", "input_package", "evidence"]) {
      mockMkdir.mockClear();
      mockWriteFile.mockClear();
      mockCreateProjectFileRecord.mockClear();

      const result = await uploadRfpProjectFile(
        validInput({ fileRole: fileRole as ProjectFileRole })
      );

      expect(result.status).toBe("invalid_file");
      if (result.status === "invalid_file") {
        expect(result.reason).toBe("invalid_role");
      }
      expect(mockMkdir).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
    }
  });

  it("returns invalid_file (no write/record) for unsupported extensions", async () => {
    for (const fileName of [
      "legacy.doc",
      "legacy.xls",
      "notes.txt",
      "no-extension",
      "data.csv.zip",
    ]) {
      mockMkdir.mockClear();
      mockWriteFile.mockClear();
      mockCreateProjectFileRecord.mockClear();

      const result = await uploadRfpProjectFile(validInput({ fileName }));

      expect(result.status).toBe("invalid_file");
      if (result.status === "invalid_file") {
        expect(result.reason).toBe("unsupported_extension");
      }
      expect(mockMkdir).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
    }
  });

  it("returns invalid_file (no write/record) for non-Uint8Array bytes", async () => {
    const result = await uploadRfpProjectFile(
      validInput({ bytes: [1, 2, 3, 4] as unknown as Uint8Array })
    );

    expect(result.status).toBe("invalid_file");
    if (result.status === "invalid_file") {
      expect(result.reason).toBe("invalid_bytes");
    }
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
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

      const result = await uploadRfpProjectFile(
        validInput({ sizeBytes, bytes })
      );

      expect(result.status).toBe("invalid_file");
      if (result.status === "invalid_file") {
        expect(result.reason).toBe("invalid_size");
      }
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
    }
  });

  it("rejects a zero-byte upload as invalid_file with no write/record", async () => {
    const result = await uploadRfpProjectFile(
      validInput({ sizeBytes: 0, bytes: new Uint8Array([]) })
    );

    expect(result.status).toBe("invalid_file");
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
  });

  it("returns invalid_file (no write/record) when bytes length does not match sizeBytes", async () => {
    const result = await uploadRfpProjectFile(
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

describe("suggestRfpProjectFileRoleFromFileName", () => {
  it("suggests the role for every token group, case-insensitively across separators", () => {
    const cases: Array<{ fileName: string; role: ProjectFileRole }> = [
      { fileName: "STC_RFP.pdf", role: "rfp" },
      { fileName: "Tender Documents.pdf", role: "rfp" },
      { fileName: "project-sow.docx", role: "scope_of_work" },
      { fileName: "scope.docx", role: "scope_of_work" },
      { fileName: "ScopeOfWork.pdf", role: "scope_of_work" },
      { fileName: "customer boq.xlsx", role: "boq" },
      { fileName: "BOM.csv", role: "boq" },
      { fileName: "compliance_matrix.xlsx", role: "compliance" },
      { fileName: "Matrix.xlsx", role: "compliance" },
      { fileName: "addendum-2.pdf", role: "addendum" },
      { fileName: "clarification_01.pdf", role: "addendum" },
      { fileName: "clarifications.pdf", role: "addendum" },
      { fileName: "Corrigendum No.3.pdf", role: "addendum" },
      { fileName: "vendor-proposal.docx", role: "other" },
      { fileName: "response.pdf", role: "other" },
      { fileName: "other_notes.docx", role: "other" },
    ];
    for (const { fileName, role } of cases) {
      expect(suggestRfpProjectFileRoleFromFileName(fileName)).toBe(role);
    }
  });

  it("suggests from the safe basename only (path segments and control chars stripped)", () => {
    expect(suggestRfpProjectFileRoleFromFileName("sub/dir/STC_RFP.pdf")).toBe(
      "rfp"
    );
    expect(suggestRfpProjectFileRoleFromFileName(DIRTY_NAME)).toBe("rfp");
  });

  it("returns null when no role token is present", () => {
    for (const fileName of ["misc.docx", "report.pdf", "Q3-2026.xlsx", ""]) {
      expect(suggestRfpProjectFileRoleFromFileName(fileName)).toBeNull();
    }
  });

  it("returns null when tokens for more than one role are present", () => {
    for (const fileName of [
      "rfp_boq.xlsx",
      "tender-scope.docx",
      "boq proposal.csv",
    ]) {
      expect(suggestRfpProjectFileRoleFromFileName(fileName)).toBeNull();
    }
  });
});

describe("validateRfpProjectFileNameRoleLock", () => {
  it("accepts a filename whose single detected role matches the explicit role", () => {
    const cases: Array<{ fileName: string; fileRole: ProjectFileRole }> = [
      { fileName: "STC_RFP.pdf", fileRole: "rfp" },
      { fileName: "project-sow.docx", fileRole: "scope_of_work" },
      { fileName: "customer boq.xlsx", fileRole: "boq" },
      { fileName: "compliance_matrix.xlsx", fileRole: "compliance" },
      { fileName: "clarification_01.pdf", fileRole: "addendum" },
      { fileName: "vendor-proposal.docx", fileRole: "other" },
    ];
    for (const { fileName, fileRole } of cases) {
      expect(validateRfpProjectFileNameRoleLock(fileName, fileRole)).toEqual({
        ok: true,
      });
    }
  });

  it("rejects a missing token, ambiguous roles, and a detected-role conflict", () => {
    expect(validateRfpProjectFileNameRoleLock("misc.docx", "other")).toEqual({
      ok: false,
      reason: "filename_role_token_missing",
    });
    expect(validateRfpProjectFileNameRoleLock("rfp_boq.xlsx", "boq")).toEqual({
      ok: false,
      reason: "ambiguous_filename_role",
    });
    expect(
      validateRfpProjectFileNameRoleLock("STC_RFP.pdf", "compliance")
    ).toEqual({ ok: false, reason: "filename_role_mismatch" });
  });
});

describe("uploadRfpProjectFile - filename role lock", () => {
  it("rejects a filename without a role token as filename_role_token_missing (no mkdir/write/record)", async () => {
    const result = await uploadRfpProjectFile(
      validInput({ fileName: "report.pdf", fileRole: "rfp" })
    );

    expect(result).toEqual({
      status: "invalid_file",
      reason: "filename_role_token_missing",
    });
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
  });

  it("rejects a filename naming two different roles as ambiguous_filename_role (no mkdir/write/record)", async () => {
    const result = await uploadRfpProjectFile(
      validInput({ fileName: "tender_compliance.pdf", fileRole: "rfp" })
    );

    expect(result).toEqual({
      status: "invalid_file",
      reason: "ambiguous_filename_role",
    });
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
  });

  it("rejects a detected role conflicting with the explicit fileRole as filename_role_mismatch (no mkdir/write/record)", async () => {
    const result = await uploadRfpProjectFile(
      validInput({ fileName: "customer boq.xlsx", fileRole: "rfp" })
    );

    expect(result).toEqual({
      status: "invalid_file",
      reason: "filename_role_mismatch",
    });
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
  });
});

describe("uploadRfpProjectFile - boq file type guard", () => {
  it("rejects boq uploads with non-workbook extensions as unsupported_boq_extension (no mkdir/write/record)", async () => {
    for (const fileName of ["customer boq.pdf", "BOM.docx"]) {
      mockMkdir.mockClear();
      mockWriteFile.mockClear();
      mockCreateProjectFileRecord.mockClear();

      const result = await uploadRfpProjectFile(
        validInput({ fileName, fileRole: "boq" })
      );

      expect(result).toEqual({
        status: "invalid_file",
        reason: "unsupported_boq_extension",
      });
      expect(mockMkdir).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockCreateProjectFileRecord).not.toHaveBeenCalled();
    }
  });

  it("accepts .xlsx and .csv boq uploads with a boq/bom token and records the explicit boq role", async () => {
    for (const fileName of ["customer boq.xlsx", "BOM.csv"]) {
      mockWriteFile.mockClear();
      mockCreateProjectFileRecord.mockClear();

      const result = await uploadRfpProjectFile(
        validInput({ fileName, fileRole: "boq" })
      );

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.file.fileName).toBe(fileName);
      expect(result.file.fileRole).toBe("boq");
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockCreateProjectFileRecord).toHaveBeenCalledTimes(1);
      expect(mockCreateProjectFileRecord.mock.calls[0][0].fileRole).toBe(
        "boq"
      );
    }
  });
});

describe("uploadRfpProjectFile - valid upload", () => {
  it("verifies the project first, sanitizes the filename, writes the exact bytes under a tenant/project temp path, records the explicit role, and returns a serializable summary", async () => {
    const bytes = new Uint8Array([10, 20, 30, 40]);

    const result = await uploadRfpProjectFile(
      validInput({
        fileName: DIRTY_NAME,
        fileRole: "rfp",
        mimeType: PDF_MIME,
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

    // One project_files row with the explicit role and the safe name/path.
    expect(mockCreateProjectFileRecord).toHaveBeenCalledTimes(1);
    expect(mockCreateProjectFileRecord).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      fileRole: "rfp",
      fileName: SAFE_NAME,
      storagePath: expectedPath,
      mimeType: PDF_MIME,
      sizeBytes: 4,
    });

    // Serializable summary: ISO dates, no tenantId.
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.file).toEqual({
      id: "file-1",
      projectId: PROJECT,
      fileRole: "rfp",
      fileName: SAFE_NAME,
      storagePath: expectedPath,
      mimeType: PDF_MIME,
      sizeBytes: 4,
      uploadedAt: UPLOADED.toISOString(),
      retainUntil: RETAIN.toISOString(),
    });
    expect("tenantId" in result.file).toBe(false);
    expect(typeof result.file.uploadedAt).toBe("string");
    expect(typeof result.file.retainUntil).toBe("string");
  });

  it("accepts every supported extension and records each explicit role for a role-locked filename", async () => {
    const cases: Array<{ fileName: string; fileRole: ProjectFileRole }> = [
      { fileName: "tender.pdf", fileRole: "rfp" },
      { fileName: "scope.docx", fileRole: "scope_of_work" },
      { fileName: "boq.xlsx", fileRole: "boq" },
      { fileName: "compliance.csv", fileRole: "compliance" },
      { fileName: "addendum-2.pdf", fileRole: "addendum" },
      { fileName: "vendor-proposal.docx", fileRole: "other" },
    ];
    for (const { fileName, fileRole } of cases) {
      mockWriteFile.mockClear();
      mockCreateProjectFileRecord.mockClear();

      const result = await uploadRfpProjectFile(
        validInput({ fileName, fileRole })
      );

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.file.fileName).toBe(fileName);
      expect(result.file.fileRole).toBe(fileRole);
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockCreateProjectFileRecord.mock.calls[0][0].fileRole).toBe(
        fileRole
      );
    }
  });

  it("accepts an uppercase extension and omits an absent mimeType from the record and summary", async () => {
    const result = await uploadRfpProjectFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileName: "TENDER.PDF",
      fileRole: "rfp",
      sizeBytes: 3,
      bytes: new Uint8Array([7, 8, 9]),
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.file.fileName).toBe("TENDER.PDF");
    expect("mimeType" in result.file).toBe(false);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const recordArg = mockCreateProjectFileRecord.mock.calls[0][0];
    expect("mimeType" in recordArg).toBe(false);
  });
});

describe("uploadRfpProjectFile - multiple files allowed", () => {
  it("accepts an upload with role rfp even when the project already has an rfp file, without reading existing files", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({ files: [existingFile("rfp")] })
    );

    const result = await uploadRfpProjectFile(validInput({ fileRole: "rfp" }));

    expect(result.status).toBe("ok");
    expect(mockCreateProjectFileRecord).toHaveBeenCalledTimes(1);
  });

  it("records two sequential uploads with the same role as two independent rows", async () => {
    const first = await uploadRfpProjectFile(
      validInput({ fileName: "addendum-1.pdf", fileRole: "addendum" })
    );
    const second = await uploadRfpProjectFile(
      validInput({ fileName: "addendum-2.pdf", fileRole: "addendum" })
    );

    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    expect(mockCreateProjectFileRecord).toHaveBeenCalledTimes(2);
    expect(mockCreateProjectFileRecord.mock.calls[0][0].fileRole).toBe(
      "addendum"
    );
    expect(mockCreateProjectFileRecord.mock.calls[1][0].fileRole).toBe(
      "addendum"
    );
  });
});

describe("uploadRfpProjectFile - record failure cleanup", () => {
  it("removes the stored file with force and rethrows when createProjectFileRecord fails after the write", async () => {
    const boom = new Error("insert failed");
    mockCreateProjectFileRecord.mockRejectedValue(boom);

    await expect(uploadRfpProjectFile(validInput())).rejects.toBe(boom);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writtenPath = mockWriteFile.mock.calls[0][0];
    expect(mockRm).toHaveBeenCalledTimes(1);
    expect(mockRm).toHaveBeenCalledWith(writtenPath, { force: true });
  });

  it("still rethrows the record error when the cleanup rm itself fails", async () => {
    const boom = new Error("insert failed");
    mockCreateProjectFileRecord.mockRejectedValue(boom);
    mockRm.mockRejectedValue(new Error("rm failed"));

    await expect(uploadRfpProjectFile(validInput())).rejects.toBe(boom);
    expect(mockRm).toHaveBeenCalledTimes(1);
  });
});

describe("uploadRfpProjectFile - immutability", () => {
  it("does not mutate the input object or bytes", async () => {
    const input = validInput({
      fileName: DIRTY_NAME,
      sizeBytes: 4,
      bytes: new Uint8Array([9, 8, 7, 6]),
    });
    const snapshot = structuredClone(input);

    await uploadRfpProjectFile(input);

    expect(input).toEqual(snapshot);
    expect(Array.from(input.bytes)).toEqual([9, 8, 7, 6]);
    expect(input.fileName).toBe(DIRTY_NAME);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-upload.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-upload.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports the project store and project file store it needs", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/db/project-file-store"');
  });

  it("imports no parser/loader/normalizer, artifact/approval/evidence store, pricing, config expansion, mantle/export, runner, AI, catalog, intake, coordinator, engine, or adapter module", () => {
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
