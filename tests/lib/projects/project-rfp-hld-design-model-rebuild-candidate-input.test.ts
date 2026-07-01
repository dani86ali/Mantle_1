import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import {
  RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
  type RfpHldDesignModelReviewPayload,
} from "@/lib/projects/project-rfp-hld-design-model-review";
import {
  RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
  type RfpHldDesignModelRebuildRequestPayload,
} from "@/lib/projects/project-rfp-hld-design-model-rebuild-request";
import {
  buildRfpHldDesignModelCandidateInput,
  type RfpHldDesignModelCandidateInputBundle,
} from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import {
  buildRfpHldDesignModelRebuildCandidateInput,
  RFP_HLD_DESIGN_MODEL_REBUILD_DRAFTING_LIMITATIONS,
  type BuildRfpHldDesignModelRebuildCandidateInputInput,
} from "@/lib/projects/project-rfp-hld-design-model-rebuild-candidate-input";
import type { ProjectArtifact } from "@/types/project";

const PROJECT_ID = "proj-1";
const SOURCE_BUNDLE_ID = "hsb-1";
const MODEL_ID = "model-1";
const REVIEW_ID = "review-1";
const REQUEST_ID = "request-1";
const CREATED_AT = "2026-06-24T00:00:00.000Z";

const UPSTREAM_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"];

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

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

function validSourceBundleArtifact(): ProjectArtifact {
  // The source-bundle row's sourceArtifactIds must match its payload's upstream
  // ids, or the base candidate-input builder blocks on a row/payload mismatch.
  return artifactOf(
    SOURCE_BUNDLE_ID, "hld_source_bundle", validBundlePayload(), "approved", UPSTREAM_IDS.slice()
  );
}

function validModelPayload(
  overrides: Partial<RfpHldDesignModelPayload> = {}
): RfpHldDesignModelPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
    createdBy: "drafter@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: [SOURCE_BUNDLE_ID],
    sourceHldSourceBundleArtifactId: SOURCE_BUNDLE_ID,
    sourceBundleVersion: 3,
    sourceBundlePayloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    coveredDomains: ["campus_switching"],
    excludedDomains: ["service_only"],
    sourceReferences: [{ id: "sr-1", kind: "source_bundle", artifactId: SOURCE_BUNDLE_ID }],
    assumptionRefs: [],
    constraintRefs: [],
    designSections: [
      {
        id: "ds-1", domain: "campus_switching", title: "ZzzSectionTitle",
        sourceRefIds: ["sr-1"],
        decisions: [{ id: "dec-1", label: "ZzzDecisionLabel", sourceRefIds: ["sr-1"] }],
      },
    ],
    topology: {
      nodes: [
        { id: "n-1", label: "ZzzNodeLabel", nodeType: "switch", sourceRefIds: ["sr-1"] },
        { id: "n-2", label: "ZzzNodeTwo", nodeType: "router", sourceRefIds: ["sr-1"] },
      ],
      links: [
        {
          id: "lk-1", label: "ZzzLinkLabel", fromNodeId: "n-1", toNodeId: "n-2",
          linkType: "uplink", sourceRefIds: ["sr-1"],
        },
      ],
      zones: [{ id: "zn-1", label: "ZzzZoneLabel", nodeIds: ["n-1"], sourceRefIds: ["sr-1"] }],
    },
    diagramIntents: [{ id: "di-1", title: "ZzzDiagramTitle", intentType: "logical", sourceRefIds: ["sr-1"] }],
    traceability: {
      requirementRefs: [], complianceRefs: [], configurationRefs: [],
      sourceBundleRefs: [{ refId: "sr-1" }],
    },
    validationFindings: [],
    ...overrides,
  };
}

