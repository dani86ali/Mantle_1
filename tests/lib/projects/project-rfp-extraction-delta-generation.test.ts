import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  DraftRfpExtractionDeltaCandidatesResult,
  RfpExtractionDeltaCandidateDraftingExecutor,
  RfpExtractionDeltaDraftedCandidate,
} from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting";
import type {
  CreateRfpExtractionDeltaDraftResult,
  RfpExtractionDeltaArtifactSummary,
  RfpExtractionDeltaEvidenceSummary,
  RfpExtractionDeltaPayloadSummary,
  RfpExtractionDeltaProjectSummary,
} from "@/lib/projects/project-rfp-extraction-delta";

// Mock ONLY the two composed service modules; the orchestration logic under
// test stays real. No DB store, file byte, parser, or AI module is touched
// anywhere in this suite: the injected executor is a plain test function that
// the mocked drafting service never invokes and the orchestrator never calls.
const { mockDraftCandidates, mockCreateDelta } = vi.hoisted(() => ({
  mockDraftCandidates: vi.fn(),
  mockCreateDelta: vi.fn(),
}));

vi.mock("@/lib/projects/project-rfp-extraction-delta-candidate-drafting", () => ({
  draftRfpExtractionDeltaCandidates: mockDraftCandidates,
}));
vi.mock("@/lib/projects/project-rfp-extraction-delta", () => ({
  createRfpExtractionDeltaDraft: mockCreateDelta,
}));

import {
  generateRfpExtractionDeltaDraft,
  type GenerateRfpExtractionDeltaDraftInput,
  type GenerateRfpExtractionDeltaDraftResult,
  type RfpExtractionDeltaGenerationCreationBlockedResult,
  type RfpExtractionDeltaGenerationDraftingBlockedResult,
} from "@/lib/projects/project-rfp-extraction-delta-generation";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const PACKAGE_A = "art-input-package-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const EV_TEXT = "evidence-text-1";
const EV_TABLE = "evidence-table-1";
const EV_TEXT_B = "evidence-text-2";
const REQUESTED_BY = "engineer@stc.example";
const DELTA_ARTIFACT = "art-extraction-delta-1";
const TS1 = "2026-06-01T10:00:00.000Z";
const TS2 = "2026-06-02T11:30:00.000Z";
const CREATED_AT = "2026-06-05T09:00:00.000Z";

/** A plain injected executor; neither mock nor orchestrator ever calls it. */
function makeExecutor(): RfpExtractionDeltaCandidateDraftingExecutor {
  return vi.fn(async () => ({ candidates: [] }));
}

