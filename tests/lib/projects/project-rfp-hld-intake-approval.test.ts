import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";

// Mock the DB store boundaries. The pure approval helper (isArtifactReviewable)
// and the HLD intake contract (catalog + payload kind) stay REAL so the
// reviewability gate and the payload re-validation are true integration checks.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockCreateArtifactVersion,
  mockCreateApproval,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockCreateArtifactVersion: vi.fn(),
  mockCreateApproval: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  createProjectArtifactVersion: mockCreateArtifactVersion,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: mockCreateApproval,
}));

import {
  reviewRfpHldIntakeArtifact,
  type ReviewRfpHldIntakeArtifactInput,
  type ReviewRfpHldIntakeArtifactResult,
} from "@/lib/projects/project-rfp-hld-intake-approval";
import {
  createRfpHldIntakeDraft,
  RFP_HLD_INTAKE_FIELDS,
  type RfpHldIntakeAnswerInput,
} from "@/lib/projects/project-rfp-hld-intake";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-hld-intake-2";
const DECIDER = "u-engineer-7";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const DECIDED_AT = new Date("2026-06-09T09:00:00.000Z");
const ANSWER_SENTINEL = "SECRET-ANSWER-VALUE";

const FIELD_IDS = RFP_HLD_INTAKE_FIELDS.map((f) => f.fieldId);

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

type AnswerRecord = Record<string, unknown>;

