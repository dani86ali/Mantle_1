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

// Mock the three DB stores. The pure approval helper (@/lib/projects/approvals ->
// isArtifactReviewable) stays REAL so the reviewability gate is a true integration
// check. The workspace read model is INJECTED via input (not imported here), so it
// is a plain mock fn whose opaque return only has to prove verbatim pass-through.
const { mockGetProjectById, mockGetArtifactById, mockCreateApproval } = vi.hoisted(
  () => ({
    mockGetProjectById: vi.fn(),
    mockGetArtifactById: vi.fn(),
    mockCreateApproval: vi.fn(),
  })
);

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProjectById }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: mockCreateApproval,
}));

import {
  reviewProjectBoqArtifact,
  CANONICAL_BOQ_APPROVAL_GATED_ARTIFACT_TYPES,
  type ReviewProjectBoqArtifactCoreInput,
  type ReviewProjectBoqArtifactCoreResult,
} from "@/lib/projects/project-boq-approval-core";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const ARTIFACT = "sku_resolution-v2";
const DECIDER = "engineer-7";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const DECIDED_AT = new Date("2026-06-03T09:00:00.000Z");
const PAYLOAD_SENTINEL = "payload-only-do-not-leak";

// Opaque to the core: it is returned verbatim, so a sentinel object proves passthrough.
const WORKSPACE_RESULT = { sentinel: "refreshed-workspace" };

const mockLoadWorkspace = vi.fn(
  (_tenantId: string, _projectId: string): Promise<unknown> =>
    Promise.resolve(WORKSPACE_RESULT)
);

const STAGE_BY_TYPE: Partial<Record<ProjectArtifactType, ProjectStageId>> = {
  normalized_boq: "boq_format_validation",
  sku_resolution: "sku_resolution",
  configuration_expansion: "configuration_expansion_review",
  priced_boq: "boq_pricing_review",
  export_package: "export_approval",
};

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Honeywell Quick BoM",
    customerName: "Honeywell",
    mode: "quick_bom",
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

function makeArtifact(
  type: ProjectArtifactType,
  status: ProjectArtifactStatus,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: STAGE_BY_TYPE[type] ?? "sku_resolution",
    type,
    status,
    version: 2,
    payload: { secret: PAYLOAD_SENTINEL },
    sourceFileIds: ["file-1"],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeCreated(
  overrides: {
    decision?: ProjectApproval["decision"];
    artifactStatus?: ProjectArtifactStatus;
    stageStatus?: ProjectStageStatus;
  } = {}
) {
  const decision = overrides.decision ?? "approved";
  const approval: ProjectApproval = {
    id: "appr-1",
    projectId: PROJECT,
    stageId: "sku_resolution",
    artifactId: ARTIFACT,
    artifactVersion: 2,
    decision,
    decidedBy: DECIDER,
    decidedAt: DECIDED_AT,
  };
  return {
    approval,
    artifactStatus: (overrides.artifactStatus ??
      (decision === "approved" ? "approved" : "rejected")) as ProjectArtifactStatus,
    stageStatus: (overrides.stageStatus ??
      (decision === "approved" ? "approved" : "rejected")) as ProjectStageStatus,
  };
}

function review(
  overrides: Partial<ReviewProjectBoqArtifactCoreInput<unknown>> = {}
): Promise<ReviewProjectBoqArtifactCoreResult<unknown>> {
  return reviewProjectBoqArtifact<unknown>({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: ARTIFACT,
    decision: "approved",
    decidedBy: DECIDER,
    expectedMode: "quick_bom",
    loadWorkspace: mockLoadWorkspace,
    ...overrides,
  });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById
    .mockReset()
    .mockResolvedValue(makeArtifact("sku_resolution", "needs_review"));
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
  mockLoadWorkspace.mockReset().mockResolvedValue(WORKSPACE_RESULT);
});

