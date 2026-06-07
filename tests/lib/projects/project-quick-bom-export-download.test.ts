import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock the two store boundaries plus node:fs/promises: the project store (verify the
// Project), the artifact store (load the exact export_package), and stat/readFile (so the
// regular-file check and the byte read can be driven without a real filesystem). No real
// DB and no real workbook read here; the service is exercised in isolation.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({ getProjectArtifactById: vi.fn() }));
vi.mock("node:fs/promises", () => ({ stat: vi.fn(), readFile: vi.fn() }));

import * as serviceModule from "@/lib/projects/project-quick-bom-export-download";
import {
  loadProjectQuickBomExportDownload,
  type LoadProjectQuickBomExportDownloadInput,
} from "@/lib/projects/project-quick-bom-export-download";
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { readFile, stat } from "node:fs/promises";

const getProjectMock = vi.mocked(getProjectById);
const getArtifactMock = vi.mocked(getProjectArtifactById);
const statMock = vi.mocked(stat);
const readFileMock = vi.mocked(readFile);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const ARTIFACT_ID = "art-ep-1";
const PRICED_ID = "art-pb-7";
const FILE_ID = "file-1";
const FILE_PATH = "C:/Pre-Sales/out/written-mantle.xlsx";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const ART_CREATED = new Date("2026-05-21T10:00:00.000Z");
const ART_UPDATED = new Date("2026-05-21T10:30:00.000Z");

// "PK\x03\x04" zip magic plus a few payload bytes; reused as the readFile result.
const BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x11, 0x22, 0x33]);
// Planted on the stored artifact payload; the lean summary must never surface it.
const SECRET_PAYLOAD = "LEAKED-ARTIFACT-PAYLOAD";

/** A filesystem error carrying an errno-style code, like a real fs rejection. */
function makeFsError(code: string): Error {
  const err = new Error(`${code}: simulated`) as Error & { code?: string };
  err.code = code;
  return err;
}

/** A minimal stat result with a controllable isFile(), cast to the stat return type. */
function statResult(isFile: boolean): Awaited<ReturnType<typeof stat>> {
  return { isFile: () => isFile } as unknown as Awaited<ReturnType<typeof stat>>;
}

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

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT_ID,
    projectId: PROJECT,
    stageId: "export_approval",
    type: "export_package",
    status: "approved",
    version: 1,
    payload: { secret: SECRET_PAYLOAD },
    filePath: FILE_PATH,
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [PRICED_ID],
    createdAt: ART_CREATED,
    updatedAt: ART_UPDATED,
    ...overrides,
  };
}

function input(
  overrides: Partial<LoadProjectQuickBomExportDownloadInput> = {}
): LoadProjectQuickBomExportDownloadInput {
  return { tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT_ID, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(makeProject());
  getArtifactMock.mockResolvedValue(makeArtifact());
  statMock.mockResolvedValue(statResult(true));
  readFileMock.mockResolvedValue(BYTES);
});

describe("loadProjectQuickBomExportDownload - project verification", () => {
  it("returns not_found and never loads the artifact or reads the filesystem when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await loadProjectQuickBomExportDownload(input());

    expect(result).toEqual({ status: "not_found" });
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(statMock).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and does not load the artifact or read the filesystem", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "rfp", name: "RFP Bid", customerName: "Acme" })
    );

    const result = await loadProjectQuickBomExportDownload(input());

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "RFP Bid",
      customerName: "Acme",
      mode: "rfp",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(statMock).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "rfp", customerName: undefined }));

    const result = await loadProjectQuickBomExportDownload(input());

    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });
});

describe("loadProjectQuickBomExportDownload - artifact load + gating", () => {
  it("loads the exact tenant/project/artifact triple after verifying the project", async () => {
    await loadProjectQuickBomExportDownload(input());

    expect(getArtifactMock).toHaveBeenCalledTimes(1);
    expect(getArtifactMock).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT_ID);
    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      getArtifactMock.mock.invocationCallOrder[0]
    );
  });

  it("returns export_package_not_found when the artifact is missing and does not read the filesystem", async () => {
    getArtifactMock.mockResolvedValue(null);

    const result = await loadProjectQuickBomExportDownload(input());

    expect(result).toEqual({ status: "export_package_not_found" });
    expect(statMock).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("returns artifact_not_export_package for a non-export_package artifact", async () => {
    getArtifactMock.mockResolvedValue(makeArtifact({ type: "priced_boq" }));

    const result = await loadProjectQuickBomExportDownload(input());

    expect(result).toEqual({ status: "artifact_not_export_package" });
    expect(statMock).not.toHaveBeenCalled();
  });

  it("returns export_package_not_approved for a non-approved export_package", async () => {
    getArtifactMock.mockResolvedValue(makeArtifact({ status: "needs_review" }));

    const result = await loadProjectQuickBomExportDownload(input());

    expect(result).toEqual({ status: "export_package_not_approved" });
    expect(statMock).not.toHaveBeenCalled();
  });
});

