import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createOpenAiRfpHldDesignModelReviewExecutor,
  type OpenAiRfpHldDesignModelReviewClient,
  type OpenAiRfpHldDesignModelReviewRequest,
  type OpenAiRfpHldDesignModelReviewResponse,
} from "@/lib/projects/project-rfp-hld-design-model-openai-review-openai";
import type { RfpHldDesignModelOpenAiReviewInput } from "@/lib/projects/project-rfp-hld-design-model-openai-review-executor";
import { RFP_HLD_DESIGN_MODEL_OPENAI_REVIEW_SYSTEM_PROMPT } from "@/lib/projects/project-rfp-hld-design-model-openai-review-prompt";
import type { RfpHldDesignModelPayload } from "@/lib/projects/project-rfp-hld-design-model";
import type { RfpHldSourceBundlePayload } from "@/lib/projects/project-rfp-hld-source-bundle";

const MODEL = "gpt-x-review";

function reviewInput(): RfpHldDesignModelOpenAiReviewInput {
  return {
    model: {
      id: "hdm-1",
      version: 1,
      payload: {
        coveredDomains: ["campus_switching"],
        excludedDomains: [],
        sourceReferences: [],
        assumptionRefs: [],
        constraintRefs: [],
        designSections: [],
        topology: { nodes: [], links: [], zones: [] },
        diagramIntents: [],
        traceability: {
          requirementRefs: [],
          complianceRefs: [],
          configurationRefs: [],
          sourceBundleRefs: [],
        },
        validationFindings: [],
      } as unknown as RfpHldDesignModelPayload,
    },
    sourceBundle: {
      id: "hsb-1",
      version: 1,
      payload: {
        coveredDomains: ["campus_switching"],
        excludedDomains: [],
        missingDomains: [],
        assumptions: [],
        constraints: [],
        warnings: [],
        blockers: [],
        designKnowledgePackRefs: [],
      } as unknown as RfpHldSourceBundlePayload,
    },
    reviewedBy: "u-1",
    reviewedAt: "2026-06-26T00:00:00.000Z",
  };
}

function clientCapturing(
  response: OpenAiRfpHldDesignModelReviewResponse,
  captured: { request?: OpenAiRfpHldDesignModelReviewRequest }
): OpenAiRfpHldDesignModelReviewClient {
  return {
    responses: {
      create: vi.fn(async (request: OpenAiRfpHldDesignModelReviewRequest) => {
        captured.request = request;
        return response;
      }),
    },
  };
}

describe("createOpenAiRfpHldDesignModelReviewExecutor - construction", () => {
  it("throws a fixed error for a blank model", () => {
    expect(() =>
      createOpenAiRfpHldDesignModelReviewExecutor({ model: "  " })
    ).toThrow("A nonblank model is required to build the review executor.");
  });

  it("throws a fixed setup error when no client is injected", () => {
    expect(() =>
      createOpenAiRfpHldDesignModelReviewExecutor({ model: MODEL })
    ).toThrow("A live review client must be injected; client wiring is not configured for this stage.");
  });
});

