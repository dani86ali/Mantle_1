import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockResolve,
  mockLoadState,
  mockSaveState,
  mockQuestionsToSections,
  mockSaveUpload,
  mockMinimalState,
  mockRunE4,
} = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockLoadState: vi.fn(),
  mockSaveState: vi.fn(),
  mockQuestionsToSections: vi.fn(),
  mockSaveUpload: vi.fn(),
  mockMinimalState: vi.fn(),
  mockRunE4: vi.fn(),
}));

vi.mock("@/app/api/estimates/[id]/_e4-state", () => ({
  resolveIntake: mockResolve,
  loadE4State: mockLoadState,
  saveE4State: mockSaveState,
  questionsToSections: mockQuestionsToSections,
  saveResponseUpload: mockSaveUpload,
  minimalPipelineState: mockMinimalState,
}));

vi.mock("@/engines/e4/orchestrator", () => ({
  runE4Detailed: mockRunE4,
}));

import {
  GET as qGET,
  POST as qPOST,
  PATCH as qPATCH,
} from "@/app/api/estimates/[id]/questionnaire/route";
import {
  GET as rGET,
  POST as rPOST,
  PATCH as rPATCH,
} from "@/app/api/estimates/[id]/responses/route";
import { NextRequest } from "next/server";

function jsonReq(body: unknown, contentType = "application/json"): NextRequest {
  return {
    json: async () => body,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "content-type" ? contentType : null,
    },
  } as unknown as NextRequest;
}

function multipartReq(form: FormData): NextRequest {
  return {
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "content-type"
          ? "multipart/form-data; boundary=x"
          : null,
    },
    formData: async () => form,
    json: async () => {
      throw new Error("unexpected json call on multipart request");
    },
  } as unknown as NextRequest;
}

const resolved = { intakeId: "intake-1", customerName: "Acme", country: "SA" };

const emptyBaseline = {
  business: [],
  functional: [],
  nonFunctional: [],
  constraints: [],
  assumptions: [],
};
const emptyGaps = {
  completeQuestions: [],
  incompleteQuestions: [],
  vagueAnswers: [],
  missingCategories: [],
  contradictions: [],
  unstatedAssumptions: [],
};

beforeEach(() => {
  mockResolve.mockReset();
  mockLoadState.mockReset().mockResolvedValue({});
  mockSaveState.mockReset().mockResolvedValue(undefined);
  mockQuestionsToSections
    .mockReset()
    .mockImplementation((qs) => [
      { id: "A", title: "A", description: "", questions: qs },
    ]);
  mockSaveUpload.mockReset();
  mockMinimalState.mockReset().mockReturnValue({});
  mockRunE4.mockReset();
});

