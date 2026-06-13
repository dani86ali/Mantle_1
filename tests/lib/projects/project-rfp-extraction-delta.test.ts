import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectEvidenceItem,
} from "@/types/project";

// Mock ONLY the three store boundaries (project read, artifact read/create,
// evidence read); the draft service's validation, sanitization, gating, and
// summaries stay real. No DB, file bytes, parser, or AI module is touched
// anywhere in this suite.
const { mockGetProject, mockGetArtifact, mockCreateArtifact, mockGetEvidence } =
  vi.hoisted(() => ({
    mockGetProject: vi.fn(),
    mockGetArtifact: vi.fn(),
    mockCreateArtifact: vi.fn(),
    mockGetEvidence: vi.fn(),
  }));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifact,
  createProjectArtifactVersion: mockCreateArtifact,
}));
vi.mock("@/lib/db/project-evidence-store", () => ({
  getProjectEvidenceItemById: mockGetEvidence,
}));

import {
  createRfpExtractionDeltaDraft,
  RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
  RFP_EXTRACTION_DELTA_KINDS,
  RFP_EXTRACTION_DELTA_PROPOSAL_SOURCES,
  RFP_EXTRACTION_DELTA_REVIEW_ACTIONS,
  RFP_EXTRACTION_DELTA_REVIEW_STATUSES,
  type CreateRfpExtractionDeltaDraftInput,
  type CreateRfpExtractionDeltaDraftResult,
  type RfpExtractionDeltaCandidateInput,
} from "@/lib/projects/project-rfp-extraction-delta";

// The two citable evidence kinds, declared locally exactly like the service
// declares them - the persistence write module must stay unimported here too.
const TEXT_KIND = "rfp_document_text_chunk" as const;
const TABLE_KIND = "rfp_document_table" as const;

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const PACKAGE_A = "art-input-package-1";
const PACKAGE_B = "art-input-package-2";
const CREATED_ARTIFACT = "art-extraction-delta-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const EV_TEXT_1 = "evidence-text-1";
const EV_TABLE_1 = "evidence-table-1";
const EV_TABLE_2 = "evidence-table-2";
const TABLE_ID = `${FILE_BOQ}:table:1`;
const TABLE_ID_PDF = `${FILE_RFP}:table:1`;
const CREATED_BY = "engineer@stc.example";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const STORED_AT = new Date("2026-06-03T08:15:00.000Z");
const RETAIN_AT = new Date("2027-06-03T08:15:00.000Z");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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

/** One persisted text-chunk row (raw text body included, as stored). */
function makeTextChunkItem(
  id: string,
  overrides: Partial<ProjectEvidenceItem> = {}
): ProjectEvidenceItem {
  return {
    id,
    projectId: PROJECT,
    sourceFileId: FILE_RFP,
    kind: TEXT_KIND,
    content: {
      evidenceKind: TEXT_KIND,
      inputPackageArtifactId: PACKAGE_A,
      sourceFileId: FILE_RFP,
      sourceFileName: "rfp.pdf",
      sourceFileRole: "rfp",
      chunkIndex: 1,
      chunkCount: 2,
      text: "RAW-EVIDENCE-TEXT: contractor shall supply PoE access switches.",
      charCount: 63,
      internalExtractorState: "ARBITRARY-CONTENT-KEY-VALUE",
    },
    extractedAt: STORED_AT,
    retainUntil: RETAIN_AT,
    ...overrides,
  };
}

/** One persisted table row (raw rows matrix included, as stored). */
function makeTableItem(
  id: string,
  overrides: Partial<ProjectEvidenceItem> = {}
): ProjectEvidenceItem {
  return {
    id,
    projectId: PROJECT,
    sourceFileId: FILE_BOQ,
    kind: TABLE_KIND,
    content: {
      evidenceKind: TABLE_KIND,
      inputPackageArtifactId: PACKAGE_A,
      sourceFileId: FILE_BOQ,
      sourceFileName: "boq.xlsx",
      sourceFileRole: "boq",
      tableId: TABLE_ID,
      sheetName: "BoQ Sheet",
      rowCount: 2,
      columnCount: 2,
      rows: [
        ["RAW-TABLE-CELL-A1", "1"],
        ["RAW-TABLE-CELL-A2", "2"],
      ],
      parserDebugState: "RAW-FILE-BYTES-BASE64",
    },
    extractedAt: STORED_AT,
    retainUntil: RETAIN_AT,
    ...overrides,
  };
}

