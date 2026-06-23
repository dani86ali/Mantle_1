import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";

// The Anthropic SDK is never imported here: every behavior test injects a
// fake client through config.client, so no real client is constructed and
// the network is never reached. The adapter module is one of exactly three
// Project-chain modules allowed to import @anthropic-ai/sdk (the others are
// the requirements and extraction-delta drafting adapters), proven by the
// static source checks at the bottom of this suite.
import {
  createAnthropicRfpComplianceMatrixDraftingExecutor,
  type AnthropicRfpComplianceMatrixDraftingMessageRequest,
  type AnthropicRfpComplianceMatrixDraftingMessageResponse,
} from "@/lib/projects/project-rfp-compliance-matrix-drafting-anthropic";
import type { RfpComplianceMatrixDraftingExecutorInput } from "@/lib/projects/project-rfp-compliance-matrix-drafting";

const REQUEST_FAILED_MESSAGE =
  "RFP compliance matrix drafting request failed.";
const NO_TEXT_MESSAGE =
  "RFP compliance matrix drafting returned no text output.";
const INVALID_JSON_MESSAGE =
  "RFP compliance matrix drafting returned output that is not valid JSON.";

/** A full, valid whitelisted executor input (with config) as the contract sends. */
const EXECUTOR_INPUT: RfpComplianceMatrixDraftingExecutorInput = {
  project: {
    id: "proj-rfp-1",
    name: "STC RFP Bid",
    customerName: "STC",
    mode: "rfp",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-02T11:30:00.000Z",
  },
  requirementsBaseline: {
    id: "art-requirements-baseline-1",
    projectId: "proj-rfp-1",
    stageId: "requirements_baseline_review",
    type: "requirements_baseline",
    status: "approved",
    version: 1,
    sourceFileIds: ["file-rfp-1"],
    sourceArtifactIds: ["art-evidence-package-1"],
    createdAt: "2026-06-01T10:05:00.000Z",
    updatedAt: "2026-06-01T10:06:00.000Z",
  },
  evidencePackage: {
    id: "art-evidence-package-1",
    projectId: "proj-rfp-1",
    stageId: "intake_package_review",
    type: "evidence_package",
    status: "approved",
    version: 1,
    sourceFileIds: ["file-rfp-1", "file-boq-1"],
    sourceArtifactIds: ["art-input-package-1"],
    createdAt: "2026-06-01T10:05:00.000Z",
    updatedAt: "2026-06-01T10:06:00.000Z",
  },
  configurationExpansion: {
    id: "art-config-expansion-1",
    projectId: "proj-rfp-1",
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "approved",
    version: 1,
    sourceFileIds: ["file-boq-1"],
    sourceArtifactIds: ["art-priced-boq-1"],
    createdAt: "2026-06-01T10:05:00.000Z",
    updatedAt: "2026-06-01T10:06:00.000Z",
  },
  requirements: [
    {
      id: "RFP-REQ-001",
      text: "Contractor shall supply PoE access switches.",
      category: "technical",
      priority: "mandatory",
      title: "PoE access switches",
      notes: "From the RFP scope text.",
      evidenceReferences: [
        {
          evidenceId: "evidence-text-1",
          sourceFileId: "file-rfp-1",
          evidenceKind: "rfp_document_text_chunk",
          inputPackageArtifactId: "art-input-package-1",
          chunkIndex: 1,
          chunkCount: 2,
          charCount: 44,
        },
      ],
    },
  ],
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
      sourceFileId: "file-boq-1",
      inputPackageArtifactId: "art-input-package-1",
      tableId: "file-boq-1:table:1",
      rowCount: 1,
      columnCount: 2,
      rows: [["item", "qty"]],
    },
  ],
  configurationLines: [
    {
      lineId: "line-1",
      origin: "customer",
      sku: "C9300-48P",
      description: "48-port PoE+ access switch",
    },
  ],
  requestedBy: "engineer@stc.example",
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: [
    "art-requirements-baseline-1",
    "art-evidence-package-1",
    "art-config-expansion-1",
  ],
};

/**
 * The same input with the configuration fields absent. This is NOT a
 * production-ready generation path: Stage 5A made the approved configuration
 * gate non-optional, so the service never invokes the executor without a
 * gate-authorized configuration artifact (approved configuration_expansion
 * for BoQ projects, or an approved no-BoQ/service-only exception). This
 * fixture exists only to prove the executor's serializer defensively drops
 * absent optional fields; it does not imply generation may omit the gate.
 */
