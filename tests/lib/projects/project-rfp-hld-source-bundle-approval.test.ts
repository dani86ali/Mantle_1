import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectFile,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";

// Mock the store boundaries only. isArtifactReviewable, the Stage 6B-001 contract
// validator, the pure Stage 6B-002 assembler, and the readiness/BoQ/domain helpers
// all stay REAL so the reviewability gate, payload re-validation, and the live
// recompile-and-compare are true integration checks over the supplied fixtures.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockListProjectArtifacts,
  mockCreateArtifactVersion,
  mockListProjectFiles,
  mockCreateApproval,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockListProjectArtifacts: vi.fn(),
  mockCreateArtifactVersion: vi.fn(),
  mockListProjectFiles: vi.fn(),
  mockCreateApproval: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifacts: mockListProjectArtifacts,
  createProjectArtifactVersion: mockCreateArtifactVersion,
}));
vi.mock("@/lib/db/project-file-store", () => ({
  listProjectFiles: mockListProjectFiles,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: mockCreateApproval,
}));

import {
  reviewRfpHldSourceBundleArtifact,
  type ReviewRfpHldSourceBundleArtifactInput,
  type ReviewRfpHldSourceBundleArtifactResult,
} from "@/lib/projects/project-rfp-hld-source-bundle-approval";
import {
  buildRfpHldSourceBundleDraft,
} from "@/lib/projects/project-rfp-hld-source-bundle-assembler";
import type { RfpHldSourceBundlePayload } from "@/lib/projects/project-rfp-hld-source-bundle";

const TENANT = "44444444-4444-4444-4444-444444444444";
const PROJECT = "proj-1";
const BUNDLE_ARTIFACT_ID = "art-bundle-1";
const CREATED_BY = "engineer-1";
const DECIDER = "u-approver-7";
const TS = new Date("2026-06-12T00:00:00.000Z");
const FIXED_CREATED = new Date("2026-06-23T09:15:00.000Z");
const DECIDED_AT = new Date("2026-06-23T10:00:00.000Z");
const PAYLOAD_SENTINEL = "SECRET-CREATED-BY-VALUE";

// ---- upstream fixtures (mirrors the Stage 6B-002 assembler test) -----------

const STAGE_BY_TYPE: Partial<Record<ProjectArtifactType, ProjectStageId>> = {
  evidence_package: "intake_package_review",
  requirements_baseline: "requirements_baseline_review",
  compliance_matrix: "compliance_matrix_review",
  configuration_expansion: "configuration_expansion_review",
  hld_intake: "hld_design_delta_review",
  design_knowledge_pack: "hld_design_delta_review",
  hld_readiness_snapshot: "hld_design_delta_review",
};

function mk(
  id: string,
  type: ProjectArtifactType,
  status: ProjectArtifactStatus,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id,
    projectId: PROJECT,
    stageId: STAGE_BY_TYPE[type] ?? "hld_design_delta_review",
    type,
    status,
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function boqFile(): ProjectFile {
  return {
    id: "file-boq-1",
    projectId: PROJECT,
    fileRole: "boq",
    fileName: "customer-boq.xlsx",
    storagePath: "s3://bucket/customer-boq.xlsx",
    uploadedAt: TS,
    retainUntil: new Date("2027-06-12T00:00:00.000Z"),
  };
}

const NORMAL_SOURCE_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "dkp-1"];

function normalArtifacts(): ProjectArtifact[] {
  return [
    mk("evp-1", "evidence_package", "approved"),
    mk("req-1", "requirements_baseline", "approved", {
      payload: {
        requirements: [
          { id: "r1", text: "Campus switching refresh using Catalyst 9300 access switches." },
        ],
      },
    }),
    mk("cmx-1", "compliance_matrix", "approved", {
      payload: {
        payloadKind: "rfp_compliance_matrix",
        sourceConfigurationExpansionArtifactId: "cfg-1",
        rows: [],
      },
    }),
    mk("cfg-1", "configuration_expansion", "approved", {
      payload: {
        acceptedLines: [{ sku: "C9300-48P", description: "Catalyst 9300 access switch" }],
      },
    }),
    mk("hint-1", "hld_intake", "approved", {
      payload: {
        payloadKind: "rfp_hld_intake",
        answers: [
          {
            fieldId: "resiliency_expectations",
            label: "Resiliency expectations",
            status: "unknown",
            notes: "awaiting customer",
          },
        ],
      },
    }),
    mk("dkp-1", "design_knowledge_pack", "approved", {
      payload: {
        payloadKind: "rfp_hld_design_knowledge_pack",
        source: "manual_operator_entry",
        domain: "campus_switching",
        title: "Campus switching pack",
        designPrinciples: ["Collapsed core for the campus."],
        topologyGuidance: ["Dual uplinks per access switch."],
        constraints: [],
        assumptions: [],
        exclusions: [],
        validationNotes: [],
      },
    }),
    mk("hrs-1", "hld_readiness_snapshot", "approved", {
      sourceArtifactIds: [...NORMAL_SOURCE_IDS],
      payload: {
        payloadKind: "rfp_hld_readiness_snapshot",
        readinessStatus: "ready",
        missingInputs: [],
        sourceEvidencePackageArtifactId: "evp-1",
        sourceRequirementsBaselineArtifactId: "req-1",
        sourceComplianceMatrixArtifactId: "cmx-1",
        sourceConfigurationArtifactId: "cfg-1",
        sourceHldIntakeArtifactId: "hint-1",
        sourceArtifactIds: [...NORMAL_SOURCE_IDS],
      },
    }),
  ];
}

