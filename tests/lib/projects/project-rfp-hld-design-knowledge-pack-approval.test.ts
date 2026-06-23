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

// Mock the DB store boundaries. The pure approval helper (isArtifactReviewable),
// the domain-readiness contract, and the knowledge-pack contract stay REAL so the
// reviewability gate and payload re-validation are true integration checks.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockCreateArtifactVersion,
  mockCreateApproval,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockCreateArtifactVersion: vi.fn(),
  mockCreateApproval: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  createProjectArtifactVersion: mockCreateArtifactVersion,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: mockCreateApproval,
}));

import {
  reviewRfpHldDesignKnowledgePackArtifact,
  type ReviewRfpHldDesignKnowledgePackArtifactInput,
  type ReviewRfpHldDesignKnowledgePackArtifactResult,
} from "@/lib/projects/project-rfp-hld-design-knowledge-pack-approval";
import { createRfpHldDesignKnowledgePack } from "@/lib/projects/project-rfp-hld-design-knowledge-pack";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-pack-2";
const DECIDER = "u-engineer-7";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const DECIDED_AT = new Date("2026-06-09T09:00:00.000Z");
const CONTENT_SENTINEL = "SECRET-PRINCIPLE-VALUE";

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

// The normalized persisted shape the creation contract emits.
function makeNormalizedPayload(
  mutate: (payload: Record<string, unknown>) => void = () => {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    payloadKind: "rfp_hld_design_knowledge_pack",
    source: "manual_operator_entry",
    createdBy: "engineer-1",
    createdAt: "2026-06-20T09:15:00.000Z",
    domain: "campus_switching",
    title: "Campus switching design pack",
    designPrinciples: [CONTENT_SENTINEL, "Redundant uplinks"],
    topologyGuidance: ["Two-tier"],
    constraints: [],
    assumptions: [],
    exclusions: [],
    validationNotes: [],
    entryCount: 3,
    sectionCounts: {
      designPrinciples: 2,
      topologyGuidance: 1,
      constraints: 0,
      assumptions: 0,
      exclusions: 0,
      validationNotes: 0,
    },
  };
  mutate(payload);
  return payload;
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "design_knowledge_pack",
    status: "needs_review",
    version: 2,
    payload: makeNormalizedPayload(),
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeCreated(decision: ProjectApproval["decision"] = "approved") {
  const approval: ProjectApproval = {
    id: "appr-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
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
  overrides: Partial<ReviewRfpHldDesignKnowledgePackArtifactInput> = {}
): Promise<ReviewRfpHldDesignKnowledgePackArtifactResult> {
  return reviewRfpHldDesignKnowledgePackArtifact({
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
  mockCreateArtifactVersion.mockReset();
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
});

describe("reviewRfpHldDesignKnowledgePackArtifact - input validation", () => {
  it("throws on a blank artifactId before any store call", async () => {
    await expect(review({ artifactId: "  " })).rejects.toThrow(
      "artifactId is required."
    );
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("throws on a blank decidedBy before any store call", async () => {
    await expect(review({ decidedBy: " " })).rejects.toThrow(
      "decidedBy is required."
    );
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });
});

describe("reviewRfpHldDesignKnowledgePackArtifact - gates before approval", () => {
  it("returns not_found and never approves when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns wrong_mode (no tenantId) and never approves for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await review();

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found when the exact artifact is missing", async () => {
    mockGetArtifactById.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_design_knowledge_pack for the wrong type or stage", async () => {
    for (const overrides of [
      { type: "compliance_matrix" as ProjectArtifactType },
      { stageId: "compliance_matrix_review" as ProjectStageId },
    ]) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValue(makeArtifact(overrides));

      const result = await review();

      expect(result.status).toBe("artifact_not_design_knowledge_pack");
      if (result.status !== "artifact_not_design_knowledge_pack") {
        throw new Error("unreachable");
      }
      expect("payload" in result.artifact).toBe(false);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("returns artifact_not_reviewable for non-reviewable statuses BEFORE payload validation", async () => {
    for (const status of [
      "approved",
      "rejected",
      "stale",
      "failed",
      "missing",
      "not_applicable",
    ] as ProjectArtifactStatus[]) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValue(makeArtifact({ status }));

      const result = await review();

      expect(result.status).toBe("artifact_not_reviewable");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });
});

describe("reviewRfpHldDesignKnowledgePackArtifact - approval payload re-validation", () => {
  it("approves a normalized payload and records exactly one approval", async () => {
    const result = await review({ decidedAt: DECIDED_AT, note: "looks complete" });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
      note: "looks complete",
    });
  });

  it("approves a payload produced by the real creation contract", async () => {
    let captured: Record<string, unknown> | undefined;
    mockCreateArtifactVersion.mockImplementation(
      async (arg: { payload: Record<string, unknown> }) => {
        captured = arg.payload;
        return makeArtifact({ payload: arg.payload });
      }
    );
    await createRfpHldDesignKnowledgePack({
      tenantId: TENANT,
      projectId: PROJECT,
      createdBy: "engineer-1",
      domain: "wireless",
      title: "Wireless pack",
      designPrinciples: ["Seamless roaming"],
      topologyGuidance: [],
      constraints: [],
      assumptions: [],
      exclusions: [],
      validationNotes: ["Survey required"],
      createdAt: new Date("2026-06-20T09:15:00.000Z"),
    });
    expect(captured).toBeDefined();

    mockGetArtifactById.mockResolvedValue(makeArtifact({ payload: captured }));

    const result = await review();

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("blocks every non-normalized or tampered payload without approving", async () => {
    const tampered: Array<[string, Record<string, unknown>]> = [
      ["wrong payloadKind", makeNormalizedPayload((p) => { p.payloadKind = "nope"; })],
      ["wrong source", makeNormalizedPayload((p) => { p.source = "raw_file"; })],
      ["unknown domain", makeNormalizedPayload((p) => { p.domain = "made_up"; })],
      ["blank title", makeNormalizedPayload((p) => { p.title = "   "; })],
      ["non-array section", makeNormalizedPayload((p) => { p.constraints = "nope"; })],
      ["blank section entry", makeNormalizedPayload((p) => { p.designPrinciples = ["  "]; })],
      ["mismatched sectionCount", makeNormalizedPayload((p) => {
        (p.sectionCounts as Record<string, number>).designPrinciples = 9;
      })],
      ["mismatched entryCount", makeNormalizedPayload((p) => { p.entryCount = 99; })],
      ["no meaningful entries", makeNormalizedPayload((p) => {
        p.designPrinciples = [];
        p.topologyGuidance = [];
        p.entryCount = 0;
        p.sectionCounts = {
          designPrinciples: 0,
          topologyGuidance: 0,
          constraints: 0,
          assumptions: 0,
          exclusions: 0,
          validationNotes: 0,
        };
      })],
      ["extra top-level key", makeNormalizedPayload((p) => { p.tenantId = TENANT; })],
    ];
    for (const [, payload] of tampered) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValue(makeArtifact({ payload }));

      const result = await review();

      expect(result.status).toBe("invalid_design_knowledge_pack_payload");
      if (result.status !== "invalid_design_knowledge_pack_payload") {
        throw new Error("unreachable");
      }
      expect("payload" in result.artifact).toBe(false);
      expect(mockCreateApproval).not.toHaveBeenCalled();
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

describe("reviewRfpHldDesignKnowledgePackArtifact - ok result", () => {
  it("returns approval, post-decision statuses, and a lean summary without leaking content or tenant id", async () => {
    const result = await review();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactStatus).toBe("approved");
    expect(result.stageStatus).toBe("approved");
    expect("payload" in result.artifact).toBe(false);
    expect("tenantId" in result.artifact).toBe(false);

    const json = JSON.stringify(result);
    expect(json).not.toContain(CONTENT_SENTINEL);
    expect(json).not.toContain(TENANT);
  });

  it("returns approval_failed when createProjectApproval returns null", async () => {
    mockCreateApproval.mockResolvedValue(null);

    const result = await review();

    expect(result).toEqual({ status: "approval_failed" });
  });

  it("lets an unexpected createProjectApproval error bubble", async () => {
    mockCreateApproval.mockRejectedValue(new Error("db boom"));

    await expect(review()).rejects.toThrow("db boom");
  });

  it("does not mutate the input or the loaded artifact", async () => {
    const loaded = makeArtifact();
    const loadedSnapshot = structuredClone(loaded);
    mockGetArtifactById.mockResolvedValue(loaded);
    const input: ReviewRfpHldDesignKnowledgePackArtifactInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
    };
    const inputSnapshot = structuredClone(input);

    await reviewRfpHldDesignKnowledgePackArtifact(input);

    expect(input).toEqual(inputSnapshot);
    expect(loaded).toEqual(loadedSnapshot);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-knowledge-pack-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-design-knowledge-pack-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project store, artifact store, approval store, approval helper, domain-readiness + knowledge-pack contracts, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-approval-store",
      "@/lib/projects/approvals",
      "@/lib/projects/project-rfp-hld-domain-readiness",
      "@/lib/projects/project-rfp-hld-design-knowledge-pack",
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
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
