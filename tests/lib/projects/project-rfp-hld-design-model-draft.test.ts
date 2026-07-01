import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: vi.fn(),
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  listProjectArtifacts: vi.fn(),
  createProjectArtifactVersion: vi.fn(),
}));
vi.mock("@/lib/projects/project-rfp-hld-final-authority-regeneration-guard", () => ({
  evaluateRfpHldFinalAuthorityRegenerationGuard: vi.fn(),
}));

import { getProjectById } from "@/lib/db/project-store";
import {
  listProjectArtifacts,
  createProjectArtifactVersion,
} from "@/lib/db/project-artifact-store";
import { evaluateRfpHldFinalAuthorityRegenerationGuard } from "@/lib/projects/project-rfp-hld-final-authority-regeneration-guard";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import { buildRfpHldDesignModelCandidateInput } from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import type { RfpHldDesignModelDraftingExecutor } from "@/lib/projects/project-rfp-hld-design-model-drafting-executor";
import { createRfpHldDesignModelDraft } from "@/lib/projects/project-rfp-hld-design-model-draft";
import type { Project, ProjectArtifact } from "@/types/project";

const TENANT_ID = "tenant-1";
const PROJECT_ID = "proj-1";
const BUNDLE_ID = "hsb-1";
const CREATED_AT = "2026-06-24T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);
const CREATED_BY = "drafter@example.com";

const UPSTREAM_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"];

const mockGetProjectById = vi.mocked(getProjectById);
const mockListArtifacts = vi.mocked(listProjectArtifacts);
const mockCreateArtifact = vi.mocked(createProjectArtifactVersion);
const mockGuard = vi.mocked(evaluateRfpHldFinalAuthorityRegenerationGuard);

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

function validBundleArtifact(): ProjectArtifact {
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
  };
}

/** A design-model payload that satisfies the Stage 6C source-compatibility gate. */
function validDesignModelPayload(): RfpHldDesignModelPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
    createdBy: CREATED_BY,
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

function createdArtifactRow(): ProjectArtifact {
  return {
    id: "hdm-1",
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
  };
}

/** An executor that resolves with the supplied (default valid) payload. */
function executorReturning(payload: unknown): RfpHldDesignModelDraftingExecutor {
  return vi.fn(async () => ({ payload }));
}

function baseInput(
  overrides: Partial<Parameters<typeof createRfpHldDesignModelDraft>[0]> = {}
): Parameters<typeof createRfpHldDesignModelDraft>[0] {
  return {
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    createdBy: CREATED_BY,
    createdAt: CREATED_DATE,
    executor: executorReturning(validDesignModelPayload()),
    ...overrides,
  };
}

// HLD provider env vars that the configured drafting factory reads. They are
// saved and restored around every test so this service suite stays
// deterministic even when the developer or CI shell has them set.
const HLD_PROVIDER_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MODEL",
  "BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MAX_TOKENS",
] as const;

const savedHldProviderEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of HLD_PROVIDER_ENV_KEYS) {
    savedHldProviderEnv[key] = process.env[key];
    delete process.env[key];
  }
  mockGetProjectById.mockResolvedValue(validProject());
  mockListArtifacts.mockResolvedValue([validBundleArtifact()]);
  mockCreateArtifact.mockResolvedValue(createdArtifactRow());
  mockGuard.mockResolvedValue({ blocked: false });
});

