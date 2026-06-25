import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRfpHldGenerationReadiness,
  type RfpHldGenerationReadinessBlockerCode,
} from "@/lib/projects/project-rfp-hld-generation-readiness";
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
import type { ProjectArtifact } from "@/types/project";

const PROJECT = "proj-6f";
const CREATED_AT = "2026-06-25T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);
const BUNDLE_ID = "hsb-approved-1";
const MODEL_ID = "hdm-approved-1";
const REVIEW_ID = "hrev-current-1";
const UPSTREAM_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"];

function artifact(overrides: Partial<ProjectArtifact>): ProjectArtifact {
  return {
    id: "artifact-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "approved",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function upstreamArtifacts(): ProjectArtifact[] {
  return [
    artifact({
      id: "evp-1",
      stageId: "intake_package_review",
      type: "evidence_package",
      payload: { payloadKind: "rfp_evidence_package" },
    }),
    artifact({
      id: "req-1",
      stageId: "requirements_baseline_review",
      type: "requirements_baseline",
      payload: { requirements: [{ id: "r1", text: "campus switching" }] },
    }),
    artifact({
      id: "cmx-1",
      stageId: "compliance_matrix_review",
      type: "compliance_matrix",
      payload: { rows: [{ id: "c1", requirementText: "campus switching" }] },
    }),
    artifact({
      id: "cfg-1",
      stageId: "configuration_expansion_review",
      type: "configuration_expansion",
      payload: { acceptedLines: [{ id: "l1", sku: "C9300", description: "campus switch" }] },
    }),
    artifact({
      id: "hint-1",
      type: "hld_intake",
      payload: { answers: [] },
    }),
    artifact({
      id: "hrs-1",
      type: "hld_readiness_snapshot",
      payload: { payloadKind: "rfp_hld_readiness_snapshot" },
    }),
    artifact({
      id: "dkp-1",
      type: "design_knowledge_pack",
      payload: {
        payloadKind: "rfp_hld_design_knowledge_pack",
        domain: "campus_switching",
        title: "Campus switching pack",
      },
    }),
  ];
}

function sourceBundlePayload(): RfpHldSourceBundlePayload {
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
        artifactId: "evp-1",
        artifactType: "evidence_package",
        stageId: "intake_package_review",
        status: "approved",
        version: 1,
      },
      requirementsBaseline: {
        artifactId: "req-1",
        artifactType: "requirements_baseline",
        stageId: "requirements_baseline_review",
        status: "approved",
        version: 1,
      },
      complianceMatrix: {
        artifactId: "cmx-1",
        artifactType: "compliance_matrix",
        stageId: "compliance_matrix_review",
        status: "approved",
        version: 1,
      },
      configurationAuthority: {
        artifactId: "cfg-1",
        artifactType: "configuration_expansion",
        stageId: "configuration_expansion_review",
        status: "approved",
        version: 1,
        sourceKind: "configuration_expansion",
      },
      hldIntake: {
        artifactId: "hint-1",
        artifactType: "hld_intake",
        stageId: "hld_design_delta_review",
        status: "approved",
        version: 1,
      },
      hldReadinessSnapshot: {
        artifactId: "hrs-1",
        artifactType: "hld_readiness_snapshot",
        stageId: "hld_design_delta_review",
        status: "approved",
        version: 1,
        payloadKind: "rfp_hld_readiness_snapshot",
      },
    },
    designKnowledgePackRefs: [
      {
        artifactId: "dkp-1",
        artifactType: "design_knowledge_pack",
        stageId: "hld_design_delta_review",
        status: "approved",
        version: 1,
        payloadKind: "rfp_hld_design_knowledge_pack",
        domain: "campus_switching",
      },
    ],
    coveredDomains: ["campus_switching"],
    missingDomains: [],
    excludedDomains: ["service_only"],
    assumptions: [{ id: "a1", statement: "Existing core remains." }],
    constraints: [],
    warnings: [],
    blockers: [],
    validation: { status: "passed", checkedAt: CREATED_AT },
  };
}

function sourceBundle(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return artifact({
    id: BUNDLE_ID,
    type: "hld_source_bundle",
    status: "approved",
    version: 1,
    payload: sourceBundlePayload() as unknown as Record<string, unknown>,
    sourceArtifactIds: UPSTREAM_IDS.slice(),
    ...overrides,
  });
}

