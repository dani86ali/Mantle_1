import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";

// The Anthropic SDK is never imported here: every behavior test injects a
// fake client through config.client, so no real client is constructed and
// the network is never reached. The adapter module is one of exactly three
// Project-chain modules allowed to import @anthropic-ai/sdk (the
// requirements adapter suite proves that three-file allowlist); the static
// source checks at the bottom of this suite prove this adapter's own
// import surface and purity.
import {
  createAnthropicRfpExtractionDeltaCandidateDraftingExecutor,
  type AnthropicRfpExtractionDeltaDraftingMessageRequest,
  type AnthropicRfpExtractionDeltaDraftingMessageResponse,
} from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting-anthropic";
import type {
  RfpExtractionDeltaCandidateDraftingExecutorInput,
} from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting";

const REQUEST_FAILED_MESSAGE =
  "RFP extraction delta candidate drafting request failed.";
const NO_TEXT_MESSAGE =
  "RFP extraction delta candidate drafting returned no text output.";
const INVALID_JSON_MESSAGE =
  "RFP extraction delta candidate drafting returned output that is not valid JSON.";

/** A full, valid whitelisted executor input exactly as the contract sends. */
const EXECUTOR_INPUT: RfpExtractionDeltaCandidateDraftingExecutorInput = {
  project: {
    id: "proj-rfp-1",
    name: "STC RFP Bid",
    customerName: "STC",
    mode: "rfp",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-02T11:30:00.000Z",
  },
  inputPackage: {
    id: "art-input-package-1",
    projectId: "proj-rfp-1",
    stageId: "intake_package_review",
    type: "input_package",
    status: "approved",
    version: 1,
    sourceFileIds: ["file-rfp-1", "file-sow-1"],
    sourceArtifactIds: [],
    createdAt: "2026-06-01T10:05:00.000Z",
    updatedAt: "2026-06-01T10:06:00.000Z",
  },
  requestedBy: "engineer@stc.example",
  inputPackageArtifactId: "art-input-package-1",
  sourceFileIds: ["file-rfp-1", "file-sow-1"],
  sourceArtifactIds: ["art-input-package-1"],
  evidence: [
    {
      evidenceId: "evidence-text-1",
      evidenceKind: "rfp_document_text_chunk",
      sourceFileId: "file-rfp-1",
      inputPackageArtifactId: "art-input-package-1",
      sourceFileName: "rfp.pdf",
      sourceFileRole: "rfp",
      chunkIndex: 1,
      chunkCount: 2,
      charCount: 44,
      text: "Contractor shall supply PoE access switches.",
    },
    {
      evidenceId: "evidence-table-1",
      evidenceKind: "rfp_document_table",
      sourceFileId: "file-sow-1",
      inputPackageArtifactId: "art-input-package-1",
      sourceFileName: "sow.xlsx",
      sourceFileRole: "sow",
      tableId: "file-sow-1:table:1",
      sheetName: "Scope",
      rowCount: 1,
      columnCount: 2,
      rows: [["item", "qty"]],
    },
  ],
};

/** Raw model output, including fields only the contract sanitizer may drop. */
const RAW_MODEL_OUTPUT = {
  candidates: [
    {
      kind: "missing_evidence",
      sourceFileId: "file-rfp-1",
      title: "UPS sizing table not extracted",
      description: "Chunk 1 cites a UPS sizing table with no table row.",
      severity: "warning",
      confidence: 0.8,
      rationale: "The chunk names a table no provided table entry contains.",
      evidenceIds: ["evidence-text-1"],
      proposedEvidence: {
        evidenceKind: "rfp_document_table",
        tableId: "file-rfp-1:table:9",
        rows: [["ups", "2"]],
      },
      reviewStatus: "model-asserted-review-status",
      unitPrice: 999,
    },
  ],
  modelCommentary: "unsanitized extra field the contract must drop later",
};

function textResponse(
  ...texts: string[]
): AnthropicRfpExtractionDeltaDraftingMessageResponse {
  return { content: texts.map((text) => ({ type: "text", text })) };
}