const EXECUTOR_INPUT_NO_CONFIG: RfpComplianceMatrixDraftingExecutorInput = {
  project: EXECUTOR_INPUT.project,
  requirementsBaseline: EXECUTOR_INPUT.requirementsBaseline,
  evidencePackage: EXECUTOR_INPUT.evidencePackage,
  requirements: EXECUTOR_INPUT.requirements,
  evidence: EXECUTOR_INPUT.evidence,
  requestedBy: EXECUTOR_INPUT.requestedBy,
  sourceFileIds: EXECUTOR_INPUT.sourceFileIds,
  sourceArtifactIds: ["art-requirements-baseline-1", "art-evidence-package-1"],
};

/** Raw model output, including fields only the contract sanitizer may drop. */
const RAW_MODEL_OUTPUT = {
  rows: [
    {
      requirementId: "RFP-REQ-001",
      response: "The proposed design supplies PoE access switches per the BoQ.",
      rationale: "Maps requirement RFP-REQ-001 to the cited evidence chunk.",
      notes: "Confirm port counts during review.",
      evidenceIds: ["evidence-text-1"],
      configurationLineIds: ["line-1"],
      complianceStatus: "model-asserted-status",
      unitPrice: 999,
    },
  ],
  modelCommentary: "unsanitized extra field the contract must drop later",
};

function textResponse(
  ...texts: string[]
): AnthropicRfpComplianceMatrixDraftingMessageResponse {
  return { content: texts.map((text) => ({ type: "text", text })) };
}

function makeClient(
  response: AnthropicRfpComplianceMatrixDraftingMessageResponse
) {
  const create = vi.fn(
    (request: AnthropicRfpComplianceMatrixDraftingMessageRequest) => {
      void request;
      return Promise.resolve(response);
    }
  );
  return { create, client: { messages: { create } } };
}

function makeRejectingClient(reason: unknown) {
  const create = vi.fn(
    (request: AnthropicRfpComplianceMatrixDraftingMessageRequest) => {
      void request;
      return Promise.reject(reason);
    }
  );
  return { create, client: { messages: { create } } };
}

