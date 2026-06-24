import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  createProjectArtifactVersion: vi.fn(),
  getProjectArtifactById: vi.fn(),
  listProjectArtifacts: vi.fn(),
}));

import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";
import {
  createRfpHldDesignModelDeterministicReview,
  buildRfpHldDesignModelReviewPayload,
} from "@/lib/projects/project-rfp-hld-design-model-review-deterministic";

const getProjectMock = vi.mocked(getProjectById);
const getArtifactMock = vi.mocked(getProjectArtifactById);
const listArtifactsMock = vi.mocked(listProjectArtifacts);
const createMock = vi.mocked(createProjectArtifactVersion);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const TS = new Date("2026-01-01T00:00:00.000Z");
const TS_ISO = "2026-01-01T00:00:00.000Z";
const REVIEWED_BY = "eng-reviewer";
const REVIEWED_AT = new Date("2026-06-24T10:00:00.000Z");

// ---------------------------------------------------------------------------
// Minimal valid source-bundle payload. All authority refs are hardcoded.
// ---------------------------------------------------------------------------

const BUNDLE_SOURCE_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"];

function makeBundlePayload(): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_source_bundle",
    createdBy: "eng-1",
    createdAt: TS_ISO,
    sourceArtifactIds: [...BUNDLE_SOURCE_IDS],
    lineage: {
      compiledFromReadinessSnapshotArtifactId: "hrs-1",
      compiledArtifactIds: [...BUNDLE_SOURCE_IDS],
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
    excludedDomains: [],
    assumptions: [],
    constraints: [],
    warnings: [],
    blockers: [],
    validation: { status: "passed", checkedAt: TS_ISO },
  };
}

function makeBundle(id = "bundle-1"): ProjectArtifact {
  return {
    id,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "approved",
    version: 1,
    payload: makeBundlePayload(),
    sourceFileIds: [],
    sourceArtifactIds: [...BUNDLE_SOURCE_IDS],
    createdAt: TS,
    updatedAt: TS,
  };
}

function makeModelPayload(bundleId: string): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_design_model",
    createdBy: "eng-1",
    createdAt: TS_ISO,
    sourceArtifactIds: [bundleId],
    sourceHldSourceBundleArtifactId: bundleId,
    sourceBundleVersion: 1,
    sourceBundlePayloadKind: "rfp_hld_source_bundle",
    coveredDomains: ["campus_switching"],
    excludedDomains: [],
    sourceReferences: [
      { id: "ref-model", kind: "source_bundle", artifactId: bundleId },
      { id: "ref-bundle", kind: "source_bundle", artifactId: bundleId },
    ],
    assumptionRefs: [],
    constraintRefs: [],
    designSections: [
      {
        id: "s1",
        domain: "campus_switching",
        title: "Campus Switching Design",
        sourceRefIds: ["ref-model"],
        decisions: [
          { id: "d1", label: "Use L3 core design", sourceRefIds: ["ref-model"] },
        ],
      },
    ],
    topology: { nodes: [], links: [], zones: [] },
    diagramIntents: [],
    traceability: {
      requirementRefs: [],
      complianceRefs: [],
      configurationRefs: [],
      sourceBundleRefs: [],
    },
    validationFindings: [],
  };
}

