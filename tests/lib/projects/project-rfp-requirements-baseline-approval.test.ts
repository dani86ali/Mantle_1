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

// Mock the three DB store boundaries. The pure approval helper
// (@/lib/projects/approvals -> isArtifactReviewable) stays REAL so the
// reviewability gate is a true integration check, mirroring the RFP
// input-package approval service test.
const { mockGetProjectById, mockGetArtifactById, mockCreateApproval } =
  vi.hoisted(() => ({
    mockGetProjectById: vi.fn(),
    mockGetArtifactById: vi.fn(),
    mockCreateApproval: vi.fn(),
  }));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: mockCreateApproval,
}));

import {
  reviewRfpRequirementsBaselineArtifact,
  type ReviewRfpRequirementsBaselineArtifactInput,
  type ReviewRfpRequirementsBaselineArtifactResult,
} from "@/lib/projects/project-rfp-requirements-baseline-approval";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-requirements-baseline-2";
const DECIDER = "u-engineer-7";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const DECIDED_AT = new Date("2026-06-10T09:00:00.000Z");
const PAYLOAD_SENTINEL = "payload-only-do-not-leak";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP Bid",
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
    stageId: "requirements_baseline_review",
    type: "requirements_baseline",
    status: "needs_review",
    version: 2,
    payload: {
      payloadKind: "rfp_requirements_baseline",
      secret: PAYLOAD_SENTINEL,
    },
    sourceFileIds: ["file-rfp-1", "file-rfp-2"],
    sourceArtifactIds: ["art-input-package-1"],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeCreated(decision: ProjectApproval["decision"] = "approved") {
  const approval: ProjectApproval = {
    id: "appr-1",
    projectId: PROJECT,
    stageId: "requirements_baseline_review",
    artifactId: ARTIFACT,
    artifactVersion: 2,
    decision,
    decidedBy: DECIDER,
    decidedAt: DECIDED_AT,
  };
  return {
    approval,
    artifactStatus: (decision === "approved"
      ? "approved"
      : "rejected") as ProjectArtifactStatus,
    stageStatus: (decision === "approved"
      ? "approved"
      : "rejected") as ProjectStageStatus,
  };
}

function review(
  overrides: Partial<ReviewRfpRequirementsBaselineArtifactInput> = {}
): Promise<ReviewRfpRequirementsBaselineArtifactResult> {
  return reviewRfpRequirementsBaselineArtifact({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: ARTIFACT,
    decision: "approved",
    decidedBy: DECIDER,
    ...overrides,
  });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(makeArtifact());
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
});

describe("reviewRfpRequirementsBaselineArtifact - input validation", () => {
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

describe("reviewRfpRequirementsBaselineArtifact - project gates", () => {
  it("returns not_found and never loads the artifact or creates an approval when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns a wrong_mode lean summary (no tenantId) and never loads the artifact for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({
        mode: "quick_bom",
        name: "Honeywell Quick BoM",
        customerName: "Honeywell",
      })
    );

    const result = await review();

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "Honeywell Quick BoM",
      customerName: "Honeywell",
      mode: "quick_bom",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({ mode: "quick_bom", customerName: undefined })
    );

    const result = await review();

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });
});