function validReviewPayload(
  overrides: Partial<RfpHldDesignModelReviewPayload> = {}
): RfpHldDesignModelReviewPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
    sourceArtifactIds: [MODEL_ID, SOURCE_BUNDLE_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: SOURCE_BUNDLE_ID,
    reviewedAt: CREATED_AT,
    reviewer: { type: "deterministic" },
    sourceReferences: [{ id: "rsr-1", artifactId: MODEL_ID }],
    findings: [
      {
        id: "rf-1", severity: "warning", category: "unclear_narrative",
        message: "Thin rationale for the access layer.", sourceReferenceIds: ["rsr-1"],
        recommendedAction: "Clarify the rationale.",
      },
    ],
    recommendation: "rebuild_recommended",
    boundedRebuildInstructions: {
      summary: "Clarify the rationale.",
      instructions: "Redraft using the approved inputs only.",
      maxAttempts: 1,
    },
    ...overrides,
  };
}

function validRequestPayload(
  overrides: Partial<RfpHldDesignModelRebuildRequestPayload> = {}
): RfpHldDesignModelRebuildRequestPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
    sourceArtifactIds: [MODEL_ID, REVIEW_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceReviewArtifactId: REVIEW_ID,
    requestedBy: "engineer@example.com",
    requestedAt: CREATED_AT,
    reason: "The access layer rationale must be clearer for the customer review.",
    instructions: "Redraft using the approved inputs only and stay within the approved source artifacts.",
    status: "active",
    ...overrides,
  };
}

function artifactOf(
  id: string,
  type: ProjectArtifact["type"],
  payload: object,
  status: ProjectArtifact["status"] = "approved",
  sourceArtifactIds: string[] = []
): ProjectArtifact {
  return {
    id,
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type,
    status,
    version: 1,
    payload: payload as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds,
    createdAt: new Date(CREATED_AT),
    updatedAt: new Date(CREATED_AT),
  };
}

function baseBundle(): RfpHldDesignModelCandidateInputBundle {
  const result = buildRfpHldDesignModelCandidateInput({
    projectId: PROJECT_ID,
    artifact: validSourceBundleArtifact(),
    createdBy: "drafter@example.com",
    createdAt: CREATED_AT,
  });
  if (result.status !== "ok") throw new Error("expected ok base bundle");
  return result.bundle;
}

function builderInput(over: {
  base?: RfpHldDesignModelCandidateInputBundle;
  model?: ProjectArtifact;
  review?: ProjectArtifact;
  request?: ProjectArtifact;
} = {}): BuildRfpHldDesignModelRebuildCandidateInputInput {
  return {
    baseCandidateInput: over.base ?? baseBundle(),
    sourceModelArtifact: over.model ?? artifactOf(MODEL_ID, "hld_design_model", validModelPayload()),
    sourceReviewArtifact: over.review ?? artifactOf(REVIEW_ID, "hld_design_model_review", validReviewPayload()),
    rebuildRequestArtifact:
      over.request ?? artifactOf(REQUEST_ID, "hld_design_model_rebuild_request", validRequestPayload(), "needs_review"),
  };
}

// --------------------------------------------------------------------------
// Happy path
// --------------------------------------------------------------------------