function makeClient(
  response: AnthropicRfpExtractionDeltaDraftingMessageResponse
) {
  const create = vi.fn(
    (request: AnthropicRfpExtractionDeltaDraftingMessageRequest) => {
      void request;
      return Promise.resolve(response);
    }
  );
  return { create, client: { messages: { create } } };
}

function makeRejectingClient(reason: unknown) {
  const create = vi.fn(
    (request: AnthropicRfpExtractionDeltaDraftingMessageRequest) => {
      void request;
      return Promise.reject(reason);
    }
  );
  return { create, client: { messages: { create } } };
}

describe("createAnthropicRfpExtractionDeltaCandidateDraftingExecutor - request shape", () => {
  it("calls messages.create once with the configured model, max_tokens, and temperature and no function-calling fields", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpExtractionDeltaCandidateDraftingExecutor(
      {
        apiKey: "test-api-key",
        model: "model-override-1",
        maxTokens: 2048,
        temperature: 0,
        client,
      }
    );

    await executor(EXECUTOR_INPUT);

    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0][0];
    expect(request.model).toBe("model-override-1");
    expect(request.max_tokens).toBe(2048);
    expect(request.temperature).toBe(0);
    // The whole request surface: nothing besides these five fields exists,
    // so no function-calling, provider-tool, or schema field is ever sent.
    expect(Object.keys(request).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "system",
      "temperature",
    ]);
    expect("tools" in request).toBe(false);
    expect("tool_choice" in request).toBe(false);
  });

  it("applies safe defaults: claude-opus-4-8, 16000 max tokens, and no temperature key at all", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpExtractionDeltaCandidateDraftingExecutor(
      { apiKey: "test-api-key", client }
    );

    await executor(EXECUTOR_INPUT);

    const request = create.mock.calls[0][0];
    expect(request.model).toBe("claude-opus-4-8");
    expect(request.max_tokens).toBe(16000);
    expect("temperature" in request).toBe(false);
    expect(Object.keys(request).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "system",
    ]);
  });

  it("sends a system instruction restricted to engineer-review delta candidates that forbids BoQ and every other authority", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpExtractionDeltaCandidateDraftingExecutor(
      { apiKey: "test-api-key", client }
    );

    await executor(EXECUTOR_INPUT);

    const system = create.mock.calls[0][0].system
      .replace(/\s+/g, " ")
      .toLowerCase();
    expect(system).toContain(
      "extraction delta candidates for engineer review only"
    );
    expect(system).toContain("only from the json evidence entries");
    expect(system).toContain("never invent facts");
    expect(system).toContain("never final authority");
    expect(system).toContain("do not process or infer from boq");
    expect(system).toContain("pricing");
    expect(system).toContain("sku selection or replacement");
    expect(system).toContain("catalog lookup");
    expect(system).toContain("product configuration");
    expect(system).toContain("validation of any kind");
    expect(system).toContain("compliance matrix");
    expect(system).toContain("hld or lld");
    expect(system).toContain("proposal writing");
    expect(system).toContain("export or document generation");
    expect(system).toContain("approvals");
    expect(system).toContain("strict json only");
    expect(system).toContain('{"candidates":[...]}');
    // The allowed candidate fields, aligned with the neutral contract.
    expect(system).toContain(
      "one of missing_evidence, incorrect_extraction, table_reconstruction, suspicious_item"
    );
    expect(system).toContain("sourcefileid");
    expect(system).toContain("title (required)");
    expect(system).toContain("description (required)");
    expect(system).toContain("severity (one of info, warning, blocking)");
    expect(system).toContain("confidence (a finite number between 0 and 1)");
    expect(system).toContain("rationale");
    expect(system).toContain("evidenceids");
    expect(system).toContain("proposedevidence");
    expect(system).toContain(
      "rfp_document_text_chunk or rfp_document_table"
    );
  });

  it("sends exactly one user turn whose content is the whitelisted executor input serialized verbatim", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpExtractionDeltaCandidateDraftingExecutor(
      { apiKey: "test-api-key", client }
    );

    await executor(EXECUTOR_INPUT);

    const request = create.mock.calls[0][0];
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe("user");
    const parsed = JSON.parse(request.messages[0].content) as Record<
      string,
      unknown
    >;
    expect(Object.keys(parsed).sort()).toEqual([
      "evidence",
      "inputPackage",
      "inputPackageArtifactId",
      "project",
      "requestedBy",
      "sourceArtifactIds",
      "sourceFileIds",
    ]);
    expect(parsed).toStrictEqual({
      project: EXECUTOR_INPUT.project,
      inputPackage: EXECUTOR_INPUT.inputPackage,
      requestedBy: EXECUTOR_INPUT.requestedBy,
      inputPackageArtifactId: EXECUTOR_INPUT.inputPackageArtifactId,
      sourceFileIds: EXECUTOR_INPUT.sourceFileIds,
      sourceArtifactIds: EXECUTOR_INPUT.sourceArtifactIds,
      evidence: EXECUTOR_INPUT.evidence,
    });
  });

  it("never forwards decoy authority or storage fields smuggled onto the input object", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpExtractionDeltaCandidateDraftingExecutor(
      { apiKey: "test-api-key", client }
    );
    const decoyInput = {
      ...EXECUTOR_INPUT,
      tenantId: "attacker-tenant",
      storagePath: "C:/secret-store/never-send.json",
      internalScratch: "ARBITRARY-CONTENT-VALUE",
      approval: { decision: "approved" },
      executor: "attacker-executor",
    } as unknown as RfpExtractionDeltaCandidateDraftingExecutorInput;

    await executor(decoyInput);

    const serialized = JSON.stringify(create.mock.calls[0][0]);
    expect(serialized).not.toContain("tenantId");
    expect(serialized).not.toContain("storagePath");
    expect(serialized).not.toContain("attacker");
    expect(serialized).not.toContain("secret-store");
    expect(serialized).not.toContain("ARBITRARY-CONTENT-VALUE");
  });

  it("builds the executor without calling the client; one create call per invocation afterwards", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpExtractionDeltaCandidateDraftingExecutor(
      { apiKey: "", client }
    );

    expect(create).not.toHaveBeenCalled();
    await executor(EXECUTOR_INPUT);
    await executor(EXECUTOR_INPUT);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws a fixed setup error when no client is injected and apiKey is blank", () => {
    expect(() =>
      createAnthropicRfpExtractionDeltaCandidateDraftingExecutor({
        apiKey: "   ",
      })
    ).toThrow(
      "A nonblank apiKey is required when no drafting client is injected."
    );
  });
});