const NO_BOQ_SOURCE_IDS = ["evp-1", "req-1", "cmx-1", "cfg-exc-1", "hint-1"];

function noBoqArtifacts(): ProjectArtifact[] {
  return [
    mk("evp-1", "evidence_package", "approved"),
    mk("req-1", "requirements_baseline", "approved", {
      payload: {
        requirements: [{ id: "r1", text: "The customer seeks an outcome-based engagement." }],
      },
    }),
    mk("cmx-1", "compliance_matrix", "approved", {
      payload: {
        payloadKind: "rfp_compliance_matrix",
        sourceConfigurationExpansionArtifactId: "cfg-exc-1",
        rows: [],
      },
    }),
    mk("cfg-exc-1", "configuration_expansion", "approved", {
      payload: { payloadKind: "rfp_no_boq_service_only_exception", reason: "Services only" },
    }),
    mk("hint-1", "hld_intake", "approved", {
      payload: { payloadKind: "rfp_hld_intake", answers: [] },
    }),
    mk("hrs-1", "hld_readiness_snapshot", "approved", {
      sourceArtifactIds: [...NO_BOQ_SOURCE_IDS],
      payload: {
        payloadKind: "rfp_hld_readiness_snapshot",
        readinessStatus: "ready",
        missingInputs: [],
        sourceEvidencePackageArtifactId: "evp-1",
        sourceRequirementsBaselineArtifactId: "req-1",
        sourceComplianceMatrixArtifactId: "cmx-1",
        sourceConfigurationArtifactId: "cfg-exc-1",
        sourceHldIntakeArtifactId: "hint-1",
        sourceArtifactIds: [...NO_BOQ_SOURCE_IDS],
      },
    }),
  ];
}

/** Build a real, contract-valid persisted bundle payload from the pure assembler. */
function buildPersisted(
  artifacts: ProjectArtifact[],
  files: ProjectFile[],
  createdBy: string = CREATED_BY
): RfpHldSourceBundlePayload {
  const built = buildRfpHldSourceBundleDraft({
    projectId: PROJECT,
    files,
    artifacts,
    createdBy,
    createdAt: FIXED_CREATED,
  });
  if (built.status !== "ok") {
    throw new Error(`fixture build expected ok, got ${built.status}`);
  }
  return built.payload;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Acme RFP Bid",
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

function makeBundleArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: BUNDLE_ARTIFACT_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function persistedArtifact(
  payload: RfpHldSourceBundlePayload,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return makeBundleArtifact({
    payload: payload as unknown as Record<string, unknown>,
    sourceArtifactIds: payload.sourceArtifactIds.slice(),
    ...overrides,
  });
}

function makeCreated(decision: ProjectApproval["decision"] = "approved") {
  const approval: ProjectApproval = {
    id: "appr-bundle-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    artifactId: BUNDLE_ARTIFACT_ID,
    artifactVersion: 1,
    decision,
    decidedBy: DECIDER,
    decidedAt: DECIDED_AT,
  };
  return {
    approval,
    artifactStatus: (decision === "approved" ? "approved" : "rejected") as ProjectArtifactStatus,
    stageStatus: (decision === "approved" ? "approved" : "rejected") as ProjectStageStatus,
  };
}

function review(
  overrides: Partial<ReviewRfpHldSourceBundleArtifactInput> = {}
): Promise<ReviewRfpHldSourceBundleArtifactResult> {
  return reviewRfpHldSourceBundleArtifact({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: BUNDLE_ARTIFACT_ID,
    decision: "approved",
    decidedBy: DECIDER,
    ...overrides,
  });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById
    .mockReset()
    .mockResolvedValue(persistedArtifact(buildPersisted(normalArtifacts(), [boqFile()])));
  mockListProjectArtifacts.mockReset().mockResolvedValue(normalArtifacts());
  mockCreateArtifactVersion.mockReset();
  mockListProjectFiles.mockReset().mockResolvedValue([boqFile()]);
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
});