describe("buildRfpHldDesignModelRebuildCandidateInput - happy path", () => {
  it("attaches a rebuild context to a fresh copy of the base bundle", () => {
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const b = result.bundle;
    expect(b.payloadKind).toBe("rfp_hld_design_model_candidate_input");
    expect(b.sourceHldSourceBundleArtifactId).toBe(SOURCE_BUNDLE_ID);
    expect(b.coveredDomains).toEqual(["campus_switching"]);
    const ctx = b.rebuildContext;
    expect(ctx).toBeDefined();
    if (!ctx) return;
    expect(ctx.sourceHldSourceBundleArtifactId).toBe(SOURCE_BUNDLE_ID);
    expect(ctx.rebuildRequestArtifactId).toBe(REQUEST_ID);
    expect(ctx.sourceModelArtifactId).toBe(MODEL_ID);
    expect(ctx.sourceReviewArtifactId).toBe(REVIEW_ID);
    expect(ctx.reviewRecommendation).toBe("rebuild_recommended");
    expect(ctx.engineerReason).toContain("access layer rationale");
    expect(ctx.engineerInstructions).toContain("approved inputs only");
  });

  it("returns fresh copies, not aliases of the base bundle", () => {
    const base = baseBundle();
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput({ base }));
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.bundle).not.toBe(base);
    expect(result.bundle.coveredDomains).not.toBe(base.coveredDomains);
    result.bundle.coveredDomains.push("wireless");
    expect(base.coveredDomains).toEqual(["campus_switching"]);
  });

  it("carries the explicit redraft limitations as a fresh array", () => {
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput());
    if (result.status !== "ok") throw new Error("expected ok");
    const ctx = result.bundle.rebuildContext;
    if (!ctx) throw new Error("expected rebuild context");
    expect(ctx.limitations).toEqual([...RFP_HLD_DESIGN_MODEL_REBUILD_DRAFTING_LIMITATIONS]);
    expect(ctx.limitations).not.toBe(RFP_HLD_DESIGN_MODEL_REBUILD_DRAFTING_LIMITATIONS);
    const text = ctx.limitations.join("\n").toLowerCase();
    expect(text).toContain("same approved");
    expect(text).toContain("one bounded correction pass");
    expect(text).toContain("scope");
    expect(text).toContain("sku");
    expect(text).toContain("pricing");
    expect(text).toContain("catalog");
    expect(text).toContain("configuration");
    expect(text).toContain("hardware");
    expect(text).toContain("topology");
    expect(text).toContain("diagram");
    expect(text).toContain("export");
    expect(text).toContain("certified");
    expect(text).toContain("approval");
  });
});

// --------------------------------------------------------------------------
// Sanitized whitelist
// --------------------------------------------------------------------------

