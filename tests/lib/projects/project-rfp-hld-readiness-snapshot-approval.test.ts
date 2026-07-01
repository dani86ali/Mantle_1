import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";

// Mock DB store boundaries. isArtifactReviewable and constants stay REAL so
// the reviewability gate and payload re-validation are true integration checks.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockCreateArtifactVersion,
  mockListProjectArtifacts,
  mockListProjectFiles,
  mockCreateApproval,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockCreateArtifactVersion: vi.fn(),
  mockListProjectArtifacts: vi.fn(),
  mockListProjectFiles: vi.fn(),
  mockCreateApproval: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  createProjectArtifactVersion: mockCreateArtifactVersion,
  listProjectArtifacts: mockListProjectArtifacts,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: mockCreateApproval,
}));
vi.mock("@/lib/db/project-file-store", () => ({
  listProjectFiles: mockListProjectFiles,
}));

import {
  reviewRfpHldReadinessSnapshotArtifact,
  type ReviewRfpHldReadinessSnapshotArtifactInput,
  type ReviewRfpHldReadinessSnapshotArtifactResult,
} from "@/lib/projects/project-rfp-hld-readiness-snapshot-approval";
import { createRfpHldReadinessSnapshotDraft } from "@/lib/projects/project-rfp-hld-readiness-snapshot";
import { RFP_HLD_DESIGN_DOMAIN_DEFINITIONS } from "@/lib/projects/project-rfp-hld-domain-readiness";

const TENANT = "22222222-2222-2222-2222-222222222222";
const PROJECT = "proj-rfp-snap-1";
const ARTIFACT = "art-snap-99";
const DECIDER = "u-approver-3";
const TS1 = new Date("2026-06-10T08:00:00.000Z");
const TS2 = new Date("2026-06-10T09:00:00.000Z");
const DECIDED_AT = new Date("2026-06-23T10:00:00.000Z");
const PAYLOAD_SENTINEL = "SECRET-PAYLOAD-VALUE";
const MANUAL_OVERRIDE_REASON = "Engineer entered the intake manually.";

// Source artifact ids that the snapshot will reference.
const SRC_IDS = ["ev-1", "req-1", "comp-1", "cfg-1", "intake-1"];

const ALL_DOMAINS = RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.map((d) => d.domain);

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP Snapshot",
    customerName: "STC",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_readiness_snapshot",
    status: "needs_review",
    version: 1,
    payload: makeValidPayload(),
    sourceFileIds: [],
    sourceArtifactIds: SRC_IDS.slice(),
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeValidPayload(
  mutate: (p: Record<string, unknown>) => void = () => {}
): Record<string, unknown> {
  const p: Record<string, unknown> = {
    payloadKind: "rfp_hld_readiness_snapshot",
    createdBy: "engineer-1",
    createdAt: "2026-06-23T09:00:00.000Z",
    readinessStatus: "ready",
    sourceArtifactIds: SRC_IDS.slice(),
    sourceEvidencePackageArtifactId: "ev-1",
    sourceRequirementsBaselineArtifactId: "req-1",
    sourceComplianceMatrixArtifactId: "comp-1",
    sourceConfigurationArtifactId: "cfg-1",
    sourceHldIntakeArtifactId: "intake-1",
    hldIntakeSource: {
      sourceMode: "manual_override",
      manualOverrideReason: MANUAL_OVERRIDE_REASON,
    },
    coveredDomains: [],
    excludedDomains: ALL_DOMAINS.slice(),
    domainReadiness: {
      claimedDomains: [],
      coveredDomains: [],
      excludedDomains: ALL_DOMAINS.slice(),
      requiredKnowledgePackDomains: [],
      missingKnowledgePackDomains: [],
    },
    assumptions: [],
    missingInputs: [],
    validationMessages: [
      "HLD readiness is ready: all approved upstream authorities are in place.",
    ],
  };
  mutate(p);
  return p;
}