describe("reviewRfpHldSourceBundleArtifact - input validation", () => {
  it("throws on blank artifactId before any store call", async () => {
    await expect(review({ artifactId: "  " })).rejects.toThrow("artifactId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("throws on blank decidedBy before any store call", async () => {
    await expect(review({ decidedBy: " " })).rejects.toThrow("decidedBy is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });
});

describe("reviewRfpHldSourceBundleArtifact - gates before approval", () => {
  it("returns not_found and never approves when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await review();
    expect(result).toEqual({ status: "not_found" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns wrong_mode lean summary (no tenantId) for a non-rfp project and never approves", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await review();
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found when the exact artifact is missing", async () => {
    mockGetArtifactById.mockResolvedValue(null);
    const result = await review();
    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, BUNDLE_ARTIFACT_ID);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found when the returned artifact belongs to a different project", async () => {
    mockGetArtifactById.mockResolvedValue(
      persistedArtifact(buildPersisted(normalArtifacts(), [boqFile()]), {
        projectId: "other-project",
      })
    );
    const result = await review();
    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_hld_source_bundle for the wrong type without approving", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeBundleArtifact({ type: "hld_intake" as ProjectArtifactType })
    );
    const result = await review();
    expect(result.status).toBe("artifact_not_hld_source_bundle");
    if (result.status !== "artifact_not_hld_source_bundle") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_hld_source_bundle for the wrong stage without approving", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeBundleArtifact({ stageId: "compliance_matrix_review" as ProjectStageId })
    );
    const result = await review();
    expect(result.status).toBe("artifact_not_hld_source_bundle");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_reviewable for every non-reviewable status before payload checks", async () => {
    for (const status of [
      "approved", "rejected", "stale", "failed", "missing", "not_applicable",
    ] as ProjectArtifactStatus[]) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValue(
        persistedArtifact(buildPersisted(normalArtifacts(), [boqFile()]), { status })
      );
      const result = await review();
      expect(result.status, status).toBe("artifact_not_reviewable");
      expect(mockCreateApproval, status).not.toHaveBeenCalled();
    }
  });
});

describe("reviewRfpHldSourceBundleArtifact - approval currency gate", () => {
  it("approves a valid current source-bundle payload and records exactly one approval", async () => {
    const result = await review({ decidedAt: DECIDED_AT, note: "bundle approved" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: BUNDLE_ARTIFACT_ID,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
      note: "bundle approved",
    });
  });

  it("approves a payload produced by the real Stage 6B-002 assembler contract (no-BoQ exception)", async () => {
    const persisted = buildPersisted(noBoqArtifacts(), []);
    mockListProjectFiles.mockResolvedValue([]);
    mockListProjectArtifacts.mockResolvedValue(noBoqArtifacts());
    mockGetArtifactById.mockResolvedValue(persistedArtifact(persisted));

    const result = await review();

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("blocks an invalid persisted payload as invalid_hld_source_bundle_payload without approving", async () => {
    mockGetArtifactById.mockResolvedValue(makeBundleArtifact({ payload: { junk: true } }));

    const result = await review();

    expect(result.status).toBe("invalid_hld_source_bundle_payload");
    if (result.status !== "invalid_hld_source_bundle_payload") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks when the artifact row source ids do not match the payload source ids", async () => {
    const persisted = buildPersisted(normalArtifacts(), [boqFile()]);
    mockGetArtifactById.mockResolvedValue(
      persistedArtifact(persisted, {
        // Drop one id so the row no longer exactly matches the payload source ids.
        sourceArtifactIds: persisted.sourceArtifactIds.slice(1),
      })
    );

    const result = await review();

    expect(result.status).toBe("stale_hld_source_bundle_payload");
    if (result.status !== "stale_hld_source_bundle_payload") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_artifact_ids_mismatch");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks when the current recompile is blocked (upstream changed after compile)", async () => {
    // Persisted bundle is valid, but the readiness snapshot is no longer approved.
    mockListProjectArtifacts.mockResolvedValue(
      normalArtifacts().map((a) =>
        a.type === "hld_readiness_snapshot"
          ? { ...a, status: "needs_review" as ProjectArtifactStatus }
          : a
      )
    );

    const result = await review();

    expect(result.status).toBe("stale_hld_source_bundle_payload");
    if (result.status !== "stale_hld_source_bundle_payload") throw new Error("unreachable");
    expect(result.staleCode).toBe("recompute_blocked");
    expect((result.messages ?? []).length).toBeGreaterThan(0);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks when the current recompile returns an invalid payload", async () => {
    // A knowledge pack with a non-positive version recompiles to a contract-invalid ref.
    mockListProjectArtifacts.mockResolvedValue(
      normalArtifacts().map((a) =>
        a.type === "design_knowledge_pack" ? { ...a, version: 0 } : a
      )
    );

    const result = await review();

    expect(result.status).toBe("stale_hld_source_bundle_payload");
    if (result.status !== "stale_hld_source_bundle_payload") throw new Error("unreachable");
    expect(result.staleCode).toBe("recompute_invalid_payload");
    expect((result.errors ?? []).length).toBeGreaterThan(0);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks when the recomputed bundle structurally differs from the persisted payload", async () => {
    // Same source ids, but a fresh approved authority version changes the compiled ref.
    mockListProjectArtifacts.mockResolvedValue(
      normalArtifacts().map((a) =>
        a.type === "evidence_package" ? { ...a, version: 2 } : a
      )
    );

    const result = await review();

    expect(result.status).toBe("stale_hld_source_bundle_payload");
    if (result.status !== "stale_hld_source_bundle_payload") throw new Error("unreachable");
    expect(result.staleCode).toBe("recomputed_bundle_mismatch");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("records a REJECTION even when the persisted payload is malformed", async () => {
    mockGetArtifactById.mockResolvedValue(makeBundleArtifact({ payload: { junk: true } }));
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));

    const result = await review({ decision: "rejected" });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "rejected" })
    );
  });

  it("records a REJECTION even when the persisted payload is stale", async () => {
    const persisted = buildPersisted(normalArtifacts(), [boqFile()]);
    mockGetArtifactById.mockResolvedValue(
      persistedArtifact(persisted, { sourceArtifactIds: persisted.sourceArtifactIds.slice(1) })
    );
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));

    const result = await review({ decision: "rejected" });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });
});

