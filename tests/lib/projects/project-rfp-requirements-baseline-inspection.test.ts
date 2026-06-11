import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock ONLY the two store boundaries this read-only service is allowed to
// import (project read, artifact read/list); the inspection service's
// validation, gating, whitelisting, and summaries stay real. No DB, file
// bytes, evidence store, parser, AI, route, UI, pricing, SKU, catalog,
// export, or legacy module is touched anywhere in this suite.
const { mockGetProject, mockGetArtifact, mockListArtifactsByType } = vi.hoisted(
  () => ({
    mockGetProject: vi.fn(),
    mockGetArtifact: vi.fn(),
    mockListArtifactsByType: vi.fn(),
  })
);

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifact,
  listProjectArtifactsByType: mockListArtifactsByType,
}));

import {
  loadRfpRequirementsBaselineDetail,
  loadRfpRequirementsBaselineList,
  type LoadRfpRequirementsBaselineDetailInput,
  type LoadRfpRequirementsBaselineDetailResult,
  type LoadRfpRequirementsBaselineListInput,
  type LoadRfpRequirementsBaselineListResult,
} from "@/lib/projects/project-rfp-requirements-baseline-inspection";

// Payload marker and evidence kinds declared locally exactly like the
// service declares them - the draft/persistence modules must stay
// runtime-unimported here too.
const BASELINE_KIND = "rfp_requirements_baseline" as const;
const TEXT_KIND = "rfp_document_text_chunk" as const;
const TABLE_KIND = "rfp_document_table" as const;

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const BASELINE_A = "art-requirements-baseline-1";
const BASELINE_B = "art-requirements-baseline-2";
const PACKAGE_A = "art-input-package-1";
const PACKAGE_B = "art-input-package-2";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const EV_TEXT = "evidence-text-1";
const EV_TABLE = "evidence-table-1";
const EV_TEXT_B = "evidence-text-2";
const EV_TABLE_B = "evidence-table-2";
const TABLE_ID = `${FILE_BOQ}:table:1`;
const TABLE_ID_B = `${FILE_RFP}:table:2`;
const CREATED_BY = "engineer@stc.example";
const PAYLOAD_AT = "2026-06-03T08:15:00.000Z";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const REQ_TEXT_1 = "Provide 48-port PoE access switches for all IDFs.";
const REQ_TEXT_2 = "Submit a bid bond with the commercial offer.";

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

/** A well-formed draft payload exactly as the draft service stores it. */
function makeBaselinePayload(): Record<string, unknown> {
  return {
    payloadKind: BASELINE_KIND,
    createdBy: CREATED_BY,
    createdAt: PAYLOAD_AT,
    requirementCount: 2,
    evidenceCount: 4,
    requirements: [
      {
        id: "RFP-REQ-001",
        text: REQ_TEXT_1,
        category: "technical",
        priority: "mandatory",
        title: "Access layer switching",
        notes: "Cited from RFP section 3.2.",
        evidenceReferences: [
          {
            evidenceId: EV_TEXT,
            sourceFileId: FILE_RFP,
            evidenceKind: TEXT_KIND,
            inputPackageArtifactId: PACKAGE_A,
            chunkIndex: 1,
            chunkCount: 2,
            charCount: 63,
          },
          {
            evidenceId: EV_TABLE,
            sourceFileId: FILE_BOQ,
            evidenceKind: TABLE_KIND,
            inputPackageArtifactId: PACKAGE_A,
            tableId: TABLE_ID,
            sheetName: "BoQ Sheet",
            rowCount: 2,
            columnCount: 2,
          },
        ],
      },
      {
        id: "RFP-REQ-002",
        text: REQ_TEXT_2,
        category: "other",
        priority: "unknown",
        evidenceReferences: [
          {
            evidenceId: EV_TEXT_B,
            sourceFileId: FILE_RFP,
            evidenceKind: TEXT_KIND,
            inputPackageArtifactId: PACKAGE_B,
            chunkIndex: 2,
            chunkCount: 2,
            charCount: 40,
          },
          {
            evidenceId: EV_TABLE_B,
            sourceFileId: FILE_RFP,
            evidenceKind: TABLE_KIND,
            inputPackageArtifactId: PACKAGE_B,
            tableId: TABLE_ID_B,
            pageNumber: 4,
            rowCount: 3,
            columnCount: 2,
          },
        ],
      },
    ],
  };
}

