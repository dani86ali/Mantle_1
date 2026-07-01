import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it, expect, vi } from "vitest";

// Mock the DB stores, the readiness helpers, and the drafting executor boundary so
// the creation service's fail-closed gating, source-chain proof, whitelisted
// drafting input, and single needs_review persistence are tested without a DB,
// provider, or file read. The questionnaire contract, drafting-input contract, and
// approved design-knowledge selection run for real.
const {
  mockGetProject,
  mockListArtifacts,
  mockGetArtifactById,
  mockListFiles,
  mockCreateArtifact,
  mockBoq,
  mockDomainReadiness,
  mockDraft,
  mockGetExecutor,
} = vi.hoisted(() => ({
  mockGetProject: vi.fn(),
  mockListArtifacts: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockListFiles: vi.fn(),
  mockCreateArtifact: vi.fn(),
  mockBoq: vi.fn(),
  mockDomainReadiness: vi.fn(),
  mockDraft: vi.fn(),
  mockGetExecutor: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  listProjectArtifacts: mockListArtifacts,
  getProjectArtifactById: mockGetArtifactById,
  createProjectArtifactVersion: mockCreateArtifact,
}));
vi.mock("@/lib/db/project-file-store", () => ({ listProjectFiles: mockListFiles }));
vi.mock("@/lib/projects/project-rfp-boq-readiness", () => ({
  getRfpBoqReadinessReport: mockBoq,
}));
vi.mock(
  "@/lib/projects/project-rfp-hld-domain-readiness",
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return { ...actual, getRfpHldDomainReadinessReport: mockDomainReadiness };
  }
);
vi.mock(
  "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-executor",
  () => ({
    draftRfpHldIntakeQuestionnaireCandidate: mockDraft,
    getConfiguredRfpHldIntakeQuestionnaireDraftingExecutor: mockGetExecutor,
  })
);

import { createRfpHldIntakeQuestionnaireDraft } from "@/lib/projects/project-rfp-hld-intake-questionnaire-generation";
import { RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-intake-questionnaire";
import type { RfpHldIntakeQuestionnaireDraftingInput } from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-input";

const TENANT = "tenant-1";
const PROJECT = "proj-rfp-1";
const D = (iso: string): Date => new Date(iso);

function project(): Record<string, unknown> {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP",
    customerName: "STC",
    mode: "rfp",
    createdAt: D("2026-06-01T10:00:00.000Z"),
    updatedAt: D("2026-06-02T11:30:00.000Z"),
  };
}

function evidenceArtifact(): Record<string, unknown> {
  return {
    id: "art-evidence-1",
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "evidence_package",
    status: "approved",
    version: 2,
    sourceFileIds: [],
    sourceArtifactIds: [],
    payload: {
      payloadKind: "rfp_evidence_package",
      evidenceCount: 4,
      textChunkCount: 3,
      tableEvidenceCount: 1,
    },
  };
}

function requirementsArtifact(citedEvidence = "art-evidence-1"): Record<string, unknown> {
  return {
    id: "art-req-1",
    projectId: PROJECT,
    stageId: "requirements_baseline_review",
    type: "requirements_baseline",
    status: "approved",
    version: 3,
    sourceFileIds: [],
    sourceArtifactIds: [],
    payload: {
      payloadKind: "rfp_requirements_baseline",
      requirementCount: 2,
      sourceEvidencePackageArtifactId: citedEvidence,
      requirements: [
        { id: "r-1", text: "Campus switching across two buildings." },
        { id: "r-2", text: "Wireless coverage for all floors." },
      ],
    },
  };
}

function complianceArtifact(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "art-cm-1",
    projectId: PROJECT,
    stageId: "compliance_matrix_review",
    type: "compliance_matrix",
    status: "approved",
    version: 1,
    sourceFileIds: [],
    sourceArtifactIds: [],
    payload: {
      payloadKind: "rfp_compliance_matrix",
      sourceRequirementsBaselineArtifactId: "art-req-1",
      sourceEvidencePackageArtifactId: "art-evidence-1",
      sourceConfigurationExpansionArtifactId: "art-config-1",
      rows: [{ id: "RFP-COMP-001" }, { id: "RFP-COMP-002" }],
      ...overrides,
    },
  };
}

function configArtifact(): Record<string, unknown> {
  return {
    id: "art-config-1",
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "approved",
    version: 1,
    sourceFileIds: [],
    sourceArtifactIds: [],
    payload: { lineCount: 5, summary: { totalAcceptedLineCount: 5 } },
  };
}

