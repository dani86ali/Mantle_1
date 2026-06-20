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
  loadRfpEvidencePackageDetail,
  loadRfpEvidencePackageList,
  type LoadRfpEvidencePackageDetailInput,
  type LoadRfpEvidencePackageDetailResult,
  type LoadRfpEvidencePackageListInput,
  type LoadRfpEvidencePackageListResult,
} from "@/lib/projects/project-rfp-evidence-package-inspection";

// Payload marker and evidence kinds declared locally exactly like the service
// declares them - the draft/persistence/approval modules must stay
// runtime-unimported here too.
const PKG_KIND = "rfp_evidence_package" as const;
const TEXT_KIND = "rfp_document_text_chunk" as const;
const TABLE_KIND = "rfp_document_table" as const;

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const PKG_A = "art-evidence-package-1";
const PKG_B = "art-evidence-package-2";
const INPUT_PKG = "art-input-package-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const EV_TEXT = "evidence-text-1";
const EV_TABLE = "evidence-table-1";
const TABLE_ID = `${FILE_BOQ}:table:1`;
const CREATED_BY = "engineer@stc.example";
const PAYLOAD_AT = "2026-06-03T08:15:00.000Z";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const TEXT_BODY = "Contractor shall supply 48-port PoE access switches.";
const TABLE_CELL = "C9300-48P";

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

/** A well-formed text-chunk evidence entry exactly as the draft stores it. */
function makeTextEvidence(): Record<string, unknown> {
  return {
    evidenceId: EV_TEXT,
    evidenceKind: TEXT_KIND,
    sourceFileId: FILE_RFP,
    inputPackageArtifactId: INPUT_PKG,
    sourceFileName: "RFP.pdf",
    sourceFileRole: "rfp",
    chunkIndex: 0,
    chunkCount: 2,
    charCount: 52,
    text: TEXT_BODY,
    documentMetrics: {
      textCharCount: 1200,
      nonWhitespaceTextCharCount: 1000,
      tableCount: 1,
      tableRowCount: 3,
    },
  };
}

/** A well-formed table evidence entry exactly as the draft stores it. */
function makeTableEvidence(): Record<string, unknown> {
  return {
    evidenceId: EV_TABLE,
    evidenceKind: TABLE_KIND,
    sourceFileId: FILE_BOQ,
    inputPackageArtifactId: INPUT_PKG,
    sourceFileName: "BoQ.xlsx",
    sourceFileRole: "boq",
    tableId: TABLE_ID,
    sheetName: "BoQ Sheet",
    pageNumber: 4,
    rowCount: 2,
    columnCount: 2,
    rows: [
      ["SKU", "Qty"],
      [TABLE_CELL, "10"],
    ],
  };
}

/** A well-formed draft payload exactly as the draft service stores it. */
function makePackagePayload(): Record<string, unknown> {
  return {
    payloadKind: PKG_KIND,
    createdBy: CREATED_BY,
    createdAt: PAYLOAD_AT,
    inputPackageArtifactId: INPUT_PKG,
    evidenceCount: 2,
    textChunkCount: 1,
    tableEvidenceCount: 1,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [INPUT_PKG],
    evidence: [makeTextEvidence(), makeTableEvidence()],
  };
}

/**
 * A well-formed payload with secrets smuggled into every level: payload root
 * and both evidence entries. The whitelist must drop all of them while keeping
 * the reviewed evidence text body and table cells (final content under human
 * review).
 */
function makeSmuggledPayload(): Record<string, unknown> {
  const payload = makePackagePayload();
  payload.tenantId = TENANT;
  payload.storagePath = "C:/secret/rfp.pdf";
  payload.smuggledRoot = "SMUGGLED-ROOT-SECRET";
  const evidence = payload.evidence as Array<Record<string, unknown>>;
  evidence[0].tenantId = TENANT;
  evidence[0].storagePath = "C:/secret/rfp-source.pdf";
  evidence[0].provider = "PROVIDER-SECRET";
  evidence[0].smuggledText = "SMUGGLED-TEXT-SECRET";
  evidence[1].storagePath = "C:/secret/boq-workbook.xlsx";
  evidence[1].unitPrice = "PRICING-SECRET";
  evidence[1].sku = "SKU-SECRET";
  return payload;
}

function makePackageArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: PKG_A,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "evidence_package",
    status: "needs_review",
    version: 1,
    payload: makePackagePayload(),
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [INPUT_PKG],
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
    payloadKind: PKG_KIND,
    createdBy: CREATED_BY,
    createdAt: PAYLOAD_AT,
    inputPackageArtifactId: INPUT_PKG,
    evidenceCount: 2,
    textChunkCount: 1,
    tableEvidenceCount: 1,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [INPUT_PKG],
  };
}

/**
 * The compiled review the detail must derive from the fixture payload: the
 * lone text chunk becomes one grouped text finding, the lone table becomes one
 * readable table finding, nothing is suppressed, and the two deterministic
 * inputs balance exactly across the primary-finding audit.
 */
function expectedCompiledReview() {
  return {
    findings: [
      {
        findingId: "text-finding-1",
        kind: "text",
        title: "RFP.pdf",
        documentName: "RFP.pdf",
        role: "rfp",
        citations: [{ passageLabel: "Passage 1 of 2" }],
        body: TEXT_BODY,
        flags: {
          duplicate: false,
          boilerplate: false,
          lowConfidence: false,
          aiRefined: false,
          tableRepaired: false,
          missingFromDeterministic: false,
          conflict: false,
        },
        audit: [
          {
            evidenceId: EV_TEXT,
            evidenceKind: TEXT_KIND,
            sourceFileId: FILE_RFP,
            inputPackageArtifactId: INPUT_PKG,
            chunkIndex: 0,
            chunkCount: 2,
            charCount: 52,
          },
        ],
      },
      {
        findingId: "table-finding-1",
        kind: "table",
        title: "Table - BoQ Sheet",
        documentName: "BoQ.xlsx",
        role: "boq",
        citations: [
          { tableLabel: "Table 1", pageLabel: "Page 4", sheetLabel: "Sheet: BoQ Sheet" },
        ],
        table: {
          rows: [
            ["SKU", "Qty"],
            [TABLE_CELL, "10"],
          ],
        },
        flags: {
          duplicate: false,
          boilerplate: false,
          lowConfidence: false,
          aiRefined: false,
          tableRepaired: false,
          missingFromDeterministic: false,
          conflict: false,
        },
        audit: [
          {
            evidenceId: EV_TABLE,
            evidenceKind: TABLE_KIND,
            sourceFileId: FILE_BOQ,
            inputPackageArtifactId: INPUT_PKG,
            tableId: TABLE_ID,
            pageNumber: 4,
            sheetName: "BoQ Sheet",
            rowCount: 2,
            columnCount: 2,
          },
        ],
      },
    ],
    suppressed: [],
    accounting: {
      deterministicInputCount: 2,
      deterministicTextInputCount: 1,
      deterministicTableInputCount: 1,
      primaryFindingCount: 2,
      textFindingCount: 1,
      tableFindingCount: 1,
      repairedTableFindingCount: 0,
      missingCandidateFindingCount: 0,
      accountedInPrimaryCount: 2,
      suppressedCount: 0,
      suppressedByReason: {
        empty_fragment: 0,
        tiny_fragment: 0,
        duplicate_body: 0,
        page_only: 0,
        proprietary_notice: 0,
        repeated_header: 0,
      },
      flagSummary: {
        duplicate: 0,
        boilerplate: 0,
        lowConfidence: 0,
        aiRefined: 0,
        tableRepaired: 0,
        missingFromDeterministic: 0,
        conflict: 0,
      },
      balanced: true,
    },
  };
}

