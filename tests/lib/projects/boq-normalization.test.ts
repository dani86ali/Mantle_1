import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// All three composed dependencies are mocked: no real DB, no real file reads.
vi.mock("@/lib/db/project-file-store", () => ({
  getProjectFileById: vi.fn(),
}));
vi.mock("@/lib/projects/boq-file-loader", () => ({
  loadProjectBoqFile: vi.fn(),
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  createProjectArtifactVersion: vi.fn(),
}));

import * as service from "@/lib/projects/boq-normalization";
import {
  normalizeProjectBoqFile,
  buildNormalizedBoqArtifactPayload,
  type NormalizeProjectBoqFileInput,
} from "@/lib/projects/boq-normalization";
import { getProjectFileById } from "@/lib/db/project-file-store";
import { loadProjectBoqFile } from "@/lib/projects/boq-file-loader";
import { createProjectArtifactVersion } from "@/lib/db/project-artifact-store";
import { INVALID_BOQ_FORMAT_MESSAGE } from "@/lib/projects/boq-formats";
import type {
  CanonicalBoqLine,
  ProjectArtifact,
  ProjectFile,
} from "@/types/project";
import type { LoadedProjectBoq } from "@/lib/projects/boq-file-loader";

type LoaderResult = LoadedProjectBoq;

const getFileMock = vi.mocked(getProjectFileById);
const loadMock = vi.mocked(loadProjectBoqFile);
const createMock = vi.mocked(createProjectArtifactVersion);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const FILE_ID = "file-1";

function makeFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    id: FILE_ID,
    projectId: PROJECT,
    fileRole: "boq",
    fileName: "boq.xlsx",
    storagePath: "/storage/boq.xlsx",
    uploadedAt: new Date("2026-05-21T00:00:00.000Z"),
    retainUntil: new Date("2027-05-21T00:00:00.000Z"),
    ...overrides,
  };
}

function makeLine(overrides: Partial<CanonicalBoqLine> = {}): CanonicalBoqLine {
  return {
    sourceFormat: "format_1_line_item",
    sourceFileId: FILE_ID,
    sourceRowNumber: 2,
    originalLineNumber: "1",
    sku: "C9300-48P-E",
    description: "Catalyst 9300 switch",
    quantity: 5,
    originalCells: {},
    ...overrides,
  };
}

function makeLoadedXlsx(): LoaderResult {
  return {
    sourceFileId: FILE_ID,
    sourceFileName: "boq.xlsx",
    sourceSheetName: "MAIN BOQ",
    lines: [
      makeLine({ originalLineNumber: "1", sku: "SKU-A", sourceRowNumber: 2 }),
      makeLine({ originalLineNumber: "2", sku: "SKU-B", sourceRowNumber: 3 }),
    ],
  };
}

function makeLoadedCsv(): LoaderResult {
  return {
    sourceFileId: FILE_ID,
    sourceFileName: "boq.csv",
    lines: [makeLine({ sku: "SKU-A", sourceRowNumber: 2 })],
  };
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  const now = new Date("2026-05-21T08:00:00.000Z");
  return {
    id: "art-1",
    projectId: PROJECT,
    stageId: "boq_format_validation",
    type: "normalized_boq",
    status: "generated",
    version: 1,
    payload: {},
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockResolvedValue(makeArtifact());
});