function packArtifact(): Record<string, unknown> {
  return {
    id: "art-pack-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "design_knowledge_pack",
    status: "approved",
    version: 1,
    sourceFileIds: [],
    sourceArtifactIds: [],
    payload: {
      payloadKind: "rfp_hld_design_knowledge_pack",
      domain: "campus_switching",
      title: "Campus switching guidance",
      designPrinciples: ["Prefer a collapsed core for small campuses"],
      topologyGuidance: [],
      constraints: [],
      assumptions: [],
      exclusions: [],
      validationNotes: [],
    },
  };
}

/** Wrap the received drafting input into a VALID candidate questionnaire, like the
 * real executor boundary would, so the service's re-validation and persistence run. */
function wrapValid(input: RfpHldIntakeQuestionnaireDraftingInput): unknown {
  return {
    payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
    createdBy: input.createdBy,
    createdAt: input.createdAt,
    sourceArtifactIds: input.sourceArtifactIds.slice(),
    sourceRefs: input.sourceRefs.map((r) => ({ ...r })),
    questions: [
      {
        questionId: "q-1",
        order: 1,
        domain: "campus_switching",
        questionText: "How many access-layer switches per closet are required?",
        whyAsked: "Sizes the campus access layer.",
        answerType: "free_text",
        required: true,
        sourceRefIds: [input.sourceRefs[0].refId],
      },
    ],
    validation: {
      status: "passed",
      checkedAt: input.createdAt,
      findingCount: 0,
      findings: [],
    },
  };
}

let capturedInput: RfpHldIntakeQuestionnaireDraftingInput | undefined;

function storedArtifact(sourceArtifactIds: string[]): Record<string, unknown> {
  return {
    id: "art-questionnaire-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_intake_questionnaire",
    status: "needs_review",
    version: 1,
    sourceFileIds: [],
    sourceArtifactIds,
    createdAt: D("2026-07-01T00:00:00.000Z"),
    updatedAt: D("2026-07-01T00:00:00.000Z"),
  };
}

function run() {
  return createRfpHldIntakeQuestionnaireDraft({
    tenantId: TENANT,
    projectId: PROJECT,
    createdBy: "engineer-1",
    createdAt: D("2026-07-01T00:00:00.000Z"),
  });
}

beforeEach(() => {
  capturedInput = undefined;
  mockGetProject.mockReset().mockResolvedValue(project());
  mockListFiles.mockReset().mockResolvedValue([]);
  mockListArtifacts
    .mockReset()
    .mockResolvedValue([
      evidenceArtifact(),
      requirementsArtifact(),
      complianceArtifact(),
      packArtifact(),
    ]);
  mockGetArtifactById.mockReset().mockResolvedValue(configArtifact());
  mockBoq.mockReset().mockReturnValue({
    configurationGate: {
      satisfied: true,
      status: "satisfied",
      message: "",
      approvedConfigurationExpansionArtifactId: "art-config-1",
    },
  });
  mockDomainReadiness.mockReset().mockReturnValue({
    status: "ready",
    messages: [],
    knowledgePackSummaries: [
      { domain: "campus_switching", artifactId: "art-pack-1", version: 1, title: "Campus switching guidance" },
    ],
  });
  mockGetExecutor.mockReset().mockReturnValue(async () => ({ questions: [] }));
  mockDraft.mockReset().mockImplementation(async ({ draftingInput }) => {
    capturedInput = draftingInput;
    return { status: "drafted", questionnaire: wrapValid(draftingInput) };
  });
  mockCreateArtifact
    .mockReset()
    .mockImplementation(async (inp: { sourceArtifactIds: string[] }) =>
      storedArtifact(inp.sourceArtifactIds)
    );
});

