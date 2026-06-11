import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  CanonicalBoqLine,
  Project,
  ProjectArtifact,
} from "@/types/project";

// Mock only the two composed boundaries: the project store (verify the Project)
// and the existing deterministic normalizer (parse + artifact creation). The
// real INVALID_BOQ_FORMAT_MESSAGE is imported from boq-formats (a light, type-only
// module) so the wrapper's message translation is tested against the true literal.
const { mockGetProjectById, mockNormalize } = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockNormalize: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/projects/boq-normalization", () => ({
  normalizeProjectBoqFile: mockNormalize,
}));

import * as serviceModule from "@/lib/projects/project-quick-bom-normalization";
import { normalizeProjectQuickBomBoqFile } from "@/lib/projects/project-quick-bom-normalization";
import { INVALID_BOQ_FORMAT_MESSAGE } from "@/lib/projects/boq-formats";
import type {
  NormalizedBoqArtifactPayload,
  NormalizeProjectBoqFileResult,
} from "@/lib/projects/boq-normalization";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const FILE_ID = "file-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const ART_CREATED = new Date("2026-05-21T08:00:00.000Z");
const ART_UPDATED = new Date("2026-05-21T09:30:00.000Z");
// A storage path planted inside a BoQ line; the lean payload summary drops lines
// entirely, so this string must never appear in the summary.
const SECRET_STORAGE = "/storage/secret/boq.xlsx";

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

function makeLine(overrides: Partial<CanonicalBoqLine> = {}): CanonicalBoqLine {
  return {
    sourceFormat: "format_1_line_item",
    sourceFileId: FILE_ID,
    sourceRowNumber: 2,
    originalLineNumber: "1",
    sku: "SKU-A",
    description: "Catalyst switch",
    quantity: 1,
    originalCells: {},
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: "art-1",
    projectId: PROJECT,
    stageId: "boq_format_validation",
    type: "normalized_boq",
    status: "generated",
    version: 1,
    // The full payload (with lines) lives on the artifact; the summary excludes it.
    payload: {
      sourceFileId: FILE_ID,
      sourceFileName: "boq.xlsx",
      lineCount: 2,
      sourceFormats: ["format_1_line_item"],
      lines: [makeLine()],
    },
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [],
    createdAt: ART_CREATED,
    updatedAt: ART_UPDATED,
    ...overrides,
  };
}

function makePayload(
  overrides: Partial<NormalizedBoqArtifactPayload> = {}
): NormalizedBoqArtifactPayload {
  return {
    sourceFileId: FILE_ID,
    sourceFileName: "boq.xlsx",
    sourceSheetName: "MAIN BOQ",
    lineCount: 2,
    sourceFormats: ["format_1_line_item"],
    lines: [
      makeLine({ originalCells: { Note: SECRET_STORAGE } }),
      makeLine({ sku: "SKU-B", sourceRowNumber: 3 }),
    ],
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<NormalizeProjectBoqFileResult> = {}
): NormalizeProjectBoqFileResult {
  return { artifact: makeArtifact(), payload: makePayload(), ...overrides };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockNormalize.mockReset().mockResolvedValue(makeResult());
});

describe("normalizeProjectQuickBomBoqFile - project verification", () => {
  it("returns not_found and does not normalize when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await normalizeProjectQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockNormalize).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and does not normalize for a non-quick_bom project", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({
        mode: "rfp",
        name: "RFP Bid",
        customerName: "Acme",
        createdAt: TS1,
        updatedAt: TS2,
      })
    );

    const result = await normalizeProjectQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

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
    expect(mockNormalize).not.toHaveBeenCalled();
  });

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({ mode: "rfp", customerName: undefined })
    );

    const result = await normalizeProjectQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });
});

describe("normalizeProjectQuickBomBoqFile - delegation", () => {
  it("passes tenantId, projectId, and fileId exactly to the normalizer", async () => {
    await normalizeProjectQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

    expect(mockNormalize).toHaveBeenCalledTimes(1);
    expect(mockNormalize).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });
  });

  it("verifies the project before delegating to the normalizer", async () => {
    await normalizeProjectQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

    expect(mockGetProjectById.mock.invocationCallOrder[0]).toBeLessThan(
      mockNormalize.mock.invocationCallOrder[0]
    );
  });
});

describe("normalizeProjectQuickBomBoqFile - known error translation", () => {
  it("maps the missing-file message to file_not_found", async () => {
    mockNormalize.mockRejectedValue(new Error("Project BoQ file not found."));

    const result = await normalizeProjectQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

    expect(result).toEqual({ status: "file_not_found" });
  });

  it("maps the non-boq-role message to file_not_boq", async () => {
    mockNormalize.mockRejectedValue(
      new Error("Project file is not recorded as a BoQ/BoM file.")
    );

    const result = await normalizeProjectQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

    expect(result).toEqual({ status: "file_not_boq" });
  });

  it("maps the locked invalid-format message to invalid_format with the message", async () => {
    mockNormalize.mockRejectedValue(new Error(INVALID_BOQ_FORMAT_MESSAGE));

    const result = await normalizeProjectQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

    expect(result).toEqual({
      status: "invalid_format",
      message: INVALID_BOQ_FORMAT_MESSAGE,
    });
  });
});

