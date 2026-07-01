import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

// Mock the two composed boundaries: the project store (verify the project) and the
// artifact store (the single write). No real DB; the service is exercised in isolation.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  createProjectArtifactVersion: vi.fn(),
  getProjectArtifactById: vi.fn(),
}));

import * as serviceModule from "@/lib/projects/project-rfp-hld-intake";
import {
  createRfpHldIntakeDraft,
  createRfpHldIntakeFromQuestionnaireDraft,
  RFP_HLD_INTAKE_FIELDS,
  type CreateRfpHldIntakeDraftInput,
  type CreateRfpHldIntakeFromQuestionnaireDraftInput,
  type RfpHldIntakeAnswerInput,
  type RfpHldIntakeQuestionAnswerInput,
  type RfpHldIntakeReviewedQuestionInput,
} from "@/lib/projects/project-rfp-hld-intake";
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";

const getProjectMock = vi.mocked(getProjectById);
const createMock = vi.mocked(createProjectArtifactVersion);
const getArtifactMock = vi.mocked(getProjectArtifactById);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const CREATED_BY = "engineer-1";
const ARTIFACT_ID = "art-hld-intake-1";
const OVERRIDE_REASON = "Questionnaire not yet available; entered manually.";

const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const FIXED_CREATED = new Date("2026-06-20T09:15:00.000Z");
const ART_CREATED = new Date("2026-06-20T09:15:01.000Z");
const ART_UPDATED = new Date("2026-06-20T09:15:02.000Z");

const FIELD_IDS = RFP_HLD_INTAKE_FIELDS.map((f) => f.fieldId);

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Acme RFP Bid",
    customerName: "Acme",
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

function makeCreatedArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_intake",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: ART_CREATED,
    updatedAt: ART_UPDATED,
    ...overrides,
  };
}

// A complete, valid answer per catalog field. The first field is `answered` with
// caller-supplied padding (to prove trimming) and a bogus label (to prove it is
// ignored); the next two carry unknown/not_applicable with leakable values that must
// be dropped; the rest are answered.
function makeAnswers(): RfpHldIntakeAnswerInput[] {
  return RFP_HLD_INTAKE_FIELDS.map((field, index) => {
    if (index === 1) {
      return {
        fieldId: field.fieldId,
        status: "unknown",
        value: "DROP-ME-UNKNOWN-VALUE",
        notes: "  unknown note  ",
        label: "CALLER LABEL IGNORED",
      };
    }
    if (index === 2) {
      return {
        fieldId: field.fieldId,
        status: "not_applicable",
        value: "DROP-ME-NA-VALUE",
        label: "CALLER LABEL IGNORED",
      };
    }
    return {
      fieldId: field.fieldId,
      status: "answered",
      value: `  value for ${field.fieldId}  `,
      label: "CALLER LABEL IGNORED",
    };
  });
}

function input(overrides: Partial<CreateRfpHldIntakeDraftInput> = {}): CreateRfpHldIntakeDraftInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    createdBy: CREATED_BY,
    answers: makeAnswers(),
    manualOverrideReason: OVERRIDE_REASON,
    createdAt: FIXED_CREATED,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(makeProject());
  createMock.mockResolvedValue(makeCreatedArtifact());
});

