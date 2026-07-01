import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
  validateRfpHldIntakeQuestionnairePayload,
  isValidRfpHldIntakeQuestionnairePayload,
  type RfpHldIntakeQuestionnairePayload,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire";

const CREATED_AT = "2026-06-30T00:00:00.000Z";

/** A minimal-but-valid questionnaire: one required free-text question, no findings. */
function minimalPayload(): RfpHldIntakeQuestionnairePayload {
  return {
    payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
    createdBy: "engineer@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: ["art-req-1"],
    questions: [
      {
        questionId: "q-1",
        order: 1,
        domain: "routing_wan",
        questionText: "What WAN bandwidth is required per branch?",
        whyAsked: "Determines the WAN edge sizing for the branch design.",
        answerType: "number",
        required: true,
        sourceRefIds: ["art-req-1"],
      },
    ],
    validation: {
      status: "passed",
      checkedAt: CREATED_AT,
      findingCount: 0,
      findings: [],
    },
  };
}

/** A richer valid questionnaire: mixed answer types, options, inputs, and a finding. */
function validPayload(): RfpHldIntakeQuestionnairePayload {
  return {
    payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
    createdBy: "engineer@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: ["art-req-1", "art-cmx-1"],
    questions: [
      {
        questionId: "q-1",
        order: 1,
        domain: "campus_switching",
        questionText: "What is the existing access-layer switch footprint per site?",
        whyAsked: "Sizes the campus access design and uplink strategy.",
        answerType: "free_text",
        required: true,
        sourceRefIds: ["art-req-1"],
      },
      {
        questionId: "q-2",
        order: 2,
        domain: "security",
        questionText: "Which segmentation model should the design assume?",
        whyAsked: "Selects the macro or micro segmentation approach for the design.",
        answerType: "single_select",
        required: true,
        sourceRefIds: ["art-cmx-1"],
        allowedOptions: ["macro", "micro", "none"],
        requiredInputIds: ["art-req-1"],
      },
      {
        questionId: "q-3",
        order: 3,
        domain: "physical_installation",
        questionText: "Are redundant power feeds available in each rack location?",
        whyAsked: "Confirms the power resiliency assumptions for the topology.",
        answerType: "boolean",
        required: false,
        sourceRefIds: ["art-req-1"],
      },
    ],
    validation: {
      status: "passed",
      checkedAt: CREATED_AT,
      findingCount: 1,
      findings: [
        {
          id: "f-1",
          code: "ORDER_CONTIGUOUS",
          message: "Question ordering is contiguous.",
          severity: "info",
        },
      ],
    },
  };
}

/** Deep clone of the rich payload as a mutable bag for negative cases. */
function mutable(): Record<string, unknown> {
  return structuredClone(validPayload()) as unknown as Record<string, unknown>;
}

const questionAt = (p: Record<string, unknown>, i: number): Record<string, unknown> =>
  (p.questions as Record<string, unknown>[])[i];

