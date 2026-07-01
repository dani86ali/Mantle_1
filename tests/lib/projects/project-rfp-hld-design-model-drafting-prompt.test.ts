import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import { RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-design-model";
import {
  buildRfpHldDesignModelCandidateInput,
  type RfpHldDesignModelCandidateInputBundle,
} from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import {
  buildRfpHldDesignModelDraftingRequest,
  RFP_HLD_DESIGN_MODEL_DRAFTING_SYSTEM_PROMPT,
  RFP_HLD_DESIGN_MODEL_REBUILD_DRAFTING_INSTRUCTION,
} from "@/lib/projects/project-rfp-hld-design-model-drafting-prompt";
import type { RfpHldDesignModelRebuildDraftingContext } from "@/lib/projects/project-rfp-hld-design-model-rebuild-candidate-input";
import { RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND } from "@/lib/projects/project-rfp-hld-design-knowledge-content";
import type { ProjectArtifact } from "@/types/project";

const PROJECT_ID = "proj-1";
const ARTIFACT_ID = "hsb-1";
const CREATED_AT = "2026-06-24T00:00:00.000Z";

const UPSTREAM_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"];

function validBundlePayload(): RfpHldSourceBundlePayload {
  return {
    payloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    createdBy: "engineer@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: UPSTREAM_IDS.slice(),
    lineage: {
      compiledFromReadinessSnapshotArtifactId: "hrs-1",
      compiledArtifactIds: UPSTREAM_IDS.slice(),
    },
    authorities: {
      evidencePackage: {
        artifactId: "evp-1", artifactType: "evidence_package",
        stageId: "intake_package_review", status: "approved", version: 1,
      },
      requirementsBaseline: {
        artifactId: "req-1", artifactType: "requirements_baseline",
        stageId: "requirements_baseline_review", status: "approved", version: 1,
      },
      complianceMatrix: {
        artifactId: "cmx-1", artifactType: "compliance_matrix",
        stageId: "compliance_matrix_review", status: "approved", version: 1,
      },
      configurationAuthority: {
        artifactId: "cfg-1", artifactType: "configuration_expansion",
        stageId: "configuration_expansion_review", status: "approved", version: 1,
        sourceKind: "configuration_expansion",
      },
      hldIntake: {
        artifactId: "hint-1", artifactType: "hld_intake",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
      },
      hldReadinessSnapshot: {
        artifactId: "hrs-1", artifactType: "hld_readiness_snapshot",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
        payloadKind: "rfp_hld_readiness_snapshot",
      },
    },
    designKnowledgePackRefs: [
      {
        artifactId: "dkp-1", artifactType: "design_knowledge_pack",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
        payloadKind: "rfp_hld_design_knowledge_pack", domain: "campus_switching",
      },
    ],
    designKnowledgePackContents: [
      {
        contentKind: RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND,
        artifactId: "dkp-1", artifactType: "design_knowledge_pack",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
        payloadKind: "rfp_hld_design_knowledge_pack", domain: "campus_switching",
        title: "Campus switching pack",
        source: "manual_operator_entry",
        designPrinciples: ["Collapsed core for the campus."],
        topologyGuidance: [], constraints: [], assumptions: [], exclusions: [], validationNotes: [],
        entryCount: 1,
        sectionCounts: {
          designPrinciples: 1, topologyGuidance: 0, constraints: 0,
          assumptions: 0, exclusions: 0, validationNotes: 0,
        },
      },
    ],
    hldIntakeAnswers: {
      sourceHldIntakeArtifactId: "hint-1",
      sourceHldIntakeVersion: 1,
      sourceMode: "manual_override",
      answers: [
        { fieldId: "target_topology_intent", label: "Target topology intent", status: "answered", value: "Collapsed core campus." },
        { fieldId: "resiliency_expectations", label: "Resiliency expectations", status: "unknown", notes: "awaiting customer" },
      ],
      answerCount: 2,
      statusCounts: { answered: 1, unknown: 1, not_applicable: 0 },
    },
    coveredDomains: ["campus_switching"],
    missingDomains: [],
    excludedDomains: ["service_only"],
    assumptions: [
      { id: "a1", statement: "Existing core remains.", sourceArtifactId: "req-1" },
    ],
    constraints: [
      { id: "c1", statement: "No customer BoQ change.", sourceDomain: "campus_switching" },
    ],
    warnings: [
      { id: "w1", code: "PARTIAL_DETAIL", message: "Some rack detail missing.", severity: "warning" },
    ],
    blockers: [],
    validation: { status: "passed", checkedAt: CREATED_AT },
  };
}

function validArtifact(): ProjectArtifact {
  return {
    id: ARTIFACT_ID,
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "approved",
    version: 3,
    payload: validBundlePayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: UPSTREAM_IDS.slice(),
    createdAt: new Date(CREATED_AT),
    updatedAt: new Date(CREATED_AT),
  };
}

function validBundle(): RfpHldDesignModelCandidateInputBundle {
  const result = buildRfpHldDesignModelCandidateInput({
    projectId: PROJECT_ID,
    artifact: validArtifact(),
    createdBy: "drafter@example.com",
    createdAt: CREATED_AT,
  });
  if (result.status !== "ok") throw new Error("expected ok bundle");
  return result.bundle;
}

function rebuildContext(): RfpHldDesignModelRebuildDraftingContext {
  return {
    sourceHldSourceBundleArtifactId: ARTIFACT_ID,
    rebuildRequestArtifactId: "request-1",
    sourceModelArtifactId: "model-1",
    sourceReviewArtifactId: "review-1",
    priorModelSummary: {
      coveredDomains: ["campus_switching"],
      excludedDomains: ["service_only"],
      designSectionCount: 2,
      topologyNodeCount: 3,
      topologyLinkCount: 1,
      topologyZoneCount: 1,
      diagramIntentCount: 0,
      sourceReferenceCount: 4,
      validationFindingCount: 0,
    },
    reviewRecommendation: "rebuild_recommended",
    reviewFindingSummaries: [
      {
        id: "rf-1", severity: "warning", category: "unclear_narrative",
        message: "Thin rationale.", recommendedAction: "Clarify it.",
      },
    ],
    engineerReason: "Clarify the rationale for the customer.",
    engineerInstructions: "Redraft using the approved inputs only.",
    limitations: [
      "Redraft from exactly the same approved hld_source_bundle as the prior model; add or change no source artifacts.",
    ],
  };
}

function rebuildBundle(): RfpHldDesignModelCandidateInputBundle {
  const bundle = validBundle();
  bundle.rebuildContext = rebuildContext();
  return bundle;
}

const REBUILD_SECTION_KEYS = [
  "mode",
  "instruction",
  "sourceHldSourceBundleArtifactId",
  "rebuildRequestArtifactId",
  "sourceModelArtifactId",
  "sourceReviewArtifactId",
  "priorModelSummary",
  "reviewRecommendation",
  "reviewFindingSummaries",
  "engineerReason",
  "engineerInstructions",
  "limitations",
];

const WHITELIST_KEYS = [
  "payloadKind",
  "targetPayloadKind",
  "createdBy",
  "createdAt",
  "sourceHldSourceBundleArtifactId",
  "sourceHldSourceBundleVersion",
  "sourceHldSourceBundlePayloadKind",
  "sourceArtifactIds",
  "coveredDomains",
  "excludedDomains",
  "authorities",
  "designKnowledgePackRefs",
  "designKnowledgePackContents",
  "hldIntakeAnswers",
  "assumptions",
  "constraints",
  "warnings",
  "instructions",
];

const INTAKE_ANSWERS_KEYS = [
  "sourceHldIntakeArtifactId",
  "sourceHldIntakeVersion",
  "sourceMode",
  "answers",
  "answerCount",
  "statusCounts",
];

const INTAKE_ANSWER_KEYS = ["fieldId", "label", "status", "value", "notes"];

const CONTENT_KEYS = [
  "contentKind",
  "artifactId",
  "artifactType",
  "stageId",
  "status",
  "version",
  "payloadKind",
  "domain",
  "title",
  "source",
  "designPrinciples",
  "topologyGuidance",
  "constraints",
  "assumptions",
  "exclusions",
  "validationNotes",
  "entryCount",
  "sectionCounts",
];

describe("buildRfpHldDesignModelDraftingRequest - shape", () => {
  it("returns a deterministic, serializable { system, user } request", () => {
    const a = buildRfpHldDesignModelDraftingRequest(validBundle());
    const b = buildRfpHldDesignModelDraftingRequest(validBundle());
    expect(typeof a.system).toBe("string");
    expect(typeof a.user).toBe("string");
    expect(a).toEqual(b);
    expect(JSON.parse(a.user)).toEqual(JSON.parse(b.user));
  });

  it("uses the fixed system prompt constant", () => {
    const req = buildRfpHldDesignModelDraftingRequest(validBundle());
    expect(req.system).toBe(RFP_HLD_DESIGN_MODEL_DRAFTING_SYSTEM_PROMPT);
  });

  it("user JSON contains exactly the whitelisted keys", () => {
    const req = buildRfpHldDesignModelDraftingRequest(validBundle());
    const parsed = JSON.parse(req.user) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(WHITELIST_KEYS.slice().sort());
  });

  it("carries through approved candidate input verbatim", () => {
    const req = buildRfpHldDesignModelDraftingRequest(validBundle());
    const parsed = JSON.parse(req.user);
    expect(parsed.createdBy).toBe("drafter@example.com");
    expect(parsed.createdAt).toBe(CREATED_AT);
    expect(parsed.sourceHldSourceBundleArtifactId).toBe(ARTIFACT_ID);
    expect(parsed.sourceHldSourceBundleVersion).toBe(3);
    expect(parsed.sourceHldSourceBundlePayloadKind).toBe(RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND);
    expect(parsed.targetPayloadKind).toBe(RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND);
    expect(parsed.coveredDomains).toEqual(["campus_switching"]);
    expect(parsed.excludedDomains).toEqual(["service_only"]);
    expect(parsed.authorities.evidencePackage.artifactId).toBe("evp-1");
    expect(parsed.designKnowledgePackRefs[0].domain).toBe("campus_switching");
    expect(parsed.assumptions[0].id).toBe("a1");
    expect(parsed.constraints[0].id).toBe("c1");
    expect(parsed.warnings[0].id).toBe("w1");
  });

  it("keeps sourceArtifactIds as exactly [source bundle id]", () => {
    const req = buildRfpHldDesignModelDraftingRequest(validBundle());
    const parsed = JSON.parse(req.user);
    expect(parsed.sourceArtifactIds).toEqual([ARTIFACT_ID]);
    for (const upstream of UPSTREAM_IDS) {
      expect(parsed.sourceArtifactIds).not.toContain(upstream);
    }
  });

  it("throws on a wrong payloadKind bundle", () => {
    const bad = { ...(validBundle() as unknown as Record<string, unknown>), payloadKind: "nope" };
    expect(() =>
      buildRfpHldDesignModelDraftingRequest(
        bad as unknown as RfpHldDesignModelCandidateInputBundle
      )
    ).toThrow();
  });
});

describe("buildRfpHldDesignModelDraftingRequest - approved DKP content", () => {
  it("serializes approved DKP content with its source-chain proof", () => {
    const parsed = JSON.parse(buildRfpHldDesignModelDraftingRequest(validBundle()).user);
    expect(Array.isArray(parsed.designKnowledgePackContents)).toBe(true);
    expect(parsed.designKnowledgePackContents).toHaveLength(1);
    const c = parsed.designKnowledgePackContents[0];
    expect(c.contentKind).toBe(RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND);
    expect(c.artifactId).toBe("dkp-1");
    expect(c.domain).toBe("campus_switching");
    expect(c.title).toBe("Campus switching pack");
    expect(c.source).toBe("manual_operator_entry");
    expect(c.designPrinciples).toEqual(["Collapsed core for the campus."]);
    expect(c.entryCount).toBe(1);
  });

  it("whitelists exactly the content-block keys", () => {
    const parsed = JSON.parse(buildRfpHldDesignModelDraftingRequest(validBundle()).user);
    expect(Object.keys(parsed.designKnowledgePackContents[0]).sort()).toEqual(
      CONTENT_KEYS.slice().sort()
    );
  });

  it("does not serialize fields smuggled onto a content block", () => {
    const bundle = validBundle();
    const content = (bundle.designKnowledgePackContents ?? [])[0] as unknown as Record<string, unknown>;
    content.rawDocumentBody = "RAW PACK BODY";
    content.unitPrice = 999;
    content.evil = "should-not-appear";
    const req = buildRfpHldDesignModelDraftingRequest(bundle);
    expect(req.user).not.toContain("RAW PACK BODY");
    expect(req.user).not.toContain("rawDocumentBody");
    expect(req.user).not.toContain("unitPrice");
    expect(req.user).not.toContain("should-not-appear");
  });
});

describe("buildRfpHldDesignModelDraftingRequest - approved intake answers", () => {
  it("throws when sanitized approved HLD intake answers are missing", () => {
    const bundle = validBundle();
    delete (bundle as { hldIntakeAnswers?: unknown }).hldIntakeAnswers;
    expect(() => buildRfpHldDesignModelDraftingRequest(bundle)).toThrow(/intake answers/i);
  });

  it("serializes the sanitized approved HLD intake answers", () => {
    const parsed = JSON.parse(buildRfpHldDesignModelDraftingRequest(validBundle()).user);
    const a = parsed.hldIntakeAnswers;
    expect(a.sourceHldIntakeArtifactId).toBe("hint-1");
    expect(a.sourceHldIntakeVersion).toBe(1);
    expect(a.sourceMode).toBe("manual_override");
    expect(a.answerCount).toBe(2);
    expect(a.statusCounts).toEqual({ answered: 1, unknown: 1, not_applicable: 0 });
    expect(a.answers.map((x: { fieldId: string }) => x.fieldId)).toEqual([
      "target_topology_intent",
      "resiliency_expectations",
    ]);
  });

  it("whitelists exactly the intake-answers section keys", () => {
    const parsed = JSON.parse(buildRfpHldDesignModelDraftingRequest(validBundle()).user);
    expect(Object.keys(parsed.hldIntakeAnswers).sort()).toEqual(
      INTAKE_ANSWERS_KEYS.slice().sort()
    );
  });

  it("whitelists only the per-answer keys present on each answer", () => {
    const parsed = JSON.parse(buildRfpHldDesignModelDraftingRequest(validBundle()).user);
    for (const answer of parsed.hldIntakeAnswers.answers) {
      for (const key of Object.keys(answer)) {
        expect(INTAKE_ANSWER_KEYS).toContain(key);
      }
    }
    // The answered field carries a value, the unknown field carries notes not value.
    expect(parsed.hldIntakeAnswers.answers[0].value).toBe("Collapsed core campus.");
    expect(parsed.hldIntakeAnswers.answers[1]).not.toHaveProperty("value");
    expect(parsed.hldIntakeAnswers.answers[1].notes).toBe("awaiting customer");
  });

  it("does not serialize fields smuggled onto the answers section or an answer", () => {
    const bundle = validBundle();
    const answers = bundle.hldIntakeAnswers as unknown as Record<string, unknown>;
    answers.questionnaireReview = { audit: "leak" };
    (answers.answers as Record<string, unknown>[])[0].sourceQuestionText = "RAW QUESTION";
    (answers.answers as Record<string, unknown>[])[0].unitPrice = 999;
    const req = buildRfpHldDesignModelDraftingRequest(bundle);
    expect(req.user).not.toContain("questionnaireReview");
    expect(req.user).not.toContain("RAW QUESTION");
    expect(req.user).not.toContain("sourceQuestionText");
    expect(req.user).not.toContain("unitPrice");
  });
});

describe("buildRfpHldDesignModelDraftingRequest - purity of serialized payload", () => {
  it("does not serialize smuggled decoy fields", () => {
    const bundle = validBundle();
    const smuggled = bundle as unknown as Record<string, unknown>;
    smuggled.tenantId = "tenant-secret";
    smuggled.rawDocumentBody = "RAW RFP TEXT BODY";
    smuggled.prices = [{ sku: "C9300", price: 999 }];
    smuggled.evil = "should-not-appear";
    const req = buildRfpHldDesignModelDraftingRequest(bundle);
    expect(req.user).not.toContain("tenant-secret");
    expect(req.user).not.toContain("RAW RFP TEXT BODY");
    expect(req.user).not.toContain("should-not-appear");
    expect(req.user).not.toContain("tenantId");
    expect(req.user).not.toContain("rawDocumentBody");
  });

  it("does not serialize raw docs, files, storage paths, or compiled ids", () => {
    const req = buildRfpHldDesignModelDraftingRequest(validBundle());
    expect(req.user).not.toContain("filePath");
    expect(req.user).not.toContain("storagePath");
    expect(req.user).not.toContain("sourceFileIds");
    expect(req.user).not.toContain("compiledArtifactIds");
  });
});

describe("RFP_HLD_DESIGN_MODEL_DRAFTING_SYSTEM_PROMPT - guardrails", () => {
  const text = RFP_HLD_DESIGN_MODEL_DRAFTING_SYSTEM_PROMPT.toLowerCase();

  it("frames the run as candidate-only and human-gated", () => {
    expect(text).toContain("candidate-only");
    expect(text).toContain("unapproved");
    expect(text).toContain("human engineer review");
    expect(text).toContain("deterministic validation");
  });

  it("forbids inventing facts and authority decisions", () => {
    expect(text).toContain("never invent");
    expect(text).toContain("sku");
    expect(text).toContain("pricing");
    expect(text).toContain("catalog");
    expect(text).toContain("configuration");
  });

  it("forbids final deliverable output and certification claims", () => {
    expect(text).toContain("html");
    expect(text).toContain("diagram");
    expect(text).toContain("mermaid");
    expect(text).toContain("draw.io");
    expect(text).toContain("tp/proposal");
    expect(text).toContain("cisco-certified");
    expect(text).toContain("ai-certified");
  });

  it("requires strict JSON and one rfp_hld_design_model payload", () => {
    expect(text).toContain("strict json");
    expect(text).toContain("no markdown");
    expect(text).toContain("no code fences");
    expect(text).toContain("rfp_hld_design_model");
  });

  it("forbids final-output terms only as instructions, not as emitted content", () => {
    // The forbidden terms appear in the SYSTEM prompt (instructions), never as
    // generated content fields in the serialized user payload.
    const req = buildRfpHldDesignModelDraftingRequest(validBundle());
    const parsed = JSON.parse(req.user) as Record<string, unknown>;
    expect(Object.keys(parsed)).not.toContain("html");
    expect(Object.keys(parsed)).not.toContain("diagram");
    expect(Object.keys(parsed)).not.toContain("drawio");
  });
});

describe("buildRfpHldDesignModelDraftingRequest - rebuild context", () => {
  it("omits the rebuild section for normal initial drafting", () => {
    const parsed = JSON.parse(
      buildRfpHldDesignModelDraftingRequest(validBundle()).user
    ) as Record<string, unknown>;
    expect(Object.keys(parsed)).not.toContain("rebuild");
  });

  it("includes the rebuild section only when the bundle carries a rebuild context", () => {
    const parsed = JSON.parse(
      buildRfpHldDesignModelDraftingRequest(rebuildBundle()).user
    ) as Record<string, unknown>;
    expect(parsed.rebuild).toBeDefined();
  });

  it("serializes exactly the whitelisted rebuild keys", () => {
    const parsed = JSON.parse(buildRfpHldDesignModelDraftingRequest(rebuildBundle()).user);
    expect(Object.keys(parsed.rebuild).sort()).toEqual(REBUILD_SECTION_KEYS.slice().sort());
    expect(parsed.rebuild.mode).toBe("bounded_correction_pass");
  });

  it("carries the sanitized rebuild context through verbatim", () => {
    const parsed = JSON.parse(buildRfpHldDesignModelDraftingRequest(rebuildBundle()).user);
    const r = parsed.rebuild;
    expect(r.sourceHldSourceBundleArtifactId).toBe(ARTIFACT_ID);
    expect(r.rebuildRequestArtifactId).toBe("request-1");
    expect(r.sourceModelArtifactId).toBe("model-1");
    expect(r.sourceReviewArtifactId).toBe("review-1");
    expect(r.reviewRecommendation).toBe("rebuild_recommended");
    expect(r.priorModelSummary.designSectionCount).toBe(2);
    expect(r.reviewFindingSummaries[0].id).toBe("rf-1");
    expect(r.instruction).toBe(RFP_HLD_DESIGN_MODEL_REBUILD_DRAFTING_INSTRUCTION);
  });

  it("keeps the system prompt constant on a rebuild bundle", () => {
    expect(buildRfpHldDesignModelDraftingRequest(rebuildBundle()).system).toBe(
      RFP_HLD_DESIGN_MODEL_DRAFTING_SYSTEM_PROMPT
    );
  });

  it("does not serialize fields smuggled onto the rebuild context", () => {
    const bundle = rebuildBundle();
    const smuggled = bundle.rebuildContext as unknown as Record<string, unknown>;
    smuggled.rawModelBody = "RAW MODEL BODY";
    smuggled.unitPrice = 999;
    smuggled.evil = "should-not-appear";
    const req = buildRfpHldDesignModelDraftingRequest(bundle);
    expect(req.user).not.toContain("RAW MODEL BODY");
    expect(req.user).not.toContain("rawModelBody");
    expect(req.user).not.toContain("unitPrice");
    expect(req.user).not.toContain("should-not-appear");
  });
});

describe("buildRfpHldDesignModelDraftingRequest - rebuild prohibitions", () => {
  const user = buildRfpHldDesignModelDraftingRequest(rebuildBundle()).user.toLowerCase();

  it("frames one bounded correction pass from the same approved source bundle", () => {
    expect(user).toContain("bounded correction pass");
    expect(user).toContain("same approved");
    expect(user).toContain("candidate-only");
  });

  it("forbids new scope, authority decisions, hardware sizing, and invented topology", () => {
    expect(user).toContain("scope");
    expect(user).toContain("sku");
    expect(user).toContain("pricing");
    expect(user).toContain("catalog");
    expect(user).toContain("configuration");
    expect(user).toContain("hardware sizing");
    expect(user).toContain("invented topology");
  });

  it("forbids final outputs, diagrams, documents, exports, and certification claims", () => {
    expect(user).toContain("document");
    expect(user).toContain("html");
    expect(user).toContain("diagram");
    expect(user).toContain("mermaid");
    expect(user).toContain("draw.io");
    expect(user).toContain("svg");
    expect(user).toContain("tp/proposal");
    expect(user).toContain("export");
    expect(user).toContain("certification");
  });
});

describe("project-rfp-hld-design-model-drafting-prompt - source purity", () => {
  const sourcePath = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-drafting-prompt.ts"
  );
  const source = readFileSync(sourcePath, "utf8");

  it("is ASCII-only (source and test)", () => {
    const testSource = readFileSync(
      join(
        process.cwd(),
        "tests/lib/projects/project-rfp-hld-design-model-drafting-prompt.test.ts"
      ),
      "utf8"
    );
    expect(/^[\x00-\x7F]*$/.test(source)).toBe(true);
    expect(/^[\x00-\x7F]*$/.test(testSource)).toBe(true);
  });

  it("imports only the candidate-input contract and the design-model kind", () => {
    const specifiers = Array.from(
      source.matchAll(/from\s+"([^"]+)"/g),
      (m: RegExpMatchArray) => m[1]
    );
    const allowed = new Set([
      "@/lib/projects/project-rfp-hld-design-model-candidate-input",
      "@/lib/projects/project-rfp-hld-design-model",
    ]);
    for (const spec of specifiers) {
      expect(allowed.has(spec)).toBe(true);
    }
  });

  it("references no forbidden provider/env/io modules or calls", () => {
    const forbidden = [
      "node:fs",
      "node:path",
      "next/server",
      "react",
      "@anthropic-ai",
      "openai",
      "gemini",
      "process.env",
      "fetch(",
      "require(",
      "readFile",
      "writeFile",
      "generateText",
      "generateObject",
      "chat.completions",
      "pdf-parse",
      "mammoth",
    ];
    for (const token of forbidden) {
      expect(source.includes(token)).toBe(false);
    }
  });
});