describe("createRfpHldIntakeQuestionnaireDraft - happy path", () => {
  it("persists exactly one needs_review questionnaire with the expected chain", async () => {
    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");

    // Exactly one persisted needs_review artifact on the design-delta stage.
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const created = mockCreateArtifact.mock.calls[0][0] as Record<string, unknown>;
    expect(created.tenantId).toBe(TENANT);
    expect(created.projectId).toBe(PROJECT);
    expect(created.stageId).toBe("hld_design_delta_review");
    expect(created.type).toBe("hld_intake_questionnaire");
    expect(created.status).toBe("needs_review");
    expect(created.sourceFileIds).toEqual([]);
    expect(created.sourceArtifactIds).toEqual([
      "art-evidence-1",
      "art-req-1",
      "art-cm-1",
      "art-config-1",
      "art-pack-1",
    ]);

    // The persisted payload equals the validated candidate.
    const payload = created.payload as Record<string, unknown>;
    expect(payload.payloadKind).toBe(RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND);
    expect(payload.sourceArtifactIds).toEqual(created.sourceArtifactIds);

    // Lean payload summary.
    expect(result.payloadSummary).toEqual({
      payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
      createdBy: "engineer-1",
      createdAt: "2026-07-01T00:00:00.000Z",
      questionCount: 1,
      sourceArtifactCount: 5,
      sourceRefCount: 5,
      validationStatus: "passed",
      validationFindingCount: 0,
      payloadValid: true,
    });
  });

  it("hands the executor bounded approved source contexts and DKP content with stable ref ids", async () => {
    await run();
    const input = capturedInput;
    if (input === undefined) throw new Error("expected a captured drafting input");

    expect(input.sourceRefs.map((r) => r.refId)).toEqual([
      "source-evidence",
      "source-requirements",
      "source-compliance",
      "source-configuration",
      "dkp-campus_switching",
    ]);

    expect(input.approvedSourceContexts.map((c) => c.artifactType)).toEqual([
      "evidence_package",
      "requirements_baseline",
      "compliance_matrix",
      "configuration_expansion",
    ]);
    // Configuration context carries no raw SKU/catalog values; bounded description only.
    const configContext = input.approvedSourceContexts[3];
    expect(configContext.summary).toContain("accepted line");
    expect(configContext.excerpts).toEqual([]);

    // Approved design-knowledge content is compacted and carried per approved pack.
    expect(input.designKnowledgePackContents).toHaveLength(1);
    expect(input.designKnowledgePackContents[0].domain).toBe("campus_switching");
    expect(input.designKnowledgePackContents[0].designPrinciples).toEqual([
      "Prefer a collapsed core for small campuses",
    ]);
  });
});