describe("loadProjectQuickBomExportDownload - file path validation", () => {
  it("returns export_package_file_missing when the artifact has no filePath", async () => {
    getArtifactMock.mockResolvedValue(makeArtifact({ filePath: undefined }));

    const result = await loadProjectQuickBomExportDownload(input());

    expect(result).toEqual({ status: "export_package_file_missing" });
    expect(statMock).not.toHaveBeenCalled();
  });

  it("returns export_package_file_missing for a blank/whitespace filePath", async () => {
    getArtifactMock.mockResolvedValue(makeArtifact({ filePath: "   " }));

    const result = await loadProjectQuickBomExportDownload(input());

    expect(result).toEqual({ status: "export_package_file_missing" });
    expect(statMock).not.toHaveBeenCalled();
  });

  it("returns export_package_file_invalid for a non-.xlsx filePath and does not stat or read it", async () => {
    getArtifactMock.mockResolvedValue(
      makeArtifact({ filePath: "C:/Pre-Sales/out/evil.exe" })
    );

    const result = await loadProjectQuickBomExportDownload(input());

    expect(result).toEqual({ status: "export_package_file_invalid" });
    expect(statMock).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("accepts an uppercase .XLSX extension via case-insensitive matching", async () => {
    getArtifactMock.mockResolvedValue(
      makeArtifact({ filePath: "C:/Pre-Sales/out/book.XLSX" })
    );

    const result = await loadProjectQuickBomExportDownload(input());

    expect(result.status).toBe("ok");
    expect(statMock).toHaveBeenCalledWith("C:/Pre-Sales/out/book.XLSX");
  });
});

describe("loadProjectQuickBomExportDownload - filesystem outcomes", () => {
  it("maps a stat ENOENT to export_package_file_unavailable and never reads", async () => {
    statMock.mockRejectedValue(makeFsError("ENOENT"));

    const result = await loadProjectQuickBomExportDownload(input());

    expect(result).toEqual({ status: "export_package_file_unavailable" });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("maps a stat non-regular-file to export_package_file_invalid and never reads", async () => {
    statMock.mockResolvedValue(statResult(false));

    const result = await loadProjectQuickBomExportDownload(input());

    expect(result).toEqual({ status: "export_package_file_invalid" });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("maps a readFile ENOENT to export_package_file_unavailable", async () => {
    readFileMock.mockRejectedValue(makeFsError("ENOENT"));

    const result = await loadProjectQuickBomExportDownload(input());

    expect(result).toEqual({ status: "export_package_file_unavailable" });
  });

  it("re-throws an unexpected stat error (non-ENOENT)", async () => {
    const boom = makeFsError("EACCES");
    statMock.mockRejectedValue(boom);

    await expect(loadProjectQuickBomExportDownload(input())).rejects.toBe(boom);
  });

  it("re-throws an unexpected readFile error (non-ENOENT)", async () => {
    const boom = makeFsError("EACCES");
    readFileMock.mockRejectedValue(boom);

    await expect(loadProjectQuickBomExportDownload(input())).rejects.toBe(boom);
  });

  it("re-throws a readFile rejection that carries no error code", async () => {
    const boom = new Error("plain boom");
    readFileMock.mockRejectedValue(boom);

    await expect(loadProjectQuickBomExportDownload(input())).rejects.toBe(boom);
  });
});

describe("loadProjectQuickBomExportDownload - ok result", () => {
  it("returns the workbook bytes, xlsx mime, content length, and the stat/read targets", async () => {
    const result = await loadProjectQuickBomExportDownload(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.bytes).toBe(BYTES);
    expect(result.mimeType).toBe(XLSX_MIME);
    expect(result.contentLength).toBe(BYTES.byteLength);
    expect(statMock).toHaveBeenCalledWith(FILE_PATH);
    expect(readFileMock).toHaveBeenCalledWith(FILE_PATH);
  });

  it("returns a lean artifact summary with ISO dates and no payload/filePath", async () => {
    const result = await loadProjectQuickBomExportDownload(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: ARTIFACT_ID,
      projectId: PROJECT,
      stageId: "export_approval",
      type: "export_package",
      status: "approved",
      version: 1,
      sourceFileIds: [FILE_ID],
      sourceArtifactIds: [PRICED_ID],
      createdAt: ART_CREATED.toISOString(),
      updatedAt: ART_UPDATED.toISOString(),
    });
    expect("payload" in result.artifact).toBe(false);
    expect("filePath" in result.artifact).toBe(false);
  });

  it("never leaks the stored filePath or the artifact payload into the serializable result", async () => {
    const result = await loadProjectQuickBomExportDownload(input());

    if (result.status !== "ok") throw new Error("unreachable");
    const json = JSON.stringify({ ...result, bytes: undefined });
    expect(json).not.toContain(SECRET_PAYLOAD);
    expect(json).not.toContain(FILE_PATH);
    expect(result.filename).not.toContain(FILE_PATH);
    expect(result.filename).not.toContain("/");
    expect(result.filename).not.toContain("\\");
  });
});

describe("loadProjectQuickBomExportDownload - filename derivation", () => {
  it("derives a safe filename from the customer name plus artifact version and id", async () => {
    const result = await loadProjectQuickBomExportDownload(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.filename).toBe("quick-bom-export-Honeywell-v1-art-ep-1.xlsx");
  });

  it("sanitizes unsafe characters in the customer name and artifact id", async () => {
    getProjectMock.mockResolvedValue(makeProject({ customerName: "Ac/me*Co?" }));
    getArtifactMock.mockResolvedValue(makeArtifact({ id: "art ep:1", version: 5 }));

    const result = await loadProjectQuickBomExportDownload(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.filename).toBe("quick-bom-export-Ac_me_Co_-v5-art_ep_1.xlsx");
  });

  it("falls back to the sanitized project name when there is no customer name", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ customerName: undefined, name: "Big Project!" })
    );

    const result = await loadProjectQuickBomExportDownload(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.filename).toBe("quick-bom-export-Big_Project_-v1-art-ep-1.xlsx");
  });

  it("derives the filename from the stored artifact id, not the requested artifactId param", async () => {
    getArtifactMock.mockResolvedValue(makeArtifact({ id: "stored-art-id" }));

    const result = await loadProjectQuickBomExportDownload(
      input({ artifactId: "requested-art-id" })
    );

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.filename).toContain("stored-art-id");
    expect(result.filename).not.toContain("requested-art-id");
    // The requested id is still the load key.
    expect(getArtifactMock).toHaveBeenCalledWith(TENANT, PROJECT, "requested-art-id");
  });
});