describe("createOpenAiRfpHldDesignModelReviewExecutor - request/response", () => {
  it("sends exactly model/instructions/input plus the optional tuning fields", async () => {
    const captured: { request?: OpenAiRfpHldDesignModelReviewRequest } = {};
    const client = clientCapturing({ output_text: '{"findings":[]}' }, captured);
    const executor = createOpenAiRfpHldDesignModelReviewExecutor({
      model: MODEL,
      client,
      maxOutputTokens: 512,
      temperature: 0.1,
    });

    await executor({ reviewInput: reviewInput() });

    const request = captured.request;
    if (request === undefined) throw new Error("no request captured");
    expect(Object.keys(request).sort()).toEqual(
      ["input", "instructions", "max_output_tokens", "model", "temperature"].sort()
    );
    expect(request.model).toBe(MODEL);
    expect(request.instructions).toBe(RFP_HLD_DESIGN_MODEL_OPENAI_REVIEW_SYSTEM_PROMPT);
    expect(request.max_output_tokens).toBe(512);
    expect(request.temperature).toBe(0.1);
    expect(JSON.parse(request.input)).toMatchObject({ reviewedBy: "u-1" });
  });

  it("omits the optional tuning fields when not configured", async () => {
    const captured: { request?: OpenAiRfpHldDesignModelReviewRequest } = {};
    const client = clientCapturing({ output_text: '{"findings":[]}' }, captured);
    const executor = createOpenAiRfpHldDesignModelReviewExecutor({ model: MODEL, client });
    await executor({ reviewInput: reviewInput() });
    expect(Object.keys(captured.request ?? {}).sort()).toEqual(["input", "instructions", "model"]);
  });

  it("parses output_text JSON and returns the parsed candidate", async () => {
    const captured: { request?: OpenAiRfpHldDesignModelReviewRequest } = {};
    const client = clientCapturing(
      { output_text: '{"findings":[{"severity":"warning"}]}' },
      captured
    );
    const executor = createOpenAiRfpHldDesignModelReviewExecutor({ model: MODEL, client });
    const parsed = await executor({ reviewInput: reviewInput() });
    expect(parsed).toEqual({ findings: [{ severity: "warning" }] });
  });

  it("concatenates output text blocks in order", async () => {
    const captured: { request?: OpenAiRfpHldDesignModelReviewRequest } = {};
    const client = clientCapturing(
      {
        output: [
          { content: [{ type: "text", text: '{"find' }, { type: "reasoning", text: "IGNORED" }] },
          { content: [{ type: "text", text: 'ings":[]}' }] },
        ],
      },
      captured
    );
    const executor = createOpenAiRfpHldDesignModelReviewExecutor({ model: MODEL, client });
    expect(await executor({ reviewInput: reviewInput() })).toEqual({ findings: [] });
  });

  it("throws a fixed generic error when the client call fails (no leakage)", async () => {
    const client: OpenAiRfpHldDesignModelReviewClient = {
      responses: {
        create: vi.fn(async () => {
          throw new Error("SECRET api key 12345");
        }),
      },
    };
    const executor = createOpenAiRfpHldDesignModelReviewExecutor({ model: MODEL, client });
    await expect(executor({ reviewInput: reviewInput() })).rejects.toThrow(
      "RFP HLD design-model quality-review request failed."
    );
    await expect(executor({ reviewInput: reviewInput() })).rejects.not.toThrow(/SECRET/);
  });

  it("throws fixed errors for empty and non-JSON output", async () => {
    const captured: { request?: OpenAiRfpHldDesignModelReviewRequest } = {};
    const emptyExecutor = createOpenAiRfpHldDesignModelReviewExecutor({
      model: MODEL,
      client: clientCapturing({ output_text: "   " }, captured),
    });
    await expect(emptyExecutor({ reviewInput: reviewInput() })).rejects.toThrow(
      "RFP HLD design-model quality-review returned no text output."
    );

    const badJsonExecutor = createOpenAiRfpHldDesignModelReviewExecutor({
      model: MODEL,
      client: clientCapturing({ output_text: "not json" }, captured),
    });
    await expect(badJsonExecutor({ reviewInput: reviewInput() })).rejects.toThrow(
      "RFP HLD design-model quality-review returned output that is not valid JSON."
    );
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-openai-review-openai.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the executor contract and the prompt helper", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-hld-design-model-openai-review-executor",
      "@/lib/projects/project-rfp-hld-design-model-openai-review-prompt",
    ]);
  });

  it("wires no provider SDK, fetch, env, or store", () => {
    for (const forbidden of [
      'from "openai"',
      "@anthropic-ai",
      "fetch(",
      "process.env",
      "@/lib/db/",
    ]) {
      expect(source, `forbidden: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keeps the source ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