describe("reviewRfpHldSourceBundleArtifact - result hygiene", () => {
  it("ok result returns lean summaries without leaking the payload body or tenantId", async () => {
    const persisted = buildPersisted(normalArtifacts(), [boqFile()], PAYLOAD_SENTINEL);
    mockGetArtifactById.mockResolvedValue(persistedArtifact(persisted));

    const result = await review();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactStatus).toBe("approved");
    expect(result.stageStatus).toBe("approved");
    expect("payload" in result.artifact).toBe(false);
    expect("tenantId" in result.artifact).toBe(false);
    const json = JSON.stringify(result);
    expect(json).not.toContain(PAYLOAD_SENTINEL);
    expect(json).not.toContain(TENANT);
  });

  it("invalid result does not leak the payload body or tenantId", async () => {
    const persisted = buildPersisted(normalArtifacts(), [boqFile()]);
    mockGetArtifactById.mockResolvedValue(
      makeBundleArtifact({
        payload: { ...(persisted as unknown as Record<string, unknown>), tenantId: TENANT },
      })
    );

    const result = await review();

    expect(result.status).toBe("invalid_hld_source_bundle_payload");
    if (result.status !== "invalid_hld_source_bundle_payload") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });

  it("stale result does not leak the payload body or tenantId", async () => {
    const persisted = buildPersisted(normalArtifacts(), [boqFile()]);
    mockGetArtifactById.mockResolvedValue(
      persistedArtifact(persisted, { sourceArtifactIds: persisted.sourceArtifactIds.slice(1) })
    );

    const result = await review();

    expect(result.status).toBe("stale_hld_source_bundle_payload");
    if (result.status !== "stale_hld_source_bundle_payload") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });

  it("maps a null createProjectApproval to approval_failed", async () => {
    mockCreateApproval.mockResolvedValue(null);
    const result = await review();
    expect(result).toEqual({ status: "approval_failed" });
  });

  it("lets an unexpected createProjectApproval error bubble", async () => {
    mockCreateApproval.mockRejectedValue(new Error("db boom"));
    await expect(review()).rejects.toThrow("db boom");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-source-bundle-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-source-bundle-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the stores, the approval helper, the contract, the assembler, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-file-store",
      "@/lib/db/project-approval-store",
      "@/lib/projects/approvals",
      "@/lib/projects/project-rfp-hld-source-bundle",
      "@/lib/projects/project-rfp-hld-source-bundle-assembler",
      "@/types/project",
    ]);
  });

  it("uses createProjectApproval as its only create/update/delete mutation", () => {
    const mutationTokens = source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(Array.from(new Set(mutationTokens))).toEqual(["createProjectApproval"]);
  });

  it("imports no fs/path/raw-doc, no AI/provider, no pricing/sku/catalog/config service, no route/component, no legacy", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/catalog',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/app',
      'from "@/components',
      'from "next/server"',
      'from "next/navigation"',
      'from "react"',
      "@anthropic-ai",
      "@google/generative-ai",
      "pdf-parse",
      "mammoth",
    ]) {
      expect(source, `forbidden: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
