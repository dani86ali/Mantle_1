import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageStatus,
} from "@/types/project";

// Mock the three DB store boundaries. The pure approval helper
// (@/lib/projects/approvals -> isArtifactReviewable) stays REAL so the
// reviewability gate is a true integration check, mirroring the sibling
// input-package approval service test.
const { mockGetProjectById, mockGetArtifactById, mockCreateApproval } =
  vi.hoisted(() => ({
    mockGetProjectById: vi.fn(),
    mockGetArtifactById: vi.fn(),
    mockCreateApproval: vi.fn(),
  }));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: mockCreateApproval,
}));

import * as serviceModule from "@/lib/projects/project-rfp-evidence-package-approval";
import {
  reviewRfpEvidencePackageArtifact,
  type ReviewRfpEvidencePackageArtifactInput,
  type ReviewRfpEvidencePackageArtifactResult,
} from "@/lib/projects/project-rfp-evidence-package-approval";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-evidence-package-2";
const INPUT_PACKAGE = "art-input-package-3";
const DELTA = "art-extraction-delta-5";
const DELTA_2 = "art-extraction-delta-6";
const DECIDER = "u-engineer-7";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const DECIDED_AT = new Date("2026-06-11T09:00:00.000Z");
const EVIDENCE_SENTINEL = "evidence-body-do-not-leak";
const CANDIDATE_SENTINEL = "delta-candidate-body-do-not-leak";
const PROPOSAL_SENTINEL = "proposed-evidence-do-not-leak";
const INPUT_PACKAGE_SENTINEL = "input-package-payload-do-not-leak";

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

function makeEvidencePackagePayload(): Record<string, unknown> {
  return {
    payloadKind: "rfp_evidence_package",
    createdBy: DECIDER,
    createdAt: "2026-06-08T10:00:00.000Z",
    inputPackageArtifactId: INPUT_PACKAGE,
    evidenceCount: 3,
    textChunkCount: 2,
    tableEvidenceCount: 1,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [INPUT_PACKAGE, DELTA],
    evidence: [
      {
        evidenceKind: "rfp_document_text_chunk",
        evidenceId: "ev-text-1",
        sourceFileId: FILE_RFP,
        inputPackageArtifactId: INPUT_PACKAGE,
        chunkIndex: 0,
        chunkCount: 2,
        charCount: 25,
        text: EVIDENCE_SENTINEL,
      },
      {
        evidenceKind: "rfp_document_text_chunk",
        evidenceId: "ev-text-2",
        sourceFileId: FILE_RFP,
        inputPackageArtifactId: INPUT_PACKAGE,
        chunkIndex: 1,
        chunkCount: 2,
        charCount: 17,
        text: "second chunk body",
      },
      {
        evidenceKind: "rfp_document_table",
        evidenceId: "ev-table-1",
        sourceFileId: FILE_BOQ,
        inputPackageArtifactId: INPUT_PACKAGE,
        tableId: "table-1",
        rowCount: 1,
        columnCount: 2,
        rows: [[EVIDENCE_SENTINEL, "qty"]],
      },
    ],
  };
}

function makeEvidencePackageArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "evidence_package",
    status: "needs_review",
    version: 2,
    payload: makeEvidencePackagePayload(),
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [INPUT_PACKAGE, DELTA],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeInputPackageArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: INPUT_PACKAGE,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "input_package",
    status: "approved",
    version: 3,
    payload: { payloadKind: "rfp_input_package", secret: INPUT_PACKAGE_SENTINEL },
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeDeltaCandidate(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "RFP-DELTA-001",
    kind: "missing_evidence",
    sourceFileId: FILE_RFP,
    title: CANDIDATE_SENTINEL,
    description: CANDIDATE_SENTINEL,
    severity: "warning",
    reviewStatus: "accepted",
    evidenceReferences: [],
    proposedEvidence: {
      evidenceKind: "rfp_document_text_chunk",
      text: PROPOSAL_SENTINEL,
    },
    ...overrides,
  };
}

function makeDeltaPayload(
  candidates: Array<Record<string, unknown>>
): Record<string, unknown> {
  return {
    payloadKind: "rfp_extraction_delta",
    createdBy: DECIDER,
    createdAt: "2026-06-07T09:00:00.000Z",
    proposalSource: "deterministic",
    inputPackageArtifactId: INPUT_PACKAGE,
    candidateCount: candidates.length,
    evidenceReferenceCount: 0,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [INPUT_PACKAGE],
    candidates,
  };
}

function makeDeltaArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: DELTA,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "extraction_delta",
    status: "needs_review",
    version: 5,
    payload: makeDeltaPayload([
      makeDeltaCandidate(),
      makeDeltaCandidate({ id: "RFP-DELTA-002", reviewStatus: "rejected" }),
      makeDeltaCandidate({ id: "RFP-DELTA-003", reviewStatus: "waived" }),
    ]),
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [INPUT_PACKAGE],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeCreated(decision: ProjectApproval["decision"] = "approved") {
  const approval: ProjectApproval = {
    id: "appr-1",
    projectId: PROJECT,
    stageId: "intake_package_review",
    artifactId: ARTIFACT,
    artifactVersion: 2,
    decision,
    decidedBy: DECIDER,
    decidedAt: DECIDED_AT,
  };
  return {
    approval,
    artifactStatus: (decision === "approved"
      ? "approved"
      : "rejected") as ProjectArtifactStatus,
    stageStatus: (decision === "approved"
      ? "approved"
      : "rejected") as ProjectStageStatus,
  };
}

function evidenceEntries(
  artifact: ProjectArtifact
): Array<Record<string, unknown>> {
  return artifact.payload.evidence as Array<Record<string, unknown>>;
}

function review(
  overrides: Partial<ReviewRfpEvidencePackageArtifactInput> = {}
): Promise<ReviewRfpEvidencePackageArtifactResult> {
  return reviewRfpEvidencePackageArtifact({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: ARTIFACT,
    decision: "approved",
    decidedBy: DECIDER,
    ...overrides,
  });
}

let artifactsById: Record<string, ProjectArtifact | null>;

beforeEach(() => {
  artifactsById = {
    [ARTIFACT]: makeEvidencePackageArtifact(),
    [INPUT_PACKAGE]: makeInputPackageArtifact(),
    [DELTA]: makeDeltaArtifact(),
  };
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById
    .mockReset()
    .mockImplementation((_tenantId: string, _projectId: string, id: string) =>
      Promise.resolve(artifactsById[id] ?? null)
    );
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
});