describe("loadProjectQuickBomExportDownload - immutability", () => {
  it("does not mutate the input object", async () => {
    const inp = input();
    const snapshot = structuredClone(inp);

    await loadProjectQuickBomExportDownload(inp);

    expect(inp).toEqual(snapshot);
  });

  it("does not mutate the Project", async () => {
    const project = makeProject();
    const snapshot = structuredClone(project);
    getProjectMock.mockResolvedValue(project);

    await loadProjectQuickBomExportDownload(input());

    expect(project).toEqual(snapshot);
  });

  it("does not mutate the artifact (payload and source arrays preserved)", async () => {
    const artifact = makeArtifact();
    const snapshot = structuredClone(artifact);
    getArtifactMock.mockResolvedValue(artifact);

    await loadProjectQuickBomExportDownload(input());

    expect(artifact).toEqual(snapshot);
  });

  it("copies the artifact source arrays so the summary cannot corrupt the stored artifact", async () => {
    const artifact = makeArtifact();
    getArtifactMock.mockResolvedValue(artifact);

    const result = await loadProjectQuickBomExportDownload(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact.sourceFileIds).not.toBe(artifact.sourceFileIds);
    expect(result.artifact.sourceArtifactIds).not.toBe(artifact.sourceArtifactIds);
    result.artifact.sourceFileIds.push("injected");
    expect(artifact.sourceFileIds).toEqual([FILE_ID]);
  });

  it("does not mutate the bytes returned by readFile", async () => {
    const original = Buffer.from(BYTES);

    await loadProjectQuickBomExportDownload(input());

    expect(Buffer.from(BYTES)).toEqual(original);
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-quick-bom-export-download.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-quick-bom-export-download.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");
  const importLines = source.split("\n").filter((l) => /^\s*import\b/.test(l));
  const joinedImports = importLines.join("\n");

  it("imports the node read-only fs/path builtins, both project stores, and project types", () => {
    expect(source).toContain('from "node:fs/promises"');
    expect(source).toContain('from "node:path"');
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/db/project-artifact-store"');
    expect(source).toContain('from "@/types/project"');
  });

  it("does not import the approval store, DB schema/index/barrel, pricing/config/priced-boq/mantle/fixture, runner, AI, catalog, engine, coordinator, adapter, the export-create service, or API/UI modules", () => {
    // Inspect import lines only - the docstring legitimately names some domains to
    // declare what the module deliberately omits.
    for (const forbidden of [
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/schema"',
      'from "@/lib/db/index"',
      'from "@/lib/db"',
      'from "@/lib/projects/project-quick-bom-export"',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/honeywell',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/export',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/app',
      'from "@/components',
      "anthropic",
      "openai",
      "@google/generative-ai",
      "drizzle",
      "next/server",
    ]) {
      expect(joinedImports).not.toContain(forbidden);
    }
  });

  it("does no writing/streaming/regeneration and creates no artifact version or approval", () => {
    for (const forbidden of [
      "createReadStream",
      "createWriteStream",
      "writeFile",
      "appendFile",
      "mkdir",
      "unlink",
      'from "node:fs"',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createMantleExportArtifact",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("exposes only the download service as a runtime export", () => {
    expect(Object.keys(serviceModule)).toEqual(["loadProjectQuickBomExportDownload"]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