describe("reviewRfpRequirementsBaselineArtifact - artifact gates", () => {
  it("returns artifact_not_found and creates no approval when the exact artifact is missing", async () => {
    mockGetArtifactById.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("rejects every non-requirements_baseline type as artifact_not_requirements_baseline without creating an approval", async () => {
    const otherTypes: ProjectArtifactType[] = [
      "input_package",
      "normalized_boq",
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
      "compliance_matrix",
      "hld_design_delta",
      "technical_proposal",
      "export_package",
    ];
    for (const type of otherTypes) {
      mockCreateApproval.mockClear();
      // Right stage and a reviewable status prove the TYPE gate fires.
      mockGetArtifactById.mockResolvedValue(makeArtifact({ type }));

      const result = await review();

      expect(result.status).toBe("artifact_not_requirements_baseline");
      if (result.status !== "artifact_not_requirements_baseline") {
        throw new Error("unreachable");
      }
      expect(result.artifact.type).toBe(type);
      expect("payload" in result.artifact).toBe(false);
      expect(JSON.stringify(result)).not.toContain(PAYLOAD_SENTINEL);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("rejects a requirements_baseline artifact outside requirements_baseline_review as artifact_not_requirements_baseline without creating an approval", async () => {
    const wrongStages: ProjectStageId[] = [
      "intake_package_review",
      "boq_format_validation",
      "sku_resolution",
      "configuration_expansion_review",
      "compliance_matrix_review",
      "hld_design_delta_review",
      "boq_pricing_review",
      "proposal_review",
      "export_approval",
    ];
    for (const stageId of wrongStages) {
      mockCreateApproval.mockClear();
      // Right type and a reviewable status prove the STAGE gate fires.
      mockGetArtifactById.mockResolvedValue(makeArtifact({ stageId }));

      const result = await review();

      expect(result.status).toBe("artifact_not_requirements_baseline");
      if (result.status !== "artifact_not_requirements_baseline") {
        throw new Error("unreachable");
      }
      expect(result.artifact.stageId).toBe(stageId);
      expect("payload" in result.artifact).toBe(false);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("rejects every non-reviewable status as artifact_not_reviewable without creating an approval", async () => {
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
      mockGetArtifactById.mockResolvedValue(makeArtifact({ status }));

      const result = await review();

      expect(result.status).toBe("artifact_not_reviewable");
      if (result.status !== "artifact_not_reviewable") {
        throw new Error("unreachable");
      }
      expect(result.artifact.status).toBe(status);
      expect("payload" in result.artifact).toBe(false);
      expect(JSON.stringify(result)).not.toContain(PAYLOAD_SENTINEL);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("treats needs_review (the draft status) and generated as reviewable", async () => {
    for (const status of ["needs_review", "generated"] as ProjectArtifactStatus[]) {
      mockCreateApproval.mockClear().mockResolvedValue(makeCreated());
      mockGetArtifactById.mockResolvedValue(makeArtifact({ status }));

      const result = await review();

      expect(result.status).toBe("ok");
      expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    }
  });
});

describe("reviewRfpRequirementsBaselineArtifact - approval", () => {
  it("calls createProjectApproval exactly once with the exact artifact id, tenant, project, decision, decidedBy, decidedAt, and note", async () => {
    await review({
      decision: "rejected",
      decidedAt: DECIDED_AT,
      note: "baseline misses mandatory requirement R-12",
    });

    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "rejected",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
      note: "baseline misses mandatory requirement R-12",
    });
  });

  it("omits decidedAt and note from the createProjectApproval call when not provided", async () => {
    await review();

    const arg = mockCreateApproval.mock.calls[0][0];
    expect("decidedAt" in arg).toBe(false);
    expect("note" in arg).toBe(false);
  });

  it("returns approval_failed when createProjectApproval returns null", async () => {
    mockCreateApproval.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "approval_failed" });
  });

  it("lets an unexpected createProjectApproval error bubble without a defensive catch", async () => {
    mockCreateApproval.mockRejectedValue(new Error("db boom"));

    await expect(review()).rejects.toThrow("db boom");
  });
});

describe("reviewRfpRequirementsBaselineArtifact - ok", () => {
  it("returns ok with the approval, post-decision statuses, and the pre-approval artifact summary", async () => {
    const created = makeCreated("rejected");
    mockCreateApproval.mockResolvedValue(created);

    const result = await review({ decision: "rejected" });

    expect(result).toEqual({
      status: "ok",
      approval: created.approval,
      artifactStatus: "rejected",
      stageStatus: "rejected",
      artifact: {
        id: ARTIFACT,
        projectId: PROJECT,
        stageId: "requirements_baseline_review",
        type: "requirements_baseline",
        status: "needs_review",
        version: 2,
        sourceFileIds: ["file-rfp-1", "file-rfp-2"],
        sourceArtifactIds: ["art-input-package-1"],
        createdAt: TS1.toISOString(),
        updatedAt: TS2.toISOString(),
      },
    });
  });

  it("returns a serializable payload-free artifact summary with copied arrays and no tenantId", async () => {
    const loaded = makeArtifact();
    mockGetArtifactById.mockResolvedValue(loaded);

    const result = await review();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect("tenantId" in result.artifact).toBe(false);
    expect(JSON.parse(JSON.stringify(result.artifact))).toEqual(result.artifact);
    const json = JSON.stringify(result);
    expect(json).not.toContain(PAYLOAD_SENTINEL);
    expect(json).not.toContain(TENANT);

    // Arrays are copies, not aliases of the loaded artifact row.
    expect(result.artifact.sourceFileIds).toEqual(loaded.sourceFileIds);
    expect(result.artifact.sourceFileIds).not.toBe(loaded.sourceFileIds);
    expect(result.artifact.sourceArtifactIds).toEqual(loaded.sourceArtifactIds);
    expect(result.artifact.sourceArtifactIds).not.toBe(loaded.sourceArtifactIds);
  });

  it("passes tenantId through every store call on the ok path", async () => {
    await review();

    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
    expect(mockCreateApproval).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT })
    );
  });
});

describe("reviewRfpRequirementsBaselineArtifact - immutability", () => {
  it("does not mutate the input or the loaded artifact", async () => {
    const loaded = makeArtifact();
    const loadedSnapshot = structuredClone(loaded);
    mockGetArtifactById.mockResolvedValue(loaded);
    const input: ReviewRfpRequirementsBaselineArtifactInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
      note: "baseline looks complete",
    };
    const inputSnapshot = structuredClone(input);

    await reviewRfpRequirementsBaselineArtifact(input);

    expect(input).toEqual(inputSnapshot);
    expect(loaded).toEqual(loadedSnapshot);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-requirements-baseline-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-requirements-baseline-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project store, artifact store, approval store, approval helper, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-approval-store",
      "@/lib/projects/approvals",
      "@/types/project",
    ]);
  });

  it("uses createProjectApproval as its only create/update/delete mutation token", () => {
    expect(source).toContain("createProjectApproval");
    const mutationTokens =
      source.match(/\b(?:create|update|delete|insert|remove|drop)[A-Z]\w*/g) ??
      [];
    expect(Array.from(new Set(mutationTokens))).toEqual(["createProjectApproval"]);
  });

  it("imports no filesystem, DB schema, file/evidence store, draft/extraction service, parser, pricing, config-expansion, export, runner, AI, catalog, coordinator, engine, or adapter module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "fs"',
      'from "path"',
      'from "@/lib/db/index"',
      'from "@/lib/db/schema"',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      "createProjectArtifactVersion",
      'from "@/lib/projects/project-rfp-requirements-baseline"',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-input-package',
      'from "@/lib/projects/project-rfp-upload"',
      'from "@/lib/projects/project-rfp-creation"',
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/files"',
      'from "@/lib/projects/boq-',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom',
      'from "@/lib/projects/project-quick-bom',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
      "@google/generative-ai",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
      "xlsx",
      "storagePath",
      "new Date(",
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
