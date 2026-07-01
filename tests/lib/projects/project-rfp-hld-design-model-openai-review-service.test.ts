import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact, ProjectArtifactStatus } from "@/types/project";

// Mock the store boundaries only. The Stage 6C contract validator, the pure
// readiness/compatibility helpers, and the provider-neutral review boundary stay
// REAL so the currency gate and candidate wrapping are true integration checks.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockListProjectArtifacts,
  mockCreateArtifact,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockListProjectArtifacts: vi.fn(),
  mockCreateArtifact: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProjectById }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifacts: mockListProjectArtifacts,
  createProjectArtifactVersion: mockCreateArtifact,
}));

import {
  createRfpHldDesignModelOpenAiReview,
  getConfiguredRfpHldDesignModelOpenAiReviewExecutor,
  type CreateRfpHldDesignModelOpenAiReviewInput,
  type CreateRfpHldDesignModelOpenAiReviewResult,
} from "@/lib/projects/project-rfp-hld-design-model-openai-review-service";
import type { RfpHldDesignModelOpenAiReviewExecutor } from "@/lib/projects/project-rfp-hld-design-model-openai-review-executor";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";

const TENANT = "44444444-4444-4444-4444-444444444444";
const PROJECT = "proj-1";
const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const REVIEWER = "u-openai-7";
const CREATED_AT = "2026-06-26T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);
const REVIEWED_AT = new Date("2026-06-26T10:00:00.000Z");
const UPSTREAM_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"];
const PAYLOAD_SENTINEL = "SECRET-CREATED-BY-VALUE";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Acme RFP",
    customerName: "Acme",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

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
    coveredDomains: ["campus_switching"],
    missingDomains: [],
    excludedDomains: ["service_only"],
    assumptions: [{ id: "a1", statement: "Existing core remains.", sourceArtifactId: "req-1" }],
    constraints: [{ id: "c1", statement: "No customer BoQ change.", sourceDomain: "campus_switching" }],
    warnings: [],
    blockers: [],
    validation: { status: "passed", checkedAt: CREATED_AT },
  };
}

function validBundleArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: BUNDLE_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "approved",
    version: 1,
    payload: validBundlePayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: UPSTREAM_IDS.slice(),
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function validDesignModelPayload(): RfpHldDesignModelPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
    createdBy: "drafter@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: [BUNDLE_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceBundleVersion: 1,
    sourceBundlePayloadKind: "rfp_hld_source_bundle",
    coveredDomains: ["campus_switching"],
    excludedDomains: ["service_only"],
    sourceReferences: [{ id: "sr-1", kind: "source_bundle", artifactId: BUNDLE_ID }],
    assumptionRefs: [{ refId: "sr-1" }],
    constraintRefs: [{ refId: "sr-1" }],
    designSections: [
      {
        id: "ds-1", domain: "campus_switching", title: "Campus Switching Design",
        sourceRefIds: ["sr-1"],
        decisions: [{ id: "dec-1", label: "Use C9300 series", sourceRefIds: ["sr-1"] }],
      },
    ],
    topology: {
      nodes: [
        { id: "n-1", label: "Core Switch", nodeType: "switch", sourceRefIds: ["sr-1"] },
        { id: "n-2", label: "Access Switch", nodeType: "switch", sourceRefIds: ["sr-1"] },
      ],
      links: [
        {
          id: "l-1", label: "Core to Access", fromNodeId: "n-1", toNodeId: "n-2",
          linkType: "ethernet", sourceRefIds: ["sr-1"],
        },
      ],
      zones: [{ id: "z-1", label: "Campus Zone", nodeIds: ["n-1", "n-2"], sourceRefIds: ["sr-1"] }],
    },
    diagramIntents: [
      { id: "di-1", title: "Campus Topology", intentType: "physical", sourceRefIds: ["sr-1"] },
    ],
    traceability: {
      requirementRefs: [{ refId: "sr-1" }],
      complianceRefs: [{ refId: "sr-1" }],
      configurationRefs: [{ refId: "sr-1" }],
      sourceBundleRefs: [{ refId: "sr-1" }],
    },
    validationFindings: [],
  };
}

function validModelArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: MODEL_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model",
    status: "needs_review",
    version: 1,
    payload: validDesignModelPayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function setArtifactRows(model: ProjectArtifact | null, bundle: ProjectArtifact | null): void {
  mockGetArtifactById.mockImplementation(async (_t: string, _p: string, id: string) => {
    if (id === MODEL_ID) return model;
    if (id === BUNDLE_ID) return bundle;
    return null;
  });
}

function createdReview(): ProjectArtifact {
  return {
    id: "hrev-openai-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_review",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
  };
}

function warningExecutor(): RfpHldDesignModelOpenAiReviewExecutor {
  return vi.fn(async () => ({
    findings: [
      {
        severity: "warning",
        category: "topology_risk",
        message: "Advisory warning only.",
        sources: ["model"],
      },
    ],
  }));
}

function blockingExecutor(): RfpHldDesignModelOpenAiReviewExecutor {
  return vi.fn(async () => ({
    findings: [
      {
        severity: "blocking",
        category: "source_mismatch",
        message: "The model does not match its approved source bundle.",
      },
    ],
  }));
}

function run(
  overrides: Partial<CreateRfpHldDesignModelOpenAiReviewInput> = {}
): Promise<CreateRfpHldDesignModelOpenAiReviewResult> {
  return createRfpHldDesignModelOpenAiReview({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: MODEL_ID,
    reviewedBy: REVIEWER,
    reviewedAt: REVIEWED_AT,
    executor: warningExecutor(),
    ...overrides,
  });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  setArtifactRows(validModelArtifact(), validBundleArtifact());
  mockListProjectArtifacts
    .mockReset()
    .mockResolvedValue([validBundleArtifact(), validModelArtifact()]);
  mockCreateArtifact.mockReset().mockResolvedValue(createdReview());
});

