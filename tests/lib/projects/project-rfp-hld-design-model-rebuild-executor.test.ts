import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
  listProjectArtifacts: vi.fn(),
  createProjectArtifactVersion: vi.fn(),
  retireProjectArtifactVersion: vi.fn(),
}));

import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifacts,
  createProjectArtifactVersion,
  retireProjectArtifactVersion,
} from "@/lib/db/project-artifact-store";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import { RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-design-model-review";
import { RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-design-model-rebuild-request";
import type { RfpHldDesignModelDraftingExecutor } from "@/lib/projects/project-rfp-hld-design-model-drafting-executor";
import { executeRfpHldDesignModelRebuild } from "@/lib/projects/project-rfp-hld-design-model-rebuild-executor";
import type { Project, ProjectArtifact } from "@/types/project";

const TENANT_ID = "tenant-1";
const PROJECT_ID = "proj-1";
const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const REVIEW_ID = "hdr-1";
const REQUEST_ID = "hrr-1";
const CREATED_AT = "2026-06-24T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);
const EXECUTED_BY = "engineer@example.com";

const UPSTREAM_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"];

const mockGetProjectById = vi.mocked(getProjectById);
const mockGetArtifact = vi.mocked(getProjectArtifactById);
const mockListArtifacts = vi.mocked(listProjectArtifacts);
const mockCreateArtifact = vi.mocked(createProjectArtifactVersion);
const mockRetire = vi.mocked(retireProjectArtifactVersion);

// HLD provider env vars the configured drafting factory reads; saved/restored so
// this service suite stays deterministic even when the shell has them set.
const HLD_PROVIDER_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MODEL",
  "BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MAX_TOKENS",
] as const;
const savedHldProviderEnv: Record<string, string | undefined> = {};

function validProject(mode: Project["mode"] = "rfp"): Project {
  return {
    id: PROJECT_ID,
    tenantId: TENANT_ID,
    name: "Acme RFP",
    customerName: "Acme",
    mode,
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
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

function bundleArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: BUNDLE_ID,
    projectId: PROJECT_ID,
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

/** A design-model payload that satisfies the Stage 6C source-compatibility gate. */
function validDesignModelPayload(): RfpHldDesignModelPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
    createdBy: EXECUTED_BY,
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
      zones: [
        { id: "z-1", label: "Campus Zone", nodeIds: ["n-1", "n-2"], sourceRefIds: ["sr-1"] },
      ],
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
    validationFindings: [
      {
        id: "vf-1", severity: "warning", code: "PARTIAL_DETAIL",
        message: "Some rack detail missing.", sourceRefIds: ["sr-1"],
      },
    ],
  };
}

function modelArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: MODEL_ID,
    projectId: PROJECT_ID,
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

/** A valid review for `modelId` that recommends a bounded redraft. */
function reviewPayloadFor(modelId = MODEL_ID): Record<string, unknown> {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
    sourceArtifactIds: [modelId, BUNDLE_ID],
    sourceHldDesignModelArtifactId: modelId,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    reviewedAt: CREATED_AT,
    reviewer: { type: "deterministic" },
    sourceReferences: [{ id: "rr-1", artifactId: modelId }],
    findings: [
      {
        id: "rf-1", severity: "warning", category: "source_mismatch",
        message: "Advisory finding to resolve.", sourceReferenceIds: ["rr-1"],
      },
    ],
    recommendation: "rebuild_recommended",
    boundedRebuildInstructions: {
      summary: "Redraft to resolve the advisory finding.",
      instructions:
        "Redraft from the same approved inputs and resolve the listed finding only.",
    },
  };
}

/** A valid review that does NOT justify a redraft. */
function reviewPayloadProceed(): Record<string, unknown> {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    reviewedAt: CREATED_AT,
    reviewer: { type: "deterministic" },
    sourceReferences: [{ id: "rr-1", artifactId: MODEL_ID }],
    findings: [
      {
        id: "rf-1", severity: "suggestion", category: "unclear_narrative",
        message: "Minor wording nit.", sourceReferenceIds: ["rr-1"],
      },
    ],
    recommendation: "proceed_to_engineer_review",
  };
}

