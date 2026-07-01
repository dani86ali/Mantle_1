import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
  validateRfpHldDesignModelRebuildRequestPayload,
  isValidRfpHldDesignModelRebuildRequestPayload,
  type RfpHldDesignModelRebuildRequestPayload,
} from "@/lib/projects/project-rfp-hld-design-model-rebuild-request";

const REQUESTED_AT = "2026-06-24T00:00:00.000Z";
const MODEL_ID = "hdm-1";
const REVIEW_ID = "hdmr-1";

function validPayload(): RfpHldDesignModelRebuildRequestPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
    sourceArtifactIds: [MODEL_ID, REVIEW_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceReviewArtifactId: REVIEW_ID,
    requestedBy: "eng-1",
    requestedAt: REQUESTED_AT,
    reason: "The advisory review flagged source-alignment findings to resolve.",
    instructions:
      "Redraft the model from the same approved source artifacts. Fix only the " +
      "listed findings. Do not add scope and stay within approved source artifacts.",
    status: "active",
  };
}

function mutable(): Record<string, unknown> {
  return structuredClone(validPayload()) as unknown as Record<string, unknown>;
}

describe("validateRfpHldDesignModelRebuildRequestPayload - happy path", () => {
  it("exports the stable payload kind literal", () => {
    expect(RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND).toBe(
      "rfp_hld_design_model_rebuild_request"
    );
  });

  it("accepts a valid bounded request", () => {
    const result = validateRfpHldDesignModelRebuildRequestPayload(validPayload());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(isValidRfpHldDesignModelRebuildRequestPayload(validPayload())).toBe(true);
  });

  it("allows negated/safety scope phrasing", () => {
    const p = mutable();
    p.reason = "Stay within approved source artifacts; do not add scope of any kind.";
    p.instructions = "Never add scope. Do not introduce new scope. Keep within scope.";
    expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(true);
  });
});

describe("validateRfpHldDesignModelRebuildRequestPayload - shape", () => {
  it("rejects a non-object", () => {
    for (const v of [null, undefined, 1, "x", []]) {
      expect(validateRfpHldDesignModelRebuildRequestPayload(v).valid).toBe(false);
    }
  });

  it("rejects an unexpected top-level key", () => {
    const p = mutable();
    p.extra = "nope";
    const result = validateRfpHldDesignModelRebuildRequestPayload(p);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unexpected key "extra"'))).toBe(true);
  });

  it("rejects a missing required key", () => {
    const p = mutable();
    delete p.reason;
    expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
  });

  it("rejects the wrong payloadKind", () => {
    const p = mutable();
    p.payloadKind = "rfp_hld_design_model_review";
    expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
  });

  it("rejects a status other than active", () => {
    const p = mutable();
    p.status = "approved";
    expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
  });

  it("rejects a non-ISO-UTC requestedAt", () => {
    const p = mutable();
    p.requestedAt = "2026-06-24 00:00:00";
    expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
  });
});

describe("validateRfpHldDesignModelRebuildRequestPayload - sourceArtifactIds", () => {
  it("requires exactly [model, review] in order", () => {
    for (const ids of [
      [REVIEW_ID, MODEL_ID],
      [MODEL_ID],
      [MODEL_ID, REVIEW_ID, "extra"],
      [],
    ]) {
      const p = mutable();
      p.sourceArtifactIds = ids;
      expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
    }
  });

  it("rejects identical model and review ids", () => {
    const p = mutable();
    p.sourceReviewArtifactId = MODEL_ID;
    p.sourceArtifactIds = [MODEL_ID, MODEL_ID];
    expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
  });
});

describe("validateRfpHldDesignModelRebuildRequestPayload - bounded text", () => {
  it("rejects a blank reason or instructions", () => {
    for (const field of ["reason", "instructions"]) {
      const p = mutable();
      p[field] = "   ";
      expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
    }
  });

  it("rejects instructions over the max length", () => {
    const p = mutable();
    p.instructions = "redraft. ".repeat(200);
    const result = validateRfpHldDesignModelRebuildRequestPayload(p);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith("instructions: exceeds"))).toBe(true);
  });
});