function modelPayload(): RfpHldDesignModelPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
    createdBy: "drafter@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: [BUNDLE_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceBundleVersion: 1,
    sourceBundlePayloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    coveredDomains: ["campus_switching"],
    excludedDomains: ["service_only"],
    sourceReferences: [{ id: "sr-1", kind: "source_bundle", artifactId: BUNDLE_ID }],
    assumptionRefs: [{ refId: "sr-1" }],
    constraintRefs: [{ refId: "sr-1" }],
    designSections: [
      {
        id: "ds-1",
        domain: "campus_switching",
        title: "Campus switching design",
        sourceRefIds: ["sr-1"],
        decisions: [{ id: "dec-1", label: "Use approved campus switching design", sourceRefIds: ["sr-1"] }],
      },
    ],
    topology: {
      nodes: [
        { id: "n-1", label: "Core", nodeType: "switch", sourceRefIds: ["sr-1"] },
        { id: "n-2", label: "Access", nodeType: "switch", sourceRefIds: ["sr-1"] },
      ],
      links: [
        { id: "ln-1", label: "Uplink", fromNodeId: "n-1", toNodeId: "n-2", linkType: "ethernet", sourceRefIds: ["sr-1"] },
      ],
      zones: [{ id: "z-1", label: "Campus", nodeIds: ["n-1", "n-2"], sourceRefIds: ["sr-1"] }],
    },
    diagramIntents: [{ id: "di-1", title: "Campus topology", intentType: "physical", sourceRefIds: ["sr-1"] }],
    traceability: {
      requirementRefs: [{ refId: "sr-1" }],
      complianceRefs: [{ refId: "sr-1" }],
      configurationRefs: [{ refId: "sr-1" }],
      sourceBundleRefs: [{ refId: "sr-1" }],
    },
    validationFindings: [],
  };
}

function model(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return artifact({
    id: MODEL_ID,
    type: "hld_design_model",
    status: "approved",
    version: 1,
    payload: modelPayload() as unknown as Record<string, unknown>,
    sourceArtifactIds: [BUNDLE_ID],
    ...overrides,
  });
}

function reviewPayload(
  overrides: Partial<RfpHldDesignModelReviewPayload> = {}
): RfpHldDesignModelReviewPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    reviewedAt: CREATED_AT,
    reviewer: { type: "deterministic" },
    sourceReferences: [{ id: "ref-1", artifactId: MODEL_ID }],
    findings: [
      {
        id: "f-warn",
        severity: "warning",
        category: "topology_risk",
        message: "Advisory warning only.",
        sourceReferenceIds: ["ref-1"],
      },
    ],
    recommendation: "proceed_to_engineer_review",
    ...overrides,
  };
}

function review(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return artifact({
    id: REVIEW_ID,
    type: "hld_design_model_review",
    status: "generated",
    version: 1,
    payload: reviewPayload() as unknown as Record<string, unknown>,
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    ...overrides,
  });
}

function validArtifacts(): ProjectArtifact[] {
  return [...upstreamArtifacts(), sourceBundle(), model(), review()];
}

function blockerCodes(artifacts: ProjectArtifact[]): RfpHldGenerationReadinessBlockerCode[] {
  return getRfpHldGenerationReadiness({ projectId: PROJECT, artifacts }).blockers.map((b) => b.code);
}