function makeCreated(decision: ProjectApproval["decision"] = "approved") {
  const approval: ProjectApproval = {
    id: "appr-snap-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    artifactId: ARTIFACT,
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
  overrides: Partial<ReviewRfpHldReadinessSnapshotArtifactInput> = {}
): Promise<ReviewRfpHldReadinessSnapshotArtifactResult> {
  return reviewRfpHldReadinessSnapshotArtifact({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: ARTIFACT,
    decision: "approved",
    decidedBy: DECIDER,
    ...overrides,
  });
}

// Minimal upstream artifact factory for the real-contract test.
function makeUpstream(
  id: string,
  type: ProjectArtifactType,
  stageId: ProjectStageId,
  status: ProjectArtifact["status"],
  payload: Record<string, unknown> = {}
): ProjectArtifact {
  return {
    id,
    projectId: PROJECT,
    stageId,
    type,
    status,
    version: 1,
    payload,
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(makeArtifact());
  mockCreateArtifactVersion.mockReset();
  mockListProjectArtifacts.mockReset();
  mockListProjectFiles.mockReset().mockResolvedValue([]);
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
});

describe("reviewRfpHldReadinessSnapshotArtifact - input validation", () => {
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

describe("reviewRfpHldReadinessSnapshotArtifact - gates before approval", () => {
  it("returns not_found and never approves when project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await review();
    expect(result).toEqual({ status: "not_found" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns wrong_mode lean summary (no tenantId) for non-rfp project and never approves", async () => {
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
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_hld_readiness_snapshot for wrong type without approving", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ type: "hld_intake" as ProjectArtifactType })
    );
    const result = await review();
    expect(result.status).toBe("artifact_not_hld_readiness_snapshot");
    if (result.status !== "artifact_not_hld_readiness_snapshot") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_hld_readiness_snapshot for wrong stage without approving", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ stageId: "compliance_matrix_review" as ProjectStageId })
    );
    const result = await review();
    expect(result.status).toBe("artifact_not_hld_readiness_snapshot");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_reviewable for all non-reviewable statuses before payload validation", async () => {
    for (const status of [
      "approved", "rejected", "stale", "failed", "missing", "not_applicable",
    ] as ProjectArtifactStatus[]) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValue(makeArtifact({ status }));
      const result = await review();
      expect(result.status).toBe("artifact_not_reviewable");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });
});

describe("reviewRfpHldReadinessSnapshotArtifact - approval payload re-validation", () => {
  it("approves a normalized valid payload and calls createProjectApproval exactly once", async () => {
    const result = await review({ decidedAt: DECIDED_AT, note: "snapshot approved" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
      note: "snapshot approved",
    });
  });

  it("approves a payload produced by the real createRfpHldReadinessSnapshotDraft contract", async () => {
    // Set up approved upstream authorities for a no-BoQ readiness gate path.
    const upstreamArtifacts: ProjectArtifact[] = [
      makeUpstream("ev-1", "evidence_package", "intake_package_review", "approved"),
      makeUpstream("req-1", "requirements_baseline", "requirements_baseline_review", "approved"),
      makeUpstream("comp-1", "compliance_matrix", "compliance_matrix_review", "approved"),
      makeUpstream(
        "cfg-1",
        "configuration_expansion",
        "configuration_expansion_review",
        "approved",
        { payloadKind: "rfp_no_boq_service_only_exception" }
      ),
      makeUpstream("intake-1", "hld_intake", "hld_design_delta_review", "approved", {
        payloadKind: "rfp_hld_intake",
        sourceMode: "manual_override",
        manualOverrideReason: MANUAL_OVERRIDE_REASON,
        answers: [],
      }),
    ];
    mockListProjectArtifacts.mockResolvedValue(upstreamArtifacts);

    let capturedPayload: Record<string, unknown> | undefined;
    let capturedSourceIds: string[] | undefined;
    mockCreateArtifactVersion.mockImplementation(
      async (arg: { payload: Record<string, unknown>; sourceArtifactIds: string[] }) => {
        capturedPayload = arg.payload;
        capturedSourceIds = arg.sourceArtifactIds;
        return makeArtifact({ payload: arg.payload, sourceArtifactIds: arg.sourceArtifactIds });
      }
    );

    await createRfpHldReadinessSnapshotDraft({
      tenantId: TENANT,
      projectId: PROJECT,
      createdBy: "engineer-1",
      createdAt: new Date("2026-06-23T09:00:00.000Z"),
    });

    expect(capturedPayload).toBeDefined();
    expect(capturedSourceIds).toBeDefined();

    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ payload: capturedPayload, sourceArtifactIds: capturedSourceIds })
    );

    const result = await review();

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("blocks every tampered payload as invalid_hld_readiness_snapshot_payload without approving", async () => {
    const tampered: Array<[string, Record<string, unknown>]> = [
      ["wrong payloadKind", makeValidPayload((p) => { p.payloadKind = "wrong_kind"; })],
      ["readinessStatus not ready", makeValidPayload((p) => { p.readinessStatus = "blocked"; })],
      ["sourceArtifactIds order mismatch", makeValidPayload((p) => {
        p.sourceArtifactIds = ["req-1", "ev-1", "comp-1", "cfg-1", "intake-1"];
      })],
      ["sourceArtifactIds length mismatch", makeValidPayload((p) => {
        p.sourceArtifactIds = ["ev-1", "req-1"];
      })],
      ["sourceArtifactIds empty", makeValidPayload((p) => { p.sourceArtifactIds = []; })],
      ["missing sourceEvidencePackageArtifactId", makeValidPayload((p) => {
        delete p.sourceEvidencePackageArtifactId;
      })],
      ["missing sourceRequirementsBaselineArtifactId", makeValidPayload((p) => {
        delete p.sourceRequirementsBaselineArtifactId;
      })],
      ["missing sourceComplianceMatrixArtifactId", makeValidPayload((p) => {
        delete p.sourceComplianceMatrixArtifactId;
      })],
      ["missing sourceConfigurationArtifactId", makeValidPayload((p) => {
        delete p.sourceConfigurationArtifactId;
      })],
      ["missing sourceHldIntakeArtifactId", makeValidPayload((p) => {
        delete p.sourceHldIntakeArtifactId;
      })],
      ["source field not in sourceArtifactIds", makeValidPayload((p) => {
        p.sourceEvidencePackageArtifactId = "not-in-list";
      })],
      ["missing hldIntakeSource", makeValidPayload((p) => {
        delete p.hldIntakeSource;
      })],
      ["blank hldIntakeSource manualOverrideReason", makeValidPayload((p) => {
        p.hldIntakeSource = { sourceMode: "manual_override", manualOverrideReason: " " };
      })],
      ["extra hldIntakeSource key", makeValidPayload((p) => {
        p.hldIntakeSource = {
          sourceMode: "manual_override",
          manualOverrideReason: MANUAL_OVERRIDE_REASON,
          sourceQuestionnaireArtifactId: "questionnaire-1",
        };
      })],
      ["missingInputs non-empty", makeValidPayload((p) => {
        p.missingInputs = ["evidence_package"];
      })],
      ["unknown domain in coveredDomains", makeValidPayload((p) => {
        p.coveredDomains = ["not_a_real_domain"];
      })],
      ["unknown domain in excludedDomains", makeValidPayload((p) => {
        p.excludedDomains = ["campus_switching", "bad_domain"];
      })],
      ["missingKnowledgePackDomains non-empty (pack domain present)", makeValidPayload((p) => {
        (p.domainReadiness as Record<string, unknown>).missingKnowledgePackDomains =
          ["campus_switching"];
      })],
      ["unknown domain in domainReadiness.claimedDomains", makeValidPayload((p) => {
        (p.domainReadiness as Record<string, unknown>).claimedDomains = ["ghost_domain"];
      })],
      ["bad assumption status", makeValidPayload((p) => {
        p.assumptions = [{ fieldId: "f1", label: "L", status: "answered" }];
      })],
      ["assumption blank fieldId", makeValidPayload((p) => {
        p.assumptions = [{ fieldId: "  ", label: "L", status: "unknown" }];
      })],
      ["assumption blank note", makeValidPayload((p) => {
        p.assumptions = [{ fieldId: "f1", label: "L", status: "unknown", note: "   " }];
      })],
      ["assumption extra key", makeValidPayload((p) => {
        p.assumptions = [{ fieldId: "f1", label: "L", status: "unknown", injected: "x" }];
      })],
      ["empty validationMessages", makeValidPayload((p) => { p.validationMessages = []; })],
      ["extra top-level key", makeValidPayload((p) => { p.tenantId = TENANT; })],
      ["extra domainReadiness key", makeValidPayload((p) => {
        (p.domainReadiness as Record<string, unknown>).extra = [];
      })],
    ];

    for (const [label, payload] of tampered) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValue(makeArtifact({ payload }));

      const result = await review();

      expect(result.status, label).toBe("invalid_hld_readiness_snapshot_payload");
      if (result.status !== "invalid_hld_readiness_snapshot_payload") throw new Error("unreachable");
      expect("payload" in result.artifact, label).toBe(false);
      expect(mockCreateApproval, label).not.toHaveBeenCalled();
    }
  });

  it("records a REJECTION even when the persisted payload is malformed", async () => {
    mockGetArtifactById.mockResolvedValue(makeArtifact({ payload: { junk: true } }));

    const result = await review({ decision: "rejected" });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "rejected" })
    );
  });
});

