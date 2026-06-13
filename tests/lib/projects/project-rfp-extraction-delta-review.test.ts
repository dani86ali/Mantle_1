import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";
import {
  RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
  type RfpExtractionDeltaCandidate,
  type RfpExtractionDeltaPayload,
} from "@/lib/projects/project-rfp-extraction-delta";

const { mockGetProject, mockGetArtifact, mockCreateArtifact } = vi.hoisted(
  () => ({
    mockGetProject: vi.fn(),
    mockGetArtifact: vi.fn(),
    mockCreateArtifact: vi.fn(),
  })
);

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifact,
  createProjectArtifactVersion: mockCreateArtifact,
}));

import * as serviceModule from "@/lib/projects/project-rfp-extraction-delta-review";
import {
  reviewRfpExtractionDeltaArtifact,
  type ReviewRfpExtractionDeltaArtifactInput,
  type ReviewRfpExtractionDeltaArtifactResult,
} from "@/lib/projects/project-rfp-extraction-delta-review";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const SOURCE_DELTA = "art-extraction-delta-1";
const CREATED_DELTA = "art-extraction-delta-2";
const INPUT_PACKAGE = "art-input-package-1";
const FILE_RFP = "file-rfp-1";
const FILE_SOW = "file-sow-1";
const REVIEWED_BY = "engineer@stc.example";
const DECIDED_AT = new Date("2026-06-13T08:30:00.000Z");
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const STORED_AT = new Date("2026-06-13T08:31:00.000Z");

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

function makeCandidate(
  id: string,
  overrides: Partial<RfpExtractionDeltaCandidate> = {}
): RfpExtractionDeltaCandidate {
  return {
    id,
    kind: "missing_evidence",
    sourceFileId: FILE_RFP,
    title: `Candidate ${id}`,
    description: `Description ${id}`,
    severity: "warning",
    reviewStatus: "pending_review",
    evidenceReferences: [
      {
        evidenceId: `ev-${id}`,
        evidenceKind: "rfp_document_text_chunk",
        sourceFileId: FILE_RFP,
        inputPackageArtifactId: INPUT_PACKAGE,
        chunkIndex: 1,
        chunkCount: 1,
        charCount: 25,
      },
    ],
    ...overrides,
  };
}

function makePayload(
  overrides: Partial<RfpExtractionDeltaPayload> = {}
): RfpExtractionDeltaPayload {
  const candidates =
    overrides.candidates ?? [makeCandidate("RFP-DELTA-001")];
  return {
    payloadKind: RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
    createdBy: "draft-author@stc.example",
    createdAt: "2026-06-12T12:00:00.000Z",
    proposalSource: "ai",
    inputPackageArtifactId: INPUT_PACKAGE,
    candidateCount: candidates.length,
    evidenceReferenceCount: candidates.reduce(
      (count, candidate) => count + candidate.evidenceReferences.length,
      0
    ),
    sourceFileIds: [FILE_RFP, FILE_SOW],
    sourceArtifactIds: [INPUT_PACKAGE],
    candidates,
    ...overrides,
  };
}

function makeExtractionDeltaArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: SOURCE_DELTA,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "extraction_delta",
    status: "needs_review",
    version: 3,
    payload: makePayload(),
    sourceFileIds: [FILE_RFP, FILE_SOW],
    sourceArtifactIds: [INPUT_PACKAGE],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeStoredArtifact(call: CreateArtifactCall): ProjectArtifact {
  return {
    id: CREATED_DELTA,
    projectId: call.projectId,
    stageId: call.stageId,
    type: call.type,
    status: call.status ?? "generated",
    version: 4,
    payload: call.payload ?? {},
    sourceFileIds: (call.sourceFileIds ?? []).slice(),
    sourceArtifactIds: (call.sourceArtifactIds ?? []).slice(),
    createdAt: STORED_AT,
    updatedAt: STORED_AT,
  };
}

function review(
  overrides: Partial<ReviewRfpExtractionDeltaArtifactInput> = {}
): Promise<ReviewRfpExtractionDeltaArtifactResult> {
  return reviewRfpExtractionDeltaArtifact({
    tenantId: TENANT,
    projectId: PROJECT,
    extractionDeltaArtifactId: SOURCE_DELTA,
    reviewedBy: REVIEWED_BY,
    decidedAt: DECIDED_AT,
    decisions: [{ candidateId: "RFP-DELTA-001", action: "accept" }],
    ...overrides,
  });
}

function expectNoStoreCalls(): void {
  expect(mockGetProject).not.toHaveBeenCalled();
  expect(mockGetArtifact).not.toHaveBeenCalled();
  expect(mockCreateArtifact).not.toHaveBeenCalled();
}

