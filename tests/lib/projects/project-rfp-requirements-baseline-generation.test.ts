import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  DraftRfpRequirementCandidatesFromEvidencePackageResult,
  DraftRfpRequirementCandidatesFromEvidenceResult,
  RfpCandidateDraftingExecutor,
  RfpDraftedRequirementCandidate,
} from "@/lib/projects/project-rfp-requirements-candidate-drafting";
import type {
  CreateRfpRequirementsBaselineDraftResult,
  RfpRequirementsBaselineArtifactSummary,
  RfpRequirementsBaselineEvidenceSummary,
  RfpRequirementsBaselinePayloadSummary,
  RfpRequirementsBaselineProjectSummary,
} from "@/lib/projects/project-rfp-requirements-baseline";

// Mock ONLY the two composed service modules; the orchestration logic under
// test stays real. No DB store, file byte, parser, or AI module is touched
// anywhere in this suite: the injected executor is a plain test function
// that the mocked drafting service never invokes.
const {
  mockDraftCandidates,
  mockDraftCandidatesFromPackage,
  mockCreateBaseline,
} = vi.hoisted(() => ({
  mockDraftCandidates: vi.fn(),
  mockDraftCandidatesFromPackage: vi.fn(),
  mockCreateBaseline: vi.fn(),
}));

vi.mock("@/lib/projects/project-rfp-requirements-candidate-drafting", () => ({
  draftRfpRequirementCandidatesFromEvidence: mockDraftCandidates,
  draftRfpRequirementCandidatesFromEvidencePackage:
    mockDraftCandidatesFromPackage,
}));
vi.mock("@/lib/projects/project-rfp-requirements-baseline", () => ({
  createRfpRequirementsBaselineDraft: mockCreateBaseline,
}));

import {
  generateRfpRequirementsBaselineDraftFromEvidence,
  generateRfpRequirementsBaselineDraftFromEvidencePackage,
  type GenerateRfpRequirementsBaselineDraftFromEvidenceInput,
  type GenerateRfpRequirementsBaselineDraftFromEvidencePackageInput,
  type GenerateRfpRequirementsBaselineDraftFromEvidencePackageResult,
  type GenerateRfpRequirementsBaselineDraftFromEvidenceResult,
  type RfpBaselineGenerationCreationBlockedResult,
  type RfpBaselineGenerationDraftingBlockedResult,
  type RfpBaselineGenerationPackageDraftingBlockedResult,
} from "@/lib/projects/project-rfp-requirements-baseline-generation";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const PACKAGE_A = "art-input-package-1";
const PACKAGE_B = "art-input-package-2";
const EVIDENCE_PACKAGE = "art-evidence-package-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const EV_TEXT = "evidence-text-1";
const EV_TABLE = "evidence-table-1";
const EV_TEXT_B = "evidence-text-2";
const EVIDENCE_IDS = [EV_TEXT, EV_TABLE, EV_TEXT_B];
const REQUESTED_BY = "engineer@stc.example";
const BASELINE_ARTIFACT = "art-requirements-baseline-1";
const TS1 = "2026-06-01T10:00:00.000Z";
const TS2 = "2026-06-02T11:30:00.000Z";
const CREATED_AT = "2026-06-05T09:00:00.000Z";

/** A plain injected executor; the mocked drafting service never calls it. */
function makeExecutor(): RfpCandidateDraftingExecutor {
  return vi.fn(async () => ({ candidates: [] }));
}

function makeProjectSummary(): RfpRequirementsBaselineProjectSummary {
  return {
    id: PROJECT,
    name: "STC RFP Bid",
    customerName: "STC",
    mode: "rfp",
    createdAt: TS1,
    updatedAt: TS2,
  };
}

function makeEvidenceSummary(
  id: string,
  kind: string
): RfpRequirementsBaselineEvidenceSummary {
  return {
    id,
    projectId: PROJECT,
    sourceFileId: FILE_BOQ,
    kind,
    extractedAt: TS1,
    retainUntil: TS2,
  };
}