describe("normalizeProjectBoqFile - guards", () => {
  it("throws the exact missing-file message and does not load or create", async () => {
    getFileMock.mockResolvedValue(null);
    await expect(
      normalizeProjectBoqFile({ tenantId: TENANT, projectId: PROJECT, fileId: FILE_ID })
    ).rejects.toThrow("Project BoQ file not found.");
    expect(loadMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact role message for non-boq files and does not load or create", async () => {
    getFileMock.mockResolvedValue(makeFile({ fileRole: "rfp" }));
    await expect(
      normalizeProjectBoqFile({ tenantId: TENANT, projectId: PROJECT, fileId: FILE_ID })
    ).rejects.toThrow("Project file is not recorded as a BoQ/BoM file.");
    expect(loadMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("bubbles the invalid-format error from the loader unchanged", async () => {
    getFileMock.mockResolvedValue(makeFile());
    loadMock.mockImplementation(() => {
      throw new Error(INVALID_BOQ_FORMAT_MESSAGE);
    });
    await expect(
      normalizeProjectBoqFile({ tenantId: TENANT, projectId: PROJECT, fileId: FILE_ID })
    ).rejects.toThrow(INVALID_BOQ_FORMAT_MESSAGE);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("normalizeProjectBoqFile - artifact creation", () => {
  beforeEach(() => {
    getFileMock.mockResolvedValue(makeFile());
    loadMock.mockReturnValue(makeLoadedXlsx());
  });

  it("creates exactly one artifact with the expected stage/type/status", async () => {
    await normalizeProjectBoqFile({ tenantId: TENANT, projectId: PROJECT, fileId: FILE_ID });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "boq_format_validation",
      type: "normalized_boq",
      status: "generated",
    });
  });

  it("sources from the file only: sourceFileIds [file.id], sourceArtifactIds []", async () => {
    await normalizeProjectBoqFile({ tenantId: TENANT, projectId: PROJECT, fileId: FILE_ID });
    const arg = createMock.mock.calls[0][0];
    expect(arg.sourceFileIds).toEqual([FILE_ID]);
    expect(arg.sourceArtifactIds).toEqual([]);
  });

  it("returns the created artifact and the payload used to create it", async () => {
    const artifact = makeArtifact({ id: "art-99", version: 3 });
    createMock.mockResolvedValue(artifact);
    const result = await normalizeProjectBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });
    expect(result.artifact).toBe(artifact);
    expect(result.payload).toBe(createMock.mock.calls[0][0].payload);
  });
});

describe("normalizeProjectBoqFile - payload shape", () => {
  it("includes sourceFileId, sourceFileName, lineCount, sourceFormats, and lines", async () => {
    getFileMock.mockResolvedValue(makeFile());
    loadMock.mockReturnValue(makeLoadedXlsx());
    const { payload } = await normalizeProjectBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });
    expect(payload.sourceFileId).toBe(FILE_ID);
    expect(payload.sourceFileName).toBe("boq.xlsx");
    expect(payload.lineCount).toBe(2);
    expect(payload.sourceFormats).toEqual(["format_1_line_item"]);
    expect(payload.lines).toHaveLength(2);
  });

  it("includes sourceSheetName for xlsx-like loaded results", async () => {
    getFileMock.mockResolvedValue(makeFile());
    loadMock.mockReturnValue(makeLoadedXlsx());
    const { payload } = await normalizeProjectBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });
    expect(payload.sourceSheetName).toBe("MAIN BOQ");
  });

  it("omits sourceSheetName for csv-like loaded results", async () => {
    getFileMock.mockResolvedValue(makeFile({ fileName: "boq.csv" }));
    loadMock.mockReturnValue(makeLoadedCsv());
    const { payload } = await normalizeProjectBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });
    expect("sourceSheetName" in payload).toBe(false);
  });

  it("does not include storagePath in the payload", async () => {
    getFileMock.mockResolvedValue(makeFile());
    loadMock.mockReturnValue(makeLoadedXlsx());
    const { payload } = await normalizeProjectBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });
    expect("storagePath" in payload).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("/storage/");
  });

  it("preserves line order", async () => {
    getFileMock.mockResolvedValue(makeFile());
    const loaded = makeLoadedXlsx();
    loadMock.mockReturnValue(loaded);
    const { payload } = await normalizeProjectBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });
    expect(payload.lines.map((l) => l.sku)).toEqual(["SKU-A", "SKU-B"]);
  });

  it("emits unique, first-seen-ordered sourceFormats", () => {
    const loaded: LoadedProjectBoq = {
      sourceFileId: FILE_ID,
      sourceFileName: "mixed.xlsx",
      sourceSheetName: "S",
      lines: [
        makeLine({ sourceFormat: "format_2_number_part_qty" }),
        makeLine({ sourceFormat: "format_1_line_item" }),
        makeLine({ sourceFormat: "format_2_number_part_qty" }),
        makeLine({ sourceFormat: "format_1_line_item" }),
      ],
    };
    const payload = buildNormalizedBoqArtifactPayload(loaded);
    expect(payload.sourceFormats).toEqual([
      "format_2_number_part_qty",
      "format_1_line_item",
    ]);
  });
});

describe("normalizeProjectBoqFile - purity", () => {
  it("does not mutate the input object", async () => {
    getFileMock.mockResolvedValue(makeFile());
    loadMock.mockReturnValue(makeLoadedXlsx());
    const input: NormalizeProjectBoqFileInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    };
    const snapshot = structuredClone(input);
    await normalizeProjectBoqFile(input);
    expect(input).toEqual(snapshot);
  });

  it("does not mutate the loaded lines", async () => {
    getFileMock.mockResolvedValue(makeFile());
    const loaded = makeLoadedXlsx();
    const snapshot = structuredClone(loaded);
    loadMock.mockReturnValue(loaded);
    await normalizeProjectBoqFile({ tenantId: TENANT, projectId: PROJECT, fileId: FILE_ID });
    expect(loaded).toEqual(snapshot);
  });

  it("passes source arrays that cannot be mutated through service input", async () => {
    getFileMock.mockResolvedValue(makeFile());
    loadMock.mockReturnValue(makeLoadedXlsx());
    await normalizeProjectBoqFile({ tenantId: TENANT, projectId: PROJECT, fileId: FILE_ID });
    const arg = createMock.mock.calls[0][0];
    // The service builds [file.id] fresh; mutating it must not corrupt input.
    arg.sourceFileIds!.push("injected");
    arg.sourceArtifactIds!.push("injected");
    await normalizeProjectBoqFile({ tenantId: TENANT, projectId: PROJECT, fileId: FILE_ID });
    const secondArg = createMock.mock.calls[1][0];
    expect(secondArg.sourceFileIds).toEqual([FILE_ID]);
    expect(secondArg.sourceArtifactIds).toEqual([]);
  });
});

describe("module isolation & surface", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/boq-normalization.ts"),
    "utf8"
  );

  it("does not import engines, catalog, pricing, approvals, staleness, evidence, API, or UI", () => {
    // Inspect import statements only - docstrings legitimately name these
    // domains to declare what the module deliberately omits.
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    for (const forbidden of [
      "@/engines",
      "catalog",
      "pricing",
      "approval",
      "staleness",
      "evidence",
      "@/app",
      "@/components",
    ]) {
      expect(importLines).not.toContain(forbidden);
    }
  });

  it("exposes only the expected runtime exports", () => {
    expect(Object.keys(service).sort()).toEqual(
      ["buildNormalizedBoqArtifactPayload", "normalizeProjectBoqFile"].sort()
    );
  });
});