beforeEach(() => {
  mockGetProject.mockReset().mockResolvedValue(makeProject());
  mockGetArtifact.mockReset().mockResolvedValue(makeExtractionDeltaArtifact());
  mockCreateArtifact
    .mockReset()
    .mockImplementation(async (call: CreateArtifactCall) =>
      makeStoredArtifact(call)
    );
});

describe("reviewRfpExtractionDeltaArtifact - validation before store calls", () => {
  it("throws on blank identifiers, blank reviewer, invalid decidedAt, and non-array decisions", async () => {
    await expect(review({ projectId: "  " })).rejects.toThrow(
      "projectId is required."
    );
    await expect(
      review({ extractionDeltaArtifactId: "  " })
    ).rejects.toThrow("extractionDeltaArtifactId is required.");
    await expect(review({ reviewedBy: " " })).rejects.toThrow(
      "reviewedBy is required."
    );
    await expect(
      review({ decidedAt: new Date(Number.NaN) })
    ).rejects.toThrow("decidedAt must be a valid Date.");
    await expect(
      review({
        decisions: "nope" as unknown as ReviewRfpExtractionDeltaArtifactInput["decisions"],
      })
    ).rejects.toThrow("decisions must be an array.");
    expectNoStoreCalls();
  });

  it("throws deterministic decision shape errors before store calls", async () => {
    await expect(
      review({ decisions: [42 as unknown as { candidateId: string; action: "accept" }] })
    ).rejects.toThrow("decisions[0] must be an object.");
    await expect(
      review({ decisions: [{ candidateId: "  ", action: "accept" }] })
    ).rejects.toThrow("decisions[0].candidateId is required.");
    await expect(
      review({
        decisions: [
          {
            candidateId: "RFP-DELTA-001",
            action: "maybe" as "accept",
          },
        ],
      })
    ).rejects.toThrow(
      "decisions[0].action must be one of accept | reject | edit_accept | waive."
    );
    expectNoStoreCalls();
  });
});