describe("createRfpHldDesignModelOpenAiReview - input validation", () => {
  it("throws on blank artifactId or reviewedBy before any store call", async () => {
    await expect(run({ artifactId: " " })).rejects.toThrow("artifactId");
    await expect(run({ reviewedBy: " " })).rejects.toThrow("reviewedBy");
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });
});

describe("createRfpHldDesignModelOpenAiReview - gates (write nothing)", () => {
  it("returns not_found for a missing project and never calls the executor", async () => {
    const executor = warningExecutor();
    mockGetProjectById.mockResolvedValue(null);
    expect(await run({ executor })).toEqual({ status: "not_found" });
    expect(executor).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await run();
    expect(result.status).toBe("wrong_mode");
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found / not_hld_design_model / not_reviewable", async () => {
    setArtifactRows(null, validBundleArtifact());
    expect((await run()).status).toBe("artifact_not_found");

    setArtifactRows(validModelArtifact({ type: "hld_source_bundle" }), validBundleArtifact());
    expect((await run()).status).toBe("artifact_not_hld_design_model");

    setArtifactRows(validModelArtifact({ status: "approved" }), validBundleArtifact());
    expect((await run()).status).toBe("artifact_not_reviewable");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks an invalid persisted model payload and never calls the executor", async () => {
    const executor = warningExecutor();
    setArtifactRows(validModelArtifact({ payload: { junk: true } }), validBundleArtifact());
    const result = await run({ executor });
    expect(result.status).toBe("invalid_hld_design_model_payload");
    expect(executor).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks a stale model whose row no longer ties to the current bundle", async () => {
    setArtifactRows(validModelArtifact({ sourceArtifactIds: ["stale"] }), validBundleArtifact());
    const result = await run();
    expect(result.status).toBe("stale_hld_design_model_payload");
    if (result.status !== "stale_hld_design_model_payload") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_artifact_ids_mismatch");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("createRfpHldDesignModelOpenAiReview - executor boundary", () => {
  it("returns unavailable and writes nothing when no executor is configured", async () => {
    expect(await run({ executor: null })).toEqual({ status: "unavailable" });
    expect(await run({ executor: undefined })).toEqual({ status: "unavailable" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns review_failed and writes nothing when the executor throws", async () => {
    const executor: RfpHldDesignModelOpenAiReviewExecutor = vi.fn(async () => {
      throw new Error("boom");
    });
    expect(await run({ executor })).toEqual({
      status: "review_failed",
      error: "hld_quality_review_failed",
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns invalid_candidate_output and writes nothing on a bad candidate", async () => {
    const executor: RfpHldDesignModelOpenAiReviewExecutor = vi.fn(async () => ({
      findings: [{ severity: "critical" }],
    }));
    const result = await run({ executor });
    expect(result.status).toBe("invalid_candidate_output");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("createRfpHldDesignModelOpenAiReview - success", () => {
  it("creates exactly one needs_review ai_advisory review from a fake executor", async () => {
    const result = await run();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.recommendation).toBe("proceed_to_engineer_review");
    expect(result.findingCount).toBe(1);
    expect(result.findingCountsBySeverity).toEqual({ blocking: 0, warning: 1, suggestion: 0 });

    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const call = mockCreateArtifact.mock.calls[0][0];
    expect(call.type).toBe("hld_design_model_review");
    expect(call.status).toBe("needs_review");
    expect(call.stageId).toBe("hld_design_delta_review");
    expect(call.sourceArtifactIds).toEqual([MODEL_ID, BUNDLE_ID]);
    expect(call.payload.payloadKind).toBe("rfp_hld_design_model_review");
    expect(call.payload.reviewer).toEqual({ type: "ai_advisory", id: REVIEWER });
    expect(call.payload.reviewedAt).toBe(REVIEWED_AT.toISOString());
  });

  it("wraps blocking findings into a rebuild_recommended review", async () => {
    const result = await run({ executor: blockingExecutor() });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.recommendation).toBe("rebuild_recommended");
    expect(result.findingCountsBySeverity.blocking).toBe(1);
    const call = mockCreateArtifact.mock.calls[0][0];
    expect(call.payload.boundedRebuildInstructions.maxAttempts).toBe(1);
  });

  it("returns lean summaries without leaking the payload body or tenantId", async () => {
    const payload = validDesignModelPayload();
    payload.createdBy = PAYLOAD_SENTINEL;
    setArtifactRows(
      validModelArtifact({ payload: payload as unknown as Record<string, unknown> }),
      validBundleArtifact()
    );
    const result = await run();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    const json = JSON.stringify(result);
    expect(json).not.toContain(PAYLOAD_SENTINEL);
    expect(json).not.toContain(TENANT);
  });
});

describe("createRfpHldDesignModelOpenAiReview - configured factory", () => {
  it("returns null so the review stays unavailable until wired", () => {
    expect(getConfiguredRfpHldDesignModelOpenAiReviewExecutor()).toBeNull();
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-openai-review-service.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports no provider SDK, fs/path, raw reader, or env", () => {
    for (const forbidden of [
      'from "openai"',
      "@anthropic-ai",
      "node:fs",
      "node:path",
      "process.env",
      "project-file-store",
      "project-evidence-store",
    ]) {
      expect(source, `forbidden: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keeps the source and test ASCII-only", () => {
    const test = readFileSync(join(process.cwd(), "tests/lib/projects/project-rfp-hld-design-model-openai-review-service.test.ts"), "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});
