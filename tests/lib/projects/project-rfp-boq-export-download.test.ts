import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// The RFP BoQ export download service is a thin wrapper over the shared, mode-gated Project
// BoQ export-package download core. Per the task, the RFP lane must reject quick_bom
// projects as wrong_mode and pass rfp projects THROUGH THE CORE BEHAVIOR, so this test
// drives the REAL core (mocking only the project store, the artifact store, and
// stat/readFile) rather than mocking the core. That proves the wrapper truly pins
// expectedMode = "rfp" and the "RFP-BoQ" filename label: an rfp project serves its
// workbook, a quick_bom project is rejected before any artifact or filesystem read, the
// caller ids are forwarded tenant-scoped, and the lane adds no path/filename authority. The
// full status / canary / immutability behavior is proven exhaustively in the core's own
// test.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({ getProjectArtifactById: vi.fn() }));
vi.mock("node:fs/promises", () => ({ stat: vi.fn(), readFile: vi.fn() }));

import * as serviceModule from "@/lib/projects/project-rfp-boq-export-download";
import {
  loadProjectRfpBoqExportDownload,
  type LoadProjectRfpBoqExportDownloadInput,
} from "@/lib/projects/project-rfp-boq-export-download";
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { readFile, stat } from "node:fs/promises";

const getProjectMock = vi.mocked(getProjectById);
const getArtifactMock = vi.mocked(getProjectArtifactById);
const statMock = vi.mocked(stat);
const readFileMock = vi.mocked(readFile);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT_ID = "art-ep-rfp-1";
const PRICED_ID = "art-rfp-pb-1";
const FILE_ID = "file-1";
const FILE_PATH = "C:/Pre-Sales/out/written-mantle.xlsx";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TS = new Date("2026-06-01T10:00:00.000Z");

// "PK\x03\x04" zip magic plus a few payload bytes; reused as the readFile result.
const BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x11, 0x22, 0x33]);

/** A minimal stat result with a controllable isFile(), cast to the stat return type. */
function statResult(isFile: boolean): Awaited<ReturnType<typeof stat>> {
  return { isFile: () => isFile } as unknown as Awaited<ReturnType<typeof stat>>;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "RFP Priced BoQ",
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

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT_ID,
    projectId: PROJECT,
    stageId: "export_approval",
    type: "export_package",
    status: "approved",
    version: 1,
    payload: { secret: "no-leak" },
    filePath: FILE_PATH,
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [PRICED_ID],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function input(
  overrides: Partial<LoadProjectRfpBoqExportDownloadInput> = {}
): LoadProjectRfpBoqExportDownloadInput {
  return { tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT_ID, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(makeProject());
  getArtifactMock.mockResolvedValue(makeArtifact());
  statMock.mockResolvedValue(statResult(true));
  readFileMock.mockResolvedValue(BYTES);
});

describe("loadProjectRfpBoqExportDownload - pins rfp (through core behavior)", () => {
  it("passes the mode gate for an rfp project and serves the workbook bytes", async () => {
    const result = await loadProjectRfpBoqExportDownload(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.bytes).toBe(BYTES);
    expect(result.mimeType).toBe(XLSX_MIME);
    expect(result.contentLength).toBe(BYTES.byteLength);
    expect(getArtifactMock).toHaveBeenCalledTimes(1);
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a quick_bom project as wrong_mode before any artifact or filesystem read", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await loadProjectRfpBoqExportDownload(input());

    expect(result.status).toBe("wrong_mode");
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(statMock).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("uses the RFP filename label and shape", async () => {
    const result = await loadProjectRfpBoqExportDownload(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.filename).toBe("BOMATIC-RFP-BoQ-Acme-v1.xlsx");
    // Never the Quick lane's label.
    expect(result.filename).not.toContain("Quick-BoM");
  });

  it("forwards the caller ids tenant-scoped into the archived-inclusive project read, the artifact load, and the byte read", async () => {
    await loadProjectRfpBoqExportDownload(input());

    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT, { includeArchived: true });
    expect(getArtifactMock).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT_ID);
    expect(statMock).toHaveBeenCalledWith(FILE_PATH);
    expect(readFileMock).toHaveBeenCalledWith(FILE_PATH);
  });

  it("surfaces the core's exact export_package status names unchanged", async () => {
    getArtifactMock.mockResolvedValue(makeArtifact({ status: "needs_review" }));

    const result = await loadProjectRfpBoqExportDownload(input());

    expect(result.status).toBe("export_package_not_approved");
  });

  it("returns not_found when the project is absent (no artifact or filesystem read)", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await loadProjectRfpBoqExportDownload(input());

    expect(result.status).toBe("not_found");
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
  });
});

describe("loadProjectRfpBoqExportDownload - module purity and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-boq-export-download.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-boq-export-download.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports/re-exports from the shared download core and nothing else", () => {
    const froms = Array.from(
      new Set(Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]))
    );
    expect(froms).toEqual(["@/lib/projects/project-boq-export-download-core"]);
    expect(source).toContain("loadProjectBoqExportDownloadCore");
    expect(source).toContain('expectedMode: "rfp"');
    expect(source).toContain("RFP-BoQ");
  });

  it("re-exports the RFP-specific public type aliases over the shared shapes", () => {
    for (const typeName of [
      "LoadProjectRfpBoqExportDownloadInput",
      "RfpBoqExportDownloadProjectSummary",
      "RfpBoqExportDownloadArtifactSummary",
      "LoadProjectRfpBoqExportDownloadResult",
    ]) {
      expect(source).toContain(`export type ${typeName}`);
    }
  });

  it("does not import the stores, fs/path, the mantle export service/fixture, the runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "@/types/project"',
      'from "node:fs',
      'from "node:path"',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "getProjectArtifactById",
      "getProjectById",
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/honeywell',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/rfp-runner"',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/project-rfp-boq-export"',
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
      "next/server",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("exposes only the wrapper service as a runtime export", () => {
    expect(Object.keys(serviceModule)).toEqual(["loadProjectRfpBoqExportDownload"]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
