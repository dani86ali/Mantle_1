import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";

import {
  draftRfpHldIntakeQuestionnaireCandidate,
  getConfiguredRfpHldIntakeQuestionnaireDraftingExecutor,
  type RfpHldIntakeQuestionnaireDraftingExecutor,
  type RfpHldIntakeQuestionnaireDraftingExecutorInput,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-executor";
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_INPUT_PAYLOAD_KIND,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_TARGET_PAYLOAD_KIND,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_CANDIDATE_ONLY,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_FORBIDDEN,
  type RfpHldIntakeQuestionnaireDraftingInput,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-input";
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
  validateRfpHldIntakeQuestionnairePayload,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire";

function makeInput(): RfpHldIntakeQuestionnaireDraftingInput {
  return {
    payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_INPUT_PAYLOAD_KIND,
    createdBy: "engineer-1",
    createdAt: "2026-06-30T00:00:00.000Z",
    sourceArtifactIds: ["art-source-bundle-1"],
    sourceRefs: [
      {
        refId: "ref-1",
        artifactId: "art-source-bundle-1",
        artifactType: "hld_source_bundle",
        stageId: "hld_source_bundle_review",
        status: "approved",
        version: 2,
        payloadKind: "rfp_hld_source_bundle",
        label: "Source bundle",
      },
    ],
    designKnowledgePackContents: [],
    instructions: {
      candidateOnly: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_CANDIDATE_ONLY,
      targetPayloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_TARGET_PAYLOAD_KIND,
      forbidden: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_FORBIDDEN.slice(),
    },
  };
}

function validQuestion(): Record<string, unknown> {
  return {
    questionId: "q-1",
    order: 1,
    domain: "campus_switching",
    questionText: "How many access-layer switches per closet are required?",
    whyAsked: "Sizes the campus access layer.",
    answerType: "free_text",
    required: true,
    sourceRefIds: ["ref-1"],
  };
}

function executorOf(
  output: unknown
): RfpHldIntakeQuestionnaireDraftingExecutor {
  return async () => output;
}

describe("draftRfpHldIntakeQuestionnaireCandidate - availability", () => {
  it("returns unavailable when no executor is supplied (null)", async () => {
    const result = await draftRfpHldIntakeQuestionnaireCandidate({
      draftingInput: makeInput(),
      executor: null,
    });
    expect(result).toStrictEqual({ status: "unavailable" });
  });

  it("returns unavailable when the executor is absent (undefined)", async () => {
    const result = await draftRfpHldIntakeQuestionnaireCandidate({
      draftingInput: makeInput(),
    });
    expect(result).toStrictEqual({ status: "unavailable" });
  });

  it("does not inspect the drafting input when unavailable", async () => {
    const trap = new Proxy(
      {},
      {
        get() {
          throw new Error("drafting input must not be inspected when unavailable");
        },
      }
    ) as unknown as RfpHldIntakeQuestionnaireDraftingInput;

    const result = await draftRfpHldIntakeQuestionnaireCandidate({
      draftingInput: trap,
      executor: null,
    });
    expect(result).toStrictEqual({ status: "unavailable" });
  });
});

describe("draftRfpHldIntakeQuestionnaireCandidate - executor invocation", () => {
  it("passes exactly one key, draftingInput, and the same bundle reference", async () => {
    const bundle = makeInput();
    let received: RfpHldIntakeQuestionnaireDraftingExecutorInput | undefined;
    const executor: RfpHldIntakeQuestionnaireDraftingExecutor = vi.fn(
      async (inp) => {
        received = inp;
        return { questions: [validQuestion()] };
      }
    );

    await draftRfpHldIntakeQuestionnaireCandidate({
      draftingInput: bundle,
      executor,
    });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(Object.keys(received as object)).toEqual(["draftingInput"]);
    expect(
      (received as RfpHldIntakeQuestionnaireDraftingExecutorInput).draftingInput
    ).toBe(bundle);
  });
});

describe("draftRfpHldIntakeQuestionnaireCandidate - valid candidate output", () => {
  it("wraps questions into a full hld_intake_questionnaire that passes the Stage 6H-0B validator", async () => {
    const input = makeInput();
    const result = await draftRfpHldIntakeQuestionnaireCandidate({
      draftingInput: input,
      executor: executorOf({ questions: [validQuestion()] }),
    });

    expect(result.status).toBe("drafted");
    if (result.status !== "drafted") throw new Error("expected drafted");
    const q = result.questionnaire;
    expect(q.payloadKind).toBe(RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND);
    expect(q.createdBy).toBe(input.createdBy);
    expect(q.createdAt).toBe(input.createdAt);
    expect(q.sourceArtifactIds).toEqual(input.sourceArtifactIds);
    // The embedded self-assessment is stamped by this boundary alone.
    expect(q.validation).toEqual({
      status: "passed",
      checkedAt: input.createdAt,
      findingCount: 0,
      findings: [],
    });
    expect(validateRfpHldIntakeQuestionnairePayload(q).valid).toBe(true);
  });
});

describe("draftRfpHldIntakeQuestionnaireCandidate - invalid candidate output", () => {
  const CASES: Array<[string, unknown]> = [
    ["a non-object output", 42],
    ["extra top-level keys", { questions: [validQuestion()], extra: "x" }],
    ["an answers key alongside questions", { questions: [validQuestion()], answers: [] }],
    ["an AI-supplied validation", { questions: [validQuestion()], validation: {} }],
    [
      "a provider/raw response echo",
      { questions: [validQuestion()], rawResponse: { secret: "PROVIDER-LEAK" } },
    ],
    [
      "an embedded answer inside a question",
      { questions: [{ ...validQuestion(), answer: "smuggled" }] },
    ],
    [
      "an embedded pricing decision",
      { questions: [{ ...validQuestion(), pricing: 1234 }] },
    ],
    [
      "an embedded SKU decision",
      { questions: [{ ...validQuestion(), sku: "C9300-ATTACKER" }] },
    ],
    [
      "final-authority content in a question",
      { questions: [{ ...validQuestion(), whyAsked: "asserts final authority" }] },
    ],
    ["an invalid question shape", { questions: [{ questionId: "" }] }],
  ];

  it.each(CASES)(
    "returns invalid_candidate_output for %s with deterministic errors only",
    async (_label, output) => {
      const result = await draftRfpHldIntakeQuestionnaireCandidate({
        draftingInput: makeInput(),
        executor: executorOf(output),
      });

      expect(result.status).toBe("invalid_candidate_output");
      if (result.status !== "invalid_candidate_output") {
        throw new Error("expected invalid_candidate_output");
      }
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      for (const e of result.errors) expect(typeof e).toBe("string");
      // The raw provider output is never echoed back in the errors.
      expect(JSON.stringify(result)).not.toContain("PROVIDER-LEAK");
    }
  );
});

describe("draftRfpHldIntakeQuestionnaireCandidate - executor failure", () => {
  it("returns drafting_failed without leaking thrown detail", async () => {
    const executor: RfpHldIntakeQuestionnaireDraftingExecutor = async () => {
      throw new Error("PROVIDER-SECRET-401 sk-secret prompt dump");
    };

    const result = await draftRfpHldIntakeQuestionnaireCandidate({
      draftingInput: makeInput(),
      executor,
    });

    expect(result).toStrictEqual({
      status: "drafting_failed",
      error: "questionnaire_drafting_failed",
    });
    expect(JSON.stringify(result)).not.toContain("PROVIDER-SECRET");
    expect(JSON.stringify(result)).not.toContain("sk-secret");
  });
});

describe("getConfiguredRfpHldIntakeQuestionnaireDraftingExecutor", () => {
  it("returns null (this stage makes no live OpenAI decision)", () => {
    expect(getConfiguredRfpHldIntakeQuestionnaireDraftingExecutor()).toBeNull();
  });
});

describe("HLD intake-question drafting executor boundary purity (static source check)", () => {
  const SOURCE_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-intake-questionnaire-drafting-executor.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-intake-questionnaire-drafting-executor.test.ts"
  );
  const source = readFileSync(SOURCE_PATH, "utf8");

  it("imports exactly the drafting-input type and the persisted questionnaire contract", () => {
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    expect(importLines).toHaveLength(2);
    expect(importLines[0]).toMatch(/^import type \{/);
    expect(importLines[1]).toMatch(/^import \{/);
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-input",
      "@/lib/projects/project-rfp-hld-intake-questionnaire",
    ]);
  });

  it("imports no provider SDK, store, raw-document, route, or UI module and reads no env", () => {
    for (const forbidden of [
      "@anthropic-ai",
      "@google/generative-ai",
      'from "openai',
      "langchain",
      "process.env",
      "fetch(",
      "require(",
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/agent',
      'from "@/lib/adapters',
      'from "@/lib/catalog',
      'from "@/lib/db',
      'from "@/lib/export',
      'from "@/lib/projects/pricing',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/files',
      "artifact-store",
      "project-file-store",
      "evidence-persistence",
      'from "@/coordinator',
      'from "@/engines',
      'from "@/components',
      'from "@/app/',
      'from "next',
      'from "react',
      "node:fs",
      "node:path",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