afterEach(() => {
  for (const key of HLD_PROVIDER_ENV_KEYS) {
    const original = savedHldProviderEnv[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

describe("createRfpHldDesignModelDraft - programmer input", () => {
  it("throws on a blank projectId before any store call", async () => {
    await expect(
      createRfpHldDesignModelDraft(baseInput({ projectId: "   " }))
    ).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockListArtifacts).not.toHaveBeenCalled();
  });

  it("throws on a blank createdBy before any store call", async () => {
    await expect(
      createRfpHldDesignModelDraft(baseInput({ createdBy: "" }))
    ).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });
});

describe("createRfpHldDesignModelDraft - project gates", () => {
  it("returns not_found when the project is absent", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await createRfpHldDesignModelDraft(baseInput());
    expect(result).toEqual({ status: "not_found" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode and leaks no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(validProject("quick_bom"));
    const result = await createRfpHldDesignModelDraft(baseInput());
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") return;
    expect(result.project.id).toBe(PROJECT_ID);
    expect(JSON.stringify(result)).not.toContain(TENANT_ID);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("createRfpHldDesignModelDraft - final HLD authority guard", () => {
  const FINAL_AUTHORITY_SUMMARY = {
    project: { id: PROJECT_ID, name: "Acme RFP", mode: "rfp", createdAt: "x", updatedAt: "y" },
    artifact: { id: "hdoc-1", type: "hld_document", status: "approved" },
    payloadSummary: { payloadKind: "rfp_hld_document", drawioXmlLength: 42 },
    finalAuthorityStatus: "approved_manual_drawio_upload",
  };

  it("returns final_hld_already_approved after the project/mode gate and before readiness/write", async () => {
    mockGuard.mockResolvedValue({ blocked: true, finalAuthority: FINAL_AUTHORITY_SUMMARY as never });

    const result = await createRfpHldDesignModelDraft(baseInput());

    expect(result).toEqual({
      status: "final_hld_already_approved",
      finalAuthority: FINAL_AUTHORITY_SUMMARY,
    });
    expect(mockGuard).toHaveBeenCalledWith({ tenantId: TENANT_ID, projectId: PROJECT_ID });
    expect(mockListArtifacts).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("createRfpHldDesignModelDraft - readiness blocked", () => {
  it("blocks when there is no source bundle", async () => {
    mockListArtifacts.mockResolvedValue([]);
    const result = await createRfpHldDesignModelDraft(baseInput());
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") return;
    expect(result.code).toBe("missing_source_bundle");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks when the latest source bundle is not approved", async () => {
    const artifact = validBundleArtifact();
    artifact.status = "needs_review";
    mockListArtifacts.mockResolvedValue([artifact]);
    const result = await createRfpHldDesignModelDraft(baseInput());
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") return;
    expect(result.code).toBe("latest_source_bundle_not_approved");
  });

  it("blocks on an invalid source-bundle payload", async () => {
    const artifact = validBundleArtifact();
    (artifact.payload as Record<string, unknown>).payloadKind = "nope";
    mockListArtifacts.mockResolvedValue([artifact]);
    const result = await createRfpHldDesignModelDraft(baseInput());
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") return;
    expect(result.code).toBe("invalid_source_bundle_payload");
  });

  it("blocks on a row/payload sourceArtifactIds mismatch", async () => {
    const artifact = validBundleArtifact();
    artifact.sourceArtifactIds = UPSTREAM_IDS.slice(0, 6);
    mockListArtifacts.mockResolvedValue([artifact]);
    const result = await createRfpHldDesignModelDraft(baseInput());
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") return;
    expect(result.code).toBe("source_bundle_artifact_mismatch");
  });
});

describe("createRfpHldDesignModelDraft - executor availability", () => {
  it("returns drafting_unavailable for an explicit null executor and writes nothing", async () => {
    const result = await createRfpHldDesignModelDraft(baseInput({ executor: null }));
    expect(result).toEqual({ status: "drafting_unavailable" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns drafting_unavailable when no executor is supplied (configured factory is null)", async () => {
    const result = await createRfpHldDesignModelDraft(
      baseInput({ executor: undefined })
    );
    expect(result).toEqual({ status: "drafting_unavailable" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns drafting_failed without exposing the thrown detail", async () => {
    const executor: RfpHldDesignModelDraftingExecutor = vi.fn(async () => {
      throw new Error("provider exploded: secret prompt body");
    });
    const result = await createRfpHldDesignModelDraft(baseInput({ executor }));
    expect(result).toEqual({
      status: "drafting_failed",
      error: "hld_design_model_drafting_failed",
    });
    expect(JSON.stringify(result)).not.toContain("secret prompt body");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("createRfpHldDesignModelDraft - hard validation gate", () => {
  it("rejects an arbitrary invalid executor payload and writes nothing", async () => {
    const result = await createRfpHldDesignModelDraft(
      baseInput({ executor: executorReturning({ not: "a model" }) })
    );
    expect(result.status).toBe("invalid_draft_payload");
    if (result.status !== "invalid_draft_payload") return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects a payload whose sourceBundleVersion does not match the bundle", async () => {
    const payload = validDesignModelPayload();
    payload.sourceBundleVersion = 99;
    const result = await createRfpHldDesignModelDraft(
      baseInput({ executor: executorReturning(payload) })
    );
    expect(result.status).toBe("invalid_draft_payload");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects a payload whose source bundle id does not match", async () => {
    const payload = validDesignModelPayload();
    payload.sourceHldSourceBundleArtifactId = "other-bundle";
    payload.sourceArtifactIds = ["other-bundle"];
    payload.sourceReferences = [
      { id: "sr-1", kind: "source_bundle", artifactId: "other-bundle" },
    ];
    const result = await createRfpHldDesignModelDraft(
      baseInput({ executor: executorReturning(payload) })
    );
    expect(result.status).toBe("invalid_draft_payload");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects a payload whose domains do not match the bundle", async () => {
    const payload = validDesignModelPayload();
    payload.coveredDomains = ["wireless"];
    const result = await createRfpHldDesignModelDraft(
      baseInput({ executor: executorReturning(payload) })
    );
    expect(result.status).toBe("invalid_draft_payload");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("createRfpHldDesignModelDraft - happy path", () => {
  it("invokes the executor with exactly the Stage 6D-002 candidate input", async () => {
    const executor = executorReturning(validDesignModelPayload());
    await createRfpHldDesignModelDraft(baseInput({ executor }));

    const expected = buildRfpHldDesignModelCandidateInput({
      projectId: PROJECT_ID,
      artifact: validBundleArtifact(),
      createdBy: CREATED_BY,
      createdAt: CREATED_AT,
    });
    if (expected.status !== "ok") throw new Error("expected ok candidate input");

    expect(executor).toHaveBeenCalledTimes(1);
    const callArg = (executor as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as { candidateInput: unknown };
    expect(callArg.candidateInput).toEqual(expected.bundle);
  });

  it("creates exactly one needs_review hld_design_model sourced by the source bundle", async () => {
    const result = await createRfpHldDesignModelDraft(baseInput());
    expect(result.status).toBe("ok");
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const arg = mockCreateArtifact.mock.calls[0][0];
    expect(arg).toMatchObject({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      stageId: "hld_design_delta_review",
      type: "hld_design_model",
      status: "needs_review",
      sourceFileIds: [],
      sourceArtifactIds: [BUNDLE_ID],
    });
    expect(arg.payload).toEqual(
      validDesignModelPayload() as unknown as Record<string, unknown>
    );
  });

  it("returns lean summaries and no raw payload body", async () => {
    const result = await createRfpHldDesignModelDraft(baseInput());
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.artifact.id).toBe("hdm-1");
    expect(result.artifact.type).toBe("hld_design_model");
    expect(result.sourceBundle.artifactId).toBe(BUNDLE_ID);
    expect(result.payloadSummary.sourceReferenceCount).toBe(1);
    expect(result.payloadSummary.topologyNodeCount).toBe(2);
    expect(result.payloadSummary.designSectionCount).toBe(1);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("designSections");
    expect(serialized).not.toContain("Core Switch");
    expect(serialized).not.toContain("sourceReferences");
  });

  it("does not mutate the source artifact, executor input, or returned arrays", async () => {
    const artifact = validBundleArtifact();
    const before = structuredClone(artifact);
    mockListArtifacts.mockResolvedValue([artifact]);

    let received: { candidateInput: { coveredDomains: string[] } } | undefined;
    const executor: RfpHldDesignModelDraftingExecutor = vi.fn(async (i) => {
      received = i as typeof received;
      return { payload: validDesignModelPayload() };
    });

    const result = await createRfpHldDesignModelDraft(baseInput({ executor }));
    if (result.status !== "ok") throw new Error("expected ok");

    // Source artifact untouched.
    expect(artifact).toEqual(before);
    // Mutating the returned arrays does not reach the source artifact.
    result.artifact.sourceArtifactIds.push("x");
    result.sourceBundle.sourceArtifactIds.push("y");
    expect(artifact.sourceArtifactIds).toEqual(UPSTREAM_IDS);
    // Mutating the executor input copy does not reach the source payload.
    received?.candidateInput.coveredDomains.push("wireless");
    const payload = artifact.payload as unknown as RfpHldSourceBundlePayload;
    expect(payload.coveredDomains).toEqual(["campus_switching"]);
  });
});

describe("createRfpHldDesignModelDraft - module purity", () => {
  const sourcePath = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-draft.ts"
  );
  const source = readFileSync(sourcePath, "utf8");
  const importSpecifiers = Array.from(
    source.matchAll(/from\s+["']([^"']+)["']/g),
    (m) => m[1]
  );

  it("imports no forbidden provider/io/route/authority modules", () => {
    const forbidden = [
      "@anthropic-ai", "anthropic", "openai", "/adapters/",
      "node:fs", "node:path", "fs/promises",
      "project-file-store", "file-store", "evidence-store",
      "pdf-parse", "mammoth", "xlsx",
      "next/server", "next/navigation", "react",
      "approval", "catalog", "pricing", "/coordinator/", "/engines/",
      "config-expansion", "configuration-expansion",
    ];
    for (const spec of importSpecifiers) {
      for (const token of forbidden) {
        expect(spec.includes(token)).toBe(false);
      }
    }
  });

  it("references no provider/io call signatures or final-output terms", () => {
    const forbidden = [
      "generateText", "generateObject", "chat.completions",
      "readFileSync", "writeFileSync", "require(",
      "docxtemplater", "<mxfile", "drawio", "renderDiagram",
    ];
    for (const token of forbidden) {
      expect(source.includes(token)).toBe(false);
    }
  });

  it("is ASCII-only (source and test)", () => {
    const testSource = readFileSync(
      join(
        process.cwd(),
        "tests/lib/projects/project-rfp-hld-design-model-draft.test.ts"
      ),
      "utf8"
    );
    expect(/^[\x00-\x7F]*$/.test(source)).toBe(true);
    expect(/^[\x00-\x7F]*$/.test(testSource)).toBe(true);
  });
});