describe("createRfpHldIntakeQuestionnaireDraft - availability and mode", () => {
  it("returns not_found when the project is missing", async () => {
    mockGetProject.mockResolvedValue(null);
    expect((await run()).status).toBe("not_found");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a non-rfp project", async () => {
    mockGetProject.mockResolvedValue({ ...project(), mode: "quick_bom" });
    const result = await run();
    expect(result.status).toBe("wrong_mode");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns drafting_unavailable with no write when no executor is configured", async () => {
    mockGetExecutor.mockReturnValue(null);
    const result = await run();
    expect(result.status).toBe("drafting_unavailable");
    expect(mockDraft).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("createRfpHldIntakeQuestionnaireDraft - fail-closed gates", () => {
  it("blocks when the approved evidence package is missing", async () => {
    mockListArtifacts.mockResolvedValue([
      requirementsArtifact(),
      complianceArtifact(),
      packArtifact(),
    ]);
    const result = await run();
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("missing_approved_evidence_package");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
    expect(mockDraft).not.toHaveBeenCalled();
  });

  it("blocks when the approved requirements baseline is missing", async () => {
    mockListArtifacts.mockResolvedValue([
      evidenceArtifact(),
      complianceArtifact(),
      packArtifact(),
    ]);
    const result = await run();
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("missing_approved_requirements_baseline");
  });

  it("blocks when the approved compliance matrix is missing", async () => {
    mockListArtifacts.mockResolvedValue([
      evidenceArtifact(),
      requirementsArtifact(),
      packArtifact(),
    ]);
    const result = await run();
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("missing_approved_compliance_matrix");
  });

  it("blocks when the configuration gate is unsatisfied", async () => {
    mockBoq.mockReturnValue({
      configurationGate: { satisfied: false, status: "blocked", message: "no config" },
    });
    const result = await run();
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("configuration_gate_unsatisfied");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks when the gate-authorized configuration source is not approved", async () => {
    mockGetArtifactById.mockResolvedValue({ ...configArtifact(), status: "needs_review" });
    const result = await run();
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("missing_approved_configuration_source");
  });

  it("blocks when design knowledge packs are missing", async () => {
    mockDomainReadiness.mockReturnValue({
      status: "blocked",
      messages: ["Missing approved design knowledge pack for Campus switching."],
      knowledgePackSummaries: [],
    });
    const result = await run();
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("missing_design_knowledge_packs");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks when an approved design knowledge pack fails to compact", async () => {
    const badPack = { ...packArtifact(), payload: { ...(packArtifact().payload as object), title: "" } };
    mockListArtifacts.mockResolvedValue([
      evidenceArtifact(),
      requirementsArtifact(),
      complianceArtifact(),
      badPack,
    ]);
    const result = await run();
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("invalid_design_knowledge_pack_content");
  });
});

describe("createRfpHldIntakeQuestionnaireDraft - source-chain mismatches", () => {
  it("blocks when the requirements baseline cites a different evidence package", async () => {
    mockListArtifacts.mockResolvedValue([
      evidenceArtifact(),
      requirementsArtifact("art-evidence-OTHER"),
      complianceArtifact(),
      packArtifact(),
    ]);
    const result = await run();
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("requirements_baseline_source_chain_mismatch");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks when the requirements baseline does not cite the approved evidence package", async () => {
    const baseline = requirementsArtifact() as Record<string, unknown>;
    baseline.payload = {
      ...(baseline.payload as Record<string, unknown>),
      sourceEvidencePackageArtifactId: undefined,
    };
    mockListArtifacts.mockResolvedValue([
      evidenceArtifact(),
      baseline,
      complianceArtifact(),
      packArtifact(),
    ]);
    const result = await run();
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("requirements_baseline_source_chain_mismatch");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks when the compliance matrix cites a different requirements/evidence chain", async () => {
    mockListArtifacts.mockResolvedValue([
      evidenceArtifact(),
      requirementsArtifact(),
      complianceArtifact({ sourceRequirementsBaselineArtifactId: "art-req-OTHER" }),
      packArtifact(),
    ]);
    const result = await run();
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("compliance_matrix_source_chain_mismatch");
  });

  it("blocks when the compliance matrix cites a different configuration source", async () => {
    mockListArtifacts.mockResolvedValue([
      evidenceArtifact(),
      requirementsArtifact(),
      complianceArtifact({ sourceConfigurationExpansionArtifactId: "art-config-OTHER" }),
      packArtifact(),
    ]);
    const result = await run();
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("configuration_source_mismatch");
  });
});

describe("createRfpHldIntakeQuestionnaireDraft - drafting outcomes", () => {
  it("returns invalid_candidate_output with errors and does not write", async () => {
    mockDraft.mockResolvedValue({
      status: "invalid_candidate_output",
      errors: ["provider output: must be an object"],
    });
    const result = await run();
    expect(result.status).toBe("invalid_candidate_output");
    if (result.status !== "invalid_candidate_output") throw new Error("bad");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns drafting_failed without leaking provider detail and does not write", async () => {
    mockDraft.mockResolvedValue({
      status: "drafting_failed",
      error: "questionnaire_drafting_failed",
    });
    const result = await run();
    expect(result.status).toBe("drafting_failed");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns invalid_payload when the constructed candidate fails re-validation and does not write", async () => {
    mockDraft.mockImplementation(async ({ draftingInput }) => {
      const wrapped = wrapValid(draftingInput) as Record<string, unknown>;
      wrapped.questions = []; // empty questions is invalid per the contract
      return { status: "drafted", questionnaire: wrapped };
    });
    const result = await run();
    expect(result.status).toBe("invalid_payload");
    if (result.status !== "invalid_payload") throw new Error("expected invalid_payload");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("creation service module purity (static source check)", () => {
  const SOURCE_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-intake-questionnaire-generation.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-intake-questionnaire-generation.test.ts"
  );
  const source = readFileSync(SOURCE_PATH, "utf8");

  it("imports no provider SDK, raw parser, pricing, SKU, catalog, or configuration-authority module and reads no env/fetch", () => {
    for (const forbidden of [
      "@anthropic-ai",
      "@google/generative-ai",
      'from "openai',
      "'openai'",
      "langchain",
      "process.env",
      "fetch(",
      "require(",
      "node:fs",
      "node:path",
      "pdf-parse",
      "mammoth",
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/agent',
      'from "@/lib/adapters',
      'from "@/lib/catalog',
      'from "@/lib/projects/pricing',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      "evidence-persistence",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("drafts only through the existing configured executor boundary", () => {
    expect(source).toContain(
      "getConfiguredRfpHldIntakeQuestionnaireDraftingExecutor"
    );
    expect(source).toContain("draftRfpHldIntakeQuestionnaireCandidate");
  });

  it("keeps the source and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