const validationOf = (p: Record<string, unknown>): Record<string, unknown> =>
  p.validation as Record<string, unknown>;

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("validateRfpHldIntakeQuestionnairePayload - happy path", () => {
  it("accepts a minimal valid payload", () => {
    const result = validateRfpHldIntakeQuestionnairePayload(minimalPayload());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(isValidRfpHldIntakeQuestionnairePayload(minimalPayload())).toBe(true);
  });

  it("accepts a richer valid payload (mixed answer types, options, inputs, finding)", () => {
    const result = validateRfpHldIntakeQuestionnairePayload(validPayload());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("exports the stable payload kind literal", () => {
    expect(RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND).toBe(
      "rfp_hld_intake_questionnaire"
    );
  });
});

// ---------------------------------------------------------------------------
// Top-level shape
// ---------------------------------------------------------------------------

describe("validateRfpHldIntakeQuestionnairePayload - top-level shape", () => {
  it("rejects non-objects", () => {
    for (const bad of [null, undefined, 42, "x", []]) {
      expect(isValidRfpHldIntakeQuestionnairePayload(bad)).toBe(false);
    }
  });

  it("rejects the wrong payloadKind", () => {
    const p = mutable();
    p.payloadKind = "rfp_hld_intake";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects an unknown top-level key", () => {
    const p = mutable();
    p.extra = true;
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a missing top-level key", () => {
    const p = mutable();
    delete p.createdBy;
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a blank createdBy", () => {
    const p = mutable();
    p.createdBy = "   ";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a non-ISO-UTC createdAt", () => {
    for (const bad of ["2026-06-30", "not-a-date", "2026-06-30T00:00:00", 0]) {
      const p = mutable();
      p.createdAt = bad;
      expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// sourceArtifactIds
// ---------------------------------------------------------------------------

describe("validateRfpHldIntakeQuestionnairePayload - sourceArtifactIds", () => {
  it("rejects an empty sourceArtifactIds", () => {
    const p = mutable();
    p.sourceArtifactIds = [];
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects duplicate sourceArtifactIds", () => {
    const p = mutable();
    p.sourceArtifactIds = ["art-req-1", "art-req-1"];
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a blank sourceArtifactId entry", () => {
    const p = mutable();
    p.sourceArtifactIds = ["art-req-1", "  "];
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a non-array sourceArtifactIds", () => {
    const p = mutable();
    p.sourceArtifactIds = "art-req-1";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// questions
// ---------------------------------------------------------------------------

describe("validateRfpHldIntakeQuestionnairePayload - questions", () => {
  it("rejects an empty questions array", () => {
    const p = mutable();
    p.questions = [];
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a non-array questions", () => {
    const p = mutable();
    p.questions = {};
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a duplicate questionId", () => {
    const p = mutable();
    questionAt(p, 1).questionId = "q-1";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a duplicate order", () => {
    const p = mutable();
    questionAt(p, 1).order = 1;
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a non-positive or non-integer order", () => {
    for (const bad of [0, -1, 1.5, "1"]) {
      const p = mutable();
      questionAt(p, 0).order = bad;
      expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
    }
  });

  it("rejects a blank questionText", () => {
    const p = mutable();
    questionAt(p, 0).questionText = "  ";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a blank whyAsked", () => {
    const p = mutable();
    questionAt(p, 0).whyAsked = "";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects an invalid domain", () => {
    const p = mutable();
    questionAt(p, 0).domain = "telepathy";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects an invalid answerType", () => {
    const p = mutable();
    questionAt(p, 0).answerType = "essay";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a non-boolean required flag", () => {
    const p = mutable();
    questionAt(p, 0).required = "yes";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects an unknown key inside a question (closed shape)", () => {
    const p = mutable();
    questionAt(p, 0).weight = 5;
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects empty, duplicate, or blank sourceRefIds", () => {
    for (const bad of [[], ["art-req-1", "art-req-1"], ["  "]]) {
      const p = mutable();
      questionAt(p, 0).sourceRefIds = bad;
      expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// allowedOptions and requiredInputIds
// ---------------------------------------------------------------------------

describe("validateRfpHldIntakeQuestionnairePayload - options and inputs", () => {
  it("rejects a select question missing allowedOptions", () => {
    const p = mutable();
    delete questionAt(p, 1).allowedOptions;
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a select question with empty allowedOptions", () => {
    const p = mutable();
    questionAt(p, 1).allowedOptions = [];
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a select question with duplicate allowedOptions", () => {
    const p = mutable();
    questionAt(p, 1).allowedOptions = ["macro", "macro"];
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a select question with a blank option", () => {
    const p = mutable();
    questionAt(p, 1).allowedOptions = ["macro", "  "];
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects allowedOptions on a non-select answer type", () => {
    const p = mutable();
    questionAt(p, 0).allowedOptions = ["a", "b"];
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("accepts multi_select with allowedOptions", () => {
    const p = mutable();
    questionAt(p, 1).answerType = "multi_select";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(true);
  });

  it("rejects an empty or duplicate requiredInputIds when present", () => {
    for (const bad of [[], ["art-req-1", "art-req-1"], ["  "]]) {
      const p = mutable();
      questionAt(p, 1).requiredInputIds = bad;
      expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// validation summary
// ---------------------------------------------------------------------------

describe("validateRfpHldIntakeQuestionnairePayload - validation summary", () => {
  it("rejects a missing validation key", () => {
    const p = mutable();
    delete validationOf(p).checkedAt;
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects an unexpected validation key (closed shape)", () => {
    const p = mutable();
    validationOf(p).verdict = "ok";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects an invalid validation status", () => {
    const p = mutable();
    validationOf(p).status = "unknown";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("accepts a failed validation status (candidate may carry findings)", () => {
    const p = mutable();
    validationOf(p).status = "failed";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(true);
  });

  it("rejects a non-ISO-UTC checkedAt", () => {
    const p = mutable();
    validationOf(p).checkedAt = "2026-06-30";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a findingCount that does not match findings length", () => {
    const p = mutable();
    validationOf(p).findingCount = 5;
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects a negative or non-integer findingCount", () => {
    for (const bad of [-1, 1.5, "1"]) {
      const p = mutable();
      validationOf(p).findingCount = bad;
      expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
    }
  });

  it("rejects a duplicate finding id", () => {
    const p = mutable();
    validationOf(p).findings = [
      { id: "f-1", code: "A", message: "First.", severity: "info" },
      { id: "f-1", code: "B", message: "Second.", severity: "warning" },
    ];
    validationOf(p).findingCount = 2;
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects an invalid finding severity", () => {
    const p = mutable();
    (validationOf(p).findings as Record<string, unknown>[])[0].severity = "critical";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects an unexpected key inside a finding (closed shape)", () => {
    const p = mutable();
    (validationOf(p).findings as Record<string, unknown>[])[0].hint = "x";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Forbidden authority / provider / raw keys (recursive, exact match)
// ---------------------------------------------------------------------------

describe("validateRfpHldIntakeQuestionnairePayload - forbidden keys", () => {
  it("rejects an answers key at the top level", () => {
    const p = mutable();
    p.answers = [{ questionId: "q-1", value: "10 Gbps" }];
    const result = validateRfpHldIntakeQuestionnairePayload(p);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('forbidden key "answers"'))).toBe(true);
  });

  it("rejects an engineerAnswer smuggled into a question", () => {
    const p = mutable();
    questionAt(p, 0).engineerAnswer = "10 Gbps";
    const result = validateRfpHldIntakeQuestionnairePayload(p);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('forbidden key "engineerAnswer"'))).toBe(
      true
    );
  });

  it("rejects a pricing object nested inside a question", () => {
    const p = mutable();
    questionAt(p, 0).pricing = { unitPrice: 100 };
    const result = validateRfpHldIntakeQuestionnairePayload(p);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('forbidden key "pricing"'))).toBe(true);
  });

  it("rejects the sku / catalog / configuration authority keys anywhere", () => {
    for (const key of [
      "sku",
      "acceptedSku",
      "replacementSku",
      "catalogDecision",
      "configurationDecision",
      "defaultDecision",
      "price",
    ]) {
      const p = mutable();
      questionAt(p, 0)[key] = "smuggled";
      expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
    }
  });

  it("rejects provider / raw-source leakage keys deep inside validation.findings", () => {
    for (const key of [
      "providerResponse",
      "rawResponse",
      "prompt",
      "completion",
      "reasoning",
      "rawText",
      "documentText",
      "filePath",
      "storagePath",
    ]) {
      const p = mutable();
      (validationOf(p).findings as Record<string, unknown>[])[0][key] = "smuggled";
      const result = validateRfpHldIntakeQuestionnairePayload(p);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes(`forbidden key "${key}"`))
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Forbidden rendered-output / certification / final-deliverable strings
// ---------------------------------------------------------------------------

describe("validateRfpHldIntakeQuestionnairePayload - forbidden strings", () => {
  const cases: Array<{ name: string; value: string }> = [
    { name: "draw.io XML", value: "<mxfile host='app'></mxfile>" },
    { name: "HTML", value: "<html><body>x</body></html>" },
    { name: "SVG", value: "<svg xmlns='http://www.w3.org/2000/svg'></svg>" },
    { name: "code fence", value: "```markdown\n# doc\n```" },
    { name: "Mermaid", value: "graph TD A-->B" },
    { name: "technical proposal reference", value: "Include this in the technical proposal." },
    { name: "export package reference", value: "Goes into the export package." },
    { name: "Cisco certification claim", value: "This design is Cisco certified." },
    { name: "AI certification claim", value: "AI-certified topology." },
    { name: "final authority claim", value: "This is the final authority on the design." },
  ];

  for (const { name, value } of cases) {
    it(`rejects ${name} content in questionText`, () => {
      const p = mutable();
      questionAt(p, 0).questionText = value;
      const result = validateRfpHldIntakeQuestionnairePayload(p);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("forbidden authority/output content"))
      ).toBe(true);
    });
  }

  it("rejects forbidden content in a nested finding message", () => {
    const p = mutable();
    (validationOf(p).findings as Record<string, unknown>[])[0].message =
      "<?xml version='1.0'?><root/>";
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });

  it("rejects forbidden content inside an allowedOptions entry", () => {
    const p = mutable();
    questionAt(p, 1).allowedOptions = ["macro", "<svg></svg>"];
    expect(isValidRfpHldIntakeQuestionnairePayload(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Module purity
// ---------------------------------------------------------------------------

describe("project-rfp-hld-intake-questionnaire module purity", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/project-rfp-hld-intake-questionnaire.ts"),
    "utf8"
  );

  it("imports only the canonical HLD design-domain definitions", () => {
    const froms = Array.from(source.matchAll(/from\s+["']([^"']+)["']/g)).map(
      (m) => m[1]
    );
    expect(froms.sort()).toEqual([
      "@/lib/projects/project-rfp-hld-domain-readiness",
    ]);
  });

  it("does not import stores, fs/path, routes, React, AI/provider, catalog, pricing, SKU, or config services", () => {
    const forbidden = [
      "/db/",
      "project-store",
      "artifact-store",
      "file-store",
      "node:fs",
      "node:path",
      "next/server",
      "next/navigation",
      "react",
      "anthropic",
      "@anthropic",
      "openai",
      "@openai",
      "/adapters/",
      "catalog",
      "pricing",
      "sku",
      "config-expansion",
      "configuration-expansion",
    ];
    const importLines = source
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l) || /from\s+["']/.test(l));
    for (const needle of forbidden) {
      for (const line of importLines) {
        expect(line.includes(needle)).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ASCII-only
// ---------------------------------------------------------------------------

describe("ASCII-only files", () => {
  it("source file is ASCII-only", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/projects/project-rfp-hld-intake-questionnaire.ts"),
      "utf8"
    );
    expect(/[^\x00-\x7F]/.test(src)).toBe(false);
  });

  it("test file is ASCII-only", () => {
    const tst = readFileSync(
      join(process.cwd(), "tests/lib/projects/project-rfp-hld-intake-questionnaire.test.ts"),
      "utf8"
    );
    expect(/[^\x00-\x7F]/.test(tst)).toBe(false);
  });
});