function makeModel(
  id: string,
  bundleId: string,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model",
    status: "generated",
    version: 1,
    payload: makeModelPayload(bundleId),
    sourceFileIds: [],
    sourceArtifactIds: [bundleId],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

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
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeReviewArtifact(modelId: string, bundleId: string): ProjectArtifact {
  return {
    id: "review-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_review",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [modelId, bundleId],
    createdAt: TS,
    updatedAt: TS,
  };
}

function baseInput(artifactId: string) {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId,
    reviewedBy: REVIEWED_BY,
    reviewedAt: REVIEWED_AT,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("createRfpHldDesignModelDeterministicReview - happy path", () => {
  it("persists one needs_review review artifact and returns ok with proceed recommendation", async () => {
    const bundle = makeBundle("bundle-1");
    const model = makeModel("model-1", "bundle-1");
    const reviewArtifact = makeReviewArtifact("model-1", "bundle-1");

    getProjectMock.mockResolvedValue(makeProject());
    getArtifactMock.mockResolvedValue(model);
    listArtifactsMock.mockResolvedValue([bundle, model]);
    createMock.mockResolvedValue(reviewArtifact);

    const result = await createRfpHldDesignModelDeterministicReview(baseInput("model-1"));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.recommendation).toBe("proceed_to_engineer_review");
    expect(result.findingCount).toBe(0);
    expect(result.findingCountsBySeverity).toEqual({ blocking: 0, warning: 0, suggestion: 0 });
    expect(result.artifact.type).toBe("hld_design_model_review");
    expect(result.artifact.status).toBe("needs_review");
    expect(result.artifact.sourceArtifactIds).toContain("model-1");
    expect(result.artifact.sourceArtifactIds).toContain("bundle-1");

    expect(createMock).toHaveBeenCalledOnce();
    const createCall = createMock.mock.calls[0][0];
    expect(createCall.type).toBe("hld_design_model_review");
    expect(createCall.status).toBe("needs_review");
    expect(createCall.stageId).toBe("hld_design_delta_review");

    const payload = createCall.payload as Record<string, unknown>;
    expect(payload.payloadKind).toBe("rfp_hld_design_model_review");
    expect((payload.reviewer as Record<string, unknown>).type).toBe("deterministic");
    expect(Array.isArray(payload.sourceArtifactIds)).toBe(true);
    const srcIds = payload.sourceArtifactIds as string[];
    expect(srcIds).toContain("model-1");
    expect(srcIds).toContain("bundle-1");
    expect(payload.recommendation).toBe("proceed_to_engineer_review");
    expect(Array.isArray(payload.findings)).toBe(true);
    expect((payload.findings as unknown[]).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Project / artifact gate tests - each writes nothing
// ---------------------------------------------------------------------------

describe("createRfpHldDesignModelDeterministicReview - gates", () => {
  it("returns not_found when project is absent", async () => {
    getProjectMock.mockResolvedValue(null);
    const result = await createRfpHldDesignModelDeterministicReview(baseInput("any-id"));
    expect(result.status).toBe("not_found");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a non-rfp project", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "quick_bom" as Project["mode"] }));
    const result = await createRfpHldDesignModelDeterministicReview(baseInput("any-id"));
    expect(result.status).toBe("wrong_mode");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found when the artifact is absent", async () => {
    getProjectMock.mockResolvedValue(makeProject());
    getArtifactMock.mockResolvedValue(null);
    const result = await createRfpHldDesignModelDeterministicReview(baseInput("missing-id"));
    expect(result.status).toBe("artifact_not_found");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns artifact_not_hld_design_model for wrong artifact type", async () => {
    const artifact: ProjectArtifact = {
      ...makeModel("art-1", "b-1"),
      type: "hld_source_bundle" as ProjectArtifactType,
    };
    getProjectMock.mockResolvedValue(makeProject());
    getArtifactMock.mockResolvedValue(artifact);
    const result = await createRfpHldDesignModelDeterministicReview(baseInput("art-1"));
    expect(result.status).toBe("artifact_not_hld_design_model");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns artifact_not_hld_design_model for wrong stage", async () => {
    const artifact: ProjectArtifact = {
      ...makeModel("art-1", "b-1"),
      stageId: "intake_package_review" as ProjectStageId,
    };
    getProjectMock.mockResolvedValue(makeProject());
    getArtifactMock.mockResolvedValue(artifact);
    const result = await createRfpHldDesignModelDeterministicReview(baseInput("art-1"));
    expect(result.status).toBe("artifact_not_hld_design_model");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns artifact_not_reviewable for a non-reviewable status", async () => {
    const artifact: ProjectArtifact = {
      ...makeModel("art-1", "b-1"),
      status: "approved" as ProjectArtifactStatus,
    };
    getProjectMock.mockResolvedValue(makeProject());
    getArtifactMock.mockResolvedValue(artifact);
    const result = await createRfpHldDesignModelDeterministicReview(baseInput("art-1"));
    expect(result.status).toBe("artifact_not_reviewable");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns source_bundle_unavailable when no approved bundle exists", async () => {
    const model = makeModel("model-1", "bundle-1");
    getProjectMock.mockResolvedValue(makeProject());
    getArtifactMock.mockResolvedValue(model);
    listArtifactsMock.mockResolvedValue([model]);
    getArtifactMock.mockImplementation(async (_t, _p, id) =>
      id === "model-1" ? model : null
    );
    const result = await createRfpHldDesignModelDeterministicReview(baseInput("model-1"));
    expect(result.status).toBe("source_bundle_unavailable");
    expect(createMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Source-bundle drift: current bundle differs from model-declared bundle
// ---------------------------------------------------------------------------

describe("source-bundle drift: current bundle different from model-declared bundle", () => {
  it("reviews against the current bundle and records a blocking source_mismatch", async () => {
    const currentBundle = makeBundle("bundle-current");
    const model = makeModel("model-1", "bundle-old");

    getProjectMock.mockResolvedValue(makeProject());
    getArtifactMock.mockResolvedValue(model);
    listArtifactsMock.mockResolvedValue([currentBundle, model]);
    createMock.mockResolvedValue(makeReviewArtifact("model-1", "bundle-current"));

    const result = await createRfpHldDesignModelDeterministicReview(baseInput("model-1"));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.recommendation).toBe("rebuild_recommended");
    expect(result.findingCountsBySeverity.blocking).toBeGreaterThanOrEqual(1);

    const payload = createMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.sourceHldSourceBundleArtifactId).toBe("bundle-current");
    const findings = payload.findings as Array<Record<string, unknown>>;
    expect(findings.some((f) => f.category === "source_mismatch" && f.severity === "blocking")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid model payload with current source bundle
// ---------------------------------------------------------------------------

describe("invalid model payload with current source bundle", () => {
  it("persists an advisory review with blocking validation_gap when model payload is invalid", async () => {
    const bundle = makeBundle("bundle-1");
    const model: ProjectArtifact = {
      ...makeModel("model-bad", "bundle-1"),
      payload: { payloadKind: "rfp_hld_design_model" },
    };
    const reviewArtifact = makeReviewArtifact("model-bad", "bundle-1");

    getProjectMock.mockResolvedValue(makeProject());
    getArtifactMock.mockResolvedValue(model);
    listArtifactsMock.mockResolvedValue([bundle, model]);
    createMock.mockResolvedValue(reviewArtifact);

    const result = await createRfpHldDesignModelDeterministicReview(baseInput("model-bad"));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.recommendation).toBe("rebuild_recommended");
    expect(result.findingCountsBySeverity.blocking).toBeGreaterThanOrEqual(1);

    const payload = createMock.mock.calls[0][0].payload as Record<string, unknown>;
    const findings = payload.findings as Array<Record<string, unknown>>;
    expect(findings.some((f) => f.category === "validation_gap" && f.severity === "blocking")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildRfpHldDesignModelReviewPayload pure-function tests
// ---------------------------------------------------------------------------

describe("buildRfpHldDesignModelReviewPayload", () => {
  function makeInput(modelOverride?: Partial<ProjectArtifact>, bundleId = "bundle-1") {
    const bundle = makeBundle(bundleId);
    const model = makeModel("model-1", bundleId, modelOverride);
    return { model, bundle, reviewedBy: REVIEWED_BY, reviewedAt: REVIEWED_AT.toISOString() };
  }

  it("happy path: proceed_to_engineer_review with no findings", () => {
    const payload = buildRfpHldDesignModelReviewPayload(makeInput());
    expect(payload.recommendation).toBe("proceed_to_engineer_review");
    expect(payload.findings).toHaveLength(0);
    expect(payload.reviewer.type).toBe("deterministic");
    const srcIds = payload.sourceArtifactIds;
    expect(srcIds).toContain("model-1");
    expect(srcIds).toContain("bundle-1");
    expect(payload.boundedRebuildInstructions).toBeUndefined();
  });

  it("model source reference artifactId outside bundle produces blocking validation_gap", () => {
    const modelPayload = {
      ...makeModelPayload("bundle-1"),
      sourceReferences: [
        { id: "ref-model", kind: "source_bundle", artifactId: "bundle-1" },
        { id: "ref-bundle", kind: "source_bundle", artifactId: "bundle-1" },
        { id: "ref-outside", kind: "authority", artifactId: "OUTSIDE-ARTIFACT" },
      ],
    };
    const model = makeModel("model-1", "bundle-1", { payload: modelPayload });
    const bundle = makeBundle("bundle-1");
    const payload = buildRfpHldDesignModelReviewPayload({
      model,
      bundle,
      reviewedBy: REVIEWED_BY,
      reviewedAt: REVIEWED_AT.toISOString(),
    });
    expect(payload.findings.some((f) => f.category === "validation_gap" && f.severity === "blocking")).toBe(true);
  });

  it("unsupported model domain without a source-bundle knowledge pack produces blocking unsupported_domain", () => {
    const modelPayload = {
      ...makeModelPayload("bundle-1"),
      coveredDomains: ["campus_switching", "wireless"],
      sourceReferences: [
        { id: "ref-model", kind: "source_bundle", artifactId: "bundle-1" },
        { id: "ref-bundle", kind: "source_bundle", artifactId: "bundle-1" },
      ],
      designSections: [
        {
          id: "s1",
          domain: "campus_switching",
          title: "Campus Switching Design",
          sourceRefIds: ["ref-model"],
          decisions: [{ id: "d1", label: "Use L3 design", sourceRefIds: ["ref-model"] }],
        },
        {
          id: "s2",
          domain: "wireless",
          title: "Wireless Design",
          sourceRefIds: ["ref-model"],
          decisions: [{ id: "d2", label: "Use C9800", sourceRefIds: ["ref-model"] }],
        },
      ],
    };
    const model = makeModel("model-1", "bundle-1", { payload: modelPayload });
    const bundle = makeBundle("bundle-1");
    const payload = buildRfpHldDesignModelReviewPayload({
      model,
      bundle,
      reviewedBy: REVIEWED_BY,
      reviewedAt: REVIEWED_AT.toISOString(),
    });
    expect(payload.findings.some((f) => f.category === "unsupported_domain" && f.severity === "blocking")).toBe(true);
  });

  it("topology with an unknown node produces blocking topology_risk", () => {
    const modelPayload = {
      ...makeModelPayload("bundle-1"),
      topology: {
        nodes: [
          {
            id: "n1",
            label: "SW1",
            nodeType: "switch",
            domain: "campus_switching",
            sourceRefIds: ["UNKNOWN-REF"],
          },
        ],
        links: [],
        zones: [],
      },
    };
    const model = makeModel("model-1", "bundle-1", { payload: modelPayload });
    const bundle = makeBundle("bundle-1");
    const payload = buildRfpHldDesignModelReviewPayload({
      model,
      bundle,
      reviewedBy: REVIEWED_BY,
      reviewedAt: REVIEWED_AT.toISOString(),
    });
    expect(payload.findings.some((f) => f.category === "topology_risk" && f.severity === "blocking")).toBe(true);
  });

  it("final-output marker detected without copying marker text into the review payload", () => {
    const modelPayload = {
      ...makeModelPayload("bundle-1"),
      designSections: [
        {
          id: "s1",
          domain: "campus_switching",
          title: "final hld section",
          sourceRefIds: ["ref-model"],
          decisions: [{ id: "d1", label: "Use L3 design", sourceRefIds: ["ref-model"] }],
        },
      ],
    };
    const model = makeModel("model-1", "bundle-1", { payload: modelPayload });
    const bundle = makeBundle("bundle-1");
    const payload = buildRfpHldDesignModelReviewPayload({
      model,
      bundle,
      reviewedBy: REVIEWED_BY,
      reviewedAt: REVIEWED_AT.toISOString(),
    });
    const hasMarkerFinding = payload.findings.some(
      (f) => f.category === "validation_gap" && f.severity === "blocking"
    );
    expect(hasMarkerFinding).toBe(true);
    const fullText = JSON.stringify(payload);
    expect(fullText.toLowerCase()).not.toContain("```");
    expect(fullText.toLowerCase()).not.toContain("<html");
    expect(fullText.toLowerCase()).not.toContain("mermaid");
  });

  it("certification marker detected without copying marker text into the review payload", () => {
    const modelPayload = {
      ...makeModelPayload("bundle-1"),
      designSections: [
        {
          id: "s1",
          domain: "campus_switching",
          title: "cisco-certified architecture section",
          sourceRefIds: ["ref-model"],
          decisions: [{ id: "d1", label: "Use L3 design", sourceRefIds: ["ref-model"] }],
        },
      ],
    };
    const model = makeModel("model-1", "bundle-1", { payload: modelPayload });
    const bundle = makeBundle("bundle-1");
    const payload = buildRfpHldDesignModelReviewPayload({
      model,
      bundle,
      reviewedBy: REVIEWED_BY,
      reviewedAt: REVIEWED_AT.toISOString(),
    });
    expect(payload.findings.some((f) => f.category === "validation_gap" && f.severity === "blocking")).toBe(true);
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("cisco-certified");
  });

  it("source bundle assumptions with no model coverage produces warning missing_assumption", () => {
    const bundlePayload = {
      ...makeBundlePayload(),
      assumptions: [{ id: "a1", statement: "Network refreshed within 12 months." }],
    };
    const bundle = makeBundle("bundle-1");
    bundle.payload = bundlePayload;
    const model = makeModel("model-1", "bundle-1");
    const payload = buildRfpHldDesignModelReviewPayload({
      model,
      bundle,
      reviewedBy: REVIEWED_BY,
      reviewedAt: REVIEWED_AT.toISOString(),
    });
    expect(payload.findings.some((f) => f.category === "missing_assumption" && f.severity === "warning")).toBe(true);
  });

  it("empty design sections produce warning unclear_narrative", () => {
    const modelPayload = {
      ...makeModelPayload("bundle-1"),
      designSections: [],
    };
    const model = makeModel("model-1", "bundle-1", { payload: modelPayload });
    const bundle = makeBundle("bundle-1");
    const payload = buildRfpHldDesignModelReviewPayload({
      model,
      bundle,
      reviewedBy: REVIEWED_BY,
      reviewedAt: REVIEWED_AT.toISOString(),
    });
    expect(payload.findings.some((f) => f.category === "unclear_narrative" && f.severity === "warning")).toBe(true);
  });

  it("design section with no decisions produces suggestion unclear_narrative", () => {
    const modelPayload = {
      ...makeModelPayload("bundle-1"),
      designSections: [
        {
          id: "s1",
          domain: "campus_switching",
          title: "Campus Switching Design",
          sourceRefIds: ["ref-model"],
          decisions: [],
        },
      ],
    };
    const model = makeModel("model-1", "bundle-1", { payload: modelPayload });
    const bundle = makeBundle("bundle-1");
    const payload = buildRfpHldDesignModelReviewPayload({
      model,
      bundle,
      reviewedBy: REVIEWED_BY,
      reviewedAt: REVIEWED_AT.toISOString(),
    });
    expect(payload.findings.some((f) => f.category === "unclear_narrative" && f.severity === "suggestion")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Static purity checks
// ---------------------------------------------------------------------------

const SRC_PATH = join(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  "../../../src/lib/projects/project-rfp-hld-design-model-review-deterministic.ts"
);
const TEST_PATH = join(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  "project-rfp-hld-design-model-review-deterministic.test.ts"
);

describe("static purity", () => {
  it("source file imports no forbidden runtime specifiers", () => {
    const src = readFileSync(SRC_PATH, "utf8");
    const forbidden = [
      "node:fs",
      "node:path",
      "fetch(",
      "process.env",
      "openai",
      "anthropic",
      "/ai/",
      "/parsers/",
      "/adapters/",
      "/engines/",
      "/coordinator/",
      "/components/",
      "/routes/",
    ];
    for (const token of forbidden) {
      expect(src, `source must not contain "${token}"`).not.toContain(token);
    }
  });

  it("source and test files are ASCII-only", () => {
    const src = readFileSync(SRC_PATH, "utf8");
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(src), "source must be ASCII-only").toBe(false);
    expect(/[^\x00-\x7F]/.test(test), "test must be ASCII-only").toBe(false);
  });
});