/** One persisted PDF table row carrying pageNumber instead of sheetName. */
function makePdfTableItem(id: string): ProjectEvidenceItem {
  return makeTableItem(id, {
    sourceFileId: FILE_RFP,
    content: {
      evidenceKind: TABLE_KIND,
      inputPackageArtifactId: PACKAGE_A,
      sourceFileId: FILE_RFP,
      sourceFileName: "rfp.pdf",
      sourceFileRole: "rfp",
      tableId: TABLE_ID_PDF,
      pageNumber: 3,
      rowCount: 1,
      columnCount: 2,
      rows: [["RAW-TABLE-CELL-B1", "RAW-TABLE-CELL-B2"]],
      parserDebugState: "RAW-FILE-BYTES-BASE64",
    },
  });
}

/** One stored approved input_package artifact version. */
function makeInputPackageArtifact(
  id: string,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "input_package",
    status: "approved",
    version: 3,
    payload: {
      payloadKind: "rfp_input_package",
      marker: "PACKAGE-PAYLOAD-SECRET",
    },
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

/** The shape the artifact create store receives. */
interface CreateArtifactCall {
  projectId: string;
  tenantId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status?: ProjectArtifact["status"];
  payload?: Record<string, unknown>;
  sourceFileIds?: string[];
  sourceArtifactIds?: string[];
}

/** The stored row the mocked create returns, echoing the create input. */
function makeStoredArtifact(call: CreateArtifactCall): ProjectArtifact {
  return {
    id: CREATED_ARTIFACT,
    projectId: call.projectId,
    stageId: call.stageId,
    type: call.type,
    status: call.status ?? "generated",
    version: 1,
    payload: call.payload ?? {},
    sourceFileIds: (call.sourceFileIds ?? []).slice(),
    sourceArtifactIds: (call.sourceArtifactIds ?? []).slice(),
    createdAt: STORED_AT,
    updatedAt: STORED_AT,
  };
}

function makeCandidate(
  overrides: Partial<RfpExtractionDeltaCandidateInput> = {}
): RfpExtractionDeltaCandidateInput {
  return {
    kind: "missing_evidence",
    sourceFileId: FILE_RFP,
    title: "Missing PoE budget table",
    description: "The PoE budget table on page 12 was not extracted.",
    ...overrides,
  };
}

function draft(
  overrides: Partial<CreateRfpExtractionDeltaDraftInput> = {}
): Promise<CreateRfpExtractionDeltaDraftResult> {
  return createRfpExtractionDeltaDraft({
    tenantId: TENANT,
    projectId: PROJECT,
    inputPackageArtifactId: PACKAGE_A,
    createdBy: `  ${CREATED_BY}  `,
    proposalSource: "deterministic",
    candidates: [makeCandidate({ evidenceIds: [EV_TEXT_1] })],
    ...overrides,
  });
}

function expectNoStoreCalls(): void {
  expect(mockGetProject).not.toHaveBeenCalled();
  expect(mockGetArtifact).not.toHaveBeenCalled();
  expect(mockGetEvidence).not.toHaveBeenCalled();
  expect(mockCreateArtifact).not.toHaveBeenCalled();
}

const LEAN_PACKAGE_A_SUMMARY = {
  id: PACKAGE_A,
  projectId: PROJECT,
  stageId: "intake_package_review",
  type: "input_package",
  status: "approved",
  version: 3,
  sourceFileIds: [FILE_RFP, FILE_BOQ],
  sourceArtifactIds: [],
  createdAt: TS1.toISOString(),
  updatedAt: TS2.toISOString(),
};

let evidenceById: Map<string, ProjectEvidenceItem>;
let artifactById: Map<string, ProjectArtifact>;

beforeEach(() => {
  evidenceById = new Map([
    [EV_TEXT_1, makeTextChunkItem(EV_TEXT_1)],
    [EV_TABLE_1, makeTableItem(EV_TABLE_1)],
    [EV_TABLE_2, makePdfTableItem(EV_TABLE_2)],
  ]);
  artifactById = new Map([[PACKAGE_A, makeInputPackageArtifact(PACKAGE_A)]]);
  mockGetProject.mockReset().mockResolvedValue(makeProject());
  mockGetArtifact
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, _projectId: string, artifactId: string) =>
        artifactById.get(artifactId) ?? null
    );
  mockGetEvidence
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, _projectId: string, evidenceId: string) =>
        evidenceById.get(evidenceId) ?? null
    );
  mockCreateArtifact
    .mockReset()
    .mockImplementation(async (call: CreateArtifactCall) =>
      makeStoredArtifact(call)
    );
});