/** The sanitized package the detail must produce from the fixture payload. */
function expectedPackage() {
  return {
    payloadKind: PKG_KIND,
    createdBy: CREATED_BY,
    createdAt: PAYLOAD_AT,
    inputPackageArtifactId: INPUT_PKG,
    evidenceCount: 2,
    textChunkCount: 1,
    tableEvidenceCount: 1,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [INPUT_PKG],
    evidence: [
      {
        evidenceId: EV_TEXT,
        sourceFileId: FILE_RFP,
        inputPackageArtifactId: INPUT_PKG,
        evidenceKind: TEXT_KIND,
        sourceFileName: "RFP.pdf",
        sourceFileRole: "rfp",
        chunkIndex: 0,
        chunkCount: 2,
        charCount: 52,
        text: TEXT_BODY,
        documentMetrics: {
          textCharCount: 1200,
          nonWhitespaceTextCharCount: 1000,
          tableCount: 1,
          tableRowCount: 3,
        },
      },
      {
        evidenceId: EV_TABLE,
        sourceFileId: FILE_BOQ,
        inputPackageArtifactId: INPUT_PKG,
        evidenceKind: TABLE_KIND,
        sourceFileName: "BoQ.xlsx",
        sourceFileRole: "boq",
        tableId: TABLE_ID,
        pageNumber: 4,
        sheetName: "BoQ Sheet",
        rowCount: 2,
        columnCount: 2,
        rows: [
          ["SKU", "Qty"],
          [TABLE_CELL, "10"],
        ],
      },
    ],
    compiledReview: expectedCompiledReview(),
  };
}

function list(
  overrides: Partial<LoadRfpEvidencePackageListInput> = {}
): Promise<LoadRfpEvidencePackageListResult> {
  return loadRfpEvidencePackageList({
    tenantId: TENANT,
    projectId: PROJECT,
    ...overrides,
  });
}

function detail(
  overrides: Partial<LoadRfpEvidencePackageDetailInput> = {}
): Promise<LoadRfpEvidencePackageDetailResult> {
  return loadRfpEvidencePackageDetail({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: PKG_A,
    ...overrides,
  });
}

function expectNoStoreCalls(): void {
  expect(mockGetProject).not.toHaveBeenCalled();
  expect(mockGetArtifact).not.toHaveBeenCalled();
  expect(mockListArtifactsByType).not.toHaveBeenCalled();
}

let packageArtifact: ProjectArtifact;
let artifactById: Map<string, ProjectArtifact>;

beforeEach(() => {
  packageArtifact = makePackageArtifact();
  artifactById = new Map([[PKG_A, packageArtifact]]);
  mockGetProject.mockReset().mockResolvedValue(makeProject());
  mockGetArtifact
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, _projectId: string, artifactId: string) =>
        artifactById.get(artifactId) ?? null
    );
  mockListArtifactsByType
    .mockReset()
    .mockImplementation(async () => [packageArtifact]);
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

