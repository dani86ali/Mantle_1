import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

// Mock only the store boundaries. The Stage 6H-0B questionnaire contract validator
// is NOT mocked: list validity and detail gating drive the real validator over the
// supplied payloads.
const { mockGetProjectById, mockGetArtifactById, mockListArtifactsByType } =
  vi.hoisted(() => ({
    mockGetProjectById: vi.fn(),
    mockGetArtifactById: vi.fn(),
    mockListArtifactsByType: vi.fn(),
  }));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifactsByType: mockListArtifactsByType,
}));

import {
  loadRfpHldIntakeQuestionnaireList,
  loadRfpHldIntakeQuestionnaireDetail,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire-inspection";
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
  type RfpHldIntakeQuestionnairePayload,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire";

const TENANT = "55555555-5555-5555-5555-555555555555";
const PROJECT = "proj-rfp-questionnaire-1";
const ARTIFACT = "hld-intake-questionnaire-1";
const CREATED_AT = "2026-06-28T09:00:00.000Z";
const TS = new Date("2026-06-28T08:00:00.000Z");

/** A valid candidate questionnaire payload. Fresh per call. */
function validPayload(): RfpHldIntakeQuestionnairePayload {
  return {
    payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
    createdBy: "engineer@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: ["art-req-1", "art-cmx-1"],
    questions: [
      {
        questionId: "q-2",
        order: 2,
        domain: "security",
        questionText: "Which segmentation model applies at the perimeter?",
        whyAsked: "Sizes the security zoning for the HLD.",
        answerType: "single_select",
        required: true,
        sourceRefIds: ["art-cmx-1"],
        allowedOptions: ["Flat", "Zoned"],
      },
      {
        questionId: "q-1",
        order: 1,
        domain: "campus_switching",
        questionText: "What is the existing access-layer footprint?",
        whyAsked: "Sizes the campus access design.",
        answerType: "free_text",
        required: true,
        sourceRefIds: ["art-req-1"],
        requiredInputIds: ["art-req-1"],
      },
    ],
    validation: {
      status: "passed",
      checkedAt: CREATED_AT,
      findingCount: 1,
      findings: [
        {
          id: "f-1",
          code: "questionnaire_draft",
          message: "Deterministic candidate questionnaire for engineer review.",
          severity: "info",
        },
      ],
    },
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP HLD",
    customerName: "STC",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function questionnaireArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_intake_questionnaire",
    status: "needs_review",
    version: 1,
    payload: validPayload() as unknown as Record<string, unknown>,
    sourceFileIds: ["secret-file-id"],
    sourceArtifactIds: ["art-req-1", "art-cmx-1"],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(questionnaireArtifact());
  mockListArtifactsByType.mockReset().mockResolvedValue([questionnaireArtifact()]);
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("loadRfpHldIntakeQuestionnaireList", () => {
  it("throws on a blank projectId without touching the store", async () => {
    await expect(
      loadRfpHldIntakeQuestionnaireList({ tenantId: TENANT, projectId: "  " })
    ).rejects.toThrow(/projectId is required/);
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("returns not_found when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await loadRfpHldIntakeQuestionnaireList({
      tenantId: TENANT,
      projectId: PROJECT,
    });
    expect(result).toEqual({ status: "not_found" });
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a quick_bom project and leaks no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await loadRfpHldIntakeQuestionnaireList({
      tenantId: TENANT,
      projectId: PROJECT,
    });
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("returns lean counts-only summaries with payloadValid and validation status/finding count", async () => {
    const result = await loadRfpHldIntakeQuestionnaireList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(mockListArtifactsByType).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "hld_intake_questionnaire" as ProjectArtifactType
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    const art = result.artifacts[0];
    expect("payload" in art).toBe(false);
    expect(art.payloadSummary).toEqual({
      payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
      createdBy: "engineer@example.com",
      createdAt: CREATED_AT,
      questionCount: 2,
      sourceArtifactCount: 2,
      validationStatus: "passed",
      validationFindingCount: 1,
      payloadValid: true,
    });
    const json = JSON.stringify(result.artifacts);
    expect(json).not.toContain("secret-file-id");
    expect(json).not.toContain("segmentation model");
    expect(json).not.toContain(TENANT);
  });

  it("reports payloadValid=false for a structurally invalid stored payload without throwing", async () => {
    mockListArtifactsByType.mockResolvedValue([
      questionnaireArtifact({
        payload: { ...validPayload(), payloadKind: "wrong_kind" } as unknown as Record<
          string,
          unknown
        >,
      }),
    ]);
    const result = await loadRfpHldIntakeQuestionnaireList({
      tenantId: TENANT,
      projectId: PROJECT,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifacts[0].payloadSummary.payloadValid).toBe(false);
  });

  it("filters to hld_intake_questionnaire on hld_design_delta_review only", async () => {
    mockListArtifactsByType.mockResolvedValue([
      questionnaireArtifact(),
      questionnaireArtifact({
        id: "wrong-stage",
        stageId: "compliance_matrix_review" as ProjectStageId,
      }),
      questionnaireArtifact({
        id: "wrong-type",
        type: "hld_intake" as ProjectArtifactType,
      }),
      questionnaireArtifact({ id: "wrong-project", projectId: "other-project" }),
    ]);
    const result = await loadRfpHldIntakeQuestionnaireList({
      tenantId: TENANT,
      projectId: PROJECT,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifacts.map((a) => a.id)).toEqual([ARTIFACT]);
  });
});

// ---------------------------------------------------------------------------
// detail
// ---------------------------------------------------------------------------

describe("loadRfpHldIntakeQuestionnaireDetail", () => {
  it("throws on a blank artifactId", async () => {
    await expect(
      loadRfpHldIntakeQuestionnaireDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: "",
      })
    ).rejects.toThrow(/artifactId is required/);
  });

  it("returns not_found when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await loadRfpHldIntakeQuestionnaireDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });
    expect(result).toEqual({ status: "not_found" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a quick_bom project and leaks no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await loadRfpHldIntakeQuestionnaireDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });
    expect(result.status).toBe("wrong_mode");
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found scoping the lookup to session tenant + route project", async () => {
    mockGetArtifactById.mockResolvedValue(null);
    const result = await loadRfpHldIntakeQuestionnaireDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });
    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
  });

  it("returns artifact_not_questionnaire for the wrong type or stage, with a lean summary and no payload body", async () => {
    for (const overrides of [
      { type: "hld_intake" as ProjectArtifactType },
      { stageId: "compliance_matrix_review" as ProjectStageId },
    ]) {
      mockGetArtifactById.mockResolvedValue(questionnaireArtifact(overrides));
      const result = await loadRfpHldIntakeQuestionnaireDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
      });
      expect(result.status).toBe("artifact_not_questionnaire");
      if (result.status !== "artifact_not_questionnaire") {
        throw new Error("unreachable");
      }
      expect("payload" in result.artifact).toBe(false);
      expect(JSON.stringify(result)).not.toContain("segmentation model");
    }
  });

  it("returns invalid_questionnaire_payload for a structurally invalid payload, leaking no body/tenant", async () => {
    mockGetArtifactById.mockResolvedValue(
      questionnaireArtifact({
        payload: { ...validPayload(), payloadKind: "wrong_kind" } as unknown as Record<
          string,
          unknown
        >,
      })
    );
    const result = await loadRfpHldIntakeQuestionnaireDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });
    expect(result.status).toBe("invalid_questionnaire_payload");
    if (result.status !== "invalid_questionnaire_payload") {
      throw new Error("unreachable");
    }
    expect("questionnaire" in result).toBe(false);
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("segmentation model");
  });

  it("returns sanitized order-sorted questions and validation for a valid payload, and no answers/tenant leak", async () => {
    const result = await loadRfpHldIntakeQuestionnaireDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.questionnaire.questions.map((q) => q.questionId)).toEqual([
      "q-1",
      "q-2",
    ]);
    expect(result.questionnaire.questions[1]).toEqual({
      questionId: "q-2",
      order: 2,
      domain: "security",
      questionText: "Which segmentation model applies at the perimeter?",
      whyAsked: "Sizes the security zoning for the HLD.",
      answerType: "single_select",
      required: true,
      sourceRefIds: ["art-cmx-1"],
      allowedOptions: ["Flat", "Zoned"],
    });
    expect(result.questionnaire.validation).toEqual({
      status: "passed",
      checkedAt: CREATED_AT,
      findingCount: 1,
      findings: [
        {
          id: "f-1",
          code: "questionnaire_draft",
          message: "Deterministic candidate questionnaire for engineer review.",
          severity: "info",
        },
      ],
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("secret-file-id");
    // Never surfaces an answers key or value.
    expect(json).not.toContain('"answer"');
    expect(json).not.toContain('"answers"');
  });
});