describe("exported vocabularies", () => {
  it("pins the candidate kinds and proposal sources", () => {
    expect(RFP_EXTRACTION_DELTA_KINDS).toEqual([
      "missing_evidence",
      "incorrect_extraction",
      "table_reconstruction",
      "suspicious_item",
    ]);
    expect(RFP_EXTRACTION_DELTA_PROPOSAL_SOURCES).toEqual([
      "deterministic",
      "ai",
      "engineer",
    ]);
  });

  it("pins the review statuses and review actions for the review service", () => {
    expect(RFP_EXTRACTION_DELTA_REVIEW_STATUSES).toEqual([
      "pending_review",
      "accepted",
      "rejected",
      "waived",
    ]);
    expect(RFP_EXTRACTION_DELTA_REVIEW_ACTIONS).toEqual([
      "accept",
      "reject",
      "edit_accept",
      "waive",
    ]);
  });
});

describe("createRfpExtractionDeltaDraft - validation before store calls", () => {
  it("throws on a blank projectId", async () => {
    for (const blank of ["", "   "]) {
      await expect(draft({ projectId: blank })).rejects.toThrow(
        "projectId is required."
      );
    }
    expectNoStoreCalls();
  });

  it("throws on a blank inputPackageArtifactId", async () => {
    for (const blank of ["", "   "]) {
      await expect(draft({ inputPackageArtifactId: blank })).rejects.toThrow(
        "inputPackageArtifactId is required."
      );
    }
    expectNoStoreCalls();
  });

  it("throws on a blank createdBy", async () => {
    for (const blank of ["", "   "]) {
      await expect(draft({ createdBy: blank })).rejects.toThrow(
        "createdBy is required."
      );
    }
    expectNoStoreCalls();
  });

  it("throws on an unknown proposalSource", async () => {
    for (const bad of ["llm", "", undefined]) {
      await expect(
        draft({
          proposalSource:
            bad as CreateRfpExtractionDeltaDraftInput["proposalSource"],
        })
      ).rejects.toThrow(
        "proposalSource must be one of deterministic | ai | engineer."
      );
    }
    expectNoStoreCalls();
  });

  it("throws when candidates is not an array", async () => {
    for (const bad of ["not-an-array", null, undefined, {}]) {
      await expect(
        draft({
          candidates:
            bad as unknown as CreateRfpExtractionDeltaDraftInput["candidates"],
        })
      ).rejects.toThrow("candidates must be an array.");
    }
    expectNoStoreCalls();
  });

  it("throws on a non-object candidate", async () => {
    for (const bad of [null, "x", 42, []]) {
      await expect(
        draft({
          candidates: [bad as unknown as RfpExtractionDeltaCandidateInput],
        })
      ).rejects.toThrow("candidates[0] must be an object.");
    }
    expectNoStoreCalls();
  });

  it("throws on an unknown candidate kind", async () => {
    for (const bad of ["extra_evidence", undefined, 7]) {
      await expect(
        draft({
          candidates: [
            makeCandidate({
              kind: bad as RfpExtractionDeltaCandidateInput["kind"],
            }),
          ],
        })
      ).rejects.toThrow(
        "candidates[0].kind must be one of missing_evidence | incorrect_extraction | table_reconstruction | suspicious_item."
      );
    }
    expectNoStoreCalls();
  });

  it("throws on a blank or non-string candidate sourceFileId", async () => {
    for (const bad of ["", "   ", 42]) {
      await expect(
        draft({
          candidates: [
            makeCandidate({ sourceFileId: bad as unknown as string }),
          ],
        })
      ).rejects.toThrow("candidates[0].sourceFileId is required.");
    }
    expectNoStoreCalls();
  });

  it("throws on a blank or non-string candidate title", async () => {
    for (const bad of ["", "   ", 7]) {
      await expect(
        draft({
          candidates: [makeCandidate({ title: bad as unknown as string })],
        })
      ).rejects.toThrow("candidates[0].title is required.");
    }
    expectNoStoreCalls();
  });

  it("throws on a blank or non-string candidate description", async () => {
    for (const bad of ["", "   ", null]) {
      await expect(
        draft({
          candidates: [
            makeCandidate({ description: bad as unknown as string }),
          ],
        })
      ).rejects.toThrow("candidates[0].description is required.");
    }
    expectNoStoreCalls();
  });

  it("throws on an unknown candidate severity", async () => {
    for (const bad of ["fatal", null, 1]) {
      await expect(
        draft({
          candidates: [
            makeCandidate({
              severity: bad as RfpExtractionDeltaCandidateInput["severity"],
            }),
          ],
        })
      ).rejects.toThrow(
        "candidates[0].severity must be one of info | warning | blocking."
      );
    }
    expectNoStoreCalls();
  });

  it("throws on a non-finite or out-of-range candidate confidence", async () => {
    for (const bad of [
      -0.1,
      1.1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "0.5",
      null,
    ]) {
      await expect(
        draft({
          candidates: [
            makeCandidate({ confidence: bad as unknown as number }),
          ],
        })
      ).rejects.toThrow(
        "candidates[0].confidence must be a finite number between 0 and 1 inclusive."
      );
    }
    expectNoStoreCalls();
  });

  it("names the failing candidate index in the error", async () => {
    await expect(
      draft({
        candidates: [
          makeCandidate(),
          makeCandidate({
            kind: "bogus" as RfpExtractionDeltaCandidateInput["kind"],
          }),
        ],
      })
    ).rejects.toThrow("candidates[1].kind must be one of");
    expectNoStoreCalls();
  });
});