function makeInputPackageSummary(
  overrides: Partial<RfpRequirementsBaselineArtifactSummary> = {}
): RfpRequirementsBaselineArtifactSummary {
  return {
    id: PACKAGE_A,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "input_package",
    status: "approved",
    version: 3,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeEvidencePackageSummary(
  overrides: Partial<RfpRequirementsBaselineArtifactSummary> = {}
): RfpRequirementsBaselineArtifactSummary {
  return {
    id: EVIDENCE_PACKAGE,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "evidence_package",
    status: "approved",
    version: 4,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

/** Sanitized candidates exactly as the drafting service would return them. */
function makeCandidates(): RfpDraftedRequirementCandidate[] {
  return [
    {
      text: "CANDIDATE-TEXT: provide 48-port PoE access switches for all IDFs.",
      category: "technical",
      priority: "mandatory",
      evidenceIds: [EV_TEXT, EV_TABLE],
      title: "Access layer switching",
      notes: "Cited from RFP section 3.2.",
    },
    {
      text: "CANDIDATE-TEXT: submit a bid bond with the commercial offer.",
      evidenceIds: [EV_TABLE, EV_TEXT_B],
    },
  ];
}

type DraftingOk = Extract<
  DraftRfpRequirementCandidatesFromEvidenceResult,
  { status: "ok" }
>;

function makeDraftingOk(): DraftingOk {
  return {
    status: "ok",
    project: makeProjectSummary(),
    candidates: makeCandidates(),
    candidateCount: 2,
    evidenceCount: 3,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A, PACKAGE_B],
  };
}

type PackageDraftingOk = Extract<
  DraftRfpRequirementCandidatesFromEvidencePackageResult,
  { status: "ok" }
>;

function makePackageDraftingOk(): PackageDraftingOk {
  return {
    status: "ok",
    project: makeProjectSummary(),
    evidencePackageArtifactId: EVIDENCE_PACKAGE,
    candidates: makeCandidates(),
    candidateCount: 2,
    evidenceCount: 3,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
  };
}

function makeArtifactSummary(): RfpRequirementsBaselineArtifactSummary {
  return {
    id: BASELINE_ARTIFACT,
    projectId: PROJECT,
    stageId: "requirements_baseline_review",
    type: "requirements_baseline",
    status: "needs_review",
    version: 1,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A, PACKAGE_B],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function makePayloadSummary(): RfpRequirementsBaselinePayloadSummary {
  return {
    payloadKind: "rfp_requirements_baseline",
    createdBy: REQUESTED_BY,
    createdAt: CREATED_AT,
    requirementCount: 2,
    evidenceCount: 3,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A, PACKAGE_B],
    requirementIds: ["RFP-REQ-001", "RFP-REQ-002"],
  };
}

type CreationOk = Extract<
  CreateRfpRequirementsBaselineDraftResult,
  { status: "ok" }
>;

function makeCreationOk(): CreationOk {
  return {
    status: "ok",
    artifact: makeArtifactSummary(),
    payloadSummary: makePayloadSummary(),
  };
}

/**
 * One representative member of every non-ok drafting status: the project
 * gates, every evidence/provenance gate, the provider (executor) failure,
 * and invalid executor output.
 */
function makeDraftingBlockedResults(): RfpBaselineGenerationDraftingBlockedResult[] {
  return [
    { status: "not_found" },
    {
      status: "wrong_mode",
      project: { ...makeProjectSummary(), mode: "quick_bom" },
    },
    {
      status: "evidence_not_found",
      missingEvidenceIds: ["missing-ev-1", "missing-ev-2"],
    },
    {
      status: "evidence_not_rfp_extraction",
      evidence: [makeEvidenceSummary("evidence-boq-1", "boq_line_item")],
    },
    {
      status: "evidence_missing_input_package",
      evidence: [makeEvidenceSummary(EV_TEXT, "rfp_document_text_chunk")],
    },
    {
      status: "input_package_artifact_not_found",
      missingArtifactIds: [PACKAGE_A],
    },
    {
      status: "artifact_not_input_package",
      artifacts: [
        makeInputPackageSummary({
          type: "normalized_boq",
          stageId: "boq_format_validation",
        }),
      ],
    },
    {
      status: "input_package_not_approved",
      artifacts: [makeInputPackageSummary({ status: "needs_review" })],
    },
    { status: "drafting_failed", error: "candidate_drafting_failed" },
    {
      status: "invalid_candidate_output",
      errors: ["candidates[0] must be an object."],
    },
  ];
}

/** One representative member of every non-ok package-drafting status. */
function makePackageDraftingBlockedResults(): RfpBaselineGenerationPackageDraftingBlockedResult[] {
  return [
    { status: "not_found" },
    {
      status: "wrong_mode",
      project: { ...makeProjectSummary(), mode: "quick_bom" },
    },
    { status: "evidence_package_artifact_not_found" },
    {
      status: "artifact_not_evidence_package",
      artifact: makeEvidencePackageSummary({ type: "input_package" }),
    },
    {
      status: "evidence_package_not_approved",
      artifact: makeEvidencePackageSummary({ status: "needs_review" }),
    },
    {
      status: "invalid_evidence_package_payload",
      artifact: makeEvidencePackageSummary(),
    },
    {
      status: "evidence_package_empty",
      artifact: makeEvidencePackageSummary(),
    },
    { status: "drafting_failed", error: "candidate_drafting_failed" },
    {
      status: "invalid_candidate_output",
      errors: ["candidates[0] cites unknown evidence ID: evidence-bogus-1."],
    },
  ];
}

/** One representative member of every non-ok baseline-create status. */
function makeCreationBlockedResults(): RfpBaselineGenerationCreationBlockedResult[] {
  return [
    { status: "not_found" },
    {
      status: "wrong_mode",
      project: { ...makeProjectSummary(), mode: "quick_bom" },
    },
    { status: "evidence_not_found", missingEvidenceIds: [EV_TEXT_B] },
    {
      status: "evidence_not_rfp_extraction",
      evidence: [makeEvidenceSummary("evidence-boq-1", "boq_line_item")],
    },
    {
      status: "evidence_missing_input_package",
      evidence: [makeEvidenceSummary(EV_TABLE, "rfp_document_table")],
    },
    {
      status: "input_package_artifact_not_found",
      missingArtifactIds: [PACKAGE_B],
    },
    {
      status: "artifact_not_input_package",
      artifacts: [
        makeInputPackageSummary({
          type: "normalized_boq",
          stageId: "boq_format_validation",
        }),
      ],
    },
    {
      status: "input_package_not_approved",
      artifacts: [makeInputPackageSummary({ status: "needs_review" })],
    },
  ];
}

function generate(
  overrides: Partial<GenerateRfpRequirementsBaselineDraftFromEvidenceInput> = {}
): Promise<GenerateRfpRequirementsBaselineDraftFromEvidenceResult> {
  return generateRfpRequirementsBaselineDraftFromEvidence({
    tenantId: TENANT,
    projectId: PROJECT,
    evidenceIds: EVIDENCE_IDS.slice(),
    requestedBy: REQUESTED_BY,
    executor: makeExecutor(),
    ...overrides,
  });
}

function generatePackage(
  overrides: Partial<GenerateRfpRequirementsBaselineDraftFromEvidencePackageInput> = {}
): Promise<GenerateRfpRequirementsBaselineDraftFromEvidencePackageResult> {
  return generateRfpRequirementsBaselineDraftFromEvidencePackage({
    tenantId: TENANT,
    projectId: PROJECT,
    evidencePackageArtifactId: EVIDENCE_PACKAGE,
    requestedBy: REQUESTED_BY,
    executor: makeExecutor(),
    ...overrides,
  });
}

beforeEach(() => {
  mockDraftCandidates.mockReset().mockResolvedValue(makeDraftingOk());
  mockDraftCandidatesFromPackage
    .mockReset()
    .mockResolvedValue(makePackageDraftingOk());
  mockCreateBaseline.mockReset().mockResolvedValue(makeCreationOk());
});

describe("generateRfpRequirementsBaselineDraftFromEvidence - drafting phase input", () => {
  it("calls candidate drafting exactly once with the exact tenant/project/evidence/requestedBy/executor", async () => {
    const executor = makeExecutor();
    const evidenceIds = EVIDENCE_IDS.slice();

    await generate({ executor, evidenceIds });

    expect(mockDraftCandidates).toHaveBeenCalledTimes(1);
    const draftingInput = mockDraftCandidates.mock.calls[0][0];
    expect(draftingInput).toEqual({
      tenantId: TENANT,
      projectId: PROJECT,
      evidenceIds: EVIDENCE_IDS,
      requestedBy: REQUESTED_BY,
      executor,
    });
    // The injected executor crosses the boundary by identity, never wrapped.
    expect(draftingInput.executor).toBe(executor);
    expect(Object.keys(draftingInput).sort()).toEqual([
      "evidenceIds",
      "executor",
      "projectId",
      "requestedBy",
      "tenantId",
    ]);
  });

  it("forwards a padded requestedBy to drafting untrimmed - the drafting service owns that gate", async () => {
    await generate({ requestedBy: `  ${REQUESTED_BY}  ` });

    expect(mockDraftCandidates.mock.calls[0][0].requestedBy).toBe(
      `  ${REQUESTED_BY}  `
    );
  });

  it("runs candidate drafting strictly before baseline creation", async () => {
    await generate();

    expect(mockDraftCandidates).toHaveBeenCalledTimes(1);
    expect(mockCreateBaseline).toHaveBeenCalledTimes(1);
    expect(mockDraftCandidates.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateBaseline.mock.invocationCallOrder[0]
    );
  });
});

describe("generateRfpRequirementsBaselineDraftFromEvidencePackage - package drafting phase input", () => {
  it("calls package-based candidate drafting with evidencePackageArtifactId and no raw evidenceIds", async () => {
    const executor = makeExecutor();

    await generatePackage({ executor });

    expect(mockDraftCandidatesFromPackage).toHaveBeenCalledTimes(1);
    expect(mockDraftCandidates).not.toHaveBeenCalled();
    const draftingInput = mockDraftCandidatesFromPackage.mock.calls[0][0];
    expect(draftingInput).toEqual({
      tenantId: TENANT,
      projectId: PROJECT,
      evidencePackageArtifactId: EVIDENCE_PACKAGE,
      requestedBy: REQUESTED_BY,
      executor,
    });
    expect(draftingInput.executor).toBe(executor);
    expect(Object.keys(draftingInput).sort()).toEqual([
      "evidencePackageArtifactId",
      "executor",
      "projectId",
      "requestedBy",
      "tenantId",
    ]);
    expect("evidenceIds" in draftingInput).toBe(false);
  });

  it("runs package candidate drafting strictly before baseline creation", async () => {
    await generatePackage();

    expect(mockDraftCandidatesFromPackage).toHaveBeenCalledTimes(1);
    expect(mockCreateBaseline).toHaveBeenCalledTimes(1);
    expect(
      mockDraftCandidatesFromPackage.mock.invocationCallOrder[0]
    ).toBeLessThan(mockCreateBaseline.mock.invocationCallOrder[0]);
  });
});

describe("candidate drafting blocked", () => {
  it("wraps every non-ok drafting status with phase candidate_drafting and never calls baseline creation", async () => {
    for (const blocked of makeDraftingBlockedResults()) {
      mockDraftCandidates.mockReset().mockResolvedValue(blocked);
      mockCreateBaseline.mockClear();

      const result = await generate();

      expect(result).toEqual({
        status: "blocked",
        phase: "candidate_drafting",
        drafting: blocked,
      });
      expect(mockCreateBaseline).not.toHaveBeenCalled();
    }
  });

  it("keeps a provider failure lean: a drafting_failed block carries only the fixed error code", async () => {
    mockDraftCandidates.mockReset().mockResolvedValue({
      status: "drafting_failed",
      error: "candidate_drafting_failed",
    });

    const result = await generate();

    expect(result).toEqual({
      status: "blocked",
      phase: "candidate_drafting",
      drafting: {
        status: "drafting_failed",
        error: "candidate_drafting_failed",
      },
    });
    expect(mockCreateBaseline).not.toHaveBeenCalled();
  });
});

describe("package candidate drafting blocked", () => {
  it("wraps every non-ok package-drafting status with phase candidate_drafting and never calls baseline creation", async () => {
    for (const blocked of makePackageDraftingBlockedResults()) {
      mockDraftCandidatesFromPackage.mockReset().mockResolvedValue(blocked);
      mockCreateBaseline.mockClear();

      const result = await generatePackage();

      expect(result).toEqual({
        status: "blocked",
        phase: "candidate_drafting",
        drafting: blocked,
      });
      expect(mockCreateBaseline).not.toHaveBeenCalled();
    }
  });
});

describe("baseline creation phase input", () => {
  it("hands baseline creation the same tenant/project, trimmed createdBy, and exactly the drafted candidates", async () => {
    const draftingOk = makeDraftingOk();
    mockDraftCandidates.mockReset().mockResolvedValue(draftingOk);

    await generate({ requestedBy: `  ${REQUESTED_BY}  ` });

    expect(mockCreateBaseline).toHaveBeenCalledTimes(1);
    const creationInput = mockCreateBaseline.mock.calls[0][0];
    expect(creationInput).toEqual({
      tenantId: TENANT,
      projectId: PROJECT,
      createdBy: REQUESTED_BY,
      candidates: draftingOk.candidates,
    });
    // Exactly the sanitized array the drafting service returned: the
    // orchestrator never rebuilds, filters, or re-sanitizes candidates.
    expect(creationInput.candidates).toBe(draftingOk.candidates);
    expect(Object.keys(creationInput).sort()).toEqual([
      "candidates",
      "createdBy",
      "projectId",
      "tenantId",
    ]);
  });
});

describe("package baseline creation phase input", () => {
  it("hands baseline creation the sanitized package-drafted candidates only", async () => {
    const draftingOk = makePackageDraftingOk();
    mockDraftCandidatesFromPackage.mockReset().mockResolvedValue(draftingOk);

    await generatePackage({ requestedBy: `  ${REQUESTED_BY}  ` });

    expect(mockCreateBaseline).toHaveBeenCalledTimes(1);
    const creationInput = mockCreateBaseline.mock.calls[0][0];
    expect(creationInput).toEqual({
      tenantId: TENANT,
      projectId: PROJECT,
      createdBy: REQUESTED_BY,
      candidates: draftingOk.candidates,
    });
    expect(creationInput.candidates).toBe(draftingOk.candidates);
    expect(Object.keys(creationInput).sort()).toEqual([
      "candidates",
      "createdBy",
      "projectId",
      "tenantId",
    ]);
  });
});

describe("baseline creation blocked", () => {
  it("wraps every non-ok creation status with phase baseline_creation after a successful drafting phase", async () => {
    for (const blocked of makeCreationBlockedResults()) {
      mockDraftCandidates.mockClear();
      mockCreateBaseline.mockReset().mockResolvedValue(blocked);

      const result = await generate();

      expect(result).toEqual({
        status: "blocked",
        phase: "baseline_creation",
        creation: blocked,
      });
      expect(mockDraftCandidates).toHaveBeenCalledTimes(1);
    }
  });
});

describe("package baseline creation blocked", () => {
  it("wraps every non-ok creation status with phase baseline_creation after successful package drafting", async () => {
    for (const blocked of makeCreationBlockedResults()) {
      mockDraftCandidatesFromPackage.mockClear();
      mockCreateBaseline.mockReset().mockResolvedValue(blocked);

      const result = await generatePackage();

      expect(result).toEqual({
        status: "blocked",
        phase: "baseline_creation",
        creation: blocked,
      });
      expect(mockDraftCandidatesFromPackage).toHaveBeenCalledTimes(1);
    }
  });
});

describe("success", () => {
  it("returns the lean ok read model: drafting counts/source ids plus the created summaries", async () => {
    const result = await generate();

    expect(result).toEqual({
      status: "ok",
      candidateCount: 2,
      evidenceCount: 3,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A, PACKAGE_B],
      artifact: makeArtifactSummary(),
      payloadSummary: makePayloadSummary(),
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("exposes no candidates, project summary, or tenant on the ok result", async () => {
    const result = await generate();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(Object.keys(result).sort()).toEqual([
      "artifact",
      "candidateCount",
      "evidenceCount",
      "payloadSummary",
      "sourceArtifactIds",
      "sourceFileIds",
      "status",
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TENANT);
    expect(serialized).not.toContain("tenantId");
    expect(serialized).not.toContain("CANDIDATE-TEXT");
  });

  it("returns copies: mutating the ok result never mutates either mocked service result", async () => {
    const draftingOk = makeDraftingOk();
    const creationOk = makeCreationOk();
    const draftingSnapshot = structuredClone(draftingOk);
    const creationSnapshot = structuredClone(creationOk);
    mockDraftCandidates.mockReset().mockResolvedValue(draftingOk);
    mockCreateBaseline.mockReset().mockResolvedValue(creationOk);

    const result = await generate();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    result.sourceFileIds.push("hacked-file");
    result.sourceArtifactIds.push("hacked-artifact");
    result.artifact.status = "approved";
    result.artifact.sourceFileIds.push("hacked-file");
    result.artifact.sourceArtifactIds.push("hacked-artifact");
    result.payloadSummary.createdBy = "hacked-user";
    result.payloadSummary.sourceFileIds.push("hacked-file");
    result.payloadSummary.sourceArtifactIds.push("hacked-artifact");
    result.payloadSummary.requirementIds.push("RFP-REQ-999");

    expect(draftingOk).toEqual(draftingSnapshot);
    expect(creationOk).toEqual(creationSnapshot);
  });

  it("never mutates the caller's input", async () => {
    const evidenceIds = EVIDENCE_IDS.slice();
    const snapshot = evidenceIds.slice();

    const result = await generate({ evidenceIds });

    expect(result.status).toBe("ok");
    expect(evidenceIds).toEqual(snapshot);
  });
});

describe("package success", () => {
  it("returns the lean package ok read model with the evidence_package id", async () => {
    const result = await generatePackage();

    expect(result).toEqual({
      status: "ok",
      candidateCount: 2,
      evidenceCount: 3,
      evidencePackageArtifactId: EVIDENCE_PACKAGE,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A],
      artifact: makeArtifactSummary(),
      payloadSummary: makePayloadSummary(),
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("exposes no package-drafted candidates, project summary, raw evidence IDs input, or tenant on the ok result", async () => {
    const result = await generatePackage();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(Object.keys(result).sort()).toEqual([
      "artifact",
      "candidateCount",
      "evidenceCount",
      "evidencePackageArtifactId",
      "payloadSummary",
      "sourceArtifactIds",
      "sourceFileIds",
      "status",
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TENANT);
    expect(serialized).not.toContain("tenantId");
    expect(serialized).not.toContain("CANDIDATE-TEXT");
    expect(serialized).not.toContain("evidenceIds");
  });

  it("returns copies for the package ok result", async () => {
    const draftingOk = makePackageDraftingOk();
    const creationOk = makeCreationOk();
    const draftingSnapshot = structuredClone(draftingOk);
    const creationSnapshot = structuredClone(creationOk);
    mockDraftCandidatesFromPackage.mockReset().mockResolvedValue(draftingOk);
    mockCreateBaseline.mockReset().mockResolvedValue(creationOk);

    const result = await generatePackage();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    result.sourceFileIds.push("hacked-file");
    result.sourceArtifactIds.push("hacked-artifact");
    result.artifact.status = "approved";
    result.artifact.sourceFileIds.push("hacked-file");
    result.payloadSummary.requirementIds.push("RFP-REQ-999");

    expect(draftingOk).toEqual(draftingSnapshot);
    expect(creationOk).toEqual(creationSnapshot);
  });
});

describe("service failures bubble unhidden", () => {
  it("bubbles a drafting service throw and never calls baseline creation", async () => {
    mockDraftCandidates
      .mockReset()
      .mockRejectedValue(new Error("requestedBy is required."));

    await expect(generate()).rejects.toThrow("requestedBy is required.");
    expect(mockCreateBaseline).not.toHaveBeenCalled();
  });

  it("bubbles a baseline creation throw", async () => {
    mockCreateBaseline
      .mockReset()
      .mockRejectedValue(new Error("artifact create failed"));

    await expect(generate()).rejects.toThrow("artifact create failed");
  });

  it("bubbles a package drafting service throw and never calls baseline creation", async () => {
    mockDraftCandidatesFromPackage
      .mockReset()
      .mockRejectedValue(new Error("evidencePackageArtifactId is required."));

    await expect(generatePackage()).rejects.toThrow(
      "evidencePackageArtifactId is required."
    );
    expect(mockCreateBaseline).not.toHaveBeenCalled();
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-requirements-baseline-generation.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-requirements-baseline-generation.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the two composed service modules", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-requirements-candidate-drafting",
      "@/lib/projects/project-rfp-requirements-baseline",
    ]);
  });

  it("performs no store mutation or persistence call beyond the composed baseline service", () => {
    const calls =
      source.match(
        /\b(?:create|update|delete|insert|remove|drop|persist|write|save|upsert)[A-Z]\w*/g
      ) ?? [];
    expect(
      calls.filter((name) => name !== "createRfpRequirementsBaselineDraft")
    ).toEqual([]);
  });

  it("never touches an evidence content body or table rows", () => {
    expect(source).not.toContain(".content");
    expect(source).not.toContain("content.text");
    expect(source).not.toContain("content.rows");
  });

  it("makes no direct network or environment access", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain("process.env");
  });

  it("imports no DB store, raw-file, extraction, persistence, route, UI, AI, LLM, provider, agent, coordinator, catalog, pricing, SKU, config, export, or Quick BoM module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "fs"',
      'from "path"',
      'from "@/lib/db',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-input-package',
      'from "@/lib/projects/project-rfp-upload"',
      'from "@/lib/projects/project-rfp-creation"',
      'from "@/lib/projects/project-rfp-requirements-baseline-inspection',
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