describe("validateRfpHldDesignModelRebuildRequestPayload - leakage + authority", () => {
  it("rejects raw-document / source-file leakage keys", () => {
    for (const key of ["rawText", "documentText", "sourceFileId", "filePath", "extractedText"]) {
      const p = mutable();
      p[key] = "leak";
      expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
    }
  });

  it("rejects provider / model / prompt fields", () => {
    for (const key of ["provider", "model", "prompt", "rawResponse", "systemPrompt"]) {
      const p = mutable();
      p[key] = "x";
      expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
    }
  });

  it("rejects final-output / deliverable / certification markers", () => {
    for (const bad of [
      "Produce the final HLD document now.",
      "Build a mermaid diagram of the topology.",
      "Embed ```code``` blocks.",
      "Generate the technical proposal export package.",
      "This is a cisco-certified design.",
    ]) {
      const p = mutable();
      p.reason = bad;
      expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
    }
  });

  it("rejects SKU / pricing / catalog / config / sizing authority text", () => {
    for (const bad of [
      "Select the C9300 SKU for the access layer.",
      "Update the pricing for the core switches.",
      "Make a catalog decision for the optics.",
      "Change the configuration of the firewall.",
      "Do hardware sizing for the new racks.",
    ]) {
      const p = mutable();
      p.instructions = bad;
      expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
    }
  });

  it("rejects affirmative new-scope authority text", () => {
    for (const bad of [
      "Add new scope to cover the data center.",
      "Expand the scope to include extra sites.",
      "Introduce additional scope beyond the source.",
    ]) {
      const p = mutable();
      p.instructions = bad;
      const result = validateRfpHldDesignModelRebuildRequestPayload(p);
      expect(result.valid).toBe(false);
    }
  });
});