// ---------------------------------------------------------------------------
// Static module purity
// ---------------------------------------------------------------------------

describe("project-rfp-hld-intake-questionnaire-inspection - module purity (static)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-intake-questionnaire-inspection.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-intake-questionnaire-inspection.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the stores, the questionnaire contract, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/projects/project-rfp-hld-intake-questionnaire",
      "@/types/project",
    ]);
  });

  it("creates nothing and imports no forbidden providers/pricing/raw/approval modules", () => {
    expect(/\b(?:create|update|delete|write|approve)[A-Z]\w*/.test(source)).toBe(
      false
    );
    for (const forbidden of [
      "@anthropic-ai",
      "@google/generative-ai",
      "openai",
      "pdf-parse",
      "mammoth",
      "xlsx",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    for (const f of froms) {
      expect(f).not.toContain("@/lib/ai");
      expect(f).not.toContain("@/lib/llm");
      expect(f).not.toContain("@/lib/adapters");
      expect(f).not.toContain("@/lib/catalog");
      expect(f).not.toContain("pricing");
      expect(f).not.toContain("sku-resolution");
      expect(f).not.toContain("config-expansion");
      expect(f).not.toContain("project-file-store");
      expect(f).not.toContain("project-evidence-store");
      expect(f).not.toContain("approval");
      expect(f).not.toContain("/api/");
      expect(f).not.toContain("/app/");
    }
  });

  it("keeps source and test files ASCII-only", () => {
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});