describe("getRfpHldGenerationReadiness", () => {
  it("returns ready for the approved model, current source bundle, and non-blocking review", () => {
    const report = getRfpHldGenerationReadiness({ projectId: PROJECT, artifacts: validArtifacts() });

    expect(report.status).toBe("ready");
    expect(report.ready).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.approvedModel?.id).toBe(MODEL_ID);
    expect(report.sourceBundle?.id).toBe(BUNDLE_ID);
    expect(report.review?.id).toBe(REVIEW_ID);
    expect(report.review?.findingCounts).toEqual({ blocking: 0, warning: 1, suggestion: 0 });
    expect(JSON.stringify(report)).not.toContain("payloadKind");
    expect(JSON.stringify(report)).not.toContain("engineer@example.com");
  });

  it("blocks when there is no approved HLD design model", () => {
    const artifacts = validArtifacts().filter((a) => a.type !== "hld_design_model");
    expect(blockerCodes(artifacts)).toContain("no_approved_hld_design_model");
  });

  it("blocks when the latest approved model is on the wrong stage", () => {
    const artifacts = [
      ...upstreamArtifacts(),
      sourceBundle(),
      model({ stageId: "intake_package_review" }),
      review(),
    ];
    const report = getRfpHldGenerationReadiness({ projectId: PROJECT, artifacts });

    expect(report.status).toBe("blocked");
    expect(report.ready).toBe(false);
    expect(report.blockers.map((b) => b.code)).toContain("approved_model_wrong_stage");
    expect(report.approvedModel?.stageId).toBe("intake_package_review");
    expect(
      report.blockers.find((b) => b.code === "approved_model_wrong_stage")?.message
    ).toContain("hld_design_delta_review");
  });

  it("fails closed before downstream validation for a wrong-stage approved model", () => {
    const artifacts = [model({ stageId: "intake_package_review" })];
    const report = getRfpHldGenerationReadiness({ projectId: PROJECT, artifacts });

    expect(report.ready).toBe(false);
    expect(report.blockers.map((b) => b.code)).toEqual(["approved_model_wrong_stage"]);
  });

  it("blocks when the approved model payload is invalid", () => {
    const artifacts = [...upstreamArtifacts(), sourceBundle(), model({ payload: { junk: true } }), review()];
    expect(blockerCodes(artifacts)).toContain("approved_model_payload_invalid");
  });

  it("blocks when the approved model source bundle is missing", () => {
    const artifacts = validArtifacts().filter((a) => a.id !== BUNDLE_ID);
    expect(blockerCodes(artifacts)).toContain("source_bundle_missing");
  });

  it("blocks when the referenced source bundle is not approved", () => {
    const artifacts = [...upstreamArtifacts(), sourceBundle({ status: "needs_review" }), model(), review()];
    expect(blockerCodes(artifacts)).toContain("source_bundle_not_approved");
  });

  it("blocks when model/source compatibility fails", () => {
    const payload = modelPayload();
    payload.sourceBundleVersion = 99;
    const artifacts = [
      ...upstreamArtifacts(),
      sourceBundle(),
      model({ payload: payload as unknown as Record<string, unknown> }),
      review(),
    ];
    expect(blockerCodes(artifacts)).toContain("model_source_compatibility_failed");
  });

  it("blocks when a newer source bundle supersedes the approved model source", () => {
    const newerPayload = sourceBundlePayload();
    newerPayload.createdAt = "2026-06-25T01:00:00.000Z";
    const artifacts = [
      ...validArtifacts(),
      sourceBundle({
        id: "hsb-approved-2",
        version: 2,
        payload: newerPayload as unknown as Record<string, unknown>,
      }),
    ];
    expect(blockerCodes(artifacts)).toContain("source_bundle_not_current");
  });

  it("blocks when a source-bundle upstream authority has a newer unapproved version", () => {
    const artifacts = [
      ...validArtifacts(),
      artifact({
        id: "req-2",
        stageId: "requirements_baseline_review",
        type: "requirements_baseline",
        status: "needs_review",
        version: 2,
        payload: { requirements: [] },
      }),
    ];
    expect(blockerCodes(artifacts)).toContain("source_bundle_upstream_not_current");
  });

  it("blocks when no current matching review exists", () => {
    const artifacts = validArtifacts().filter((a) => a.type !== "hld_design_model_review");
    expect(blockerCodes(artifacts)).toContain("matching_review_missing");
  });

  it("blocks when the latest matching review payload is invalid", () => {
    const artifacts = [...upstreamArtifacts(), sourceBundle(), model(), review({ payload: { junk: true } })];
    expect(blockerCodes(artifacts)).toContain("matching_review_payload_invalid");
  });

  it("blocks when the latest review points to a different model and source ids", () => {
    const payload = reviewPayload({
      sourceArtifactIds: ["other-model", BUNDLE_ID],
      sourceHldDesignModelArtifactId: "other-model",
      sourceReferences: [{ id: "ref-1", artifactId: "other-model" }],
    });
    const artifacts = [
      ...upstreamArtifacts(),
      sourceBundle(),
      model(),
      review({ payload: payload as unknown as Record<string, unknown> }),
    ];
    const codes = blockerCodes(artifacts);
    expect(codes).toContain("matching_review_model_mismatch");
    expect(codes).toContain("matching_review_source_ids_mismatch");
  });

  it("blocks when the current review has blocking findings", () => {
    const payload = reviewPayload({
      findings: [
        {
          id: "f-block",
          severity: "blocking",
          category: "source_mismatch",
          message: "Blocking finding.",
          sourceReferenceIds: ["ref-1"],
        },
      ],
      recommendation: "reject_required",
    });
    const artifacts = [
      ...upstreamArtifacts(),
      sourceBundle(),
      model(),
      review({ payload: payload as unknown as Record<string, unknown> }),
    ];
    expect(blockerCodes(artifacts)).toContain("matching_review_blocking_findings");
  });

  it("selects the latest review and fails closed on its invalid payload", () => {
    const artifacts = [
      ...upstreamArtifacts(),
      sourceBundle(),
      model(),
      review({ id: "review-old", version: 1 }),
      review({ id: "review-new", version: 2, payload: { junk: true } }),
    ];
    const report = getRfpHldGenerationReadiness({ projectId: PROJECT, artifacts });
    expect(report.review?.id).toBe("review-new");
    expect(report.blockers.map((b) => b.code)).toContain("matching_review_payload_invalid");
  });
});

describe("Stage 6F service static guards", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-generation-readiness.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-generation-readiness.test.ts"
  );

  it("does not import raw readers, providers, pricing, catalog, or generation modules", () => {
    const src = readFileSync(SRC_PATH, "utf8");
    for (const forbidden of [
      "node:fs",
      "node:path",
      "project-file-store",
      "project-evidence-store",
      "createProjectArtifactVersion",
      "createProjectApproval",
      "pdf-parse",
      "mammoth",
      "xlsx",
      "@anthropic-ai",
      "@google/generative-ai",
      "@/lib/ai",
      "@/lib/llm",
      "pricing",
      "catalog",
      "draw.io",
      "mermaid",
      "technical_proposal",
      "export_package",
    ]) {
      expect(src).not.toContain(forbidden);
    }
  });

  it("keeps the source and test file ASCII-only", () => {
    const src = readFileSync(SRC_PATH, "utf8");
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(src)).toBe(false);
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});