describe("reviewRfpHldReadinessSnapshotArtifact - ok result", () => {
  it("returns approval, post-decision statuses, and lean artifact summary without leaking payload or tenantId", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ payload: makeValidPayload((p) => { p.createdBy = PAYLOAD_SENTINEL; }) })
    );

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

  it("invalid result does not leak payload or tenantId", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ payload: makeValidPayload((p) => { p.tenantId = TENANT; }) })
    );

    const result = await review();

    expect(result.status).toBe("invalid_hld_readiness_snapshot_payload");
    if (result.status !== "invalid_hld_readiness_snapshot_payload") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });

  it("maps null createProjectApproval to approval_failed", async () => {
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
    "src/lib/projects/project-rfp-hld-readiness-snapshot-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-readiness-snapshot-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project store, artifact store, approval store, approval helper, snapshot payload kind, HLD domain definitions/types, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-approval-store",
      "@/lib/projects/approvals",
      "@/lib/projects/project-rfp-hld-readiness-snapshot",
      "@/lib/projects/project-rfp-hld-domain-readiness",
      "@/types/project",
    ]);
  });

  it("uses createProjectApproval as its only create/update/delete mutation", () => {
    const mutationTokens = source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(Array.from(new Set(mutationTokens))).toEqual(["createProjectApproval"]);
  });

  it("reads no file/evidence/raw stores, fs/path, pricing/sku/catalog/config, AI, routes, or UI", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
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
      'from "react"',
      "@anthropic-ai",
      "@google/generative-ai",
    ]) {
      expect(source, `forbidden: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keeps source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
