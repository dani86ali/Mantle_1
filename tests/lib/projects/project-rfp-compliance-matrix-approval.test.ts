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
} from "@/types/project";

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
  reviewRfpComplianceMatrixArtifact,
} from "@/lib/projects/project-rfp-compliance-matrix-approval";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-compliance-matrix-1";
const DECIDER = "u-engineer";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP Bid",
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
    stageId: "compliance_matrix_review",
    type: "compliance_matrix",
    status: "needs_review",
    version: 1,
    payload: { secret: "PAYLOAD-SECRET" },
    sourceFileIds: ["file-rfp-1"],
    sourceArtifactIds: ["art-requirements-baseline-1"],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeCreated(decision: ProjectApproval["decision"] = "approved") {
  return {
    approval: {
      id: "approval-1",
      projectId: PROJECT,
      stageId: "compliance_matrix_review",
      artifactId: ARTIFACT,
      artifactVersion: 1,
      decision,
      decidedBy: DECIDER,
      decidedAt: TS2,
    },
    artifactStatus:
      decision === "approved" ? "approved" : ("rejected" as ProjectArtifactStatus),
    stageStatus:
      decision === "approved" ? "approved" : ("rejected" as ProjectArtifactStatus),
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(makeArtifact());
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
});

describe("reviewRfpComplianceMatrixArtifact", () => {
  it("approves the exact compliance matrix artifact through createProjectApproval", async () => {
    const result = await reviewRfpComplianceMatrixArtifact({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
      note: "complete",
    });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
      note: "complete",
    });
    expect(JSON.stringify(result)).not.toContain("PAYLOAD-SECRET");
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });

  it("gates project, type, stage, and reviewable status before creating approval", async () => {
    mockGetProjectById.mockResolvedValueOnce(null);
    expect(
      await reviewRfpComplianceMatrixArtifact({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
        decision: "approved",
        decidedBy: DECIDER,
      })
    ).toEqual({ status: "not_found" });
    expect(mockCreateApproval).not.toHaveBeenCalled();

    for (const type of [
      "requirements_baseline",
      "evidence_package",
      "priced_boq",
    ] as ProjectArtifactType[]) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValueOnce(makeArtifact({ type }));
      const result = await reviewRfpComplianceMatrixArtifact({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
        decision: "approved",
        decidedBy: DECIDER,
      });
      expect(result.status).toBe("artifact_not_compliance_matrix");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }

    for (const stageId of [
      "requirements_baseline_review",
      "intake_package_review",
    ] as ProjectStageId[]) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValueOnce(makeArtifact({ stageId }));
      const result = await reviewRfpComplianceMatrixArtifact({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
        decision: "approved",
        decidedBy: DECIDER,
      });
      expect(result.status).toBe("artifact_not_compliance_matrix");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }

    mockGetArtifactById.mockResolvedValueOnce(
      makeArtifact({ status: "approved" })
    );
    const notReviewable = await reviewRfpComplianceMatrixArtifact({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
    });
    expect(notReviewable.status).toBe("artifact_not_reviewable");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compliance-matrix-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-compliance-matrix-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only project store, artifact store, approval store, approval helper, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-approval-store",
      "@/lib/projects/approvals",
      "@/types/project",
    ]);
  });

  it("keeps approval as the only mutation boundary and imports no generation or AI modules", () => {
    expect(source).toContain("createProjectApproval");
    for (const forbidden of [
      "createProjectArtifactVersion",
      'from "@/lib/projects/project-rfp-compliance-matrix-draft"',
      'from "@/lib/projects/project-rfp-compliance-matrix-drafting"',
      'from "@/lib/projects/project-rfp-compliance-matrix-generation"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/config-expansion',
      "@anthropic-ai",
      "@google/generative-ai",
      "storagePath",
      "new Date(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps source and test ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