describe("createAnthropicRfpComplianceMatrixDraftingExecutor - request shape", () => {
  it("calls messages.create once with the configured model, max_tokens, and temperature and no function-calling fields", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
      apiKey: "test-api-key",
      model: "model-override-1",
      maxTokens: 2048,
      temperature: 0,
      client,
    });

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
    const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });

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

  it("omits temperature when it is configured as a non-finite value", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
      apiKey: "test-api-key",
      temperature: Number.NaN,
      client,
    });

    await executor(EXECUTOR_INPUT);

    expect("temperature" in create.mock.calls[0][0]).toBe(false);
  });

  it("sends a system instruction restricted to candidate compliance rows from the approved artifacts that forbids every authority", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });

    await executor(EXECUTOR_INPUT);

    const system = create.mock.calls[0][0].system
      .replace(/\s+/g, " ")
      .toLowerCase();

    // (1) Drafts only from the approved baseline, evidence, and the approved
    // configuration gate artifact/lines the service supplies. Stage 5A made
    // the configuration gate non-optional, so the stale "optional
    // configuration_expansion" wording must be gone.
    expect(system).toContain("only from the approved requirements_baseline");
    expect(system).toContain("approved evidence_package");
    expect(system).toContain("approved configuration gate artifact");
    expect(system).not.toContain("optional approved configuration_expansion");
    expect(system).not.toContain("optional configuration_expansion");
    expect(system).toContain("never invent facts");
    expect(system).toContain("exactly one row per approved baseline requirement");
    expect(system).toContain(
      "copy every requirementid, evidenceid, and configurationlineid exactly"
    );

    // (2) No authority of any kind; the model never decides compliance.
    expect(system).toContain("no authority");
    expect(system).toContain("make no business decisions");
    expect(system).toContain("approve anything");
    expect(system).toContain("final compliance decision");
    expect(system).toContain("comply or not-comply status");
    expect(system).toContain(
      "legal, commercial, local-content, safety, or insurance determination"
    );
    expect(system).toContain("pricing");
    expect(system).toContain("sku selection or replacement");
    expect(system).toContain("catalog lookup");
    expect(system).toContain("product configuration decisions");
    expect(system).toContain("hld, lld, tp, or proposal authority");
    expect(system).toContain("export or document generation");
    expect(system).toContain("validation of any kind");

    // (3) Authority-owner rows are flagged for human review, not declared met.
    expect(system).toContain("requiring review by the right human owner");
    expect(system).toContain("never as satisfied by technical design");
    expect(system).toContain("unapproved draft");
    expect(system).toContain("human-reviewed");
    expect(system).toContain("human-approved");

    // (4) Strict JSON shape; the neutral sanitizer (not the model) owns status.
    expect(system).toContain("strict json only");
    expect(system).toContain('{"rows":[...]}');
    expect(system).toContain("requirementid (required");
    expect(system).toContain("response");
    expect(system).toContain("rationale");
    expect(system).toContain("notes");
    expect(system).toContain("evidenceids");
    expect(system).toContain("configurationlineids");
    expect(system).toContain(
      "do not include a compliancestatus, status, approval"
    );
    expect(system).toContain("needs_review");
  });

  it("sends exactly one user turn whose content is the whitelisted executor input serialized verbatim", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });

    await executor(EXECUTOR_INPUT);

    const request = create.mock.calls[0][0];
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe("user");
    const parsed = JSON.parse(request.messages[0].content) as Record<
      string,
      unknown
    >;
    expect(Object.keys(parsed).sort()).toEqual([
      "configurationExpansion",
      "configurationLines",
      "evidence",
      "evidencePackage",
      "project",
      "requestedBy",
      "requirements",
      "requirementsBaseline",
      "sourceArtifactIds",
      "sourceFileIds",
    ]);
    expect(parsed).toStrictEqual({
      project: EXECUTOR_INPUT.project,
      requirementsBaseline: EXECUTOR_INPUT.requirementsBaseline,
      evidencePackage: EXECUTOR_INPUT.evidencePackage,
      configurationExpansion: EXECUTOR_INPUT.configurationExpansion,
      requirements: EXECUTOR_INPUT.requirements,
      evidence: EXECUTOR_INPUT.evidence,
      configurationLines: EXECUTOR_INPUT.configurationLines,
      requestedBy: EXECUTOR_INPUT.requestedBy,
      sourceFileIds: EXECUTOR_INPUT.sourceFileIds,
      sourceArtifactIds: EXECUTOR_INPUT.sourceArtifactIds,
    });
  });

  // Defensive serializer fallback ONLY - generation requires the configuration
  // gate (see EXECUTOR_INPUT_NO_CONFIG); this proves absent optional fields are
  // dropped, not that the gate may be skipped.
  it("serializer fallback: drops the optional configuration fields when the service omits them", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });

    await executor(EXECUTOR_INPUT_NO_CONFIG);

    const parsed = JSON.parse(create.mock.calls[0][0].messages[0].content) as Record<
      string,
      unknown
    >;
    expect(Object.keys(parsed).sort()).toEqual([
      "evidence",
      "evidencePackage",
      "project",
      "requestedBy",
      "requirements",
      "requirementsBaseline",
      "sourceArtifactIds",
      "sourceFileIds",
    ]);
    expect("configurationExpansion" in parsed).toBe(false);
    expect("configurationLines" in parsed).toBe(false);
    expect(parsed).toStrictEqual({
      project: EXECUTOR_INPUT_NO_CONFIG.project,
      requirementsBaseline: EXECUTOR_INPUT_NO_CONFIG.requirementsBaseline,
      evidencePackage: EXECUTOR_INPUT_NO_CONFIG.evidencePackage,
      requirements: EXECUTOR_INPUT_NO_CONFIG.requirements,
      evidence: EXECUTOR_INPUT_NO_CONFIG.evidence,
      requestedBy: EXECUTOR_INPUT_NO_CONFIG.requestedBy,
      sourceFileIds: EXECUTOR_INPUT_NO_CONFIG.sourceFileIds,
      sourceArtifactIds: EXECUTOR_INPUT_NO_CONFIG.sourceArtifactIds,
    });
  });

  it("never forwards decoy authority, storage, or pricing fields smuggled onto the input object", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });
    const decoyInput = {
      ...EXECUTOR_INPUT,
      tenantId: "attacker-tenant",
      storagePath: "C:/secret-store/never-send.json",
      internalScratch: "ARBITRARY-CONTENT-VALUE",
      approval: { decision: "approved" },
      unitPrice: 1234,
      catalogLookup: { sku: "ATTACKER-SKU-9000" },
      executor: "attacker-executor",
    } as unknown as RfpComplianceMatrixDraftingExecutorInput;

    await executor(decoyInput);

    const serialized = JSON.stringify(create.mock.calls[0][0]);
    expect(serialized).not.toContain("tenantId");
    expect(serialized).not.toContain("storagePath");
    expect(serialized).not.toContain("attacker");
    expect(serialized).not.toContain("secret-store");
    expect(serialized).not.toContain("ARBITRARY-CONTENT-VALUE");
    expect(serialized).not.toContain("unitPrice");
    expect(serialized).not.toContain("catalogLookup");
    expect(serialized).not.toContain("ATTACKER-SKU-9000");
  });

  it("builds the executor without calling the client; one create call per invocation afterwards", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
      apiKey: "",
      client,
    });

    expect(create).not.toHaveBeenCalled();
    await executor(EXECUTOR_INPUT);
    await executor(EXECUTOR_INPUT);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws a fixed setup error when no client is injected and apiKey is blank", () => {
    expect(() =>
      createAnthropicRfpComplianceMatrixDraftingExecutor({ apiKey: "   " })
    ).toThrow(
      "A nonblank apiKey is required when no drafting client is injected."
    );
  });
});