function reviewArtifact(
  payload: Record<string, unknown> = reviewPayloadFor(),
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: REVIEW_ID,
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_review",
    status: "needs_review",
    version: 1,
    payload,
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function requestPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
    sourceArtifactIds: [MODEL_ID, REVIEW_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceReviewArtifactId: REVIEW_ID,
    requestedBy: "engineer@example.com",
    requestedAt: CREATED_AT,
    reason: "The advisory review flagged source-alignment findings to resolve.",
    instructions:
      "Redraft from the same approved source artifacts. Fix only the listed findings.",
    status: "active",
    ...overrides,
  };
}

function requestArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: REQUEST_ID,
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_rebuild_request",
    status: "needs_review",
    version: 1,
    payload: requestPayload(),
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, REVIEW_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

/** The new candidate model row a successful rebuild persists. */
function createdModelRow(): ProjectArtifact {
  return {
    id: "hdm-2",
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type: "hld_design_model",
    status: "needs_review",
    version: 2,
    payload: validDesignModelPayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
  };
}

function executorReturning(payload: unknown): RfpHldDesignModelDraftingExecutor {
  return vi.fn(async () => ({ payload }));
}

/** Wire getProjectArtifactById for request/model/review, overridable by id. */
function wireArtifacts(overrides: Record<string, ProjectArtifact | null> = {}): void {
  const map: Record<string, ProjectArtifact | null> = {
    [REQUEST_ID]: requestArtifact(),
    [MODEL_ID]: modelArtifact(),
    [REVIEW_ID]: reviewArtifact(),
    ...overrides,
  };
  mockGetArtifact.mockImplementation(async (_t, _p, id) =>
    id in map ? map[id] : null
  );
}

function baseInput(
  overrides: Partial<Parameters<typeof executeRfpHldDesignModelRebuild>[0]> = {}
): Parameters<typeof executeRfpHldDesignModelRebuild>[0] {
  return {
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    rebuildRequestArtifactId: REQUEST_ID,
    executedBy: EXECUTED_BY,
    createdAt: CREATED_DATE,
    executor: executorReturning(validDesignModelPayload()),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of HLD_PROVIDER_ENV_KEYS) {
    savedHldProviderEnv[key] = process.env[key];
    delete process.env[key];
  }
  mockGetProjectById.mockResolvedValue(validProject());
  mockListArtifacts.mockResolvedValue([bundleArtifact()]);
  wireArtifacts();
  mockCreateArtifact.mockResolvedValue(createdModelRow());
  // Default: pre-claim flips needs_review -> stale; any mark flips stale -> failed.
  mockRetire.mockImplementation(async (i) =>
    i.retiredStatus === "stale"
      ? requestArtifact({ status: "stale" })
      : requestArtifact({ status: "failed" })
  );
});