// The normalized persisted shape the creation contract emits: every catalog
// field once, in canonical order, with catalog labels and matching counts.
function makeNormalizedPayload(
  mutate: (answers: AnswerRecord[], payload: Record<string, unknown>) => void = () => {}
): Record<string, unknown> {
  const answers: AnswerRecord[] = RFP_HLD_INTAKE_FIELDS.map((field, i) => {
    const base: AnswerRecord = { fieldId: field.fieldId, label: field.label };
    if (i === 0) return { ...base, status: "answered", value: ANSWER_SENTINEL };
    if (i === 1) return { ...base, status: "unknown", notes: "needs a follow-up" };
    if (i === 2) return { ...base, status: "not_applicable" };
    return { ...base, status: "answered", value: `value-${field.fieldId}` };
  });
  const payload: Record<string, unknown> = {
    payloadKind: "rfp_hld_intake",
    createdBy: "engineer-1",
    createdAt: "2026-06-20T09:15:00.000Z",
    sourceMode: "manual_override",
    manualOverrideReason: "Questionnaire not yet available; entered manually.",
    answers,
    answerCount: answers.length,
    statusCounts: { answered: answers.length - 2, unknown: 1, not_applicable: 1 },
  };
  mutate(answers, payload);
  return payload;
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_intake",
    status: "needs_review",
    version: 2,
    payload: makeNormalizedPayload(),
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeCreated(decision: ProjectApproval["decision"] = "approved") {
  const approval: ProjectApproval = {
    id: "appr-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
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

function review(
  overrides: Partial<ReviewRfpHldIntakeArtifactInput> = {}
): Promise<ReviewRfpHldIntakeArtifactResult> {
  return reviewRfpHldIntakeArtifact({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: ARTIFACT,
    decision: "approved",
    decidedBy: DECIDER,
    ...overrides,
  });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(makeArtifact());
  mockCreateArtifactVersion.mockReset();
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
});

describe("reviewRfpHldIntakeArtifact - input validation", () => {
  it("throws on a blank artifactId before any store call", async () => {
    await expect(review({ artifactId: "  " })).rejects.toThrow(
      "artifactId is required."
    );
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
});

describe("reviewRfpHldIntakeArtifact - gates before approval", () => {
  it("returns not_found and never approves when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns a wrong_mode lean summary (no tenantId) and never approves for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await review();

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found when the exact artifact is missing", async () => {
    mockGetArtifactById.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_hld_intake for the wrong type or stage without approving", async () => {
    for (const overrides of [
      { type: "compliance_matrix" as ProjectArtifactType },
      { stageId: "compliance_matrix_review" as ProjectStageId },
    ]) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValue(makeArtifact(overrides));

      const result = await review();

      expect(result.status).toBe("artifact_not_hld_intake");
      if (result.status !== "artifact_not_hld_intake") throw new Error("unreachable");
      expect("payload" in result.artifact).toBe(false);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("returns artifact_not_reviewable for non-reviewable statuses BEFORE payload validation", async () => {
    // Status gate fires before payload re-validation: a non-reviewable artifact
    // with a perfectly valid payload still blocks as not_reviewable.
    for (const status of [
      "approved",
      "rejected",
      "stale",
      "failed",
      "missing",
      "not_applicable",
    ] as ProjectArtifactStatus[]) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValue(makeArtifact({ status }));

      const result = await review();

      expect(result.status).toBe("artifact_not_reviewable");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });
});

describe("reviewRfpHldIntakeArtifact - approval payload re-validation", () => {
  it("approves a normalized payload and records exactly one approval", async () => {
    const result = await review({ decidedAt: DECIDED_AT, note: "looks complete" });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
      note: "looks complete",
    });
  });

  it("approves a payload produced by the real creation contract", async () => {
    // Drive the creation contract to capture the exact normalized payload it
    // emits, then prove the approval gate accepts that payload.
    let captured: Record<string, unknown> | undefined;
    mockCreateArtifactVersion.mockImplementation(
      async (arg: { payload: Record<string, unknown> }) => {
        captured = arg.payload;
        return makeArtifact({ payload: arg.payload });
      }
    );
    const answers: RfpHldIntakeAnswerInput[] = RFP_HLD_INTAKE_FIELDS.map((field, i) => {
      if (i === 1) return { fieldId: field.fieldId, status: "unknown", notes: "tbd" };
      if (i === 2) return { fieldId: field.fieldId, status: "not_applicable" };
      return { fieldId: field.fieldId, status: "answered", value: `v ${field.fieldId}` };
    });
    await createRfpHldIntakeDraft({
      tenantId: TENANT,
      projectId: PROJECT,
      createdBy: "engineer-1",
      answers,
      manualOverrideReason: "Manual override for this bid.",
      createdAt: new Date("2026-06-20T09:15:00.000Z"),
    });
    expect(captured).toBeDefined();

    mockGetArtifactById.mockResolvedValue(makeArtifact({ payload: captured }));

    const result = await review();

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("approves a well-formed questionnaire_assisted payload", async () => {
    const payload = makeNormalizedPayload((_, p) => {
      p.sourceMode = "questionnaire_assisted";
      delete p.manualOverrideReason;
      p.sourceQuestionnaireArtifactId = "art-questionnaire-1";
    });
    mockGetArtifactById.mockResolvedValue(makeArtifact({ payload }));

    const result = await review();

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("blocks every non-normalized or tampered payload as invalid_hld_intake_payload without approving", async () => {
    const tampered: Array<[string, Record<string, unknown>]> = [
      ["wrong payloadKind", makeNormalizedPayload((_, p) => { p.payloadKind = "nope"; })],
      ["unknown row carrying a value", makeNormalizedPayload((a) => { a[1].value = "leak"; })],
      ["wrong label", makeNormalizedPayload((a) => { a[0].label = "WRONG LABEL"; })],
      ["missing field", makeNormalizedPayload((a, p) => { a.pop(); p.answerCount = a.length; })],
      ["duplicate field", makeNormalizedPayload((a) => { a[1].fieldId = a[0].fieldId; })],
      ["mismatched answerCount", makeNormalizedPayload((_, p) => { p.answerCount = 8; })],
      ["mismatched statusCounts", makeNormalizedPayload((_, p) => {
        p.statusCounts = { answered: 1, unknown: 1, not_applicable: 1 };
      })],
      ["missing sourceMode", makeNormalizedPayload((_, p) => { delete p.sourceMode; })],
      ["unknown sourceMode", makeNormalizedPayload((_, p) => { p.sourceMode = "auto_magic"; })],
      ["manual_override missing reason", makeNormalizedPayload((_, p) => {
        delete p.manualOverrideReason;
      })],
      ["manual_override blank reason", makeNormalizedPayload((_, p) => {
        p.manualOverrideReason = "   ";
      })],
      ["manual_override carrying a questionnaire source", makeNormalizedPayload((_, p) => {
        p.sourceQuestionnaireArtifactId = "art-questionnaire-1";
      })],
      ["questionnaire_assisted missing questionnaire source", makeNormalizedPayload((_, p) => {
        p.sourceMode = "questionnaire_assisted";
        delete p.manualOverrideReason;
      })],
      ["questionnaire_assisted carrying an override reason", makeNormalizedPayload((_, p) => {
        p.sourceMode = "questionnaire_assisted";
        p.sourceQuestionnaireArtifactId = "art-questionnaire-1";
      })],
      ["extra top-level key", makeNormalizedPayload((_, p) => { p.tenantId = TENANT; })],
      ["extra answer key", makeNormalizedPayload((a) => { a[0].injected = "x"; })],
      ["blank answered value", makeNormalizedPayload((a) => { a[0].value = "   "; })],
      ["blank notes", makeNormalizedPayload((a) => { a[1].notes = "   "; })],
    ];
    for (const [, payload] of tampered) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValue(makeArtifact({ payload }));

      const result = await review();

      expect(result.status).toBe("invalid_hld_intake_payload");
      if (result.status !== "invalid_hld_intake_payload") throw new Error("unreachable");
      expect("payload" in result.artifact).toBe(false);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("records a REJECTION even when the persisted payload is malformed", async () => {
    mockGetArtifactById.mockResolvedValue(makeArtifact({ payload: { junk: true } }));

    const result = await review({ decision: "rejected" });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "rejected" })
    );
  });
});

describe("reviewRfpHldIntakeArtifact - ok result", () => {
  it("returns approval, post-decision statuses, and a lean artifact summary without leaking answer values or tenant id", async () => {
    const result = await review();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactStatus).toBe("approved");
    expect(result.stageStatus).toBe("approved");
    expect("payload" in result.artifact).toBe(false);
    expect("tenantId" in result.artifact).toBe(false);

    const json = JSON.stringify(result);
    expect(json).not.toContain(ANSWER_SENTINEL);
    expect(json).not.toContain(TENANT);
  });

  it("returns approval_failed when createProjectApproval returns null", async () => {
    mockCreateApproval.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "approval_failed" });
  });

  it("lets an unexpected createProjectApproval error bubble", async () => {
    mockCreateApproval.mockRejectedValue(new Error("db boom"));

    await expect(review()).rejects.toThrow("db boom");
  });

  it("does not mutate the input or the loaded artifact", async () => {
    const loaded = makeArtifact();
    const loadedSnapshot = structuredClone(loaded);
    mockGetArtifactById.mockResolvedValue(loaded);
    const input: ReviewRfpHldIntakeArtifactInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
    };
    const inputSnapshot = structuredClone(input);

    await reviewRfpHldIntakeArtifact(input);

    expect(input).toEqual(inputSnapshot);
    expect(loaded).toEqual(loadedSnapshot);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-intake-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-intake-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project store, artifact store, approval store, approval helper, HLD intake contract, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-approval-store",
      "@/lib/projects/approvals",
      "@/lib/projects/project-rfp-hld-intake",
      "@/types/project",
    ]);
  });

  it("uses createProjectApproval as its only create/update/delete mutation", () => {
    const mutationTokens = source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(Array.from(new Set(mutationTokens))).toEqual(["createProjectApproval"]);
  });

  it("reads no file/evidence/raw stores, fs/path, pricing/sku/catalog/config, AI, routes, or UI", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/catalog',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/app',
      'from "@/components',
      'from "next/server"',
      'from "react"',
      "@anthropic-ai",
      "@google/generative-ai",
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