describe("loadRfpEvidencePackageList", () => {
  it("lists evidence_package versions with whitelisted payload summaries", async () => {
    const versionTwo = makePackageArtifact({
      id: PKG_B,
      version: 2,
      status: "approved",
    });
    mockListArtifactsByType.mockResolvedValue([packageArtifact, versionTwo]);

    const result = await list();

    expect(mockListArtifactsByType).toHaveBeenCalledTimes(1);
    expect(mockListArtifactsByType).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "evidence_package"
    );
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "ok",
      project: expectedProjectSummary(),
      artifacts: [
        {
          ...expectedArtifactSummary(packageArtifact),
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

  it("keeps only evidence_package rows even if the store returns others", async () => {
    const stray = makePackageArtifact({
      id: "art-stray-1",
      type: "normalized_boq",
      stageId: "boq_format_validation",
    });
    mockListArtifactsByType.mockResolvedValue([packageArtifact, stray]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    expect(result.artifacts.map((entry) => entry.id)).toEqual([PKG_A]);
  });

  it("degrades malformed list payloads to safe summary fields without throwing or leaking", async () => {
    const malformed = makePackageArtifact({
      id: PKG_B,
      payload: {
        payloadKind: 42,
        createdBy: null,
        createdAt: ["nope"],
        inputPackageArtifactId: {},
        evidenceCount: "two",
        textChunkCount: Number.NaN,
        tableEvidenceCount: Number.POSITIVE_INFINITY,
        sourceFileIds: ["ok", 7],
        sourceArtifactIds: "not-an-array",
        evidence: [makeTextEvidence()],
        tenantId: TENANT,
        storagePath: "C:/secret/rfp.pdf",
        smuggledRoot: "SMUGGLED-ROOT-SECRET",
      },
    });
    const empty = makePackageArtifact({
      id: "art-evidence-package-3",
      payload: {},
    });
    mockListArtifactsByType.mockResolvedValue([malformed, empty]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifacts.map((entry) => entry.payloadSummary)).toEqual([
      {
        payloadKind: "",
        createdBy: "",
        createdAt: "",
        inputPackageArtifactId: "",
        evidenceCount: 0,
        textChunkCount: 0,
        tableEvidenceCount: 0,
        sourceFileIds: [],
        sourceArtifactIds: [],
      },
      {
        payloadKind: "",
        createdBy: "",
        createdAt: "",
        inputPackageArtifactId: "",
        evidenceCount: 0,
        textChunkCount: 0,
        tableEvidenceCount: 0,
        sourceFileIds: [],
        sourceArtifactIds: [],
      },
    ]);
    const serialized = JSON.stringify(result);
    for (const leak of [
      TEXT_BODY,
      TENANT,
      "tenantId",
      "storagePath",
      "C:/secret",
      "SMUGGLED-ROOT-SECRET",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("never exposes evidence text bodies, table rows, or secrets in list summaries", async () => {
    const smuggled = makePackageArtifact({ payload: makeSmuggledPayload() });
    mockListArtifactsByType.mockResolvedValue([smuggled]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifacts[0].payloadSummary).toEqual(expectedPayloadSummary());
    const serialized = JSON.stringify(result);
    for (const leak of [
      TEXT_BODY,
      TABLE_CELL,
      "SMUGGLED-ROOT-SECRET",
      "SMUGGLED-TEXT-SECRET",
      "PROVIDER-SECRET",
      "PRICING-SECRET",
      "SKU-SECRET",
      TENANT,
      "tenantId",
      "storagePath",
      "C:/secret",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("returns serializable fresh copies whose mutation never touches the stored row", async () => {
    const snapshot = structuredClone(packageArtifact);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    result.artifacts[0].sourceFileIds.push("hacked-file");
    result.artifacts[0].sourceArtifactIds.push("hacked-artifact");
    result.artifacts[0].payloadSummary.sourceFileIds.push("hacked-file");
    result.artifacts[0].payloadSummary.sourceArtifactIds.push("hacked-artifact");
    expect(packageArtifact).toEqual(snapshot);
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

describe("loadRfpEvidencePackageDetail - artifact gates", () => {
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

  it("returns artifact_not_evidence_package for a wrong type, without its payload", async () => {
    const inputPackage = makePackageArtifact({
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
      status: "artifact_not_evidence_package",
      artifact: expectedArtifactSummary(inputPackage),
    });
    expect(JSON.stringify(result)).not.toContain("PACKAGE-PAYLOAD-SECRET");
  });

  it("returns artifact_not_evidence_package for an evidence_package at the wrong stage", async () => {
    artifactById.set(
      PKG_A,
      makePackageArtifact({ stageId: "requirements_baseline_review" })
    );

    const result = await detail();

    expect(result.status).toBe("artifact_not_evidence_package");
    expect(JSON.stringify(result)).not.toContain(TEXT_BODY);
    expect(JSON.stringify(result)).not.toContain(TABLE_CELL);
  });

  it("returns invalid_payload for a wrong marker, non-object payload, or malformed evidence", async () => {
    const payloads: unknown[] = [
      {
        payloadKind: "rfp_input_package",
        evidence: [],
        secret: "SMUGGLED-ROOT-SECRET",
      },
      { payloadKind: 42, evidence: [] },
      "not-an-object",
      42,
      null,
      [],
      { payloadKind: PKG_KIND },
      { payloadKind: PKG_KIND, evidence: "not-an-array" },
      { payloadKind: PKG_KIND, evidence: 7 },
      { payloadKind: PKG_KIND, evidence: [makeTextEvidence(), null] },
      { payloadKind: PKG_KIND, evidence: [makeTextEvidence(), "junk"] },
      { payloadKind: PKG_KIND, evidence: [["nested"]] },
    ];
    for (const payload of payloads) {
      const stored = makePackageArtifact({
        payload: payload as Record<string, unknown>,
      });
      artifactById.set(PKG_A, stored);

      const result = await detail();

      expect(result).toEqual({
        status: "invalid_payload",
        artifact: expectedArtifactSummary(stored),
      });
      expect(JSON.stringify(result)).not.toContain("SMUGGLED-ROOT-SECRET");
    }
  });
});

describe("loadRfpEvidencePackageDetail - ok", () => {
  it("returns the full sanitized package with text bodies, table rows, metrics, and source ids", async () => {
    const result = await detail();

    expect(mockGetArtifact).toHaveBeenCalledTimes(1);
    expect(mockGetArtifact).toHaveBeenCalledWith(TENANT, PROJECT, PKG_A);
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "ok",
      project: expectedProjectSummary(),
      artifact: expectedArtifactSummary(packageArtifact),
      package: expectedPackage(),
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    const serialized = JSON.stringify(result);
    expect(serialized).toContain(TEXT_BODY);
    expect(serialized).toContain(TABLE_CELL);
  });

  it("derives compiledReview from the sanitized entries while keeping the legacy evidence array", async () => {
    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    // The legacy raw evidence array is retained for audit/backward compat.
    expect(result.package.evidence).toHaveLength(2);
    // The compiled review is exactly the deterministic projection.
    expect(result.package.compiledReview).toEqual(expectedCompiledReview());
    // Every deterministic input is accounted for exactly once.
    const { accounting } = result.package.compiledReview;
    expect(accounting.balanced).toBe(true);
    expect(
      accounting.accountedInPrimaryCount + accounting.suppressedCount
    ).toBe(accounting.deterministicInputCount);
    expect(accounting.deterministicInputCount).toBe(
      result.package.evidence.length
    );
    // Primary compiled finding DISPLAY fields (everything but the audit array)
    // never leak raw ids, table ids, or the word "chunk".
    const primary = JSON.stringify(
      result.package.compiledReview.findings.map(({ audit, ...rest }) => rest)
    );
    for (const raw of [EV_TEXT, EV_TABLE, TABLE_ID, "chunk"]) {
      expect(primary).not.toContain(raw);
    }
  });

  it("inspects any version regardless of review status", async () => {
    artifactById.set(PKG_A, makePackageArtifact({ status: "approved" }));

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact.status).toBe("approved");
  });

  it("degrades a non-table evidence kind through the text shape with safe fields", async () => {
    const oddEvidence = {
      evidenceId: 7,
      evidenceKind: "boq_line_item",
      sourceFileId: null,
      inputPackageArtifactId: 3,
      sourceFileName: 5,
      chunkIndex: "one",
      chunkCount: Number.NaN,
      charCount: 12,
      text: 99,
      documentMetrics: { textCharCount: 10 },
    };
    const payload = makePackagePayload();
    payload.evidence = [oddEvidence];
    artifactById.set(PKG_A, makePackageArtifact({ payload }));

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.package.evidence).toEqual([
      {
        evidenceId: "",
        sourceFileId: "",
        inputPackageArtifactId: "",
        evidenceKind: TEXT_KIND,
        chunkIndex: 0,
        chunkCount: 0,
        charCount: 12,
        text: "",
      },
    ]);
  });

  it("degrades malformed table rows and cells to a safe matrix", async () => {
    const malformedTable = makeTableEvidence();
    malformedTable.rows = [["ok", 7, null], "not-a-row", 42, [{}, "tail"]];
    const payload = makePackagePayload();
    (payload.evidence as unknown[])[1] = malformedTable;
    artifactById.set(PKG_A, makePackageArtifact({ payload }));

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const tableEntry = result.package.evidence[1];
    if (tableEntry.evidenceKind !== TABLE_KIND) {
      throw new Error("expected table evidence");
    }
    expect(tableEntry.rows).toEqual([["ok", "", ""], [], [], ["", "tail"]]);
  });

  it("drops smuggled payload and evidence keys while keeping the reviewed text and rows", async () => {
    artifactById.set(
      PKG_A,
      makePackageArtifact({ payload: makeSmuggledPayload() })
    );

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    // The whitelist output of the smuggled payload equals the clean one.
    expect(result.package).toEqual(expectedPackage());
    const serialized = JSON.stringify(result);
    expect(serialized).toContain(TEXT_BODY);
    expect(serialized).toContain(TABLE_CELL);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "C:/secret",
      "PROVIDER-SECRET",
      "PRICING-SECRET",
      "SKU-SECRET",
      "SMUGGLED-ROOT-SECRET",
      "SMUGGLED-TEXT-SECRET",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("returns fresh copies, never aliases into the stored payload", async () => {
    const snapshot = structuredClone(packageArtifact);

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const storedEvidence = packageArtifact.payload.evidence as Array<
      Record<string, unknown>
    >;
    expect(result.package.evidence).not.toBe(storedEvidence);
    expect(result.package.evidence[1]).not.toBe(storedEvidence[1]);
    const tableEntry = result.package.evidence[1];
    if (tableEntry.evidenceKind !== TABLE_KIND) {
      throw new Error("expected table evidence");
    }
    expect(tableEntry.rows).not.toBe(storedEvidence[1].rows);

    tableEntry.rows.push(["hacked-row"]);
    tableEntry.rows[0].push("hacked-cell");
    result.package.sourceFileIds.push("hacked-file");
    result.package.sourceArtifactIds.push("hacked-artifact");
    result.artifact.sourceFileIds.push("hacked-file");
    result.artifact.sourceArtifactIds.push("hacked-artifact");
    expect(packageArtifact).toEqual(snapshot);
  });

  it("bubbles an unexpected artifact read failure unhidden", async () => {
    mockGetArtifact.mockRejectedValue(new Error("artifact read failed"));

    await expect(detail()).rejects.toThrow("artifact read failed");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-evidence-package-inspection.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-evidence-package-inspection.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the allowed store and type-only shape modules", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-evidence-package",
      "@/lib/projects/project-rfp-compiled-evidence-review",
    ]);
    expect(source).toMatch(/import type \{[\s\S]*?\} from "@\/types\/project";/);
    expect(source).toMatch(
      /import type \{[\s\S]*?\} from "@\/lib\/projects\/project-rfp-evidence-package";/
    );
  });

  it("imports the evidence-package shapes type-only and never as a runtime value", () => {
    // The draft module exports a runtime payload-kind const and the draft
    // creator; this read module pulls only the type-only shapes, never a
    // runtime value. The tempered gap cannot cross a `from`, so it can only
    // match a genuine non-type import of the draft module (none exists).
    expect(source).toMatch(
      /import type \{[\s\S]*?\} from "@\/lib\/projects\/project-rfp-evidence-package";/
    );
    expect(source).not.toContain("createRfpEvidencePackageDraft");
    expect(source).not.toMatch(
      /import \{(?:(?!from)[\s\S])*?\}\s+from\s+"@\/lib\/projects\/project-rfp-evidence-package"/
    );
  });

  it("performs no store mutation calls at all", () => {
    const calls =
      source.match(
        /\b(?:create|update|delete|insert|remove|drop|persist|save|upsert)[A-Z]\w*/g
      ) ?? [];
    expect(calls).toEqual([]);
  });

  it("never reads the evidence store or evidence content bodies", () => {
    expect(source).not.toContain("project-evidence-store");
    expect(source).not.toContain("getProjectEvidenceItemById");
    expect(source).not.toContain("listProjectEvidenceItems");
    expect(source).not.toContain("ProjectEvidenceItem");
    expect(source).not.toContain("content.text");
    expect(source).not.toContain("content.rows");
    expect(source).not.toContain("storagePath");
    expect(source).not.toContain("benchmark");
  });

  it("imports no filesystem, parser, OCR, AI, provider, adapter, executor, route, UI, approval, extraction-delta, requirements, pricing, SKU, config, export, catalog, coordinator, or engine module", () => {
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
      'from "@/lib/projects/project-rfp-evidence-package-approval"',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/project-rfp-extraction',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-requirements',
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