afterEach(() => {
  for (const key of HLD_PROVIDER_ENV_KEYS) {
    const original = savedHldProviderEnv[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("executeRfpHldDesignModelRebuild - programmer input", () => {
  it("throws on a blank rebuildRequestArtifactId before any store call", async () => {
    await expect(
      executeRfpHldDesignModelRebuild(baseInput({ rebuildRequestArtifactId: "  " }))
    ).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("throws on a blank executedBy before any store call", async () => {
    await expect(
      executeRfpHldDesignModelRebuild(baseInput({ executedBy: "" }))
    ).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });
});

describe("executeRfpHldDesignModelRebuild - happy path", () => {
  it("claims the request to stale BEFORE the executor, writes exactly one needs_review model, and runs no review", async () => {
    const executor = executorReturning(validDesignModelPayload());
    const result = await executeRfpHldDesignModelRebuild(baseInput({ executor }));

    expect(result.status).toBe("ok");

    // Pre-executor claim: retire(stale) happened, and before the executor call.
    expect(mockRetire).toHaveBeenCalledTimes(1);
    expect(mockRetire.mock.calls[0][0]).toEqual({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      artifactId: REQUEST_ID,
      expectedVersion: 1,
      expectedStatus: "needs_review",
      retiredStatus: "stale",
    });
    const executorMock = executor as unknown as { mock: { invocationCallOrder: number[] } };
    expect(mockRetire.mock.invocationCallOrder[0]).toBeLessThan(
      executorMock.mock.invocationCallOrder[0]
    );

    // Exactly one new hld_design_model, sourced by the source bundle only.
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    expect(mockCreateArtifact.mock.calls[0][0]).toMatchObject({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      stageId: "hld_design_delta_review",
      type: "hld_design_model",
      status: "needs_review",
      sourceFileIds: [],
      sourceArtifactIds: [BUNDLE_ID],
    });

    if (result.status !== "ok") return;
    expect(result.artifact.id).toBe("hdm-2");
    expect(result.artifact.status).toBe("needs_review");
    expect(result.consumedRequest.id).toBe(REQUEST_ID);
    expect(result.consumedRequest.status).toBe("stale");
    expect(result.sourceBundle.artifactId).toBe(BUNDLE_ID);
    expect(result.payloadSummary.topologyNodeCount).toBe(2);
    expect(result.payloadSummary.designSectionCount).toBe(1);
  });

  it("invokes the executor with the rebuild candidate input (carries the rebuild context)", async () => {
    const executor = executorReturning(validDesignModelPayload());
    await executeRfpHldDesignModelRebuild(baseInput({ executor }));

    const calls = (executor as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1);
    const candidateInput = (calls[0][0] as { candidateInput: Record<string, unknown> })
      .candidateInput;
    expect(candidateInput.payloadKind).toBe("rfp_hld_design_model_candidate_input");
    expect(candidateInput.sourceHldSourceBundleArtifactId).toBe(BUNDLE_ID);
    const rebuildContext = candidateInput.rebuildContext as Record<string, unknown>;
    expect(rebuildContext).toBeDefined();
    expect(rebuildContext.rebuildRequestArtifactId).toBe(REQUEST_ID);
    expect(rebuildContext.sourceModelArtifactId).toBe(MODEL_ID);
  });

  it("returns lean summaries with no raw payload body or tenantId", async () => {
    const result = await executeRfpHldDesignModelRebuild(baseInput());
    if (result.status !== "ok") throw new Error("expected ok");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TENANT_ID);
    expect(serialized).not.toContain("designSections");
    expect(serialized).not.toContain("sourceReferences");
    expect(serialized).not.toContain("Core Switch");
  });
});

describe("executeRfpHldDesignModelRebuild - concurrency / reuse safety", () => {
  it("does not call the executor or write a model when the pre-executor claim is lost", async () => {
    const executor = executorReturning(validDesignModelPayload());
    mockRetire.mockResolvedValue(null);

    const result = await executeRfpHldDesignModelRebuild(baseInput({ executor }));

    expect(result).toEqual({ status: "request_retire_failed", intendedStatus: "stale" });
    expect(executor).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks reuse when the request row is already retired (stale/failed/rejected)", async () => {
    for (const status of ["stale", "failed", "rejected"] as const) {
      vi.clearAllMocks();
      mockGetProjectById.mockResolvedValue(validProject());
      mockListArtifacts.mockResolvedValue([bundleArtifact()]);
      wireArtifacts({ [REQUEST_ID]: requestArtifact({ status }) });
      const result = await executeRfpHldDesignModelRebuild(baseInput());
      expect(result.status).toBe("request_not_active");
      expect(mockRetire).not.toHaveBeenCalled();
      expect(mockCreateArtifact).not.toHaveBeenCalled();
    }
  });

  it("blocks reuse when the request payload status is not active", async () => {
    wireArtifacts({
      [REQUEST_ID]: requestArtifact({ payload: requestPayload({ status: "consumed" }) }),
    });
    const result = await executeRfpHldDesignModelRebuild(baseInput());
    expect(result.status).toBe("request_not_active");
    expect(mockRetire).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("executeRfpHldDesignModelRebuild - project + request gates", () => {
  it("returns not_found when the project is absent", async () => {
    mockGetProjectById.mockResolvedValue(null);
    expect((await executeRfpHldDesignModelRebuild(baseInput())).status).toBe("not_found");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a non-RFP project and leaks no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(validProject("quick_bom"));
    const result = await executeRfpHldDesignModelRebuild(baseInput());
    expect(result.status).toBe("wrong_mode");
    expect(JSON.stringify(result)).not.toContain(TENANT_ID);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns request_not_found when the request artifact is missing", async () => {
    wireArtifacts({ [REQUEST_ID]: null });
    expect((await executeRfpHldDesignModelRebuild(baseInput())).status).toBe(
      "request_not_found"
    );
  });

  it("returns artifact_not_rebuild_request for a wrong type/stage artifact", async () => {
    wireArtifacts({ [REQUEST_ID]: requestArtifact({ type: "hld_design_model" }) });
    const result = await executeRfpHldDesignModelRebuild(baseInput());
    expect(result.status).toBe("artifact_not_rebuild_request");
    expect(mockRetire).not.toHaveBeenCalled();
  });

  it("returns request_payload_invalid for a forbidden-instruction payload", async () => {
    wireArtifacts({
      [REQUEST_ID]: requestArtifact({
        payload: requestPayload({
          instructions: "Select the C9300 SKU and set the pricing.",
        }),
      }),
    });
    const result = await executeRfpHldDesignModelRebuild(baseInput());
    expect(result.status).toBe("request_payload_invalid");
    if (result.status !== "request_payload_invalid") return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("executeRfpHldDesignModelRebuild - source model / review gates", () => {
  it("blocks an approved, rejected, or stale source model", async () => {
    for (const status of ["approved", "rejected", "stale"] as const) {
      vi.clearAllMocks();
      mockGetProjectById.mockResolvedValue(validProject());
      mockListArtifacts.mockResolvedValue([bundleArtifact()]);
      wireArtifacts({ [MODEL_ID]: modelArtifact({ status }) });
      const result = await executeRfpHldDesignModelRebuild(baseInput());
      expect(result.status).toBe("source_model_unavailable");
      expect(mockRetire).not.toHaveBeenCalled();
    }
  });

  it("returns source_review_unavailable when the review is about a different model", async () => {
    wireArtifacts({ [REVIEW_ID]: reviewArtifact(reviewPayloadFor("other-model")) });
    const result = await executeRfpHldDesignModelRebuild(baseInput());
    expect(result.status).toBe("source_review_unavailable");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns source_review_does_not_justify_rebuild for a proceed recommendation with no blocking finding", async () => {
    wireArtifacts({ [REVIEW_ID]: reviewArtifact(reviewPayloadProceed()) });
    const result = await executeRfpHldDesignModelRebuild(baseInput());
    expect(result.status).toBe("source_review_does_not_justify_rebuild");
    expect(mockRetire).not.toHaveBeenCalled();
  });
});

describe("executeRfpHldDesignModelRebuild - source bundle gates", () => {
  it("returns stale_source_bundle when the model no longer builds on the current approved bundle", async () => {
    wireArtifacts({ [MODEL_ID]: modelArtifact({ sourceArtifactIds: ["stale-bundle"] }) });
    const result = await executeRfpHldDesignModelRebuild(baseInput());
    expect(result.status).toBe("stale_source_bundle");
    expect(mockRetire).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns candidate_input_blocked with invalid_model_payload when the source model body is invalid", async () => {
    wireArtifacts({ [MODEL_ID]: modelArtifact({ payload: { not: "a model" } }) });
    const result = await executeRfpHldDesignModelRebuild(baseInput());
    expect(result.status).toBe("candidate_input_blocked");
    if (result.status !== "candidate_input_blocked") return;
    expect(result.reason).toBe("invalid_model_payload");
    expect(mockRetire).not.toHaveBeenCalled();
  });
});

describe("executeRfpHldDesignModelRebuild - executor availability", () => {
  it("returns drafting_unavailable for an explicit null executor and does not retire", async () => {
    const result = await executeRfpHldDesignModelRebuild(baseInput({ executor: null }));
    expect(result).toEqual({ status: "drafting_unavailable" });
    expect(mockRetire).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns drafting_unavailable when no executor is supplied (configured factory null) and does not retire", async () => {
    const result = await executeRfpHldDesignModelRebuild(baseInput({ executor: undefined }));
    expect(result).toEqual({ status: "drafting_unavailable" });
    expect(mockRetire).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("executeRfpHldDesignModelRebuild - post-claim failures", () => {
  it("marks the claimed request failed and returns a controlled drafting_failed when the executor throws", async () => {
    const executor: RfpHldDesignModelDraftingExecutor = vi.fn(async () => {
      throw new Error("provider exploded: secret prompt body");
    });
    const result = await executeRfpHldDesignModelRebuild(baseInput({ executor }));

    expect(result).toEqual({
      status: "drafting_failed",
      error: "hld_design_model_rebuild_drafting_failed",
    });
    expect(JSON.stringify(result)).not.toContain("secret prompt body");
    // Pre-claim (stale) then mark-failed (failed); no model written.
    expect(mockRetire).toHaveBeenCalledTimes(2);
    expect(mockRetire.mock.calls[0][0].retiredStatus).toBe("stale");
    expect(mockRetire.mock.calls[1][0]).toMatchObject({
      expectedStatus: "stale",
      retiredStatus: "failed",
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("marks the claimed request failed and writes no model on an invalid draft payload", async () => {
    const result = await executeRfpHldDesignModelRebuild(
      baseInput({ executor: executorReturning({ not: "a model" }) })
    );
    expect(result.status).toBe("invalid_draft_payload");
    if (result.status !== "invalid_draft_payload") return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(mockRetire).toHaveBeenCalledTimes(2);
    expect(mockRetire.mock.calls[1][0].retiredStatus).toBe("failed");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns request_retire_failed (intendedStatus failed) without provider leakage when the failed mark cannot match", async () => {
    const executor: RfpHldDesignModelDraftingExecutor = vi.fn(async () => {
      throw new Error("provider exploded: secret prompt body");
    });
    // Pre-claim succeeds; the stale -> failed mark loses the row.
    mockRetire.mockImplementation(async (i) =>
      i.retiredStatus === "stale" ? requestArtifact({ status: "stale" }) : null
    );

    const result = await executeRfpHldDesignModelRebuild(baseInput({ executor }));

    expect(result).toEqual({ status: "request_retire_failed", intendedStatus: "failed" });
    expect(JSON.stringify(result)).not.toContain("secret prompt body");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("project-rfp-hld-design-model-rebuild-executor - source purity", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-rebuild-executor.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("reads no raw files, parsers, AI/provider SDK, pricing, or catalog modules", () => {
    for (const forbidden of [
      "pdf-parse",
      "mammoth",
      "@anthropic-ai",
      "@google/generative-ai",
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "storagePath",
      "filePath",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("is ASCII-only (source and test)", () => {
    const testSource = readFileSync(
      join(
        process.cwd(),
        "tests/lib/projects/project-rfp-hld-design-model-rebuild-executor.test.ts"
      ),
      "utf8"
    );
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