describe("createAnthropicRfpComplianceMatrixDraftingExecutor - response handling", () => {
  it("returns the parsed JSON verbatim as unknown, leaving sanitization to the drafting contract", async () => {
    const { client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });

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
    const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });

    const output = await executor(EXECUTOR_INPUT);

    expect(output).toStrictEqual(RAW_MODEL_OUTPUT);
  });

  const NO_TEXT_CASES: Array<
    [string, AnthropicRfpComplianceMatrixDraftingMessageResponse]
  > = [
    ["an empty content array", { content: [] }],
    ["only non-text content entries", { content: [{ type: "thinking" }] }],
    ["only whitespace text", textResponse("   ", "\n\t")],
  ];

  it.each(NO_TEXT_CASES)(
    "rejects %s with the fixed generic no-text error",
    async (_label, response) => {
      const { client } = makeClient(response);
      const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
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
    const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });

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
      const executor = createAnthropicRfpComplianceMatrixDraftingExecutor({
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

describe("Anthropic compliance-matrix drafting adapter module purity (static source check)", () => {
  const ADAPTER_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compliance-matrix-drafting-anthropic.ts"
  );
  const REQUIREMENTS_ADAPTER_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-requirements-candidate-drafting-anthropic.ts"
  );
  const EXTRACTION_DELTA_ADAPTER_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-extraction-delta-candidate-drafting-anthropic.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-compliance-matrix-drafting-anthropic.test.ts"
  );
  const adapterSource = readFileSync(ADAPTER_PATH, "utf8");

  function listSourceFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...listSourceFiles(fullPath));
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it("imports exactly the Anthropic SDK and the compliance-matrix drafting contract type, in that order", () => {
    const froms = Array.from(
      adapterSource.matchAll(/from\s+"([^"]+)"/g),
      (m) => m[1]
    );
    expect(froms).toEqual([
      "@anthropic-ai/sdk",
      "@/lib/projects/project-rfp-compliance-matrix-drafting",
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

  it("limits Project-chain (src/lib/projects, src/app) @anthropic-ai/sdk imports to exactly the three approved drafting adapters", () => {
    // Legacy frozen modules outside the Project chain (src/lib/ai, src/lib/llm,
    // src/lib/agent) keep their own SDK imports and are out of scope here.
    const sdkImport = /from\s+["']@anthropic-ai\/sdk["']/;
    const offenders: string[] = [];
    for (const root of ["src/lib/projects", "src/app"]) {
      for (const file of listSourceFiles(join(process.cwd(), root))) {
        if (sdkImport.test(readFileSync(file, "utf8"))) {
          offenders.push(file);
        }
      }
    }
    expect(offenders.sort()).toEqual(
      [
        REQUIREMENTS_ADAPTER_PATH,
        EXTRACTION_DELTA_ADAPTER_PATH,
        ADAPTER_PATH,
      ].sort()
    );
  });

  it("stays free of legacy AI/LLM/catalog/pricing/SKU/config/export/DB/route/UI imports, environment reads, and network primitives", () => {
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
      // The compliance-matrix generation, draft, and payload modules (exact
      // modules, closing quote: the drafting-contract import legitimately
      // shares the project-rfp-compliance-matrix prefix).
      'from "@/lib/projects/project-rfp-compliance-matrix-generation',
      'from "@/lib/projects/project-rfp-compliance-matrix-draft"',
      'from "@/lib/projects/project-rfp-compliance-matrix"',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/components',
      'from "@/app/',
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