describe("reviewProjectBoqArtifact - input validation", () => {
  it("throws on a blank artifactId before any store call", async () => {
    await expect(review({ artifactId: "   " })).rejects.toThrow(
      "artifactId is required."
    );
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("throws on a blank decidedBy before any store call", async () => {
    await expect(review({ decidedBy: "  " })).rejects.toThrow(
      "decidedBy is required."
    );
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("validates artifactId before decidedBy when both are blank", async () => {
    await expect(review({ artifactId: "", decidedBy: "" })).rejects.toThrow(
      "artifactId is required."
    );
  });
});

describe("reviewProjectBoqArtifact - project + injected mode gates", () => {
  it("returns not_found and does not load the artifact when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a payload-free project summary when the mode mismatches expectedMode", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({ mode: "rfp", name: "RFP Bid" })
    );

    const result = await review({ expectedMode: "quick_bom" });

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      tenantId: TENANT,
      name: "RFP Bid",
      customerName: "Honeywell",
      mode: "rfp",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("gates on the INJECTED expectedMode, not a hardcoded quick_bom (rfp project passes when rfp is expected)", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "rfp" }));
    mockGetArtifactById.mockResolvedValue(
      makeArtifact("sku_resolution", "needs_review")
    );

    const result = await review({ expectedMode: "rfp" });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("returns wrong_mode for a quick_bom project when rfp is expected", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await review({ expectedMode: "rfp" });

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project.mode).toBe("quick_bom");
    expect(mockGetArtifactById).not.toHaveBeenCalled();
  });
});