describe("reviewRfpEvidencePackageArtifact - input validation", () => {
  it("throws on a blank projectId before any store call", async () => {
    await expect(review({ projectId: "   " })).rejects.toThrow(
      "projectId is required."
    );
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("throws on a blank artifactId before any store call", async () => {
    await expect(review({ artifactId: "  " })).rejects.toThrow(
      "artifactId is required."
    );
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("throws on a decision other than approved/rejected before any store call", async () => {
    await expect(
      review({ decision: "maybe" as ProjectApproval["decision"] })
    ).rejects.toThrow('decision must be "approved" or "rejected".');
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("throws on a blank decidedBy before any store call", async () => {
    await expect(review({ decidedBy: " " })).rejects.toThrow(
      "decidedBy is required."
    );
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("validates projectId, then artifactId, then decision, then decidedBy", async () => {
    const badDecision = "maybe" as ProjectApproval["decision"];
    await expect(
      review({
        projectId: " ",
        artifactId: " ",
        decision: badDecision,
        decidedBy: " ",
      })
    ).rejects.toThrow("projectId is required.");
    await expect(
      review({ artifactId: " ", decision: badDecision, decidedBy: " " })
    ).rejects.toThrow("artifactId is required.");
    await expect(
      review({ decision: badDecision, decidedBy: " " })
    ).rejects.toThrow('decision must be "approved" or "rejected".');
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });
});

describe("reviewRfpEvidencePackageArtifact - project gates", () => {
  it("returns not_found and never loads the artifact or creates an approval when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns a wrong_mode lean summary (no tenantId) and never loads the artifact for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({
        mode: "quick_bom",
        name: "Honeywell Quick BoM",
        customerName: "Honeywell",
      })
    );

    const result = await review();

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "Honeywell Quick BoM",
      customerName: "Honeywell",
      mode: "quick_bom",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({ mode: "quick_bom", customerName: undefined })
    );

    const result = await review();

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });
});

describe("reviewRfpEvidencePackageArtifact - artifact gates", () => {
  it("returns artifact_not_found and creates no approval when the exact artifact is missing", async () => {
    artifactsById[ARTIFACT] = null;

    const result = await review();

    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("rejects every non-evidence_package type as artifact_not_evidence_package without loading sources or approving", async () => {
    const otherTypes: ProjectArtifactType[] = [
      "input_package",
      "extraction_delta",
      "normalized_boq",
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
      "requirements_baseline",
      "compliance_matrix",
      "hld_design_delta",
      "technical_proposal",
      "export_package",
    ];
    for (const type of otherTypes) {
      mockGetArtifactById.mockClear();
      mockCreateApproval.mockClear();
      // Right stage and a reviewable status prove the TYPE gate fires.
      artifactsById[ARTIFACT] = makeEvidencePackageArtifact({ type });

      const result = await review();

      expect(result.status).toBe("artifact_not_evidence_package");
      if (result.status !== "artifact_not_evidence_package") {
        throw new Error("unreachable");
      }
      expect(result.artifact.type).toBe(type);
      expect("payload" in result.artifact).toBe(false);
      expect(JSON.stringify(result)).not.toContain(EVIDENCE_SENTINEL);
      expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("rejects an evidence_package outside intake_package_review as artifact_not_evidence_package", async () => {
    artifactsById[ARTIFACT] = makeEvidencePackageArtifact({
      stageId: "requirements_baseline_review",
    });

    const result = await review();

    expect(result.status).toBe("artifact_not_evidence_package");
    if (result.status !== "artifact_not_evidence_package") {
      throw new Error("unreachable");
    }
    expect(result.artifact.stageId).toBe("requirements_baseline_review");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("rejects non-reviewable statuses as artifact_not_reviewable without loading sources or approving", async () => {
    const nonReviewable: ProjectArtifactStatus[] = [
      "approved",
      "rejected",
      "stale",
      "failed",
      "missing",
      "not_applicable",
    ];
    for (const status of nonReviewable) {
      mockGetArtifactById.mockClear();
      mockCreateApproval.mockClear();
      artifactsById[ARTIFACT] = makeEvidencePackageArtifact({ status });

      const result = await review();

      expect(result.status).toBe("artifact_not_reviewable");
      if (result.status !== "artifact_not_reviewable") {
        throw new Error("unreachable");
      }
      expect(result.artifact.status).toBe(status);
      expect("payload" in result.artifact).toBe(false);
      expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("treats generated and needs_review statuses as reviewable", async () => {
    const reviewable: ProjectArtifactStatus[] = ["generated", "needs_review"];
    for (const status of reviewable) {
      mockCreateApproval.mockClear().mockResolvedValue(makeCreated());
      artifactsById[ARTIFACT] = makeEvidencePackageArtifact({ status });

      const result = await review();

      expect(result.status).toBe("ok");
      expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    }
  });
});

describe("reviewRfpEvidencePackageArtifact - rejected decisions skip approval-only gates", () => {
  it("persists a rejection against an invalid payload without loading source artifacts", async () => {
    artifactsById[ARTIFACT] = makeEvidencePackageArtifact({
      payload: { payloadKind: "not-an-evidence-package" },
    });
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));

    const result = await review({ decision: "rejected", note: "incomplete" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactStatus).toBe("rejected");
    // Only the target artifact was loaded: no source/provenance validation.
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "rejected",
      decidedBy: DECIDER,
      note: "incomplete",
    });
  });

  it("persists a rejection while delta candidates are still pending_review", async () => {
    artifactsById[DELTA] = makeDeltaArtifact({
      payload: makeDeltaPayload([
        makeDeltaCandidate({ reviewStatus: "pending_review" }),
      ]),
    });
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));

    const result = await review({ decision: "rejected" });

    expect(result.status).toBe("ok");
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("returns no payloadSummary for a rejected decision", async () => {
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));

    const result = await review({ decision: "rejected" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect("payloadSummary" in result).toBe(false);
  });
});

describe("reviewRfpEvidencePackageArtifact - approval-only payload gates", () => {
  const INVALID_PAYLOAD_CASES: ReadonlyArray<{
    name: string;
    mutate: (artifact: ProjectArtifact) => void;
  }> = [
    {
      name: "the payload is not a plain object",
      mutate: (a) => {
        a.payload = [] as unknown as Record<string, unknown>;
      },
    },
    {
      name: "payloadKind is not rfp_evidence_package",
      mutate: (a) => {
        a.payload.payloadKind = "rfp_extraction_delta";
      },
    },
    {
      name: "inputPackageArtifactId is blank",
      mutate: (a) => {
        a.payload.inputPackageArtifactId = "   ";
      },
    },
    {
      name: "inputPackageArtifactId is missing",
      mutate: (a) => {
        delete a.payload.inputPackageArtifactId;
      },
    },
    {
      name: "sourceFileIds is not an array",
      mutate: (a) => {
        a.payload.sourceFileIds = FILE_RFP;
      },
    },
    {
      name: "sourceFileIds is empty",
      mutate: (a) => {
        a.sourceFileIds = [];
        a.payload.sourceFileIds = [];
      },
    },
    {
      name: "sourceFileIds contains a non-string entry",
      mutate: (a) => {
        a.payload.sourceFileIds = [FILE_RFP, 7];
      },
    },
    {
      name: "sourceArtifactIds is not an array",
      mutate: (a) => {
        a.payload.sourceArtifactIds = INPUT_PACKAGE;
      },
    },
    {
      name: "sourceArtifactIds contains a non-string entry",
      mutate: (a) => {
        a.payload.sourceArtifactIds = [INPUT_PACKAGE, 5];
      },
    },
    {
      name: "payload sourceFileIds do not equal the artifact sourceFileIds",
      mutate: (a) => {
        a.payload.sourceFileIds = [FILE_BOQ, FILE_RFP];
      },
    },
    {
      name: "payload sourceFileIds drop an artifact source file",
      mutate: (a) => {
        a.payload.sourceFileIds = [FILE_RFP];
      },
    },
    {
      name: "payload sourceArtifactIds do not equal the artifact sourceArtifactIds",
      mutate: (a) => {
        a.payload.sourceArtifactIds = [DELTA, INPUT_PACKAGE];
      },
    },
    {
      name: "sourceArtifactIds omit the inputPackageArtifactId",
      mutate: (a) => {
        a.sourceArtifactIds = [DELTA];
        a.payload.sourceArtifactIds = [DELTA];
      },
    },
    {
      name: "evidence is not an array",
      mutate: (a) => {
        a.payload.evidence = {};
      },
    },
    {
      name: "evidence is empty",
      mutate: (a) => {
        a.payload.evidence = [];
      },
    },
    {
      name: "an evidence entry is not an object",
      mutate: (a) => {
        (a.payload.evidence as unknown[])[0] = "junk";
      },
    },
    {
      name: "an evidence entry has an unknown evidenceKind",
      mutate: (a) => {
        evidenceEntries(a)[0].evidenceKind = "rfp_requirement";
      },
    },
    {
      name: "an evidence entry has a blank evidenceId",
      mutate: (a) => {
        evidenceEntries(a)[0].evidenceId = "  ";
      },
    },
    {
      name: "an evidence entry has a blank sourceFileId",
      mutate: (a) => {
        evidenceEntries(a)[0].sourceFileId = "";
      },
    },
    {
      name: "an evidence entry sourceFileId is outside payload sourceFileIds",
      mutate: (a) => {
        evidenceEntries(a)[0].sourceFileId = "file-other-9";
      },
    },
    {
      name: "a payload sourceFileId has no evidence entry",
      mutate: (a) => {
        a.payload.evidence = evidenceEntries(a).slice(0, 2);
        a.payload.evidenceCount = 2;
        a.payload.textChunkCount = 2;
        a.payload.tableEvidenceCount = 0;
      },
    },
    {
      name: "an evidence entry names a different inputPackageArtifactId",
      mutate: (a) => {
        evidenceEntries(a)[0].inputPackageArtifactId = "art-other-package";
      },
    },
    {
      name: "evidenceCount does not match the evidence array",
      mutate: (a) => {
        a.payload.evidenceCount = 4;
      },
    },
    {
      name: "evidenceCount is not numeric",
      mutate: (a) => {
        a.payload.evidenceCount = "3";
      },
    },
    {
      name: "textChunkCount does not match the text-chunk entries",
      mutate: (a) => {
        a.payload.textChunkCount = 3;
      },
    },
    {
      name: "tableEvidenceCount does not match the table entries",
      mutate: (a) => {
        a.payload.tableEvidenceCount = 0;
      },
    },
  ];

  for (const { name, mutate } of INVALID_PAYLOAD_CASES) {
    it(`returns invalid_evidence_package_payload when ${name}`, async () => {
      const artifact = makeEvidencePackageArtifact();
      mutate(artifact);
      artifactsById[ARTIFACT] = artifact;

      const result = await review();

      expect(result.status).toBe("invalid_evidence_package_payload");
      if (result.status !== "invalid_evidence_package_payload") {
        throw new Error("unreachable");
      }
      expect("payload" in result.artifact).toBe(false);
      expect(JSON.stringify(result)).not.toContain(EVIDENCE_SENTINEL);
      // The payload gate fires before any source artifact load.
      expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    });
  }
});

describe("reviewRfpEvidencePackageArtifact - source artifact gates", () => {
  it("returns source_artifact_not_found with only the missing input package id", async () => {
    artifactsById[INPUT_PACKAGE] = null;

    const result = await review();

    expect(result).toEqual({
      status: "source_artifact_not_found",
      missingSourceArtifactIds: [INPUT_PACKAGE],
    });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("collects every missing source artifact id in artifact order", async () => {
    artifactsById[INPUT_PACKAGE] = null;
    artifactsById[DELTA] = null;

    const result = await review();

    expect(result).toEqual({
      status: "source_artifact_not_found",
      missingSourceArtifactIds: [INPUT_PACKAGE, DELTA],
    });
  });

  it("returns source_artifact_invalid when the input package source is not approved", async () => {
    artifactsById[INPUT_PACKAGE] = makeInputPackageArtifact({
      status: "needs_review",
    });

    const result = await review();

    expect(result.status).toBe("source_artifact_invalid");
    if (result.status !== "source_artifact_invalid") {
      throw new Error("unreachable");
    }
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].id).toBe(INPUT_PACKAGE);
    expect(result.artifacts[0].status).toBe("needs_review");
    expect("payload" in result.artifacts[0]).toBe(false);
    expect(JSON.stringify(result)).not.toContain(INPUT_PACKAGE_SENTINEL);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns source_artifact_invalid when the input package id resolves to another type or stage", async () => {
    for (const override of [
      { type: "extraction_delta" as ProjectArtifactType },
      { stageId: "boq_format_validation" as ProjectArtifact["stageId"] },
    ]) {
      mockCreateApproval.mockClear();
      artifactsById[INPUT_PACKAGE] = makeInputPackageArtifact(override);

      const result = await review();

      expect(result.status).toBe("source_artifact_invalid");
      if (result.status !== "source_artifact_invalid") {
        throw new Error("unreachable");
      }
      expect(result.artifacts[0].id).toBe(INPUT_PACKAGE);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("accepts no pricing, SKU, config, BoQ, requirements, compliance, HLD, proposal, export, or package type as a delta source", async () => {
    const disallowedTypes: ProjectArtifactType[] = [
      "normalized_boq",
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
      "requirements_baseline",
      "compliance_matrix",
      "hld_design_delta",
      "technical_proposal",
      "export_package",
      "input_package",
      "evidence_package",
    ];
    for (const type of disallowedTypes) {
      mockCreateApproval.mockClear();
      artifactsById[DELTA] = makeDeltaArtifact({ type });

      const result = await review();

      expect(result.status).toBe("source_artifact_invalid");
      if (result.status !== "source_artifact_invalid") {
        throw new Error("unreachable");
      }
      expect(result.artifacts[0].id).toBe(DELTA);
      expect(result.artifacts[0].type).toBe(type);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("returns source_artifact_invalid for an extraction_delta source outside intake_package_review", async () => {
    artifactsById[DELTA] = makeDeltaArtifact({
      stageId: "requirements_baseline_review",
    });

    const result = await review();

    expect(result.status).toBe("source_artifact_invalid");
    if (result.status !== "source_artifact_invalid") {
      throw new Error("unreachable");
    }
    expect(result.artifacts[0].id).toBe(DELTA);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });
});

describe("reviewRfpEvidencePackageArtifact - extraction delta gates", () => {
  const INVALID_DELTA_PAYLOAD_CASES: ReadonlyArray<{
    name: string;
    payload: Record<string, unknown>;
  }> = [
    {
      name: "the delta payload is not stamped rfp_extraction_delta",
      payload: { ...makeDeltaPayload([]), payloadKind: "rfp_evidence_package" },
    },
    {
      name: "the delta candidates value is not an array",
      payload: { ...makeDeltaPayload([]), candidates: {} },
    },
    {
      name: "a delta candidate is not an object",
      payload: {
        ...makeDeltaPayload([]),
        candidates: ["junk"],
      },
    },
    {
      name: "a delta candidate has a blank id",
      payload: makeDeltaPayload([makeDeltaCandidate({ id: "  " })]),
    },
    {
      name: "a delta candidate has no reviewStatus",
      payload: makeDeltaPayload([
        makeDeltaCandidate({ reviewStatus: undefined }),
      ]),
    },
    {
      name: "a delta candidate has a blank reviewStatus",
      payload: makeDeltaPayload([makeDeltaCandidate({ reviewStatus: " " })]),
    },
    {
      name: "a delta candidate has an unknown reviewStatus",
      payload: makeDeltaPayload([
        makeDeltaCandidate({ reviewStatus: "approved_by_ai" }),
      ]),
    },
  ];

  for (const { name, payload } of INVALID_DELTA_PAYLOAD_CASES) {
    it(`returns extraction_delta_payload_invalid when ${name}`, async () => {
      artifactsById[DELTA] = makeDeltaArtifact({ payload });

      const result = await review();

      expect(result).toEqual({
        status: "extraction_delta_payload_invalid",
        sources: [{ sourceArtifactId: DELTA, sourceArtifactVersion: 5 }],
      });
      expect(JSON.stringify(result)).not.toContain(CANDIDATE_SENTINEL);
      expect(JSON.stringify(result)).not.toContain(PROPOSAL_SENTINEL);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    });
  }

  it("blocks approval with extraction_delta_candidates_pending listing only the pending candidate ids", async () => {
    artifactsById[DELTA] = makeDeltaArtifact({
      payload: makeDeltaPayload([
        makeDeltaCandidate(),
        makeDeltaCandidate({
          id: "RFP-DELTA-002",
          reviewStatus: "pending_review",
        }),
        makeDeltaCandidate({
          id: "RFP-DELTA-003",
          reviewStatus: "pending_review",
        }),
      ]),
    });

    const result = await review();

    expect(result).toEqual({
      status: "extraction_delta_candidates_pending",
      sources: [
        {
          sourceArtifactId: DELTA,
          sourceArtifactVersion: 5,
          pendingCandidateIds: ["RFP-DELTA-002", "RFP-DELTA-003"],
        },
      ],
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain(CANDIDATE_SENTINEL);
    expect(json).not.toContain(PROPOSAL_SENTINEL);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("collects pending candidates across every extraction_delta source in order", async () => {
    artifactsById[ARTIFACT] = makeEvidencePackageArtifact({
      sourceArtifactIds: [INPUT_PACKAGE, DELTA, DELTA_2],
      payload: {
        ...makeEvidencePackagePayload(),
        sourceArtifactIds: [INPUT_PACKAGE, DELTA, DELTA_2],
      },
    });
    artifactsById[DELTA] = makeDeltaArtifact({
      payload: makeDeltaPayload([
        makeDeltaCandidate({ reviewStatus: "pending_review" }),
      ]),
    });
    artifactsById[DELTA_2] = makeDeltaArtifact({
      id: DELTA_2,
      version: 6,
      payload: makeDeltaPayload([
        makeDeltaCandidate({
          id: "RFP-DELTA-009",
          reviewStatus: "pending_review",
        }),
      ]),
    });

    const result = await review();

    expect(result).toEqual({
      status: "extraction_delta_candidates_pending",
      sources: [
        {
          sourceArtifactId: DELTA,
          sourceArtifactVersion: 5,
          pendingCandidateIds: ["RFP-DELTA-001"],
        },
        {
          sourceArtifactId: DELTA_2,
          sourceArtifactVersion: 6,
          pendingCandidateIds: ["RFP-DELTA-009"],
        },
      ],
    });
  });

  it("reports an invalid delta payload before pending candidates in another delta", async () => {
    artifactsById[ARTIFACT] = makeEvidencePackageArtifact({
      sourceArtifactIds: [INPUT_PACKAGE, DELTA, DELTA_2],
      payload: {
        ...makeEvidencePackagePayload(),
        sourceArtifactIds: [INPUT_PACKAGE, DELTA, DELTA_2],
      },
    });
    artifactsById[DELTA] = makeDeltaArtifact({
      payload: { payloadKind: "rfp_extraction_delta", candidates: {} },
    });
    artifactsById[DELTA_2] = makeDeltaArtifact({
      id: DELTA_2,
      version: 6,
      payload: makeDeltaPayload([
        makeDeltaCandidate({ reviewStatus: "pending_review" }),
      ]),
    });

    const result = await review();

    expect(result).toEqual({
      status: "extraction_delta_payload_invalid",
      sources: [{ sourceArtifactId: DELTA, sourceArtifactVersion: 5 }],
    });
  });

  it("treats accepted, rejected, and waived candidates as resolved review metadata", async () => {
    // The default fixture holds exactly one candidate per resolved status.
    const result = await review();

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("approves over a delta source with zero candidates (none found)", async () => {
    artifactsById[DELTA] = makeDeltaArtifact({ payload: makeDeltaPayload([]) });

    const result = await review();

    expect(result.status).toBe("ok");
  });
});

describe("reviewRfpEvidencePackageArtifact - approval call", () => {
  it("calls createProjectApproval exactly once with the exact artifact id, tenant, project, decision, decidedBy, decidedAt, and note", async () => {
    await review({ decidedAt: DECIDED_AT, note: "evidence verified" });

    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
      note: "evidence verified",
    });
  });

  it("omits decidedAt and note from the createProjectApproval call when not provided", async () => {
    await review();

    const arg = mockCreateApproval.mock.calls[0][0];
    expect("decidedAt" in arg).toBe(false);
    expect("note" in arg).toBe(false);
  });

  it("returns approval_failed when createProjectApproval returns null", async () => {
    mockCreateApproval.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "approval_failed" });
  });

  it("lets an unexpected createProjectApproval error bubble without a defensive catch", async () => {
    mockCreateApproval.mockRejectedValue(new Error("db boom"));

    await expect(review()).rejects.toThrow("db boom");
  });
});

describe("reviewRfpEvidencePackageArtifact - ok", () => {
  it("returns ok with the approval, post-decision statuses, the pre-approval artifact summary, and the lean payload summary", async () => {
    const created = makeCreated("approved");
    mockCreateApproval.mockResolvedValue(created);

    const result = await review();

    expect(result).toEqual({
      status: "ok",
      approval: created.approval,
      artifactStatus: "approved",
      stageStatus: "approved",
      artifact: {
        id: ARTIFACT,
        projectId: PROJECT,
        stageId: "intake_package_review",
        type: "evidence_package",
        status: "needs_review",
        version: 2,
        sourceFileIds: [FILE_RFP, FILE_BOQ],
        sourceArtifactIds: [INPUT_PACKAGE, DELTA],
        createdAt: TS1.toISOString(),
        updatedAt: TS2.toISOString(),
      },
      payloadSummary: {
        payloadKind: "rfp_evidence_package",
        inputPackageArtifactId: INPUT_PACKAGE,
        evidenceCount: 3,
        textChunkCount: 2,
        tableEvidenceCount: 1,
        sourceFileIds: [FILE_RFP, FILE_BOQ],
        sourceArtifactIds: [INPUT_PACKAGE, DELTA],
        extractionDeltaSourceArtifactIds: [DELTA],
      },
    });
    // Sources are loaded tenant/project scoped, in artifact-row order.
    expect(mockGetArtifactById.mock.calls).toEqual([
      [TENANT, PROJECT, ARTIFACT],
      [TENANT, PROJECT, INPUT_PACKAGE],
      [TENANT, PROJECT, DELTA],
    ]);
  });

  it("returns serializable summaries with copied arrays and no payload, evidence, candidate, proposal, or tenantId leakage", async () => {
    const loaded = makeEvidencePackageArtifact();
    artifactsById[ARTIFACT] = loaded;

    const result = await review();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect("tenantId" in result.artifact).toBe(false);
    expect(JSON.parse(JSON.stringify(result.artifact))).toEqual(result.artifact);
    expect(JSON.parse(JSON.stringify(result.payloadSummary))).toEqual(
      result.payloadSummary
    );
    const json = JSON.stringify(result);
    expect(json).not.toContain(EVIDENCE_SENTINEL);
    expect(json).not.toContain(CANDIDATE_SENTINEL);
    expect(json).not.toContain(PROPOSAL_SENTINEL);
    expect(json).not.toContain(INPUT_PACKAGE_SENTINEL);
    expect(json).not.toContain(TENANT);

    // Arrays are copies, not aliases of the loaded row or its payload.
    expect(result.artifact.sourceFileIds).toEqual(loaded.sourceFileIds);
    expect(result.artifact.sourceFileIds).not.toBe(loaded.sourceFileIds);
    expect(result.artifact.sourceArtifactIds).not.toBe(loaded.sourceArtifactIds);
    expect(result.payloadSummary?.sourceFileIds).not.toBe(
      loaded.payload.sourceFileIds
    );
    expect(result.payloadSummary?.sourceArtifactIds).not.toBe(
      loaded.payload.sourceArtifactIds
    );
  });

  it("approves a deterministic-only package whose only source is the approved input package", async () => {
    artifactsById[ARTIFACT] = makeEvidencePackageArtifact({
      sourceArtifactIds: [INPUT_PACKAGE],
      payload: {
        ...makeEvidencePackagePayload(),
        sourceArtifactIds: [INPUT_PACKAGE],
      },
    });

    const result = await review();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary?.extractionDeltaSourceArtifactIds).toEqual([]);
    expect(mockGetArtifactById.mock.calls).toEqual([
      [TENANT, PROJECT, ARTIFACT],
      [TENANT, PROJECT, INPUT_PACKAGE],
    ]);
  });

  it("passes tenantId through every store call on the ok path", async () => {
    await review();

    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
    expect(mockCreateApproval).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT })
    );
  });
});

describe("reviewRfpEvidencePackageArtifact - immutability", () => {
  it("does not mutate the input or any loaded artifact", async () => {
    const loadedTarget = makeEvidencePackageArtifact();
    const loadedInputPackage = makeInputPackageArtifact();
    const loadedDelta = makeDeltaArtifact();
    artifactsById[ARTIFACT] = loadedTarget;
    artifactsById[INPUT_PACKAGE] = loadedInputPackage;
    artifactsById[DELTA] = loadedDelta;
    const targetSnapshot = structuredClone(loadedTarget);
    const inputPackageSnapshot = structuredClone(loadedInputPackage);
    const deltaSnapshot = structuredClone(loadedDelta);
    const input: ReviewRfpEvidencePackageArtifactInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
      note: "evidence verified",
    };
    const inputSnapshot = structuredClone(input);

    await reviewRfpEvidencePackageArtifact(input);

    expect(input).toEqual(inputSnapshot);
    expect(loadedTarget).toEqual(targetSnapshot);
    expect(loadedInputPackage).toEqual(inputPackageSnapshot);
    expect(loadedDelta).toEqual(deltaSnapshot);
  });

  it("returns arrays whose mutation never reaches the loaded rows", async () => {
    const loaded = makeEvidencePackageArtifact();
    artifactsById[ARTIFACT] = loaded;

    const result = await review();

    expect(result.status).toBe("ok");
    if (result.status !== "ok" || result.payloadSummary === undefined) {
      throw new Error("unreachable");
    }
    result.artifact.sourceFileIds.push("mutated");
    result.artifact.sourceArtifactIds.push("mutated");
    result.payloadSummary.sourceFileIds.push("mutated");
    result.payloadSummary.sourceArtifactIds.push("mutated");
    result.payloadSummary.extractionDeltaSourceArtifactIds.push("mutated");
    expect(loaded.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(loaded.sourceArtifactIds).toEqual([INPUT_PACKAGE, DELTA]);
    expect(loaded.payload.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(loaded.payload.sourceArtifactIds).toEqual([INPUT_PACKAGE, DELTA]);
  });
});

describe("module purity and surface", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-evidence-package-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-evidence-package-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project store, artifact store, approval store, approval helper, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-approval-store",
      "@/lib/projects/approvals",
      "@/types/project",
    ]);
  });

  it("uses createProjectApproval as its only create/update/delete mutation", () => {
    expect(source).toContain("createProjectApproval");
    const mutationTokens =
      source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(Array.from(new Set(mutationTokens))).toEqual([
      "createProjectApproval",
    ]);
  });

  it("imports no evidence/file store, DB schema, draft service, extraction, persistence, requirements, Quick BoM, pricing, SKU, config, catalog, export, route, UI, or AI module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/index"',
      'from "@/lib/db/schema"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/db/project-file-store"',
      "createProjectArtifactVersion",
      'from "@/lib/projects/project-rfp-evidence-package"',
      'from "@/lib/projects/project-rfp-extraction-delta"',
      'from "@/lib/projects/project-rfp-extraction-delta-review"',
      'from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-requirements',
      'from "@/lib/projects/project-quick-bom',
      'from "@/lib/projects/boq-',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/mantle',
      'from "@/lib/export',
      'from "@/lib/intake',
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
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("exposes only the review service as a runtime export", () => {
    expect(Object.keys(serviceModule)).toEqual([
      "reviewRfpEvidencePackageArtifact",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