describe("GET /api/estimates/[id]/questionnaire", () => {
  it("returns 404 when no estimate exists", async () => {
    mockResolve.mockResolvedValue(null);
    const res = await qGET(jsonReq(null), { params: { id: "missing" } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Estimate not found/);
  });

  it("returns 404 when no questionnaire stored", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({});
    const res = await qGET(jsonReq(null), { params: { id: "intake-1" } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Questionnaire not generated/);
  });

  it("returns stored questionnaire", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({
      questionnaire: {
        sections: [{ id: "A", title: "A", description: "", questions: [] }],
        markdown: "# Q",
        projectType: "campus_refresh",
        status: "draft",
        updatedAt: "now",
      },
    });
    const res = await qGET(jsonReq(null), { params: { id: "intake-1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.markdown).toBe("# Q");
    expect(body.status).toBe("draft");
    expect(body.projectType).toBe("campus_refresh");
    expect(Array.isArray(body.questionnaire)).toBe(true);
  });
});

describe("POST /api/estimates/[id]/questionnaire", () => {
  it("generates from brief", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockRunE4.mockResolvedValue({
      output: { engine: "e4", artifacts: { questionnaire: "MD" }, warnings: [] },
      phase: "phase1",
      logs: [],
      phase1: {
        questionnaireMd: "# Generated",
        projectType: "sd_wan",
        questions: [
          {
            id: "A1",
            section: "A",
            priority: "required",
            responseType: "text",
            text: "Q1",
          },
        ],
        revisions: 0,
      },
    });

    const res = await qPOST(
      jsonReq({ brief: "Campus refresh", sector: "banking" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.markdown).toBe("# Generated");
    expect(body.projectType).toBe("sd_wan");
    expect(body.status).toBe("draft");
    expect(mockSaveState).toHaveBeenCalledTimes(1);
    const saved = mockSaveState.mock.calls[0][1];
    expect(saved.questionnaire.markdown).toBe("# Generated");
    const orchestratorInput = mockRunE4.mock.calls[0][0];
    expect(orchestratorInput.inputData.description).toBe("Campus refresh");
    expect(orchestratorInput.inputData.sector).toBe("banking");
  });

  it("returns 404 when estimate does not exist", async () => {
    mockResolve.mockResolvedValue(null);
    const res = await qPOST(jsonReq({ brief: "x" }), {
      params: { id: "missing" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid body", async () => {
    mockResolve.mockResolvedValue(resolved);
    const res = await qPOST(jsonReq({ brief: 123 }), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Validation failed/);
    expect(body.details).toBeDefined();
  });

  it("returns 500 when orchestrator errors", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockRunE4.mockResolvedValue({
      output: { engine: "e4", artifacts: {}, warnings: [], error: "boom" },
      phase: "phase1",
      logs: [],
    });
    const res = await qPOST(jsonReq({ brief: "x" }), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("boom");
  });
});

describe("PATCH /api/estimates/[id]/questionnaire", () => {
  it("updates status to approved", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({
      questionnaire: {
        sections: [],
        markdown: "",
        projectType: "general",
        status: "draft",
        updatedAt: "t0",
      },
    });
    const res = await qPATCH(
      jsonReq({ status: "approved", revisionNotes: "ok" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("approved");
    expect(body.revisionNotes).toBe("ok");
    expect(mockSaveState).toHaveBeenCalled();
    const saved = mockSaveState.mock.calls[0][1];
    expect(saved.questionnaire.status).toBe("approved");
  });

  it("returns 400 on invalid status value", async () => {
    mockResolve.mockResolvedValue(resolved);
    const res = await qPATCH(jsonReq({ status: "draft" }), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when no questionnaire stored", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({});
    const res = await qPATCH(jsonReq({ status: "approved" }), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(404);
  });

  it("accepts status 'revision' with revisionNotes", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({
      questionnaire: {
        sections: [],
        markdown: "",
        projectType: "general",
        status: "draft",
        updatedAt: "t0",
      },
    });
    const res = await qPATCH(
      jsonReq({ status: "revision", revisionNotes: "add SLO targets" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("revision");
    expect(body.revisionNotes).toBe("add SLO targets");
    const saved = mockSaveState.mock.calls[0][1];
    expect(saved.questionnaire.status).toBe("revision");
    expect(saved.questionnaire.revisionNotes).toBe("add SLO targets");
  });

  it("returns 400 when status 'revision' is sent without notes", async () => {
    mockResolve.mockResolvedValue(resolved);
    const res = await qPATCH(jsonReq({ status: "revision" }), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Validation failed/);
  });

  it("returns 400 when status 'revision' notes are blank", async () => {
    mockResolve.mockResolvedValue(resolved);
    const res = await qPATCH(
      jsonReq({ status: "revision", revisionNotes: "   " }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/estimates/[id]/responses", () => {
  const phase2Result = {
    output: {
      engine: "e4" as const,
      artifacts: { requirementsBaseline: "{}" },
      warnings: [],
    },
    phase: "phase2" as const,
    logs: [],
    phase2: {
      baselineRef: "{}",
      baseline: emptyBaseline,
      gaps: emptyGaps,
      responses: [
        {
          questionId: "A1",
          answer: "yes",
          confidence: 1,
          source: "free_text" as const,
        },
      ],
      format: "text" as const,
      revisions: 0,
    },
  };

  it("processes free-text JSON and triggers interpretation", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({});
    mockRunE4.mockResolvedValue(phase2Result);

    const res = await rPOST(jsonReq({ responseText: "A1: yes" }), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.responses).toHaveLength(1);
    expect(body.gaps).toBeDefined();
    expect(body.baseline).toBeDefined();
    expect(mockRunE4.mock.calls[0][0].inputData.responseText).toBe("A1: yes");
    expect(mockSaveState).toHaveBeenCalledTimes(1);
  });

  it("processes multipart Excel upload and triggers parsing", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({});
    mockSaveUpload.mockResolvedValue({ filePath: "/tmp/test.xlsx" });
    mockRunE4.mockResolvedValue({
      ...phase2Result,
      phase2: { ...phase2Result.phase2, format: "excel" as const },
    });

    const form = new FormData();
    form.append("file", new File(["x"], "test.xlsx"));
    const res = await rPOST(multipartReq(form), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(200);
    expect(mockSaveUpload).toHaveBeenCalledTimes(1);
    expect(mockRunE4.mock.calls[0][0].inputData.responseFilePath).toBe(
      "/tmp/test.xlsx",
    );
  });

  it("returns 400 when responseText is empty (validation)", async () => {
    mockResolve.mockResolvedValue(resolved);
    const res = await rPOST(jsonReq({ responseText: "" }), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Validation failed/);
  });

  it("returns 400 when multipart file is missing", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockSaveUpload.mockResolvedValue({ kind: "missing" });
    const form = new FormData();
    const res = await rPOST(multipartReq(form), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing 'file'/);
  });

  it("returns 404 when estimate does not exist", async () => {
    mockResolve.mockResolvedValue(null);
    const res = await rPOST(jsonReq({ responseText: "x" }), {
      params: { id: "missing" },
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/estimates/[id]/responses", () => {
  it("returns 404 when estimate does not exist", async () => {
    mockResolve.mockResolvedValue(null);
    const res = await rGET(jsonReq(null), { params: { id: "missing" } });
    expect(res.status).toBe(404);
  });

  it("returns 404 when responses not processed yet", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({});
    const res = await rGET(jsonReq(null), { params: { id: "intake-1" } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Responses not processed/);
  });

  it("returns stored responses", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({
      responses: {
        list: [
          {
            questionId: "A1",
            answer: "v",
            confidence: 1,
            source: "free_text",
          },
        ],
        gaps: emptyGaps,
        baseline: emptyBaseline,
        status: "processed",
        updatedAt: "now",
      },
    });
    const res = await rGET(jsonReq(null), { params: { id: "intake-1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.responses).toHaveLength(1);
    expect(body.status).toBe("processed");
    expect(body.gaps).toBeDefined();
    expect(body.baseline).toBeDefined();
  });
});

describe("PATCH /api/estimates/[id]/responses", () => {
  const storedResponses = {
    list: [
      { questionId: "A1", answer: "yes", confidence: 1, source: "free_text" as const },
    ],
    gaps: emptyGaps,
    baseline: emptyBaseline,
    status: "processed" as const,
    updatedAt: "t0",
  };

  it("action 'validate' updates status to 'validated'", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({ responses: storedResponses });
    const res = await rPATCH(jsonReq({ action: "validate" }), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("validated");
    const saved = mockSaveState.mock.calls[0][1];
    expect(saved.responses.status).toBe("validated");
    expect(saved.responses.list).toEqual(storedResponses.list);
    expect(mockRunE4).not.toHaveBeenCalled();
  });

  it("action 'reprocess' re-runs phase 2 with revision notes", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({
      questionnaire: {
        sections: [
          {
            id: "A",
            title: "A",
            description: "",
            questions: [
              { id: "A1", section: "A", priority: "required", responseType: "text", text: "Q1" },
            ],
          },
        ],
        markdown: "",
        projectType: "general",
        status: "approved",
        updatedAt: "t0",
      },
      responses: storedResponses,
    });
    mockRunE4.mockResolvedValue({
      output: { engine: "e4", artifacts: { requirementsBaseline: "{}" }, warnings: [] },
      phase: "phase2",
      logs: [],
      phase2: {
        baselineRef: "{}",
        baseline: emptyBaseline,
        gaps: emptyGaps,
        responses: [
          { questionId: "A1", answer: "updated", confidence: 0.9, source: "free_text" },
        ],
        format: "preparsed",
        revisions: 1,
      },
    });

    const res = await rPATCH(
      jsonReq({ action: "reprocess", revisionNotes: "tighten SLOs" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.responses[0].answer).toBe("updated");
    expect(body.status).toBe("processed");
    expect(mockRunE4).toHaveBeenCalledTimes(1);
    const call = mockRunE4.mock.calls[0][0];
    expect(call.revisionNotes).toBe("tighten SLOs");
    expect(call.inputData.clientResponses).toEqual(storedResponses.list);
    expect(call.inputData.questions).toHaveLength(1);
  });

  it("action 'reprocess' without notes returns 400", async () => {
    mockResolve.mockResolvedValue(resolved);
    const res = await rPATCH(jsonReq({ action: "reprocess" }), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Validation failed/);
  });

  it("returns 400 on invalid action", async () => {
    mockResolve.mockResolvedValue(resolved);
    const res = await rPATCH(jsonReq({ action: "bogus" }), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when responses not yet processed", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({});
    const res = await rPATCH(jsonReq({ action: "validate" }), {
      params: { id: "intake-1" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when estimate does not exist", async () => {
    mockResolve.mockResolvedValue(null);
    const res = await rPATCH(jsonReq({ action: "validate" }), {
      params: { id: "missing" },
    });
    expect(res.status).toBe(404);
  });
});