describe("createAnthropicRfpExtractionDeltaCandidateDraftingExecutor - response handling", () => {
  it("returns the parsed JSON verbatim as unknown, leaving sanitization to the drafting contract", async () => {
    const { client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpExtractionDeltaCandidateDraftingExecutor(
      { apiKey: "test-api-key", client }
    );

    const output = await executor(EXECUTOR_INPUT);

    expect(output).toStrictEqual(RAW_MODEL_OUTPUT);
  });

  it("concatenates multiple text entries in order and ignores non-text entries", async () => {
    const serialized = JSON.stringify(RAW_MODEL_OUTPUT);
    const splitAt = 25;
    const { client } = makeClient({
      content: [
        { type: "thinking" },
        { type: "text", text: serialized.slice(0, splitAt) },
        { type: "thinking" },
        { type: "text", text: serialized.slice(splitAt) },
      ],
    });
    const executor = createAnthropicRfpExtractionDeltaCandidateDraftingExecutor(
      { apiKey: "test-api-key", client }
    );

    const output = await executor(EXECUTOR_INPUT);

    expect(output).toStrictEqual(RAW_MODEL_OUTPUT);
  });

  const NO_TEXT_CASES: Array<
    [string, AnthropicRfpExtractionDeltaDraftingMessageResponse]
  > = [
    ["an empty content array", { content: [] }],
    ["only non-text content entries", { content: [{ type: "thinking" }] }],
    ["only whitespace text", textResponse("   ", "\n\t")],
  ];

  it.each(NO_TEXT_CASES)(
    "rejects %s with the fixed generic no-text error",
    async (_label, response) => {
      const { client } = makeClient(response);
      const executor =
        createAnthropicRfpExtractionDeltaCandidateDraftingExecutor({
          apiKey: "test-api-key",
          client,
        });

      const error = await executor(EXECUTOR_INPUT).then(
        () => null,
        (caught: unknown) => caught
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(NO_TEXT_MESSAGE);
    }
  );

  it("rejects non-JSON text with the fixed generic parse error that never echoes the response", async () => {
    const { client } = makeClient(
      textResponse("SECRET-MODEL-PROSE: here is your answer, not JSON {")
    );
    const executor = createAnthropicRfpExtractionDeltaCandidateDraftingExecutor(
      { apiKey: "test-api-key", client }
    );

    const error = await executor(EXECUTOR_INPUT).then(
      () => null,
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(INVALID_JSON_MESSAGE);
    expect((error as Error).message).not.toContain("SECRET-MODEL-PROSE");
  });

  const PROVIDER_FAILURES: Array<[string, unknown]> = [
    [
      "an Error carrying provider detail",
      new Error("401 invalid x-api-key sk-ant-secret-key prompt dump"),
    ],
    ["a raw string rejection", "raw-provider-string-detail"],
  ];

  it.each(PROVIDER_FAILURES)(
    "maps %s to the fixed generic request error with no provider detail",
    async (_label, reason) => {
      const { client } = makeRejectingClient(reason);
      const executor =
        createAnthropicRfpExtractionDeltaCandidateDraftingExecutor({
          apiKey: "test-api-key",
          client,
        });

      const error = await executor(EXECUTOR_INPUT).then(
        () => null,
        (caught: unknown) => caught
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(REQUEST_FAILED_MESSAGE);
      expect((error as Error).message).not.toContain("sk-ant");
      expect((error as Error).message).not.toContain("401");
      expect((error as Error).message).not.toContain("raw-provider-string");
    }
  );
});

describe("Anthropic extraction delta drafting adapter module purity (static source check)", () => {
  const ADAPTER_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-extraction-delta-candidate-drafting-anthropic.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-extraction-delta-candidate-drafting-anthropic.test.ts"
  );
  const adapterSource = readFileSync(ADAPTER_PATH, "utf8");

  it("imports exactly the Anthropic SDK and the extraction delta drafting contract type, in that order", () => {
    const froms = Array.from(
      adapterSource.matchAll(/from\s+"([^"]+)"/g),
      (m) => m[1]
    );
    expect(froms).toEqual([
      "@anthropic-ai/sdk",
      "@/lib/projects/project-rfp-extraction-delta-candidate-drafting",
    ]);
    const importLines = adapterSource
      .split(/\r?\n/)
      .filter((line) => /^\s*import\b/.test(line));
    expect(importLines).toHaveLength(2);
    expect(importLines[0]).toMatch(
      /^import Anthropic from "@anthropic-ai\/sdk";$/
    );
    expect(importLines[1]).toMatch(/^import type \{/);
  });

  it("stays free of legacy AI/LLM/catalog/pricing/SKU/config/export/DB/route/UI imports, environment reads, persistence services, and network primitives", () => {
    for (const forbidden of [
      "process.env",
      "fetch(",
      "require(",
      "chat.completions",
      "tool_choice",
      'from "openai',
      "@google/generative-ai",
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/agent',
      'from "@/lib/adapters',
      'from "@/lib/catalog',
      'from "@/lib/db',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/middleware',
      'from "@/lib/validation',
      'from "@/lib/projects/pricing',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/files',
      'from "@/lib/projects/project-rfp-evidence-persistence',
      // The delta persistence service itself (exact module, closing quote:
      // the drafting-contract import legitimately shares this prefix).
      'from "@/lib/projects/project-rfp-extraction-delta"',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/components',
      'from "@/app/',
      'from "next',
      'from "react',
      "node:fs",
      "node:path",
    ]) {
      expect(adapterSource).not.toContain(forbidden);
    }
    expect(/generateText\s*\(/.test(adapterSource)).toBe(false);
    expect(/generateObject\s*\(/.test(adapterSource)).toBe(false);
    // No request-level function-calling field is even spelled in the source.
    expect(/\btools\s*:/.test(adapterSource)).toBe(false);
  });

  it("keeps the adapter and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(adapterSource)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