/**
 * A well-formed payload with secrets smuggled into every level: payload
 * root, requirement entries, and evidence references (raw evidence text and
 * table rows included). The whitelist must drop all of them.
 */
function makeSmuggledPayload(): Record<string, unknown> {
  const payload = makeBaselinePayload();
  payload.tenantId = TENANT;
  payload.storagePath = "C:/secret/rfp.pdf";
  payload.smuggledRoot = "SMUGGLED-ROOT-SECRET";
  const requirements = payload.requirements as Array<Record<string, unknown>>;
  requirements[0].tenantId = TENANT;
  requirements[0].smuggledRequirement = "SMUGGLED-REQ-SECRET";
  const references = requirements[0].evidenceReferences as Array<
    Record<string, unknown>
  >;
  references[0].text = "RAW-EVIDENCE-TEXT: contractor shall supply switches.";
  references[0].smuggledReference = "SMUGGLED-REF-SECRET";
  references[1].rows = [["RAW-TABLE-CELL-A1", "1"]];
  references[1].storagePath = "C:/secret/boq-workbook";
  return payload;
}

function makeBaselineArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: BASELINE_A,
    projectId: PROJECT,
    stageId: "requirements_baseline_review",
    type: "requirements_baseline",
    status: "needs_review",
    version: 1,
    payload: makeBaselinePayload(),
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A, PACKAGE_B],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function expectedProjectSummary() {
  return {
    id: PROJECT,
    name: "STC RFP Bid",
    customerName: "STC",
    mode: "rfp",
    createdAt: TS1.toISOString(),
    updatedAt: TS2.toISOString(),
  };
}

function expectedArtifactSummary(artifact: ProjectArtifact) {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: artifact.sourceFileIds.slice(),
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

function expectedPayloadSummary() {
  return {
    payloadKind: BASELINE_KIND,
    createdBy: CREATED_BY,
    createdAt: PAYLOAD_AT,
    requirementCount: 2,
    evidenceCount: 4,
    requirementIds: ["RFP-REQ-001", "RFP-REQ-002"],
  };
}

/** The sanitized baseline the detail must produce from the fixture payload. */
function expectedBaseline() {
  return {
    payloadKind: BASELINE_KIND,
    createdBy: CREATED_BY,
    createdAt: PAYLOAD_AT,
    requirementCount: 2,
    evidenceCount: 4,
    requirements: [
      {
        id: "RFP-REQ-001",
        text: REQ_TEXT_1,
        category: "technical",
        priority: "mandatory",
        title: "Access layer switching",
        notes: "Cited from RFP section 3.2.",
        evidenceReferences: [
          {
            evidenceId: EV_TEXT,
            sourceFileId: FILE_RFP,
            inputPackageArtifactId: PACKAGE_A,
            evidenceKind: TEXT_KIND,
            chunkIndex: 1,
            chunkCount: 2,
            charCount: 63,
          },
          {
            evidenceId: EV_TABLE,
            sourceFileId: FILE_BOQ,
            inputPackageArtifactId: PACKAGE_A,
            evidenceKind: TABLE_KIND,
            tableId: TABLE_ID,
            sheetName: "BoQ Sheet",
            rowCount: 2,
            columnCount: 2,
          },
        ],
      },
      {
        id: "RFP-REQ-002",
        text: REQ_TEXT_2,
        category: "other",
        priority: "unknown",
        evidenceReferences: [
          {
            evidenceId: EV_TEXT_B,
            sourceFileId: FILE_RFP,
            inputPackageArtifactId: PACKAGE_B,
            evidenceKind: TEXT_KIND,
            chunkIndex: 2,
            chunkCount: 2,
            charCount: 40,
          },
          {
            evidenceId: EV_TABLE_B,
            sourceFileId: FILE_RFP,
            inputPackageArtifactId: PACKAGE_B,
            evidenceKind: TABLE_KIND,
            tableId: TABLE_ID_B,
            pageNumber: 4,
            rowCount: 3,
            columnCount: 2,
          },
        ],
      },
    ],
  };
}

function list(
  overrides: Partial<LoadRfpRequirementsBaselineListInput> = {}
): Promise<LoadRfpRequirementsBaselineListResult> {
  return loadRfpRequirementsBaselineList({
    tenantId: TENANT,
    projectId: PROJECT,
    ...overrides,
  });
}

function detail(
  overrides: Partial<LoadRfpRequirementsBaselineDetailInput> = {}
): Promise<LoadRfpRequirementsBaselineDetailResult> {
  return loadRfpRequirementsBaselineDetail({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: BASELINE_A,
    ...overrides,
  });
}

function expectNoStoreCalls(): void {
  expect(mockGetProject).not.toHaveBeenCalled();
  expect(mockGetArtifact).not.toHaveBeenCalled();
  expect(mockListArtifactsByType).not.toHaveBeenCalled();
}

let baselineArtifact: ProjectArtifact;
let artifactById: Map<string, ProjectArtifact>;

beforeEach(() => {
  baselineArtifact = makeBaselineArtifact();
  artifactById = new Map([[BASELINE_A, baselineArtifact]]);
  mockGetProject.mockReset().mockResolvedValue(makeProject());
  mockGetArtifact
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, _projectId: string, artifactId: string) =>
        artifactById.get(artifactId) ?? null
    );
  mockListArtifactsByType
    .mockReset()
    .mockImplementation(async () => [baselineArtifact]);
});