describe("project gates", () => {
  it("returns not_found for a missing project and reads no artifact or evidence", async () => {
    mockGetProject.mockResolvedValue(null);

    expect(await draft()).toEqual({ status: "not_found" });
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockGetEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a lean no-tenantId summary for a quick_bom project", async () => {
    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await draft();

    expect(result).toEqual({
      status: "wrong_mode",
      project: {
        id: PROJECT,
        name: "STC RFP Bid",
        customerName: "STC",
        mode: "quick_bom",
        createdAt: TS1.toISOString(),
        updatedAt: TS2.toISOString(),
      },
    });
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockGetEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("input package gates", () => {
  it("returns input_package_not_found for a missing artifact and reads no evidence", async () => {
    artifactById.delete(PACKAGE_A);

    expect(await draft()).toEqual({ status: "input_package_not_found" });
    expect(mockGetArtifact).toHaveBeenCalledWith(TENANT, PROJECT, PACKAGE_A);
    expect(mockGetEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns artifact_not_input_package for a wrong artifact type, without its payload", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, {
        type: "normalized_boq",
        stageId: "boq_format_validation",
      })
    );

    const result = await draft();

    expect(result).toEqual({
      status: "artifact_not_input_package",
      artifact: {
        ...LEAN_PACKAGE_A_SUMMARY,
        type: "normalized_boq",
        stageId: "boq_format_validation",
      },
    });
    expect(JSON.stringify(result)).not.toContain("PACKAGE-PAYLOAD-SECRET");
    expect(mockGetEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns artifact_not_input_package for an input_package at the wrong stage", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, {
        stageId: "requirements_baseline_review",
      })
    );

    const result = await draft();

    expect(result.status).toBe("artifact_not_input_package");
    expect(mockGetEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns input_package_not_approved for a non-approved package version", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, { status: "needs_review" })
    );

    const result = await draft();

    expect(result).toEqual({
      status: "input_package_not_approved",
      artifact: { ...LEAN_PACKAGE_A_SUMMARY, status: "needs_review" },
    });
    expect(JSON.stringify(result)).not.toContain("PACKAGE-PAYLOAD-SECRET");
    expect(mockGetEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns input_package_has_no_source_files for an empty sourceFileIds list", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, { sourceFileIds: [] })
    );

    const result = await draft();

    expect(result).toEqual({
      status: "input_package_has_no_source_files",
      artifact: { ...LEAN_PACKAGE_A_SUMMARY, sourceFileIds: [] },
    });
    expect(mockGetEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("candidate source-file gate", () => {
  it("returns every offending sourceFileId deduped in candidate order and reads no evidence", async () => {
    const result = await draft({
      candidates: [
        makeCandidate({
          sourceFileId: "file-rogue-2",
          evidenceIds: [EV_TEXT_1],
        }),
        makeCandidate(),
        makeCandidate({ sourceFileId: "file-rogue-1" }),
        makeCandidate({ sourceFileId: "file-rogue-2" }),
      ],
    });

    expect(result).toEqual({
      status: "candidate_source_file_not_in_package",
      sourceFileIds: ["file-rogue-2", "file-rogue-1"],
    });
    expect(mockGetEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("cited evidence gates", () => {
  it("trims, dedupes, and loads cited evidence once in candidate citation order", async () => {
    await draft({
      candidates: [
        makeCandidate({
          kind: "table_reconstruction",
          sourceFileId: FILE_BOQ,
          evidenceIds: [` ${EV_TABLE_1} `, EV_TABLE_1, "", "   "],
        }),
        makeCandidate({ evidenceIds: [EV_TEXT_1, EV_TABLE_1] }),
      ],
    });

    expect(mockGetEvidence.mock.calls).toEqual([
      [TENANT, PROJECT, EV_TABLE_1],
      [TENANT, PROJECT, EV_TEXT_1],
    ]);
    const payload = mockCreateArtifact.mock.calls[0][0].payload;
    expect(
      payload.candidates[0].evidenceReferences.map(
        (reference: { evidenceId: string }) => reference.evidenceId
      )
    ).toEqual([EV_TABLE_1]);
    expect(
      payload.candidates[1].evidenceReferences.map(
        (reference: { evidenceId: string }) => reference.evidenceId
      )
    ).toEqual([EV_TEXT_1, EV_TABLE_1]);
    expect(payload.evidenceReferenceCount).toBe(3);
  });

  it("returns evidence_not_found listing every missing id in citation order and creates nothing", async () => {
    const result = await draft({
      candidates: [
        makeCandidate({
          evidenceIds: ["evidence-missing-1", EV_TEXT_1, "evidence-missing-2"],
        }),
      ],
    });

    expect(result).toEqual({
      status: "evidence_not_found",
      missingEvidenceIds: ["evidence-missing-1", "evidence-missing-2"],
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns evidence_not_rfp_extraction with lean content-free summaries and creates nothing", async () => {
    evidenceById.set(
      "evidence-boq-line-1",
      makeTableItem("evidence-boq-line-1", { kind: "boq_line_item" })
    );

    const result = await draft({
      candidates: [
        makeCandidate({ evidenceIds: ["evidence-boq-line-1", EV_TEXT_1] }),
      ],
    });

    expect(result).toEqual({
      status: "evidence_not_rfp_extraction",
      evidence: [
        {
          id: "evidence-boq-line-1",
          projectId: PROJECT,
          sourceFileId: FILE_BOQ,
          kind: "boq_line_item",
          extractedAt: STORED_AT.toISOString(),
          retainUntil: RETAIN_AT.toISOString(),
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("RAW-TABLE-CELL");
    expect(JSON.stringify(result)).not.toContain("parserDebugState");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns evidence_not_for_input_package for rows stored for another or no package", async () => {
    evidenceById.set(
      "evidence-other-package",
      makeTextChunkItem("evidence-other-package", {
        content: {
          evidenceKind: TEXT_KIND,
          inputPackageArtifactId: PACKAGE_B,
          text: "RAW-EVIDENCE-TEXT: other package.",
        },
      })
    );
    evidenceById.set(
      "evidence-no-package",
      makeTextChunkItem("evidence-no-package", {
        content: {
          evidenceKind: TEXT_KIND,
          inputPackageArtifactId: 42,
          text: "RAW-EVIDENCE-TEXT: no package.",
        },
      })
    );

    const result = await draft({
      candidates: [
        makeCandidate({
          evidenceIds: [
            "evidence-other-package",
            EV_TEXT_1,
            "evidence-no-package",
          ],
        }),
      ],
    });

    expect(result).toEqual({
      status: "evidence_not_for_input_package",
      evidence: [
        {
          id: "evidence-other-package",
          projectId: PROJECT,
          sourceFileId: FILE_RFP,
          kind: TEXT_KIND,
          extractedAt: STORED_AT.toISOString(),
          retainUntil: RETAIN_AT.toISOString(),
        },
        {
          id: "evidence-no-package",
          projectId: PROJECT,
          sourceFileId: FILE_RFP,
          kind: TEXT_KIND,
          extractedAt: STORED_AT.toISOString(),
          retainUntil: RETAIN_AT.toISOString(),
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("RAW-EVIDENCE-TEXT");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("success", () => {
  /** Two rich candidates exercising trim, defaults, sanitization, refs. */
  function richDraft(): Promise<CreateRfpExtractionDeltaDraftResult> {
    return draft({
      proposalSource: "ai",
      candidates: [
        {
          kind: "missing_evidence",
          sourceFileId: ` ${FILE_RFP} `,
          title: "  Missing PoE budget table  ",
          description: "  The PoE budget table on page 12 was not extracted.  ",
          confidence: 0,
          rationale: "  chunk-count scan flagged a gap  ",
          evidenceIds: [` ${EV_TEXT_1} `, EV_TABLE_1, EV_TEXT_1, "", "   "],
          proposedEvidence: {
            evidenceKind: TEXT_KIND,
            text: "PROPOSED-TEXT: PoE budget is 740W per access switch.",
            sourceFileName: "rfp.pdf",
            sourceFileRole: "rfp",
            chunkIndex: 3,
            chunkCount: "4",
            charCount: 52,
            proposalDebugState: "RAW-AI-OUTPUT-DO-NOT-STORE",
          } as unknown as RfpExtractionDeltaCandidateInput["proposedEvidence"],
        },
        {
          kind: "table_reconstruction",
          sourceFileId: FILE_BOQ,
          title: "Reconstruct merged BoQ header",
          description: "Sheet header row was merged; propose a rebuilt table.",
          severity: "blocking",
          rationale: "   ",
          evidenceIds: [EV_TABLE_1, EV_TABLE_2],
          proposedEvidence: {
            evidenceKind: TABLE_KIND,
            tableId: TABLE_ID,
            sourceFileName: "boq.xlsx",
            sheetName: "BoQ Sheet",
            pageNumber: Number.NaN,
            rowCount: 2,
            columnCount: 2,
            rows: [["C9300-24P", 10], "not-a-row", ["", "48"]],
            proposalDebugState: "RAW-AI-OUTPUT-DO-NOT-STORE",
          } as unknown as RfpExtractionDeltaCandidateInput["proposedEvidence"],
        },
      ],
    });
  }

  const EXPECTED_TEXT_REF = {
    evidenceId: EV_TEXT_1,
    evidenceKind: TEXT_KIND,
    sourceFileId: FILE_RFP,
    inputPackageArtifactId: PACKAGE_A,
    chunkIndex: 1,
    chunkCount: 2,
    charCount: 63,
  };
  const EXPECTED_SHEET_TABLE_REF = {
    evidenceId: EV_TABLE_1,
    evidenceKind: TABLE_KIND,
    sourceFileId: FILE_BOQ,
    inputPackageArtifactId: PACKAGE_A,
    tableId: TABLE_ID,
    sheetName: "BoQ Sheet",
    rowCount: 2,
    columnCount: 2,
  };
  const EXPECTED_PDF_TABLE_REF = {
    evidenceId: EV_TABLE_2,
    evidenceKind: TABLE_KIND,
    sourceFileId: FILE_RFP,
    inputPackageArtifactId: PACKAGE_A,
    tableId: TABLE_ID_PDF,
    pageNumber: 3,
    rowCount: 1,
    columnCount: 2,
  };

  it("creates exactly one needs_review extraction_delta artifact at intake_package_review", async () => {
    const result = await draft();

    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const call = mockCreateArtifact.mock.calls[0][0];
    expect(call.projectId).toBe(PROJECT);
    expect(call.tenantId).toBe(TENANT);
    expect(call.stageId).toBe("intake_package_review");
    expect(call.type).toBe("extraction_delta");
    expect(call.status).toBe("needs_review");
    expect(call.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(call.sourceArtifactIds).toEqual([PACKAGE_A]);
    expect(call.filePath).toBeUndefined();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: CREATED_ARTIFACT,
      projectId: PROJECT,
      stageId: "intake_package_review",
      type: "extraction_delta",
      status: "needs_review",
      version: 1,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A],
      createdAt: STORED_AT.toISOString(),
      updatedAt: STORED_AT.toISOString(),
    });
  });

  it("reads evidence only after the project and package gates, then creates", async () => {
    await draft();

    expect(mockGetEvidence).toHaveBeenCalledTimes(1);
    expect(mockGetEvidence).toHaveBeenCalledWith(TENANT, PROJECT, EV_TEXT_1);
    const projectOrder = mockGetProject.mock.invocationCallOrder[0];
    const artifactOrder = mockGetArtifact.mock.invocationCallOrder[0];
    const evidenceOrder = mockGetEvidence.mock.invocationCallOrder[0];
    const createOrder = mockCreateArtifact.mock.invocationCallOrder[0];
    expect(projectOrder).toBeLessThan(artifactOrder);
    expect(artifactOrder).toBeLessThan(evidenceOrder);
    expect(evidenceOrder).toBeLessThan(createOrder);
  });

  it("allows empty candidates and creates a zero-count draft without evidence reads", async () => {
    const result = await draft({ candidates: [] });

    expect(mockGetEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const call = mockCreateArtifact.mock.calls[0][0];
    expect(call.type).toBe("extraction_delta");
    expect(call.status).toBe("needs_review");
    expect(call.payload.candidateCount).toBe(0);
    expect(call.payload.evidenceReferenceCount).toBe(0);
    expect(call.payload.candidates).toEqual([]);
    expect(call.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(call.sourceArtifactIds).toEqual([PACKAGE_A]);
    expect(result.status).toBe("ok");
  });

  it("builds the sanitized payload: discriminator, trimmed fields, defaults, deterministic ids, locator-only references", async () => {
    await richDraft();

    const payload = mockCreateArtifact.mock.calls[0][0].payload;
    expect(payload).toEqual({
      payloadKind: RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
      createdBy: CREATED_BY,
      createdAt: expect.stringMatching(ISO_DATE),
      proposalSource: "ai",
      inputPackageArtifactId: PACKAGE_A,
      candidateCount: 2,
      evidenceReferenceCount: 4,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A],
      candidates: [
        {
          id: "RFP-DELTA-001",
          kind: "missing_evidence",
          sourceFileId: FILE_RFP,
          title: "Missing PoE budget table",
          description: "The PoE budget table on page 12 was not extracted.",
          severity: "warning",
          confidence: 0,
          rationale: "chunk-count scan flagged a gap",
          reviewStatus: "pending_review",
          evidenceReferences: [EXPECTED_TEXT_REF, EXPECTED_SHEET_TABLE_REF],
          proposedEvidence: {
            evidenceKind: TEXT_KIND,
            text: "PROPOSED-TEXT: PoE budget is 740W per access switch.",
            sourceFileName: "rfp.pdf",
            sourceFileRole: "rfp",
            chunkIndex: 3,
            charCount: 52,
          },
        },
        {
          id: "RFP-DELTA-002",
          kind: "table_reconstruction",
          sourceFileId: FILE_BOQ,
          title: "Reconstruct merged BoQ header",
          description: "Sheet header row was merged; propose a rebuilt table.",
          severity: "blocking",
          reviewStatus: "pending_review",
          evidenceReferences: [EXPECTED_SHEET_TABLE_REF, EXPECTED_PDF_TABLE_REF],
          proposedEvidence: {
            evidenceKind: TABLE_KIND,
            tableId: TABLE_ID,
            sourceFileName: "boq.xlsx",
            sheetName: "BoQ Sheet",
            rowCount: 2,
            columnCount: 2,
            rows: [["C9300-24P", ""], [], ["", "48"]],
          },
        },
      ],
    });
  });

  it("accepts confidence boundary values 0 and 1", async () => {
    const result = await draft({
      candidates: [
        makeCandidate({ confidence: 0 }),
        makeCandidate({ confidence: 1 }),
      ],
    });

    expect(result.status).toBe("ok");
    const payload = mockCreateArtifact.mock.calls[0][0].payload;
    expect(payload.candidates[0].confidence).toBe(0);
    expect(payload.candidates[1].confidence).toBe(1);
  });

  it("omits missing or malformed proposedEvidence instead of throwing", async () => {
    const result = await draft({
      candidates: [
        makeCandidate(),
        makeCandidate({
          proposedEvidence:
            "junk" as unknown as RfpExtractionDeltaCandidateInput["proposedEvidence"],
        }),
        makeCandidate({
          proposedEvidence: {
            evidenceKind: "boq_line_item",
          } as unknown as RfpExtractionDeltaCandidateInput["proposedEvidence"],
        }),
        makeCandidate({
          proposedEvidence:
            [] as unknown as RfpExtractionDeltaCandidateInput["proposedEvidence"],
        }),
      ],
    });

    expect(result.status).toBe("ok");
    const payload = mockCreateArtifact.mock.calls[0][0].payload;
    expect(payload.candidateCount).toBe(4);
    expect(
      payload.candidates.every(
        (candidate: Record<string, unknown>) =>
          !("proposedEvidence" in candidate)
      )
    ).toBe(true);
  });

  it("degrades a malformed proposed table matrix and non-string proposed text to safe fallbacks", async () => {
    await draft({
      candidates: [
        makeCandidate({
          proposedEvidence: {
            evidenceKind: TEXT_KIND,
            text: 999,
          } as unknown as RfpExtractionDeltaCandidateInput["proposedEvidence"],
        }),
        makeCandidate({
          kind: "table_reconstruction",
          sourceFileId: FILE_BOQ,
          proposedEvidence: {
            evidenceKind: TABLE_KIND,
            rows: "not-a-matrix",
          } as unknown as RfpExtractionDeltaCandidateInput["proposedEvidence"],
        }),
      ],
    });

    const payload = mockCreateArtifact.mock.calls[0][0].payload;
    expect(payload.candidates[0].proposedEvidence).toEqual({
      evidenceKind: TEXT_KIND,
      text: "",
    });
    expect(payload.candidates[1].proposedEvidence).toEqual({
      evidenceKind: TABLE_KIND,
      rows: [],
    });
  });

  it("returns a lean payload summary without the candidate bodies", async () => {
    const result = await richDraft();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const call = mockCreateArtifact.mock.calls[0][0];
    expect(result.payloadSummary).toEqual({
      payloadKind: RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
      createdBy: CREATED_BY,
      createdAt: call.payload.createdAt,
      proposalSource: "ai",
      inputPackageArtifactId: PACKAGE_A,
      candidateCount: 2,
      evidenceReferenceCount: 4,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A],
    });
    expect(result.payloadSummary.createdAt).toMatch(ISO_DATE);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    // The lean result never carries candidate or proposal bodies.
    expect(JSON.stringify(result)).not.toContain("PROPOSED-TEXT");
    expect(JSON.stringify(result)).not.toContain("RFP-DELTA-001");
  });

  it("never copies persisted evidence bodies, package payload fields, tenant ids, or arbitrary keys", async () => {
    const result = await richDraft();

    const serializedResult = JSON.stringify(result);
    const serializedPayload = JSON.stringify(
      mockCreateArtifact.mock.calls[0][0].payload
    );
    for (const leak of [
      TENANT,
      "tenantId",
      "PACKAGE-PAYLOAD-SECRET",
      "internalExtractorState",
      "ARBITRARY-CONTENT-KEY-VALUE",
      "parserDebugState",
      "RAW-FILE-BYTES-BASE64",
      "proposalDebugState",
      "RAW-AI-OUTPUT-DO-NOT-STORE",
      // persisted bodies must never reach references or summaries
      "RAW-EVIDENCE-TEXT",
      "RAW-TABLE-CELL",
    ]) {
      expect(serializedPayload).not.toContain(leak);
      expect(serializedResult).not.toContain(leak);
    }
  });

  it("copies arrays and matrices instead of aliasing and never mutates inputs, rows, or the artifact", async () => {
    const proposedRows = [["C9300-24P", "10"]];
    const input: CreateRfpExtractionDeltaDraftInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: PACKAGE_A,
      createdBy: `  ${CREATED_BY}  `,
      proposalSource: "engineer",
      candidates: [
        makeCandidate({
          kind: "table_reconstruction",
          sourceFileId: FILE_BOQ,
          evidenceIds: [EV_TABLE_1],
          proposedEvidence: {
            evidenceKind: TABLE_KIND,
            tableId: TABLE_ID,
            rowCount: 1,
            columnCount: 2,
            rows: proposedRows,
          },
        }),
      ],
    };
    const inputSnapshot = structuredClone(input);
    const evidenceSnapshot = structuredClone(Array.from(evidenceById.values()));
    const artifactSnapshot = structuredClone(Array.from(artifactById.values()));

    const result = await createRfpExtractionDeltaDraft(input);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const call = mockCreateArtifact.mock.calls[0][0];
    const loadedPackage = artifactById.get(PACKAGE_A);
    if (loadedPackage === undefined) throw new Error("unreachable");
    // Fresh arrays everywhere: create input, payload, candidate input, and
    // loaded artifact never share identity.
    expect(call.sourceFileIds).not.toBe(loadedPackage.sourceFileIds);
    expect(call.payload.sourceFileIds).not.toBe(loadedPackage.sourceFileIds);
    expect(call.payload.sourceFileIds).not.toBe(call.sourceFileIds);
    const storedProposed = call.payload.candidates[0].proposedEvidence;
    expect(storedProposed.rows).not.toBe(proposedRows);
    expect(storedProposed.rows[0]).not.toBe(proposedRows[0]);

    // Mutating everything the service handed out reaches no loaded state.
    call.payload.sourceFileIds.push("hacked-file");
    call.payload.sourceArtifactIds.push("hacked-artifact");
    storedProposed.rows[0].push("hacked-cell");
    call.payload.candidates[0].evidenceReferences.push("hacked-reference");
    call.payload.candidates.pop();
    result.artifact.sourceFileIds.push("hacked-file");
    result.artifact.sourceArtifactIds.push("hacked-artifact");
    result.payloadSummary.sourceFileIds.push("hacked-file");
    result.payloadSummary.sourceArtifactIds.push("hacked-artifact");
    expect(input).toEqual(inputSnapshot);
    expect(Array.from(evidenceById.values())).toEqual(evidenceSnapshot);
    expect(Array.from(artifactById.values())).toEqual(artifactSnapshot);
  });

  it("bubbles an unexpected artifact create failure unhidden", async () => {
    mockCreateArtifact.mockRejectedValue(new Error("artifact insert failed"));

    await expect(draft()).rejects.toThrow("artifact insert failed");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-extraction-delta.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-extraction-delta.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the three allowed store modules and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-evidence-store",
      "@/types/project",
    ]);
  });

  it("performs no store mutation except createProjectArtifactVersion", () => {
    const calls =
      source.match(/\b(?:create|update|delete|insert|remove|drop)[A-Z]\w*/g) ??
      [];
    const allowed = new Set([
      "createProjectArtifactVersion",
      "createRfpExtractionDeltaDraft",
    ]);
    expect(calls.filter((name) => !allowed.has(name))).toEqual([]);
  });

  it("can only write the pending_review candidate review status", () => {
    expect(source).toContain('reviewStatus: "pending_review"');
    // The review status/action vocabularies and history entry types live
    // here as exported declarations for the delta-review service, but the
    // draft service itself never writes a decided status or a history
    // entry ("reviewHistory:" without the optional "?" would be an object
    // literal assignment, not the type declaration).
    for (const forbidden of [
      'reviewStatus: "accepted"',
      'reviewStatus: "rejected"',
      'reviewStatus: "waived"',
      "reviewHistory:",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("imports no filesystem, parser, extraction, persistence, evidence-package, inspection, approval, route, UI, pricing, config, export, SKU, catalog, coordinator, engine, adapter, or AI module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "fs"',
      'from "path"',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/index"',
      'from "@/lib/db/schema"',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/project-rfp-evidence-package"',
      'from "@/lib/projects/project-rfp-extraction-run"',
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
      "openai",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
      "xlsx",
      "storagePath",
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