describe("buildRfpHldDesignModelRebuildCandidateInput - sanitized whitelist", () => {
  it("summarizes the prior model with counts, never the raw model body", () => {
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput());
    if (result.status !== "ok") throw new Error("expected ok");
    const ctx = result.bundle.rebuildContext;
    if (!ctx) throw new Error("expected rebuild context");
    expect(ctx.priorModelSummary).toEqual({
      coveredDomains: ["campus_switching"],
      excludedDomains: ["service_only"],
      designSectionCount: 1,
      topologyNodeCount: 2,
      topologyLinkCount: 1,
      topologyZoneCount: 1,
      diagramIntentCount: 1,
      sourceReferenceCount: 1,
      validationFindingCount: 0,
    });
    expect(ctx.priorModelSummary).not.toHaveProperty("designSections");
    expect(ctx.priorModelSummary).not.toHaveProperty("topology");
    expect(ctx.priorModelSummary).not.toHaveProperty("sourceReferences");
  });

  it("does not leak the raw model body, files, or pricing/provider authority", () => {
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput());
    if (result.status !== "ok") throw new Error("expected ok");
    const serialized = JSON.stringify(result.bundle.rebuildContext);
    for (const marker of [
      "ZzzSectionTitle", "ZzzDecisionLabel", "ZzzNodeLabel", "ZzzZoneLabel", "ZzzDiagramTitle",
    ]) {
      expect(serialized).not.toContain(marker);
    }
    for (const key of [
      "filePath", "storagePath", "sourceFileIds", "unitPrice", "totalPrice",
      "catalogDecision", "configurationDecision", "quantityChange", "rawText",
      "documentText", "systemPrompt", "rawResponse",
    ]) {
      expect(serialized).not.toContain(key);
    }
  });

  it("includes bounded advisory finding summaries", () => {
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput());
    if (result.status !== "ok") throw new Error("expected ok");
    const ctx = result.bundle.rebuildContext;
    if (!ctx) throw new Error("expected rebuild context");
    expect(ctx.reviewFindingSummaries).toHaveLength(1);
    expect(ctx.reviewFindingSummaries[0]).toEqual({
      id: "rf-1",
      severity: "warning",
      category: "unclear_narrative",
      message: "Thin rationale for the access layer.",
      recommendedAction: "Clarify the rationale.",
    });
  });

  it("bounds long finding messages defensively", () => {
    const longMsg = "detail ".repeat(80).trim();
    const review = artifactOf(REVIEW_ID, "hld_design_model_review", validReviewPayload({
      findings: [
        {
          id: "rf-1", severity: "warning", category: "unclear_narrative",
          message: longMsg, sourceReferenceIds: ["rsr-1"],
        },
      ],
    }));
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput({ review }));
    if (result.status !== "ok") throw new Error("expected ok");
    const ctx = result.bundle.rebuildContext;
    if (!ctx) throw new Error("expected rebuild context");
    const msg = ctx.reviewFindingSummaries[0].message;
    expect(msg.length).toBeLessThanOrEqual(300);
    expect(msg.length).toBeLessThan(longMsg.length);
    expect(longMsg.startsWith(msg)).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Fail-closed mismatch gates
// --------------------------------------------------------------------------

describe("buildRfpHldDesignModelRebuildCandidateInput - fail-closed mismatch gates", () => {
  it("blocks when the request does not reference the provided model", () => {
    const model = artifactOf("model-OTHER", "hld_design_model", validModelPayload());
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput({ model }));
    expect(result).toEqual({ status: "blocked", reason: "request_model_mismatch" });
  });

  it("blocks when the request does not reference the provided review", () => {
    const review = artifactOf("review-OTHER", "hld_design_model_review", validReviewPayload());
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput({ review }));
    expect(result).toEqual({ status: "blocked", reason: "request_review_mismatch" });
  });

  it("blocks when the review is about a different model", () => {
    const review = artifactOf(REVIEW_ID, "hld_design_model_review", validReviewPayload({
      sourceHldDesignModelArtifactId: "model-OTHER",
      sourceArtifactIds: ["model-OTHER", SOURCE_BUNDLE_ID],
      sourceReferences: [{ id: "rsr-1", artifactId: "model-OTHER" }],
    }));
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput({ review }));
    expect(result).toEqual({ status: "blocked", reason: "review_model_mismatch" });
  });

  it("blocks when the model builds on a different source bundle than the base", () => {
    const model = artifactOf(MODEL_ID, "hld_design_model", validModelPayload({
      sourceHldSourceBundleArtifactId: "hsb-OTHER",
      sourceArtifactIds: ["hsb-OTHER"],
    }));
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput({ model }));
    expect(result).toEqual({ status: "blocked", reason: "source_bundle_mismatch" });
  });

  it("blocks when the review references a different source bundle than the base", () => {
    const review = artifactOf(REVIEW_ID, "hld_design_model_review", validReviewPayload({
      sourceHldSourceBundleArtifactId: "hsb-OTHER",
      sourceArtifactIds: [MODEL_ID, "hsb-OTHER"],
    }));
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput({ review }));
    expect(result).toEqual({ status: "blocked", reason: "source_bundle_mismatch" });
  });

  it("blocks when the advisory review does not justify a rebuild", () => {
    const proceed = validReviewPayload({ recommendation: "proceed_to_engineer_review" });
    delete (proceed as Partial<RfpHldDesignModelReviewPayload>).boundedRebuildInstructions;
    const review = artifactOf(REVIEW_ID, "hld_design_model_review", proceed);
    const result = buildRfpHldDesignModelRebuildCandidateInput(builderInput({ review }));
    expect(result).toEqual({ status: "blocked", reason: "review_does_not_justify_rebuild" });
  });
});

// --------------------------------------------------------------------------
// Invalid payloads + programmer misuse
// --------------------------------------------------------------------------