describe("reviewProjectBoqArtifact - artifact gates", () => {
  it("returns artifact_not_found and does not create an approval when the artifact is missing", async () => {
    mockGetArtifactById.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("rejects normalized_boq and other non-gated types as artifact_not_quick_bom without an approval or payload leak", async () => {
    const nonGated: ProjectArtifactType[] = [
      "normalized_boq",
      "input_package",
      "requirements_baseline",
      "compliance_matrix",
      "hld_design_delta",
      "technical_proposal",
    ];
    for (const type of nonGated) {
      mockCreateApproval.mockClear();
      // status "generated" is itself reviewable, proving the type gate fires first.
      mockGetArtifactById.mockResolvedValue(makeArtifact(type, "generated"));

      const result = await review();

      expect(result.status).toBe("artifact_not_quick_bom");
      if (result.status !== "artifact_not_quick_bom") throw new Error("unreachable");
      expect(result.artifact.type).toBe(type);
      expect("payload" in result.artifact).toBe(false);
      expect(JSON.stringify(result)).not.toContain(PAYLOAD_SENTINEL);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("treats every canonical BoQ approval-gated type as approvable", async () => {
    for (const type of CANONICAL_BOQ_APPROVAL_GATED_ARTIFACT_TYPES) {
      mockCreateApproval.mockClear().mockResolvedValue(makeCreated());
      mockGetArtifactById.mockResolvedValue(makeArtifact(type, "generated"));

      const result = await review();

      expect(result.status).toBe("ok");
      expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects non-reviewable statuses as artifact_not_reviewable without an approval", async () => {
    const nonReviewable: ProjectArtifactStatus[] = [
      "approved",
      "rejected",
      "stale",
      "failed",
      "missing",
      "not_applicable",
    ];
    for (const status of nonReviewable) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValue(makeArtifact("sku_resolution", status));

      const result = await review();

      expect(result.status).toBe("artifact_not_reviewable");
      if (result.status !== "artifact_not_reviewable") throw new Error("unreachable");
      expect(result.artifact.status).toBe(status);
      expect("payload" in result.artifact).toBe(false);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });
});

describe("reviewProjectBoqArtifact - configuration_expansion draft guard", () => {
  it("rejects a configuration_expansion DRAFT as artifact_not_reviewable without an approval or payload leak", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact("configuration_expansion", "needs_review", {
        payload: {
          payloadKind: "configuration_expansion_draft",
          secret: PAYLOAD_SENTINEL,
        },
      })
    );

    const result = await review();

    expect(result.status).toBe("artifact_not_reviewable");
    if (result.status !== "artifact_not_reviewable") throw new Error("unreachable");
    expect(result.artifact.type).toBe("configuration_expansion");
    expect("payload" in result.artifact).toBe(false);
    expect(JSON.stringify(result)).not.toContain(PAYLOAD_SENTINEL);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("still approves a reviewed (non-draft) configuration_expansion artifact", async () => {
    for (const status of ["generated", "needs_review"] as ProjectArtifactStatus[]) {
      mockCreateApproval.mockClear().mockResolvedValue(makeCreated());
      mockGetArtifactById.mockResolvedValue(
        makeArtifact("configuration_expansion", status)
      );

      const result = await review();

      expect(result.status).toBe("ok");
      expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    }
  });
});

describe("reviewProjectBoqArtifact - sku_resolution completeness gate", () => {
  function skuResolutionArtifact(
    decisionStatuses: string[],
    status: ProjectArtifactStatus = "needs_review"
  ): ProjectArtifact {
    return makeArtifact("sku_resolution", status, {
      payload: {
        secret: PAYLOAD_SENTINEL,
        decisions: decisionStatuses.map((decisionStatus, i) => ({
          sourceFileId: "file-1",
          sourceRowNumber: i + 2,
          originalLineNumber: `L-${i}`,
          originalSku: `SKU-${i}`,
          status: decisionStatus,
          suggestions: [],
        })),
      },
    });
  }

  it("blocks approving a sku_resolution artifact while any decision is still needs_review", async () => {
    mockGetArtifactById.mockResolvedValue(
      skuResolutionArtifact(["accepted", "needs_review"])
    );

    const result = await review();

    expect(result.status).toBe("artifact_not_reviewable");
    if (result.status !== "artifact_not_reviewable") throw new Error("unreachable");
    expect(result.artifact.type).toBe("sku_resolution");
    expect("payload" in result.artifact).toBe(false);
    expect(JSON.stringify(result)).not.toContain(PAYLOAD_SENTINEL);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks approving a sku_resolution artifact while any decision is still unresolved", async () => {
    mockGetArtifactById.mockResolvedValue(
      skuResolutionArtifact(["accepted", "unresolved"])
    );

    const result = await review();

    expect(result.status).toBe("artifact_not_reviewable");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("allows approving a sku_resolution artifact when every decision is accepted/rejected/manual/out_of_scope", async () => {
    mockGetArtifactById.mockResolvedValue(
      skuResolutionArtifact(["accepted", "rejected", "manual", "out_of_scope"])
    );

    const result = await review();

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("still records a rejection of an incomplete sku_resolution because only approval is gated", async () => {
    mockGetArtifactById.mockResolvedValue(
      skuResolutionArtifact(["needs_review", "unresolved"])
    );
    mockCreateApproval.mockResolvedValue(makeCreated({ decision: "rejected" }));

    const result = await review({ decision: "rejected" });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("does not block a sku_resolution artifact whose payload has no decisions array", async () => {
    mockGetArtifactById.mockResolvedValue(makeArtifact("sku_resolution", "generated"));

    const result = await review();

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });
});

describe("reviewProjectBoqArtifact - allowedArtifactTypes intersection", () => {
  it("approves a priced_boq artifact when the allowlist is narrowed to priced_boq", async () => {
    mockGetArtifactById.mockResolvedValue(makeArtifact("priced_boq", "needs_review"));

    const result = await review({ allowedArtifactTypes: ["priced_boq"] });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("returns artifact_not_quick_bom (no approval) for other gated types when narrowed to priced_boq", async () => {
    const otherGated: ProjectArtifactType[] = [
      "sku_resolution",
      "configuration_expansion",
      "export_package",
    ];
    for (const type of otherGated) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValue(makeArtifact(type, "needs_review"));

      const result = await review({ allowedArtifactTypes: ["priced_boq"] });

      expect(result.status).toBe("artifact_not_quick_bom");
      if (result.status !== "artifact_not_quick_bom") throw new Error("unreachable");
      expect(result.artifact.type).toBe(type);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("cannot widen approval to a non-canonical type even when it is explicitly allowed", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact("technical_proposal", "needs_review")
    );

    const result = await review({ allowedArtifactTypes: ["technical_proposal"] });

    expect(result.status).toBe("artifact_not_quick_bom");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("drops non-canonical types from a mixed allowlist but still approves the canonical priced_boq", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact("technical_proposal", "needs_review")
    );
    let result = await review({
      allowedArtifactTypes: ["priced_boq", "technical_proposal"],
    });
    expect(result.status).toBe("artifact_not_quick_bom");
    expect(mockCreateApproval).not.toHaveBeenCalled();

    mockCreateApproval.mockClear().mockResolvedValue(makeCreated());
    mockGetArtifactById.mockResolvedValue(makeArtifact("priced_boq", "needs_review"));
    result = await review({
      allowedArtifactTypes: ["priced_boq", "technical_proposal"],
    });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("still blocks a configuration_expansion DRAFT even when configuration_expansion is allowed", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact("configuration_expansion", "needs_review", {
        payload: { payloadKind: "configuration_expansion_draft" },
      })
    );

    const result = await review({
      allowedArtifactTypes: ["configuration_expansion"],
    });

    expect(result.status).toBe("artifact_not_reviewable");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });
});

describe("reviewProjectBoqArtifact - approval mutation", () => {
  it("calls createProjectApproval once with the exact artifactId, tenant, project, decision, decidedBy, decidedAt, and note", async () => {
    await review({ decision: "rejected", decidedAt: DECIDED_AT, note: "fix pricing" });

    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
        decision: "rejected",
        decidedBy: DECIDER,
        decidedAt: DECIDED_AT,
        note: "fix pricing",
      })
    );
  });

  it("omits decidedAt and note from the createProjectApproval call when not provided", async () => {
    await review();

    const arg = mockCreateApproval.mock.calls[0][0];
    expect("decidedAt" in arg).toBe(false);
    expect("note" in arg).toBe(false);
  });

  it("returns approval_failed when createProjectApproval returns null and does not load the workspace", async () => {
    mockCreateApproval.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "approval_failed" });
    expect(mockLoadWorkspace).not.toHaveBeenCalled();
  });

  it("lets an unexpected createProjectApproval error bubble without a defensive catch", async () => {
    mockCreateApproval.mockRejectedValue(new Error("db boom"));

    await expect(review()).rejects.toThrow("db boom");
    expect(mockLoadWorkspace).not.toHaveBeenCalled();
  });
});

describe("reviewProjectBoqArtifact - injected workspace + ok", () => {
  it("loads the injected workspace with (tenantId, projectId) only after createProjectApproval succeeds", async () => {
    await review();

    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockLoadWorkspace).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockCreateApproval.mock.invocationCallOrder[0]).toBeLessThan(
      mockLoadWorkspace.mock.invocationCallOrder[0]
    );
  });

  it("returns ok with the approval, statuses, and the injected workspace result verbatim", async () => {
    const created = makeCreated();
    mockCreateApproval.mockResolvedValue(created);
    mockLoadWorkspace.mockResolvedValue(WORKSPACE_RESULT);

    const result = await review();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.approval).toBe(created.approval);
    expect(result.artifactStatus).toBe(created.artifactStatus);
    expect(result.stageStatus).toBe(created.stageStatus);
    expect(result.workspace).toBe(WORKSPACE_RESULT);
  });

  it("passes tenantId through every store/service call on the ok path", async () => {
    await review();

    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
    expect(mockCreateApproval).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT })
    );
    expect(mockLoadWorkspace).toHaveBeenCalledWith(TENANT, PROJECT);
  });
});

describe("canonical approval-gated set", () => {
  it("is exactly the four BoQ approval-gated artifact types", () => {
    expect(CANONICAL_BOQ_APPROVAL_GATED_ARTIFACT_TYPES).toEqual([
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
      "export_package",
    ]);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-boq-approval-core.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-boq-approval-core.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports createProjectApproval as its only create/update/delete mutation", () => {
    expect(source).toContain("createProjectApproval");
    const mutationTokens = source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(Array.from(new Set(mutationTokens))).toEqual(["createProjectApproval"]);
  });

  it("creates no artifact versions and imports no pricing, export, config-expansion, runner, AI, catalog, engine, coordinator, or adapter module", () => {
    for (const forbidden of [
      "createProjectArtifactVersion",
      'from "@/lib/projects/project-quick-bom-workspace"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/honeywell',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