function makeProjectSummary(): RfpExtractionDeltaProjectSummary {
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
): RfpExtractionDeltaEvidenceSummary {
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
  overrides: Partial<RfpExtractionDeltaArtifactSummary> = {}
): RfpExtractionDeltaArtifactSummary {
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

/** Sanitized candidates exactly as the drafting service would return them. */
function makeCandidates(): RfpExtractionDeltaDraftedCandidate[] {
  return [
    {
      kind: "missing_evidence",
      sourceFileId: FILE_RFP,
      title: "Missing SLA penalties table",
      description: "CANDIDATE-BODY: the SLA penalties table was not extracted.",
      severity: "blocking",
      confidence: 0.9,
      rationale: "Section 7 references penalties absent from the evidence.",
      evidenceIds: [EV_TEXT, EV_TABLE],
    },
    {
      kind: "incorrect_extraction",
      sourceFileId: FILE_RFP,
      title: "Wrong access port count",
      description: "CANDIDATE-BODY: extracted 24 ports; the RFP states 48.",
      evidenceIds: [EV_TEXT_B],
    },
  ];
}

type DraftingOk = Extract<
  DraftRfpExtractionDeltaCandidatesResult,
  { status: "ok" }
>;

function makeDraftingOk(): DraftingOk {
  return {
    status: "ok",
    project: makeProjectSummary(),
    candidates: makeCandidates(),
    candidateCount: 2,
    evidenceCount: 3,
    sourceFileIds: [FILE_RFP],
    sourceArtifactIds: [PACKAGE_A],
  };
}

function makeArtifactSummary(): RfpExtractionDeltaArtifactSummary {
  return {
    id: DELTA_ARTIFACT,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "extraction_delta",
    status: "needs_review",
    version: 1,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function makePayloadSummary(): RfpExtractionDeltaPayloadSummary {
  return {
    payloadKind: "rfp_extraction_delta",
    createdBy: REQUESTED_BY,
    createdAt: CREATED_AT,
    proposalSource: "ai",
    inputPackageArtifactId: PACKAGE_A,
    candidateCount: 2,
    evidenceReferenceCount: 3,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
  };
}

type CreationOk = Extract<
  CreateRfpExtractionDeltaDraftResult,
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
 * One representative member of every non-ok drafting status: the project and
 * package gates, the missing-evidence gate, the provider (executor) failure,
 * and invalid executor output.
 */
function makeDraftingBlockedResults(): RfpExtractionDeltaGenerationDraftingBlockedResult[] {
  return [
    { status: "not_found" },
    {
      status: "wrong_mode",
      project: { ...makeProjectSummary(), mode: "quick_bom" },
    },
    { status: "input_package_not_found" },
    {
      status: "artifact_not_input_package",
      artifact: makeInputPackageSummary({
        type: "normalized_boq",
        stageId: "boq_format_validation",
      }),
    },
    {
      status: "input_package_not_approved",
      artifact: makeInputPackageSummary({ status: "needs_review" }),
    },
    {
      status: "input_package_has_no_source_files",
      artifact: makeInputPackageSummary({ sourceFileIds: [] }),
    },
    {
      status: "extraction_evidence_not_found",
      inputPackageArtifactId: PACKAGE_A,
    },
    {
      status: "drafting_failed",
      error: "extraction_delta_drafting_failed",
    },
    {
      status: "invalid_candidate_output",
      errors: ["candidates[0] must be an object."],
    },
  ];
}

/** One representative member of every non-ok delta-create status. */
function makeCreationBlockedResults(): RfpExtractionDeltaGenerationCreationBlockedResult[] {
  return [
    { status: "not_found" },
    {
      status: "wrong_mode",
      project: { ...makeProjectSummary(), mode: "quick_bom" },
    },
    { status: "input_package_not_found" },
    {
      status: "artifact_not_input_package",
      artifact: makeInputPackageSummary({
        type: "normalized_boq",
        stageId: "boq_format_validation",
      }),
    },
    {
      status: "input_package_not_approved",
      artifact: makeInputPackageSummary({ status: "needs_review" }),
    },
    {
      status: "input_package_has_no_source_files",
      artifact: makeInputPackageSummary({ sourceFileIds: [] }),
    },
    {
      status: "candidate_source_file_not_in_package",
      sourceFileIds: [FILE_RFP],
    },
    { status: "evidence_not_found", missingEvidenceIds: [EV_TEXT_B] },
    {
      status: "evidence_not_rfp_extraction",
      evidence: [makeEvidenceSummary("evidence-boq-1", "boq_line_item")],
    },
    {
      status: "evidence_not_for_input_package",
      evidence: [makeEvidenceSummary(EV_TABLE, "rfp_document_table")],
    },
  ];
}

function generate(
  overrides: Partial<GenerateRfpExtractionDeltaDraftInput> = {}
): Promise<GenerateRfpExtractionDeltaDraftResult> {
  return generateRfpExtractionDeltaDraft({
    tenantId: TENANT,
    projectId: PROJECT,
    inputPackageArtifactId: PACKAGE_A,
    requestedBy: REQUESTED_BY,
    executor: makeExecutor(),
    ...overrides,
  });
}

beforeEach(() => {
  mockDraftCandidates.mockReset().mockResolvedValue(makeDraftingOk());
  mockCreateDelta.mockReset().mockResolvedValue(makeCreationOk());
});

describe("generateRfpExtractionDeltaDraft - drafting phase input", () => {
  it("calls candidate drafting exactly once with the exact tenant/project/inputPackageArtifactId/requestedBy/executor", async () => {
    const executor = makeExecutor();

    await generate({ executor });

    expect(mockDraftCandidates).toHaveBeenCalledTimes(1);
    const draftingInput = mockDraftCandidates.mock.calls[0][0];
    expect(draftingInput).toEqual({
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: PACKAGE_A,
      requestedBy: REQUESTED_BY,
      executor,
    });
    // The injected executor crosses the boundary by identity, never wrapped,
    // and the orchestrator never invokes it itself.
    expect(draftingInput.executor).toBe(executor);
    expect(executor).not.toHaveBeenCalled();
    expect(Object.keys(draftingInput).sort()).toEqual([
      "executor",
      "inputPackageArtifactId",
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

  it("runs candidate drafting strictly before delta creation", async () => {
    await generate();

    expect(mockDraftCandidates).toHaveBeenCalledTimes(1);
    expect(mockCreateDelta).toHaveBeenCalledTimes(1);
    expect(mockDraftCandidates.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateDelta.mock.invocationCallOrder[0]
    );
  });
});

describe("candidate drafting blocked", () => {
  it("wraps every non-ok drafting status with phase candidate_drafting and never calls delta creation", async () => {
    for (const blocked of makeDraftingBlockedResults()) {
      mockDraftCandidates.mockReset().mockResolvedValue(blocked);
      mockCreateDelta.mockClear();

      const result = await generate();

      expect(result).toEqual({
        status: "blocked",
        phase: "candidate_drafting",
        drafting: blocked,
      });
      expect(mockCreateDelta).not.toHaveBeenCalled();
    }
  });

  it("keeps a provider failure lean: a drafting_failed block carries only the fixed error code", async () => {
    mockDraftCandidates.mockReset().mockResolvedValue({
      status: "drafting_failed",
      error: "extraction_delta_drafting_failed",
    });

    const result = await generate();

    expect(result).toEqual({
      status: "blocked",
      phase: "candidate_drafting",
      drafting: {
        status: "drafting_failed",
        error: "extraction_delta_drafting_failed",
      },
    });
    expect(mockCreateDelta).not.toHaveBeenCalled();
  });
});

describe("delta creation phase input", () => {
  it("hands delta creation the same tenant/project/inputPackageArtifactId, trimmed createdBy, proposalSource ai, and exactly the drafted candidates", async () => {
    const draftingOk = makeDraftingOk();
    mockDraftCandidates.mockReset().mockResolvedValue(draftingOk);

    await generate({ requestedBy: `  ${REQUESTED_BY}  ` });

    expect(mockCreateDelta).toHaveBeenCalledTimes(1);
    const creationInput = mockCreateDelta.mock.calls[0][0];
    expect(creationInput).toEqual({
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: PACKAGE_A,
      createdBy: REQUESTED_BY,
      proposalSource: "ai",
      candidates: draftingOk.candidates,
    });
    // Exactly the sanitized array the drafting service returned: the
    // orchestrator never rebuilds, filters, or re-sanitizes candidates.
    expect(creationInput.candidates).toBe(draftingOk.candidates);
    expect(Object.keys(creationInput).sort()).toEqual([
      "candidates",
      "createdBy",
      "inputPackageArtifactId",
      "projectId",
      "proposalSource",
      "tenantId",
    ]);
  });
});

describe("delta creation blocked", () => {
  it("wraps every non-ok creation status with phase delta_creation after a successful drafting phase", async () => {
    for (const blocked of makeCreationBlockedResults()) {
      mockDraftCandidates.mockClear();
      mockCreateDelta.mockReset().mockResolvedValue(blocked);

      const result = await generate();

      expect(result).toEqual({
        status: "blocked",
        phase: "delta_creation",
        creation: blocked,
      });
      expect(mockDraftCandidates).toHaveBeenCalledTimes(1);
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
      sourceFileIds: [FILE_RFP],
      sourceArtifactIds: [PACKAGE_A],
      artifact: makeArtifactSummary(),
      payloadSummary: makePayloadSummary(),
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("exposes no candidates, project summary, tenant, or proposed body on the ok result", async () => {
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
    expect(serialized).not.toContain("CANDIDATE-BODY");
    expect(serialized).not.toContain("customerName");
  });

  it("returns copies: mutating the ok result never mutates either mocked service result", async () => {
    const draftingOk = makeDraftingOk();
    const creationOk = makeCreationOk();
    const draftingSnapshot = structuredClone(draftingOk);
    const creationSnapshot = structuredClone(creationOk);
    mockDraftCandidates.mockReset().mockResolvedValue(draftingOk);
    mockCreateDelta.mockReset().mockResolvedValue(creationOk);

    const result = await generate();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    result.sourceFileIds.push("hacked-file");
    result.sourceArtifactIds.push("hacked-artifact");
    result.artifact.status = "approved";
    result.artifact.sourceFileIds.push("hacked-file");
    result.artifact.sourceArtifactIds.push("hacked-artifact");
    result.payloadSummary.createdBy = "hacked-user";
    result.payloadSummary.proposalSource = "engineer";
    result.payloadSummary.sourceFileIds.push("hacked-file");
    result.payloadSummary.sourceArtifactIds.push("hacked-artifact");

    expect(draftingOk).toEqual(draftingSnapshot);
    expect(creationOk).toEqual(creationSnapshot);
  });

  it("never mutates the caller's input", async () => {
    const executor = makeExecutor();
    const input: GenerateRfpExtractionDeltaDraftInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: PACKAGE_A,
      requestedBy: `  ${REQUESTED_BY}  `,
      executor,
    };
    const snapshot = { ...input };

    const result = await generateRfpExtractionDeltaDraft(input);

    expect(result.status).toBe("ok");
    expect(input).toEqual(snapshot);
    // The trimmed createdBy never writes back onto the caller's input, and the
    // executor stays the exact injected reference.
    expect(input.requestedBy).toBe(`  ${REQUESTED_BY}  `);
    expect(input.executor).toBe(executor);
  });
});

describe("service failures bubble unhidden", () => {
  it("bubbles a drafting service throw and never calls delta creation", async () => {
    mockDraftCandidates
      .mockReset()
      .mockRejectedValue(new Error("requestedBy is required."));

    await expect(generate()).rejects.toThrow("requestedBy is required.");
    expect(mockCreateDelta).not.toHaveBeenCalled();
  });

  it("bubbles a delta creation throw", async () => {
    mockCreateDelta
      .mockReset()
      .mockRejectedValue(new Error("artifact create failed"));

    await expect(generate()).rejects.toThrow("artifact create failed");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-extraction-delta-generation.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-extraction-delta-generation.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the two composed service modules", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-extraction-delta-candidate-drafting",
      "@/lib/projects/project-rfp-extraction-delta",
    ]);
  });

  it("performs no store mutation or persistence call beyond the composed delta service", () => {
    const calls =
      source.match(
        /\b(?:create|update|delete|insert|remove|drop|persist|write|save|upsert)[A-Z]\w*/g
      ) ?? [];
    expect(
      calls.filter((name) => name !== "createRfpExtractionDeltaDraft")
    ).toEqual([]);
  });

  it("never touches an evidence content body or table rows", () => {
    expect(source).not.toContain(".content");
    expect(source).not.toContain("content.text");
    expect(source).not.toContain("content.rows");
  });

  it("makes no direct network, require, or environment access", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toContain("process.env");
  });

  it("imports no DB store, raw-file, extraction, persistence, review, executor-factory, provider, route, UI, AI, LLM, agent, coordinator, catalog, pricing, SKU, config, export, or Quick BoM module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "fs"',
      'from "path"',
      'from "@/lib/db',
      'from "@/lib/projects/project-rfp-extraction-delta-review"',
      'from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting-executor"',
      'from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting-anthropic"',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/project-rfp-evidence-package"',
      'from "@/lib/projects/project-rfp-evidence-package-approval"',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
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
      "process.env",
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