describe("buildRfpHldDesignModelRebuildCandidateInput - invalid payloads", () => {
  it("rejects an invalid model payload", () => {
    const bad = validModelPayload() as unknown as Record<string, unknown>;
    bad.payloadKind = "nope";
    const result = buildRfpHldDesignModelRebuildCandidateInput(
      builderInput({ model: artifactOf(MODEL_ID, "hld_design_model", bad) })
    );
    expect(result.status).toBe("invalid_model_payload");
    if (result.status !== "invalid_model_payload") return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects an invalid review payload", () => {
    const bad = validReviewPayload() as unknown as Record<string, unknown>;
    bad.payloadKind = "nope";
    const result = buildRfpHldDesignModelRebuildCandidateInput(
      builderInput({ review: artifactOf(REVIEW_ID, "hld_design_model_review", bad) })
    );
    expect(result.status).toBe("invalid_review_payload");
  });

  it("rejects an invalid request payload", () => {
    const bad = validRequestPayload() as unknown as Record<string, unknown>;
    bad.status = "stale";
    const result = buildRfpHldDesignModelRebuildCandidateInput(
      builderInput({ request: artifactOf(REQUEST_ID, "hld_design_model_rebuild_request", bad) })
    );
    expect(result.status).toBe("invalid_request_payload");
  });
});

describe("buildRfpHldDesignModelRebuildCandidateInput - programmer misuse", () => {
  it("throws when the base bundle has the wrong payloadKind", () => {
    const base = { ...baseBundle(), payloadKind: "nope" } as unknown as RfpHldDesignModelCandidateInputBundle;
    expect(() => buildRfpHldDesignModelRebuildCandidateInput(builderInput({ base }))).toThrow();
  });

  it("throws when a required artifact object is missing", () => {
    // Construct the input directly: builderInput's ?? default would mask a null.
    expect(() =>
      buildRfpHldDesignModelRebuildCandidateInput({
        baseCandidateInput: baseBundle(),
        sourceModelArtifact: null as unknown as ProjectArtifact,
        sourceReviewArtifact: artifactOf(REVIEW_ID, "hld_design_model_review", validReviewPayload()),
        rebuildRequestArtifact: artifactOf(
          REQUEST_ID, "hld_design_model_rebuild_request", validRequestPayload(), "needs_review"
        ),
      })
    ).toThrow();
  });
});

// --------------------------------------------------------------------------
// Source purity
// --------------------------------------------------------------------------

describe("project-rfp-hld-design-model-rebuild-candidate-input - source purity", () => {
  const sourcePath = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-rebuild-candidate-input.ts"
  );
  const source = readFileSync(sourcePath, "utf8");

  it("is ASCII-only (source and test)", () => {
    const testSource = readFileSync(
      join(
        process.cwd(),
        "tests/lib/projects/project-rfp-hld-design-model-rebuild-candidate-input.test.ts"
      ),
      "utf8"
    );
    expect(/^[\x00-\x7F]*$/.test(source)).toBe(true);
    expect(/^[\x00-\x7F]*$/.test(testSource)).toBe(true);
  });

  it("imports only canonical project types and the HLD contracts", () => {
    const specifiers = Array.from(
      source.matchAll(/from\s+"([^"]+)"/g),
      (m: RegExpMatchArray) => m[1]
    );
    const allowed = new Set([
      "@/types/project",
      "@/lib/projects/project-rfp-hld-design-model-candidate-input",
      "@/lib/projects/project-rfp-hld-design-model",
      "@/lib/projects/project-rfp-hld-design-model-review",
      "@/lib/projects/project-rfp-hld-design-model-rebuild-request",
    ]);
    for (const spec of specifiers) {
      expect(allowed.has(spec)).toBe(true);
    }
  });

  it("references no forbidden runtime/provider/io modules or calls", () => {
    const forbidden = [
      "node:fs",
      "node:path",
      "next/server",
      "react",
      "@anthropic-ai",
      "openai",
      "generateText",
      "generateObject",
      "chat.completions",
      "pdf-parse",
      "mammoth",
      "readFileSync",
      "require(",
      "process.env",
      "fetch(",
    ];
    for (const token of forbidden) {
      expect(source.includes(token)).toBe(false);
    }
  });
});