describe("reviewRfpExtractionDeltaArtifact - project and artifact gates", () => {
  it("returns not_found for a missing project and never loads the artifact", async () => {
    mockGetProject.mockResolvedValue(null);

    expect(await review()).toEqual({ status: "not_found" });
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a lean project summary", async () => {
    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await review();

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
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("gates exact artifact existence, type/stage, status, and payload shape without persisting", async () => {
    mockGetArtifact.mockResolvedValueOnce(null);
    expect(await review()).toEqual({ status: "extraction_delta_not_found" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();

    mockGetArtifact.mockResolvedValueOnce(
      makeExtractionDeltaArtifact({ type: "evidence_package" })
    );
    expect((await review()).status).toBe("artifact_not_extraction_delta");
    expect(mockCreateArtifact).not.toHaveBeenCalled();

    mockGetArtifact.mockResolvedValueOnce(
      makeExtractionDeltaArtifact({ stageId: "requirements_baseline_review" })
    );
    expect((await review()).status).toBe("artifact_not_extraction_delta");
    expect(mockCreateArtifact).not.toHaveBeenCalled();

    mockGetArtifact.mockResolvedValueOnce(
      makeExtractionDeltaArtifact({ status: "approved" })
    );
    expect((await review()).status).toBe("extraction_delta_not_reviewable");
    expect(mockCreateArtifact).not.toHaveBeenCalled();

    mockGetArtifact.mockResolvedValueOnce(
      makeExtractionDeltaArtifact({ payload: { payloadKind: "wrong" } })
    );
    expect((await review()).status).toBe("invalid_extraction_delta_payload");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("reviewRfpExtractionDeltaArtifact - decision gates", () => {
  it("rejects duplicate decisions, unknown targets, non-pending targets, missing waiver notes, and invalid edits before persistence", async () => {
    let result = await review({
      decisions: [
        { candidateId: "RFP-DELTA-001", action: "accept" },
        { candidateId: "RFP-DELTA-001", action: "reject" },
      ],
    });
    expect(result).toEqual({
      status: "duplicate_decision",
      candidateIds: ["RFP-DELTA-001"],
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();

    result = await review({
      decisions: [{ candidateId: "RFP-DELTA-404", action: "accept" }],
    });
    expect(result).toEqual({
      status: "decision_target_not_found",
      candidateIds: ["RFP-DELTA-404"],
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();

    mockGetArtifact.mockResolvedValueOnce(
      makeExtractionDeltaArtifact({
        payload: makePayload({
          candidates: [
            makeCandidate("RFP-DELTA-001", { reviewStatus: "accepted" }),
          ],
        }),
      })
    );
    result = await review();
    expect(result).toEqual({
      status: "candidate_not_pending",
      candidateIds: ["RFP-DELTA-001"],
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();

    result = await review({
      decisions: [{ candidateId: "RFP-DELTA-001", action: "waive", note: " " }],
    });
    expect(result).toEqual({
      status: "waiver_note_required",
      candidateIds: ["RFP-DELTA-001"],
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();

    result = await review({
      decisions: [
        {
          candidateId: "RFP-DELTA-001",
          action: "edit_accept",
          editedFields: { title: "   " },
        },
      ],
    });
    expect(result).toEqual({
      status: "invalid_edit",
      edits: [
        {
          candidateId: "RFP-DELTA-001",
          reason: "editedFields.title must be a nonblank string.",
        },
      ],
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("reviewRfpExtractionDeltaArtifact - persistence", () => {
  it("creates one reviewed extraction_delta version with accepted, rejected, waived, and edited-accepted candidates", async () => {
    const oldHistory = {
      action: "reject" as const,
      decidedBy: "previous@example.test",
      decidedAt: "2026-06-12T08:00:00.000Z",
      previousReviewStatus: "pending_review" as const,
      nextReviewStatus: "rejected" as const,
      note: "old decision kept visible",
    };
    const loaded = makeExtractionDeltaArtifact({
      sourceArtifactIds: [INPUT_PACKAGE, SOURCE_DELTA],
      payload: makePayload({
        candidates: [
          makeCandidate("RFP-DELTA-001", { title: "Accept me" }),
          makeCandidate("RFP-DELTA-002", { title: "Reject me" }),
          makeCandidate("RFP-DELTA-003", { title: "Waive me" }),
          makeCandidate("RFP-DELTA-004", {
            title: "Edit me",
            reviewHistory: [oldHistory],
            proposedEvidence: {
              evidenceKind: "rfp_document_text_chunk",
              text: "old proposal",
            },
          }),
        ],
      }),
    });
    mockGetArtifact.mockResolvedValue(loaded);

    const result = await review({
      decisions: [
        { candidateId: "RFP-DELTA-001", action: "accept", note: "ok" },
        { candidateId: "RFP-DELTA-002", action: "reject" },
        {
          candidateId: "RFP-DELTA-003",
          action: "waive",
          note: "not blocking after manual source-file review",
        },
        {
          candidateId: "RFP-DELTA-004",
          action: "edit_accept",
          note: "fixed table",
          editedFields: {
            title: "  Edited table reconstruction  ",
            description: "  Rebuilt the missing table.  ",
            severity: "blocking",
            confidence: 1,
            rationale: "  engineer adjusted rows  ",
            proposedEvidence: {
              evidenceKind: "rfp_document_table",
              tableId: "table-edited",
              rows: [["sku", 42], "bad-row"],
              debug: "do-not-store",
            } as unknown as ReviewRfpExtractionDeltaArtifactInput["decisions"][number]["editedFields"],
            unitPrice: 12345,
            acceptedSku: "C9300X-48HX",
          } as unknown as ReviewRfpExtractionDeltaArtifactInput["decisions"][number]["editedFields"],
        },
      ],
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const call = mockCreateArtifact.mock.calls[0][0] as CreateArtifactCall;
    expect(call).toMatchObject({
      tenantId: TENANT,
      projectId: PROJECT,
      stageId: "intake_package_review",
      type: "extraction_delta",
      status: "needs_review",
      sourceFileIds: [FILE_RFP, FILE_SOW],
      sourceArtifactIds: [INPUT_PACKAGE, SOURCE_DELTA],
    });

    const payload = call.payload as Record<string, unknown> & {
      candidates: RfpExtractionDeltaCandidate[];
    };
    expect(payload).toMatchObject({
      payloadKind: RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
      reviewedBy: REVIEWED_BY,
      reviewedAt: DECIDED_AT.toISOString(),
      reviewedDecisionCount: 4,
      pendingCount: 0,
      acceptedCount: 2,
      rejectedCount: 1,
      waivedCount: 1,
      sourceExtractionDeltaArtifactId: SOURCE_DELTA,
      sourceExtractionDeltaArtifactVersion: 3,
    });
    expect(payload.candidates.map((candidate) => candidate.reviewStatus)).toEqual([
      "accepted",
      "rejected",
      "waived",
      "accepted",
    ]);
    expect(payload.candidates[0].reviewHistory?.at(-1)).toMatchObject({
      action: "accept",
      note: "ok",
      previousReviewStatus: "pending_review",
      nextReviewStatus: "accepted",
    });
    expect(payload.candidates[2].reviewHistory?.at(-1)).toMatchObject({
      action: "waive",
      note: "not blocking after manual source-file review",
      nextReviewStatus: "waived",
    });
    expect(payload.candidates[3].reviewHistory?.[0]).toEqual(oldHistory);
    expect(payload.candidates[3]).toMatchObject({
      title: "Edited table reconstruction",
      description: "Rebuilt the missing table.",
      severity: "blocking",
      confidence: 1,
      rationale: "engineer adjusted rows",
      proposedEvidence: {
        evidenceKind: "rfp_document_table",
        tableId: "table-edited",
        rows: [["sku", ""], []],
      },
    });
    expect(payload.candidates[3].reviewHistory?.at(-1)).toMatchObject({
      action: "edit_accept",
      note: "fixed table",
      editedFields: {
        title: "Edited table reconstruction",
        description: "Rebuilt the missing table.",
        severity: "blocking",
        confidence: 1,
        rationale: "engineer adjusted rows",
        proposedEvidence: {
          evidenceKind: "rfp_document_table",
          tableId: "table-edited",
          rows: [["sku", ""], []],
        },
      },
    });
    const serializedPayload = JSON.stringify(payload);
    expect(serializedPayload).not.toContain("unitPrice");
    expect(serializedPayload).not.toContain("acceptedSku");
    expect(serializedPayload).not.toContain("do-not-store");

    expect(result.payloadSummary).toEqual({
      payloadKind: RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
      createdBy: "draft-author@stc.example",
      createdAt: "2026-06-12T12:00:00.000Z",
      proposalSource: "ai",
      inputPackageArtifactId: INPUT_PACKAGE,
      candidateCount: 4,
      evidenceReferenceCount: 4,
      reviewedBy: REVIEWED_BY,
      reviewedAt: DECIDED_AT.toISOString(),
      reviewedDecisionCount: 4,
      pendingCount: 0,
      acceptedCount: 2,
      rejectedCount: 1,
      waivedCount: 1,
      sourceExtractionDeltaArtifactId: SOURCE_DELTA,
      sourceExtractionDeltaArtifactVersion: 3,
      sourceFileIds: [FILE_RFP, FILE_SOW],
      sourceArtifactIds: [INPUT_PACKAGE, SOURCE_DELTA],
    });
    const serializedResult = JSON.stringify(result);
    expect(serializedResult).not.toContain("Edited table reconstruction");
    expect(serializedResult).not.toContain("old proposal");
    expect(serializedResult).not.toContain(TENANT);
  });

  it("does not mutate inputs or loaded artifacts and returns copied summary arrays", async () => {
    const artifact = makeExtractionDeltaArtifact();
    const artifactSnapshot = structuredClone(artifact);
    mockGetArtifact.mockResolvedValue(artifact);
    const input: ReviewRfpExtractionDeltaArtifactInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      extractionDeltaArtifactId: SOURCE_DELTA,
      reviewedBy: `  ${REVIEWED_BY}  `,
      decidedAt: DECIDED_AT,
      decisions: [{ candidateId: "RFP-DELTA-001", action: "accept" }],
    };
    const inputSnapshot = structuredClone(input);

    const result = await reviewRfpExtractionDeltaArtifact(input);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(input).toEqual(inputSnapshot);
    expect(artifact).toEqual(artifactSnapshot);
    const call = mockCreateArtifact.mock.calls[0][0] as CreateArtifactCall;
    expect(call.sourceFileIds).not.toBe(artifact.sourceFileIds);
    expect(call.sourceArtifactIds).not.toBe(artifact.sourceArtifactIds);
    expect(result.payloadSummary.sourceFileIds).not.toBe(call.sourceFileIds);
    expect(result.payloadSummary.sourceArtifactIds).not.toBe(
      call.sourceArtifactIds
    );
    result.payloadSummary.sourceFileIds.push("mutated");
    result.payloadSummary.sourceArtifactIds.push("mutated");
    expect(call.sourceFileIds).toEqual([FILE_RFP, FILE_SOW]);
    expect(call.sourceArtifactIds).toEqual([INPUT_PACKAGE, SOURCE_DELTA]);
  });
});

describe("module purity and surface", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-extraction-delta-review.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-extraction-delta-review.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the project store, artifact store, canonical project types, and extraction-delta types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-extraction-delta",
    ]);
  });

  it("imports no forbidden persistence, approval, route, UI, Quick BoM, AI, catalog, pricing, SKU, config, export, or design modules", () => {
    for (const forbidden of [
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/index"',
      'from "@/lib/db/schema"',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-package"',
      'from "@/lib/projects/project-rfp-requirements',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-quick-bom',
      'from "@/lib/projects/boq-',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/mantle',
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

  it("exposes only the review service as a runtime export", () => {
    expect(Object.keys(serviceModule)).toEqual([
      "reviewRfpExtractionDeltaArtifact",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