describe("normalizeProjectQuickBomBoqFile - unexpected errors", () => {
  it("re-throws an unexpected normalizer error unchanged", async () => {
    const boom = new Error("boom-internal-stack-detail");
    mockNormalize.mockRejectedValue(boom);

    await expect(
      normalizeProjectQuickBomBoqFile({
        tenantId: TENANT,
        projectId: PROJECT,
        fileId: FILE_ID,
      })
    ).rejects.toBe(boom);
  });

  it("re-throws a non-Error rejection", async () => {
    mockNormalize.mockRejectedValue("plain string failure");

    await expect(
      normalizeProjectQuickBomBoqFile({
        tenantId: TENANT,
        projectId: PROJECT,
        fileId: FILE_ID,
      })
    ).rejects.toBe("plain string failure");
  });
});

describe("normalizeProjectQuickBomBoqFile - ok summaries", () => {
  it("returns a serializable artifact summary with ISO dates and no payload", async () => {
    const result = await normalizeProjectQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: "art-1",
      projectId: PROJECT,
      stageId: "boq_format_validation",
      type: "normalized_boq",
      status: "generated",
      version: 1,
      sourceFileIds: [FILE_ID],
      sourceArtifactIds: [],
      createdAt: ART_CREATED.toISOString(),
      updatedAt: ART_UPDATED.toISOString(),
    });
    expect("payload" in result.artifact).toBe(false);
    expect(typeof result.artifact.createdAt).toBe("string");
    expect(typeof result.artifact.updatedAt).toBe("string");
  });

  it("returns a lean payload summary without lines or storage paths", async () => {
    const result = await normalizeProjectQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary).toEqual({
      sourceFileId: FILE_ID,
      sourceFileName: "boq.xlsx",
      sourceSheetName: "MAIN BOQ",
      lineCount: 2,
      sourceFormats: ["format_1_line_item"],
    });
    expect("lines" in result.payloadSummary).toBe(false);
    expect("storagePath" in result.payloadSummary).toBe(false);
    expect(JSON.stringify(result.payloadSummary)).not.toContain(SECRET_STORAGE);
  });

  it("omits sourceSheetName from the payload summary for a csv-like result", async () => {
    mockNormalize.mockResolvedValue(
      makeResult({
        payload: makePayload({ sourceSheetName: undefined, lines: [makeLine()] }),
      })
    );

    const result = await normalizeProjectQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

    if (result.status !== "ok") throw new Error("unreachable");
    expect("sourceSheetName" in result.payloadSummary).toBe(false);
  });
});

describe("normalizeProjectQuickBomBoqFile - immutability and array copies", () => {
  it("does not mutate the input object", async () => {
    const input = { tenantId: TENANT, projectId: PROJECT, fileId: FILE_ID };
    const snapshot = structuredClone(input);

    await normalizeProjectQuickBomBoqFile(input);

    expect(input).toEqual(snapshot);
  });

  it("copies artifact source arrays and payload sourceFormats so the summary cannot corrupt the normalizer result", async () => {
    const res = makeResult();
    mockNormalize.mockResolvedValue(res);

    const result = await normalizeProjectQuickBomBoqFile({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: FILE_ID,
    });

    if (result.status !== "ok") throw new Error("unreachable");
    // Distinct references from the normalizer's result arrays.
    expect(result.artifact.sourceFileIds).not.toBe(res.artifact.sourceFileIds);
    expect(result.artifact.sourceArtifactIds).not.toBe(
      res.artifact.sourceArtifactIds
    );
    expect(result.payloadSummary.sourceFormats).not.toBe(
      res.payload.sourceFormats
    );

    // Mutating the returned summary arrays must not reach back into the result.
    result.artifact.sourceFileIds.push("injected");
    result.artifact.sourceArtifactIds.push("injected");
    result.payloadSummary.sourceFormats.push("format_2_number_part_qty");

    expect(res.artifact.sourceFileIds).toEqual([FILE_ID]);
    expect(res.artifact.sourceArtifactIds).toEqual([]);
    expect(res.payload.sourceFormats).toEqual(["format_1_line_item"]);
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-quick-bom-normalization.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-quick-bom-normalization.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports the project store, the existing normalizer, and the format message it needs", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/projects/boq-normalization"');
    expect(source).toContain('from "@/lib/projects/boq-formats"');
  });

  it("does not import the artifact/approval/evidence stores, raw BoQ loader, pricing, config expansion, mantle/export, runner, AI, catalog, coordinator, engine, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db/project-artifact-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/db/project-file-store"',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/boq-file-loader"',
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

  it("exposes only the wrapper service as a runtime export", () => {
    expect(Object.keys(serviceModule)).toEqual([
      "normalizeProjectQuickBomBoqFile",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