describe("validateRfpHldDesignModelRebuildRequestPayload - OpenAI redo policy", () => {
  const BUNDLE_ID = "hsb-1";

  function openAiPayload(): Record<string, unknown> {
    return {
      ...mutable(),
      requestSource: "openai_advisory",
      redoPhase: "initial_openai_gate",
      redoAttempt: 1,
      maxRedoAttempts: 1,
      sourceHldSourceBundleArtifactId: BUNDLE_ID,
    };
  }

  it("keeps a historical payload (no policy fields) valid", () => {
    expect(validateRfpHldDesignModelRebuildRequestPayload(validPayload()).valid).toBe(true);
  });

  it("accepts requestSource engineer only without any policy fields", () => {
    const engineer = { ...mutable(), requestSource: "engineer" };
    expect(validateRfpHldDesignModelRebuildRequestPayload(engineer).valid).toBe(true);

    const engineerWithPolicy = { ...openAiPayload(), requestSource: "engineer" };
    expect(validateRfpHldDesignModelRebuildRequestPayload(engineerWithPolicy).valid).toBe(false);
  });

  it("accepts valid openai_advisory initial_openai_gate metadata", () => {
    const result = validateRfpHldDesignModelRebuildRequestPayload(openAiPayload());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects openai_advisory missing any of the four policy fields", () => {
    for (const key of [
      "redoPhase",
      "redoAttempt",
      "maxRedoAttempts",
      "sourceHldSourceBundleArtifactId",
    ]) {
      const p = openAiPayload();
      delete p[key];
      expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid, key).toBe(false);
    }
  });

  it("rejects policy fields present without openai_advisory requestSource", () => {
    const p = openAiPayload();
    delete p.requestSource;
    expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
  });

  it("rejects an invalid requestSource or redoPhase", () => {
    const badSource = { ...openAiPayload(), requestSource: "robot" };
    expect(validateRfpHldDesignModelRebuildRequestPayload(badSource).valid).toBe(false);
    const badPhase = { ...openAiPayload(), redoPhase: "mystery_gate" };
    expect(validateRfpHldDesignModelRebuildRequestPayload(badPhase).valid).toBe(false);
  });

  it("rejects a blank source bundle id", () => {
    const p = { ...openAiPayload(), sourceHldSourceBundleArtifactId: "   " };
    expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid).toBe(false);
  });

  it("enforces initial_openai_gate max=1 attempt=1", () => {
    const wrongMax = { ...openAiPayload(), maxRedoAttempts: 2 };
    expect(validateRfpHldDesignModelRebuildRequestPayload(wrongMax).valid).toBe(false);
    const wrongAttempt = { ...openAiPayload(), redoAttempt: 2 };
    expect(validateRfpHldDesignModelRebuildRequestPayload(wrongAttempt).valid).toBe(false);
  });

  it("rejects a non-integer or out-of-range redoAttempt", () => {
    const nonInt = { ...openAiPayload(), redoAttempt: 1.5 };
    expect(validateRfpHldDesignModelRebuildRequestPayload(nonInt).valid).toBe(false);
    const zero = { ...openAiPayload(), redoAttempt: 0 };
    expect(validateRfpHldDesignModelRebuildRequestPayload(zero).valid).toBe(false);
  });

  it("accepts future se_directed_openai_gate attempts 1 and 2 with max 2", () => {
    for (const attempt of [1, 2]) {
      const p = {
        ...openAiPayload(),
        redoPhase: "se_directed_openai_gate",
        maxRedoAttempts: 2,
        redoAttempt: attempt,
      };
      expect(validateRfpHldDesignModelRebuildRequestPayload(p).valid, `attempt ${attempt}`).toBe(true);
    }
  });

  it("rejects se_directed_openai_gate with max 1 or attempt 3", () => {
    const wrongMax = {
      ...openAiPayload(),
      redoPhase: "se_directed_openai_gate",
      maxRedoAttempts: 1,
      redoAttempt: 1,
    };
    expect(validateRfpHldDesignModelRebuildRequestPayload(wrongMax).valid).toBe(false);
    const attempt3 = {
      ...openAiPayload(),
      redoPhase: "se_directed_openai_gate",
      maxRedoAttempts: 2,
      redoAttempt: 3,
    };
    expect(validateRfpHldDesignModelRebuildRequestPayload(attempt3).valid).toBe(false);
  });
});

describe("validateRfpHldDesignModelRebuildRequestPayload - engineer word cap", () => {
  // 251 short whitespace tokens: over the 250-word cap but well under 1200 chars.
  const OVER_250_WORDS = "fix ".repeat(251).trim();
  const AT_250_WORDS = "fix ".repeat(250).trim();

  it("accepts engineer instructions at <=250 words with no policy fields", () => {
    const p = { ...mutable(), requestSource: "engineer", instructions: AT_250_WORDS };
    const result = validateRfpHldDesignModelRebuildRequestPayload(p);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects engineer instructions over 250 words", () => {
    const p = { ...mutable(), requestSource: "engineer", instructions: OVER_250_WORDS };
    const result = validateRfpHldDesignModelRebuildRequestPayload(p);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("engineer exceeds 250 words"))
    ).toBe(true);
  });

  it("keeps a historical payload (no requestSource) valid over 250 words within char limit", () => {
    const p = { ...mutable(), instructions: OVER_250_WORDS };
    expect(OVER_250_WORDS.length).toBeLessThanOrEqual(1200);
    const result = validateRfpHldDesignModelRebuildRequestPayload(p);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("project-rfp-hld-design-model-rebuild-request - source purity", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-rebuild-request.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports nothing (pure, self-contained contract)", () => {
    expect(/^\s*import\s/m.test(source)).toBe(false);
  });

  it("is ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