describe("createRfpHldIntakeDraft - validation before any store call", () => {
  it("rejects a blank projectId before touching the stores", async () => {
    await expect(createRfpHldIntakeDraft(input({ projectId: "   " }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a blank createdBy before touching the stores", async () => {
    await expect(createRfpHldIntakeDraft(input({ createdBy: "  " }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a blank manualOverrideReason before touching the stores", async () => {
    await expect(
      createRfpHldIntakeDraft(input({ manualOverrideReason: "   " }))
    ).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a missing manualOverrideReason before touching the stores", async () => {
    const bad = {
      ...input(),
      manualOverrideReason: undefined,
    } as unknown as CreateRfpHldIntakeDraftInput;
    await expect(createRfpHldIntakeDraft(bad)).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a missing catalog field before touching the stores", async () => {
    const answers = makeAnswers().slice(1);
    await expect(createRfpHldIntakeDraft(input({ answers })).catch((e) => e)).resolves.toBeInstanceOf(Error);
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a duplicate field id", async () => {
    const answers = makeAnswers();
    answers.push({ fieldId: FIELD_IDS[0], status: "unknown" });
    await expect(createRfpHldIntakeDraft(input({ answers }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown field id", async () => {
    const answers = makeAnswers();
    answers[0] = { fieldId: "not_a_real_field", status: "unknown" };
    await expect(createRfpHldIntakeDraft(input({ answers }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid answer status", async () => {
    const answers = makeAnswers();
    answers[0] = {
      fieldId: FIELD_IDS[0],
      status: "skipped" as unknown as RfpHldIntakeAnswerInput["status"],
    };
    await expect(createRfpHldIntakeDraft(input({ answers }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
  });

  it("rejects an answered field with a blank value", async () => {
    const answers = makeAnswers();
    answers[0] = { fieldId: FIELD_IDS[0], status: "answered", value: "   " };
    await expect(createRfpHldIntakeDraft(input({ answers }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
  });

  it("rejects a non-array answers payload", async () => {
    const bad = { ...input(), answers: "nope" } as unknown as CreateRfpHldIntakeDraftInput;
    await expect(createRfpHldIntakeDraft(bad)).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
  });
});

describe("createRfpHldIntakeDraft - project gates", () => {
  it("returns not_found and never writes when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await createRfpHldIntakeDraft(input());

    expect(result).toEqual({ status: "not_found" });
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and never writes for a non-rfp project", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "quick_bom", name: "Quick BoM", customerName: "Honeywell" })
    );

    const result = await createRfpHldIntakeDraft(input());

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "Quick BoM",
      customerName: "Honeywell",
      mode: "quick_bom",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "quick_bom", customerName: undefined })
    );

    const result = await createRfpHldIntakeDraft(input());

    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });
});

describe("createRfpHldIntakeDraft - artifact creation", () => {
  it("writes a needs_review hld_intake on hld_design_delta_review with empty source arrays", async () => {
    await createRfpHldIntakeDraft(input());

    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.stageId).toBe("hld_design_delta_review");
    expect(arg.type).toBe("hld_intake");
    expect(arg.status).toBe("needs_review");
    expect(arg.sourceFileIds).toEqual([]);
    expect(arg.sourceArtifactIds).toEqual([]);
    expect("filePath" in arg).toBe(false);
  });

  it("records manual_override with the trimmed reason and no questionnaire source", async () => {
    await createRfpHldIntakeDraft(input({ manualOverrideReason: "  padded reason  " }));

    const payload = createMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.sourceMode).toBe("manual_override");
    expect(payload.manualOverrideReason).toBe("padded reason");
    expect("sourceQuestionnaireArtifactId" in payload).toBe(false);
  });

  it("verifies the project before the write", async () => {
    await createRfpHldIntakeDraft(input());

    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      createMock.mock.invocationCallOrder[0]
    );
  });

  it("normalizes the persisted payload: full canonical order, trimmed values/notes, caller labels ignored, dropped values", async () => {
    await createRfpHldIntakeDraft(input());

    const payload = createMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.payloadKind).toBe("rfp_hld_intake");
    expect(payload.createdBy).toBe(CREATED_BY);
    expect(payload.createdAt).toBe(FIXED_CREATED.toISOString());
    expect(payload.sourceMode).toBe("manual_override");
    expect(payload.manualOverrideReason).toBe(OVERRIDE_REASON);
    expect("sourceQuestionnaireArtifactId" in payload).toBe(false);
    expect(payload.answerCount).toBe(FIELD_IDS.length);
    expect(payload.statusCounts).toEqual({
      answered: FIELD_IDS.length - 2,
      unknown: 1,
      not_applicable: 1,
    });

    const answers = payload.answers as Array<Record<string, unknown>>;
    expect(answers.map((a) => a.fieldId)).toEqual(FIELD_IDS);
    // Every persisted label is the canonical catalog label, never the caller's.
    for (let i = 0; i < answers.length; i++) {
      expect(answers[i].label).toBe(RFP_HLD_INTAKE_FIELDS[i].label);
      expect(answers[i].label).not.toBe("CALLER LABEL IGNORED");
    }

    // index 0: answered with a trimmed value.
    expect(answers[0].status).toBe("answered");
    expect(answers[0].value).toBe(`value for ${FIELD_IDS[0]}`);

    // index 1: unknown drops value, keeps trimmed note.
    expect(answers[1].status).toBe("unknown");
    expect("value" in answers[1]).toBe(false);
    expect(answers[1].notes).toBe("unknown note");

    // index 2: not_applicable drops value, no note.
    expect(answers[2].status).toBe("not_applicable");
    expect("value" in answers[2]).toBe(false);
    expect("notes" in answers[2]).toBe(false);

    expect(JSON.stringify(payload)).not.toContain("DROP-ME-UNKNOWN-VALUE");
    expect(JSON.stringify(payload)).not.toContain("DROP-ME-NA-VALUE");
  });
});

describe("createRfpHldIntakeDraft - ok result summaries", () => {
  it("returns a serializable artifact summary with ISO dates and no payload", async () => {
    const result = await createRfpHldIntakeDraft(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: ARTIFACT_ID,
      projectId: PROJECT,
      stageId: "hld_design_delta_review",
      type: "hld_intake",
      status: "needs_review",
      version: 1,
      sourceFileIds: [],
      sourceArtifactIds: [],
      createdAt: ART_CREATED.toISOString(),
      updatedAt: ART_UPDATED.toISOString(),
    });
    expect("payload" in result.artifact).toBe(false);
  });

  it("returns a lean payloadSummary with counts/ids/status counts but not the answer values", async () => {
    const result = await createRfpHldIntakeDraft(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary).toEqual({
      payloadKind: "rfp_hld_intake",
      createdBy: CREATED_BY,
      createdAt: FIXED_CREATED.toISOString(),
      sourceMode: "manual_override",
      answerCount: FIELD_IDS.length,
      statusCounts: { answered: FIELD_IDS.length - 2, unknown: 1, not_applicable: 1 },
      fieldIds: FIELD_IDS,
    });
    expect("answers" in result.payloadSummary).toBe(false);
    expect("value" in result.payloadSummary).toBe(false);
    const json = JSON.stringify(result.payloadSummary);
    expect(json).not.toContain(`value for ${FIELD_IDS[0]}`);
    expect(json).not.toContain("unknown note");
  });

  it("returns defensive copies of the summary arrays/objects", async () => {
    const result = await createRfpHldIntakeDraft(input());

    if (result.status !== "ok") throw new Error("unreachable");
    result.payloadSummary.fieldIds.push("injected" as never);
    result.payloadSummary.statusCounts.answered = 999;
    result.artifact.sourceFileIds.push("injected");

    // A second call's fresh summaries are unaffected by the mutation above.
    const again = await createRfpHldIntakeDraft(input());
    if (again.status !== "ok") throw new Error("unreachable");
    expect(again.payloadSummary.fieldIds).toEqual(FIELD_IDS);
    expect(again.payloadSummary.statusCounts.answered).toBe(FIELD_IDS.length - 2);
    expect(again.artifact.sourceFileIds).toEqual([]);
  });

  it("does not mutate the input object", async () => {
    const inp = input();
    const snapshot = structuredClone(inp);

    await createRfpHldIntakeDraft(inp);

    expect(inp).toEqual(snapshot);
  });

  it("bubbles a store error from the artifact write", async () => {
    const boom = new Error("store boom");
    createMock.mockRejectedValue(boom);

    await expect(createRfpHldIntakeDraft(input())).rejects.toBe(boom);
  });
});

describe("createRfpHldIntakeDraft - field catalog contract", () => {
  it("exposes the exact catalog field ids in order", () => {
    expect(FIELD_IDS).toEqual([
      "existing_network_context",
      "target_topology_intent",
      "site_room_context",
      "resiliency_expectations",
      "wan_lan_boundaries",
      "rack_power_assumptions",
      "implementation_constraints",
      "exclusions",
      "diagram_notes",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Questionnaire-assisted creation (Stage 6H-0E-B)
// ---------------------------------------------------------------------------

const SOURCE_ID = "art-questionnaire-1";
const ANSWER_LEAK = "DROP-ME-NA-VALUE-Q";

function makeSourceQuestionnairePayload(): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_intake_questionnaire",
    createdBy: "engineer-1",
    createdAt: "2026-06-18T09:00:00.000Z",
    sourceArtifactIds: ["input-pkg-1"],
    questions: [
      { questionId: "sq-1", order: 1, domain: "campus_switching", questionText: "Existing core?", whyAsked: "context", answerType: "free_text", required: true, sourceRefIds: ["ref-1"] },
      { questionId: "sq-2", order: 2, domain: "campus_switching", questionText: "Redundancy?", whyAsked: "resiliency", answerType: "single_select", required: false, sourceRefIds: ["ref-2"], allowedOptions: ["yes", "no"] },
      { questionId: "sq-3", order: 3, domain: "campus_switching", questionText: "Rack space?", whyAsked: "physical", answerType: "free_text", required: false, sourceRefIds: ["ref-3"] },
      { questionId: "sq-4", order: 4, domain: "campus_switching", questionText: "Legacy VLANs?", whyAsked: "migration", answerType: "free_text", required: false, sourceRefIds: ["ref-4"] },
    ],
    validation: { status: "passed", checkedAt: "2026-06-18T09:00:00.000Z", findingCount: 0, findings: [] },
  };
}

function makeSourceArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: SOURCE_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_intake_questionnaire",
    status: "needs_review",
    version: 3,
    payload: makeSourceQuestionnairePayload(),
    sourceFileIds: [],
    sourceArtifactIds: ["input-pkg-1"],
    createdAt: ART_CREATED,
    updatedAt: ART_UPDATED,
    ...overrides,
  };
}

function makeReviewedQuestions(): RfpHldIntakeReviewedQuestionInput[] {
  return [
    { questionId: "sq-1", action: "accepted", sourceQuestionId: "sq-1", order: 1, questionText: "Existing core?", whyAsked: "context", answerType: "free_text", required: true, sourceRefIds: ["ref-1"] },
    { questionId: "sq-2", action: "edited", sourceQuestionId: "sq-2", order: 2, questionText: "Redundancy tier?", whyAsked: "resiliency", answerType: "single_select", required: false, sourceRefIds: ["ref-2"], allowedOptions: ["dual", "single"] },
    { questionId: "sq-3", action: "removed", sourceQuestionId: "sq-3", questionText: "Rack space?", whyAsked: "physical", answerType: "free_text", required: false, sourceRefIds: ["ref-3"] },
    { questionId: "sq-4", action: "waived", sourceQuestionId: "sq-4", questionText: "Legacy VLANs?", whyAsked: "migration", answerType: "free_text", required: false, sourceRefIds: ["ref-4"], waiverReason: "Out of scope for this bid." },
    { questionId: "added-1", action: "added", order: 3, questionText: "New SDA fabric?", whyAsked: "engineer added", answerType: "boolean", required: false, sourceRefIds: [] },
  ];
}

function makeQuestionAnswers(): RfpHldIntakeQuestionAnswerInput[] {
  return [
    { questionId: "sq-1", status: "answered", value: "  Catalyst 9500 core  " },
    { questionId: "sq-2", status: "unknown", notes: "  needs follow-up  " },
    { questionId: "added-1", status: "not_applicable", value: ANSWER_LEAK },
  ];
}

function qInput(
  overrides: Partial<CreateRfpHldIntakeFromQuestionnaireDraftInput> = {}
): CreateRfpHldIntakeFromQuestionnaireDraftInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    createdBy: CREATED_BY,
    sourceQuestionnaireArtifactId: SOURCE_ID,
    reviewedQuestions: makeReviewedQuestions(),
    answers: makeQuestionAnswers(),
    createdAt: FIXED_CREATED,
    ...overrides,
  };
}

describe("createRfpHldIntakeFromQuestionnaireDraft - happy path", () => {
  beforeEach(() => {
    getProjectMock.mockResolvedValue(makeProject());
    getArtifactMock.mockResolvedValue(makeSourceArtifact());
    createMock.mockResolvedValue(
      makeCreatedArtifact({ sourceArtifactIds: [SOURCE_ID] })
    );
  });

  it("writes a needs_review questionnaire_assisted hld_intake with sourceArtifactIds [SOURCE_ID]", async () => {
    const result = await createRfpHldIntakeFromQuestionnaireDraft(qInput());

    expect(result.status).toBe("ok");
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.type).toBe("hld_intake");
    expect(arg.status).toBe("needs_review");
    expect(arg.stageId).toBe("hld_design_delta_review");
    expect(arg.sourceFileIds).toEqual([]);
    expect(arg.sourceArtifactIds).toEqual([SOURCE_ID]);
  });

  it("stamps sourceMode questionnaire_assisted and a consistent review audit block", async () => {
    await createRfpHldIntakeFromQuestionnaireDraft(qInput());

    const payload = createMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.payloadKind).toBe("rfp_hld_intake");
    expect(payload.sourceMode).toBe("questionnaire_assisted");
    expect(payload.sourceQuestionnaireArtifactId).toBe(SOURCE_ID);
    expect("manualOverrideReason" in payload).toBe(false);

    const review = payload.questionnaireReview as Record<string, unknown>;
    expect(review.sourceQuestionnaireArtifactId).toBe(SOURCE_ID);
    expect(review.sourceQuestionnaireVersion).toBe(3);
    expect(review.questionnairePayloadKind).toBe("rfp_hld_intake_questionnaire");
    expect((review.reviewedQuestions as unknown[]).length).toBe(5);
    expect(review.counts).toEqual({
      accepted: 1,
      edited: 1,
      added: 1,
      removed: 1,
      waived: 1,
      active: 3,
    });
  });

  it("normalizes answers to the active questions in order, dropping non-answered values", async () => {
    await createRfpHldIntakeFromQuestionnaireDraft(qInput());

    const payload = createMock.mock.calls[0][0].payload as Record<string, unknown>;
    const answers = payload.answers as Array<Record<string, unknown>>;
    expect(answers.map((a) => a.fieldId)).toEqual(["sq-1", "sq-2", "added-1"]);
    // labels are the reviewed question text.
    expect(answers[0].label).toBe("Existing core?");
    expect(answers[1].label).toBe("Redundancy tier?");
    expect(answers[0].value).toBe("Catalyst 9500 core");
    expect(answers[1].status).toBe("unknown");
    expect("value" in answers[1]).toBe(false);
    expect(answers[1].notes).toBe("needs follow-up");
    expect(answers[2].status).toBe("not_applicable");
    expect("value" in answers[2]).toBe(false);
    expect(payload.answerCount).toBe(3);
    expect(payload.statusCounts).toEqual({ answered: 1, unknown: 1, not_applicable: 1 });
    expect(JSON.stringify(payload)).not.toContain(ANSWER_LEAK);
  });

  it("returns a lean payloadSummary carrying sourceMode and the source id but no answer values or tenant id", async () => {
    const result = await createRfpHldIntakeFromQuestionnaireDraft(qInput());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary.sourceMode).toBe("questionnaire_assisted");
    expect(result.payloadSummary.sourceQuestionnaireArtifactId).toBe(SOURCE_ID);
    expect(result.payloadSummary.fieldIds).toEqual(["sq-1", "sq-2", "added-1"]);
    expect("answers" in result.payloadSummary).toBe(false);
    const json = JSON.stringify(result.payloadSummary);
    expect(json).not.toContain("Catalyst 9500 core");
    expect(json).not.toContain(TENANT);
  });

  it("loads the exact source artifact by tenant/project/id and verifies before the write", async () => {
    await createRfpHldIntakeFromQuestionnaireDraft(qInput());

    expect(getArtifactMock).toHaveBeenCalledWith(TENANT, PROJECT, SOURCE_ID);
    expect(getArtifactMock.mock.invocationCallOrder[0]).toBeLessThan(
      createMock.mock.invocationCallOrder[0]
    );
  });
});

describe("createRfpHldIntakeFromQuestionnaireDraft - gates", () => {
  beforeEach(() => {
    getProjectMock.mockResolvedValue(makeProject());
    getArtifactMock.mockResolvedValue(makeSourceArtifact());
    createMock.mockResolvedValue(
      makeCreatedArtifact({ sourceArtifactIds: [SOURCE_ID] })
    );
  });

  it("rejects a blank sourceQuestionnaireArtifactId before any store call", async () => {
    await expect(
      createRfpHldIntakeFromQuestionnaireDraft(qInput({ sourceQuestionnaireArtifactId: "  " }))
    ).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
  });

  it("returns not_found and never writes when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await createRfpHldIntakeFromQuestionnaireDraft(qInput());

    expect(result).toEqual({ status: "not_found" });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns wrong_mode (no tenantId) for a non-rfp project", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await createRfpHldIntakeFromQuestionnaireDraft(qInput());

    expect(result.status).toBe("wrong_mode");
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns source_not_found when the source artifact is missing", async () => {
    getArtifactMock.mockResolvedValue(null);

    const result = await createRfpHldIntakeFromQuestionnaireDraft(qInput());

    expect(result).toEqual({ status: "source_not_found" });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns source_not_usable for wrong type/stage/status", async () => {
    for (const overrides of [
      { type: "input_package" as ProjectArtifactType },
      { stageId: "compliance_matrix_review" as ProjectStageId },
      { status: "stale" as ProjectArtifact["status"] },
      { status: "rejected" as ProjectArtifact["status"] },
    ]) {
      createMock.mockClear();
      getArtifactMock.mockResolvedValue(makeSourceArtifact(overrides));

      const result = await createRfpHldIntakeFromQuestionnaireDraft(qInput());

      expect(result).toEqual({ status: "source_not_usable" });
      expect(createMock).not.toHaveBeenCalled();
    }
  });

  it("returns invalid_source_payload when the source questionnaire payload is malformed", async () => {
    getArtifactMock.mockResolvedValue(makeSourceArtifact({ payload: { junk: true } }));

    const result = await createRfpHldIntakeFromQuestionnaireDraft(qInput());

    expect(result).toEqual({ status: "invalid_source_payload" });
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createRfpHldIntakeFromQuestionnaireDraft - review/answer validation", () => {
  beforeEach(() => {
    getProjectMock.mockResolvedValue(makeProject());
    getArtifactMock.mockResolvedValue(makeSourceArtifact());
    createMock.mockResolvedValue(
      makeCreatedArtifact({ sourceArtifactIds: [SOURCE_ID] })
    );
  });

  async function expectReviewReject(
    reviewedQuestions: RfpHldIntakeReviewedQuestionInput[],
    answers: RfpHldIntakeQuestionAnswerInput[] = makeQuestionAnswers()
  ): Promise<void> {
    createMock.mockClear();
    await expect(
      createRfpHldIntakeFromQuestionnaireDraft(qInput({ reviewedQuestions, answers }))
    ).rejects.toThrow();
    expect(createMock).not.toHaveBeenCalled();
  }

  it("rejects a source-question coverage gap (an unreviewed source question)", async () => {
    const reviewed = makeReviewedQuestions().filter((q) => q.questionId !== "sq-4");
    await expectReviewReject(reviewed);
  });

  it("rejects a duplicate source-question review", async () => {
    const reviewed = makeReviewedQuestions();
    reviewed[2] = { ...reviewed[2], sourceQuestionId: "sq-2" };
    await expectReviewReject(reviewed);
  });

  it("rejects an unknown sourceQuestionId", async () => {
    const reviewed = makeReviewedQuestions();
    reviewed[0] = { ...reviewed[0], sourceQuestionId: "sq-nope" };
    await expectReviewReject(reviewed);
  });

  it("rejects an added question that carries a sourceQuestionId", async () => {
    const reviewed = makeReviewedQuestions();
    reviewed[4] = { ...reviewed[4], sourceQuestionId: "sq-1" };
    await expectReviewReject(reviewed);
  });

  it("rejects a non-added action without a sourceQuestionId", async () => {
    const reviewed = makeReviewedQuestions();
    delete (reviewed[0] as { sourceQuestionId?: string }).sourceQuestionId;
    await expectReviewReject(reviewed);
  });

  it("rejects a waived question with no waiverReason", async () => {
    const reviewed = makeReviewedQuestions();
    delete (reviewed[3] as { waiverReason?: string }).waiverReason;
    await expectReviewReject(reviewed);
  });

  it("rejects a duplicate active order", async () => {
    const reviewed = makeReviewedQuestions();
    reviewed[1] = { ...reviewed[1], order: 1 };
    await expectReviewReject(reviewed);
  });

  it("rejects a select answer type without allowedOptions", async () => {
    const reviewed = makeReviewedQuestions();
    delete (reviewed[1] as { allowedOptions?: string[] }).allowedOptions;
    await expectReviewReject(reviewed);
  });

  it("rejects when every reviewed source question is removed or waived", async () => {
    const reviewed: RfpHldIntakeReviewedQuestionInput[] = [
      { questionId: "sq-1", action: "removed", sourceQuestionId: "sq-1", questionText: "Existing core?", whyAsked: "context", answerType: "free_text", required: true, sourceRefIds: ["ref-1"] },
      { questionId: "sq-2", action: "waived", sourceQuestionId: "sq-2", questionText: "Redundancy?", whyAsked: "resiliency", answerType: "single_select", required: false, sourceRefIds: ["ref-2"], allowedOptions: ["yes", "no"], waiverReason: "Not needed." },
      { questionId: "sq-3", action: "removed", sourceQuestionId: "sq-3", questionText: "Rack space?", whyAsked: "physical", answerType: "free_text", required: false, sourceRefIds: ["ref-3"] },
      { questionId: "sq-4", action: "waived", sourceQuestionId: "sq-4", questionText: "Legacy VLANs?", whyAsked: "migration", answerType: "free_text", required: false, sourceRefIds: ["ref-4"], waiverReason: "Out of scope." },
    ];
    await expectReviewReject(reviewed, []);
  });

  it("rejects a missing answer for an active question", async () => {
    const answers = makeQuestionAnswers().filter((a) => a.questionId !== "sq-1");
    await expectReviewReject(makeReviewedQuestions(), answers);
  });

  it("rejects a duplicate answer", async () => {
    const answers = makeQuestionAnswers();
    answers.push({ questionId: "sq-1", status: "answered", value: "again" });
    await expectReviewReject(makeReviewedQuestions(), answers);
  });

  it("rejects an answer for a removed or waived question", async () => {
    for (const questionId of ["sq-3", "sq-4"]) {
      const answers = makeQuestionAnswers();
      answers.push({ questionId, status: "answered", value: "x" });
      await expectReviewReject(makeReviewedQuestions(), answers);
    }
  });

  it("rejects an answered active question with a blank value", async () => {
    const answers = makeQuestionAnswers();
    answers[0] = { questionId: "sq-1", status: "answered", value: "   " };
    await expectReviewReject(makeReviewedQuestions(), answers);
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-intake.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-intake.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");
  const importLines = source.split("\n").filter((l) => /^\s*import\b/.test(l));
  const joinedImports = importLines.join("\n");

  it("imports only the project store, the artifact store, and canonical project types", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/db/project-artifact-store"');
    expect(source).toContain('from "@/types/project"');
  });

  it("does not import file/evidence stores, fs/path, pricing/sku/catalog/config authority, AI/provider, or Next/React/app/components", () => {
    for (const forbidden of [
      "@/lib/db/project-file-store",
      "@/lib/projects/evidence",
      "@/lib/projects/files",
      "node:fs",
      "node:path",
      "@/lib/projects/pricing",
      "@/lib/projects/priced-boq",
      "@/lib/projects/catalog-lookup",
      "catalog",
      "config-expansion",
      "@/lib/adapters",
      "@/lib/agent",
      "@/lib/ai",
      "@/lib/llm",
      "@/coordinator",
      "@/engines",
      "@/app",
      "@/components",
      "next/server",
      "react",
      "anthropic",
      "openai",
      "@google/generative-ai",
    ]) {
      expect(joinedImports).not.toContain(forbidden);
    }
  });

  it("exposes the creation service, field catalog, payload kind, and validation error surface as runtime exports", () => {
    expect(Object.keys(serviceModule).sort()).toEqual(
      [
        "RFP_HLD_INTAKE_FIELDS",
        "RFP_HLD_INTAKE_PAYLOAD_KIND",
        "RfpHldIntakeValidationError",
        "createRfpHldIntakeDraft",
        "createRfpHldIntakeFromQuestionnaireDraft",
        "isRfpHldIntakeValidationError",
      ].sort()
    );
    expect(serviceModule.RFP_HLD_INTAKE_PAYLOAD_KIND).toBe("rfp_hld_intake");
  });

  it("classifies its own validation errors and rejects foreign errors via the predicate", () => {
    const validation = new serviceModule.RfpHldIntakeValidationError("bad answers");
    expect(serviceModule.isRfpHldIntakeValidationError(validation)).toBe(true);
    expect(serviceModule.isRfpHldIntakeValidationError(new Error("store boom"))).toBe(
      false
    );
    expect(serviceModule.isRfpHldIntakeValidationError(null)).toBe(false);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