describe("validation before store calls", () => {
  it("list throws on a blank projectId", async () => {
    for (const blank of ["", "   "]) {
      await expect(list({ projectId: blank })).rejects.toThrow(
        "projectId is required."
      );
    }
    expectNoStoreCalls();
  });

  it("detail throws on a blank projectId", async () => {
    for (const blank of ["", "   "]) {
      await expect(detail({ projectId: blank })).rejects.toThrow(
        "projectId is required."
      );
    }
    expectNoStoreCalls();
  });

  it("detail throws on a blank artifactId", async () => {
    for (const blank of ["", "   "]) {
      await expect(detail({ artifactId: blank })).rejects.toThrow(
        "artifactId is required."
      );
    }
    expectNoStoreCalls();
  });
});

describe("project gates", () => {
  it("list returns not_found for a missing project and reads no artifacts", async () => {
    mockGetProject.mockResolvedValue(null);

    expect(await list()).toEqual({ status: "not_found" });
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
    expect(mockGetArtifact).not.toHaveBeenCalled();
  });

  it("detail returns not_found for a missing project and reads no artifacts", async () => {
    mockGetProject.mockResolvedValue(null);

    expect(await detail()).toEqual({ status: "not_found" });
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("list returns wrong_mode with a lean no-tenantId summary for a quick_bom project", async () => {
    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await list();

    expect(result).toEqual({
      status: "wrong_mode",
      project: { ...expectedProjectSummary(), mode: "quick_bom" },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TENANT);
    expect(serialized).not.toContain("tenantId");
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("detail returns wrong_mode with a lean no-tenantId summary for a quick_bom project", async () => {
    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await detail();

    expect(result).toEqual({
      status: "wrong_mode",
      project: { ...expectedProjectSummary(), mode: "quick_bom" },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TENANT);
    expect(serialized).not.toContain("tenantId");
    expect(mockGetArtifact).not.toHaveBeenCalled();
  });
});

describe("loadRfpRequirementsBaselineList", () => {
  it("lists requirements_baseline versions with whitelisted payload summaries", async () => {
    const versionTwo = makeBaselineArtifact({
      id: BASELINE_B,
      version: 2,
      status: "approved",
    });
    mockListArtifactsByType.mockResolvedValue([baselineArtifact, versionTwo]);

    const result = await list();

    expect(mockListArtifactsByType).toHaveBeenCalledTimes(1);
    expect(mockListArtifactsByType).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "requirements_baseline"
    );
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "ok",
      project: expectedProjectSummary(),
      artifacts: [
        {
          ...expectedArtifactSummary(baselineArtifact),
          payloadSummary: expectedPayloadSummary(),
        },
        {
          ...expectedArtifactSummary(versionTwo),
          payloadSummary: expectedPayloadSummary(),
        },
      ],
      artifactCount: 2,
    });
  });

  it("keeps only requirements_baseline rows even if the store returns others", async () => {
    const stray = makeBaselineArtifact({
      id: "art-stray-1",
      type: "normalized_boq",
      stageId: "boq_format_validation",
    });
    mockListArtifactsByType.mockResolvedValue([baselineArtifact, stray]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    expect(result.artifacts.map((entry) => entry.id)).toEqual([BASELINE_A]);
  });

  it("degrades malformed payloads to safe summary fields without throwing or leaking", async () => {
    const malformed = makeBaselineArtifact({
      id: BASELINE_B,
      payload: {
        payloadKind: 42,
        createdBy: null,
        createdAt: ["nope"],
        requirementCount: "two",
        evidenceCount: Number.NaN,
        requirements: "not-an-array",
        tenantId: TENANT,
        storagePath: "C:/secret/rfp.pdf",
        smuggledRoot: "SMUGGLED-ROOT-SECRET",
      },
    });
    const empty = makeBaselineArtifact({
      id: "art-requirements-baseline-3",
      payload: {},
    });
    const partial = makeBaselineArtifact({
      id: "art-requirements-baseline-4",
      payload: {
        payloadKind: BASELINE_KIND,
        requirements: [{ id: "RFP-REQ-001" }, null, "junk", { id: 7 }],
      },
    });
    mockListArtifactsByType.mockResolvedValue([malformed, empty, partial]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifacts.map((entry) => entry.payloadSummary)).toEqual([
      {
        payloadKind: "",
        createdBy: "",
        createdAt: "",
        requirementCount: 0,
        evidenceCount: 0,
        requirementIds: [],
      },
      {
        payloadKind: "",
        createdBy: "",
        createdAt: "",
        requirementCount: 0,
        evidenceCount: 0,
        requirementIds: [],
      },
      {
        payloadKind: BASELINE_KIND,
        createdBy: "",
        createdAt: "",
        requirementCount: 0,
        evidenceCount: 0,
        requirementIds: ["RFP-REQ-001", "", "", ""],
      },
    ]);
    const serialized = JSON.stringify(result);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "C:/secret",
      "SMUGGLED-ROOT-SECRET",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("never includes requirement text, evidence text, or table rows in list summaries", async () => {
    const smuggled = makeBaselineArtifact({ payload: makeSmuggledPayload() });
    mockListArtifactsByType.mockResolvedValue([smuggled]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifacts[0].payloadSummary.requirementIds).toEqual([
      "RFP-REQ-001",
      "RFP-REQ-002",
    ]);
    const serialized = JSON.stringify(result);
    for (const leak of [
      REQ_TEXT_1,
      REQ_TEXT_2,
      "RAW-EVIDENCE-TEXT",
      "RAW-TABLE-CELL",
      "SMUGGLED",
      TENANT,
      "tenantId",
      "storagePath",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("returns serializable fresh copies whose mutation never touches the stored row", async () => {
    const snapshot = structuredClone(baselineArtifact);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    result.artifacts[0].sourceFileIds.push("hacked-file");
    result.artifacts[0].sourceArtifactIds.push("hacked-artifact");
    result.artifacts[0].payloadSummary.requirementIds.push("hacked-id");
    expect(baselineArtifact).toEqual(snapshot);
  });

  it("bubbles an unexpected project read failure unhidden", async () => {
    mockGetProject.mockRejectedValue(new Error("project read failed"));

    await expect(list()).rejects.toThrow("project read failed");
  });

  it("bubbles an unexpected artifact list failure unhidden", async () => {
    mockListArtifactsByType.mockRejectedValue(
      new Error("artifact list failed")
    );

    await expect(list()).rejects.toThrow("artifact list failed");
  });
});

describe("loadRfpRequirementsBaselineDetail - artifact gates", () => {
  it("returns artifact_not_found for a missing artifact", async () => {
    const result = await detail({ artifactId: "art-missing-1" });

    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifact).toHaveBeenCalledTimes(1);
    expect(mockGetArtifact).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "art-missing-1"
    );
  });

  it("returns artifact_not_requirements_baseline for a wrong type, without its payload", async () => {
    const inputPackage = makeBaselineArtifact({
      id: "art-input-package-9",
      type: "input_package",
      stageId: "intake_package_review",
      status: "approved",
      payload: {
        payloadKind: "rfp_input_package",
        marker: "PACKAGE-PAYLOAD-SECRET",
      },
    });
    artifactById.set("art-input-package-9", inputPackage);

    const result = await detail({ artifactId: "art-input-package-9" });

    expect(result).toEqual({
      status: "artifact_not_requirements_baseline",
      artifact: expectedArtifactSummary(inputPackage),
    });
    expect(JSON.stringify(result)).not.toContain("PACKAGE-PAYLOAD-SECRET");
  });

  it("returns artifact_not_requirements_baseline for a requirements_baseline at the wrong stage", async () => {
    artifactById.set(
      BASELINE_A,
      makeBaselineArtifact({ stageId: "intake_package_review" })
    );

    const result = await detail();

    expect(result.status).toBe("artifact_not_requirements_baseline");
    expect(JSON.stringify(result)).not.toContain(REQ_TEXT_1);
  });

  it("returns invalid_payload for a missing or wrong payload marker, without payload leaks", async () => {
    const payloads: Array<Record<string, unknown>> = [
      {},
      { payloadKind: "rfp_input_package", requirements: [] },
      { payloadKind: 42, requirements: [], secret: "SMUGGLED-ROOT-SECRET" },
    ];
    for (const payload of payloads) {
      const stored = makeBaselineArtifact({ payload });
      artifactById.set(BASELINE_A, stored);

      const result = await detail();

      expect(result).toEqual({
        status: "invalid_payload",
        artifact: expectedArtifactSummary(stored),
      });
      expect(JSON.stringify(result)).not.toContain("SMUGGLED-ROOT-SECRET");
    }
  });

  it("returns invalid_payload for a malformed requirements array", async () => {
    const variants: unknown[] = [
      undefined,
      "not-an-array",
      7,
      { 0: {} },
      [{ id: "RFP-REQ-001" }, null],
      [{ id: "RFP-REQ-001" }, "junk"],
      [["nested"]],
    ];
    for (const requirements of variants) {
      const payload: Record<string, unknown> = {
        payloadKind: BASELINE_KIND,
        createdBy: CREATED_BY,
        createdAt: PAYLOAD_AT,
        requirementCount: 0,
        evidenceCount: 0,
      };
      if (requirements !== undefined) payload.requirements = requirements;
      artifactById.set(BASELINE_A, makeBaselineArtifact({ payload }));

      const result = await detail();

      expect(result.status).toBe("invalid_payload");
    }
  });
});

describe("loadRfpRequirementsBaselineDetail - ok", () => {
  it("returns the full sanitized baseline with requirement text and locator-only references", async () => {
    const result = await detail();

    expect(mockGetArtifact).toHaveBeenCalledTimes(1);
    expect(mockGetArtifact).toHaveBeenCalledWith(TENANT, PROJECT, BASELINE_A);
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "ok",
      project: expectedProjectSummary(),
      artifact: expectedArtifactSummary(baselineArtifact),
      baseline: expectedBaseline(),
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("inspects any version regardless of review status", async () => {
    artifactById.set(
      BASELINE_A,
      makeBaselineArtifact({ status: "rejected" })
    );

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact.status).toBe("rejected");
  });

  it("omits title/notes when not stored and degrades malformed requirement fields safely", async () => {
    artifactById.set(
      BASELINE_A,
      makeBaselineArtifact({
        payload: {
          payloadKind: BASELINE_KIND,
          createdBy: 42,
          createdAt: null,
          requirementCount: "two",
          evidenceCount: Number.NaN,
          requirements: [
            {
              id: 7,
              text: 42,
              category: null,
              priority: ["x"],
              title: 9,
              notes: {},
              evidenceReferences: "not-an-array",
            },
            {
              id: "RFP-REQ-002",
              text: REQ_TEXT_2,
              category: "other",
              priority: "unknown",
              evidenceReferences: [
                {
                  evidenceId: 5,
                  evidenceKind: "boq_line_item",
                  sourceFileId: null,
                  inputPackageArtifactId: 3,
                  chunkIndex: "one",
                },
              ],
            },
          ],
        },
      })
    );

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.baseline.createdBy).toBe("");
    expect(result.baseline.createdAt).toBe("");
    expect(result.baseline.requirementCount).toBe(0);
    expect(result.baseline.evidenceCount).toBe(0);
    const [first, second] = result.baseline.requirements;
    expect(first).toEqual({
      id: "",
      text: "",
      category: "",
      priority: "",
      evidenceReferences: [],
    });
    expect(Object.keys(first)).toEqual([
      "id",
      "text",
      "category",
      "priority",
      "evidenceReferences",
    ]);
    expect(second.evidenceReferences).toEqual([
      {
        evidenceId: "",
        sourceFileId: "",
        inputPackageArtifactId: "",
        evidenceKind: TEXT_KIND,
        chunkIndex: 0,
        chunkCount: 0,
        charCount: 0,
      },
    ]);
  });

  it("drops smuggled payload keys, raw evidence text, and table rows via the whitelist", async () => {
    artifactById.set(
      BASELINE_A,
      makeBaselineArtifact({ payload: makeSmuggledPayload() })
    );

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    // The whitelist output of the smuggled payload equals the clean one.
    expect(result.baseline).toEqual(expectedBaseline());
    const serialized = JSON.stringify(result);
    expect(serialized).toContain(REQ_TEXT_1);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "C:/secret",
      "RAW-EVIDENCE-TEXT",
      "RAW-TABLE-CELL",
      "SMUGGLED-ROOT-SECRET",
      "SMUGGLED-REQ-SECRET",
      "SMUGGLED-REF-SECRET",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("returns fresh copies, never aliases into the stored payload", async () => {
    const snapshot = structuredClone(baselineArtifact);

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const storedRequirements = baselineArtifact.payload
      .requirements as Array<Record<string, unknown>>;
    expect(result.baseline.requirements).not.toBe(storedRequirements);
    expect(result.baseline.requirements[0]).not.toBe(storedRequirements[0]);
    expect(result.baseline.requirements[0].evidenceReferences).not.toBe(
      storedRequirements[0].evidenceReferences
    );

    result.baseline.requirements[0].text = "hacked";
    result.baseline.requirements[0].evidenceReferences.push({
      evidenceId: "hacked",
      sourceFileId: "hacked",
      inputPackageArtifactId: "hacked",
      evidenceKind: TEXT_KIND,
      chunkIndex: 9,
      chunkCount: 9,
      charCount: 9,
    });
    result.baseline.requirements.push({
      id: "hacked",
      text: "hacked",
      category: "hacked",
      priority: "hacked",
      evidenceReferences: [],
    });
    result.artifact.sourceFileIds.push("hacked-file");
    result.artifact.sourceArtifactIds.push("hacked-artifact");
    expect(baselineArtifact).toEqual(snapshot);
  });

  it("bubbles an unexpected artifact read failure unhidden", async () => {
    mockGetArtifact.mockRejectedValue(new Error("artifact read failed"));

    await expect(detail()).rejects.toThrow("artifact read failed");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-requirements-baseline-inspection.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-requirements-baseline-inspection.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the two allowed store modules and type-only shape modules", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-requirements-baseline",
    ]);
    expect(source).toMatch(/import type \{[\s\S]*?\} from "@\/types\/project";/);
    expect(source).toMatch(
      /import type \{[\s\S]*?\} from "@\/lib\/projects\/project-rfp-requirements-baseline";/
    );
  });

  it("performs no store mutation calls at all", () => {
    const calls =
      source.match(/\b(?:create|update|delete|insert|remove|drop)[A-Z]\w*/g) ??
      [];
    expect(calls).toEqual([]);
  });

  it("never imports the evidence store or reads evidence content bodies", () => {
    expect(source).not.toContain("project-evidence-store");
    expect(source).not.toContain("getProjectEvidenceItemById");
    expect(source).not.toContain("listProjectEvidenceItems");
    expect(source).not.toContain("ProjectEvidenceItem");
    expect(source).not.toContain("content.text");
    expect(source).not.toContain("content.rows");
    expect(source).not.toContain(".rows");
    expect(source).not.toContain("storagePath");
  });

  it("imports no filesystem, parser, extraction, persistence, approval, route, UI, pricing, config, export, SKU, catalog, coordinator, engine, adapter, or AI module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "fs"',
      'from "path"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/index"',
      'from "@/lib/db/schema"',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-requirements-baseline-approval"',
      'from "@/lib/projects/project-rfp-input-package',
      'from "@/lib/projects/project-rfp-upload"',
      'from "@/lib/projects/project-rfp-creation"',
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/artifacts"',
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/files"',
      'from "@/lib/projects/stages"',
      'from "@/lib/projects/staleness"',
      'from "@/lib/projects/boq-',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom',
      'from "@/lib/projects/project-quick-bom',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/lib/validation',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/app',
      'from "@/components',
      'from "next',
      'from "react',
      "@anthropic-ai",
      "@google/generative-ai",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
      "xlsx",
      "benchmark",
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
