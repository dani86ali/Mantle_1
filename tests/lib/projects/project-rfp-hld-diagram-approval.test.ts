import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

// Mock the store boundaries only. isArtifactReviewable and the Stage 6G-A diagram
// contract validator stay REAL so the reviewability gate and the payload/source-chain
// re-validation are true integration checks over the supplied fixtures.
const { mockGetProjectById, mockGetArtifactById, mockCreateApproval } = vi.hoisted(
  () => ({
    mockGetProjectById: vi.fn(),
    mockGetArtifactById: vi.fn(),
    mockCreateApproval: vi.fn(),
  })
);

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
  reviewRfpHldDiagramArtifact,
  type ReviewRfpHldDiagramArtifactInput,
  type ReviewRfpHldDiagramArtifactResult,
} from "@/lib/projects/project-rfp-hld-diagram-approval";
import {
  RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND,
  type RfpHldDiagramDraftPayload,
} from "@/lib/projects/project-rfp-hld-diagram";

const TENANT = "55555555-5555-5555-5555-555555555555";
const PROJECT = "proj-1";
const DIAGRAM_ID = "hdg-1";
const MODEL_ID = "hdm-1";
const BUNDLE_ID = "hsb-1";
const REVIEW_ID = "hrev-1";
const DECIDER = "u-approver-9";
const CREATED_AT = "2026-06-24T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);
const DECIDED_AT = new Date("2026-06-24T10:00:00.000Z");
const PAYLOAD_SENTINEL = "SECRET-DIAGRAM-CREATED-BY";
const UPSTREAM_SENTINEL = "SECRET-UPSTREAM-MODEL-PAYLOAD";

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

function validDiagramPayload(
  overrides: Partial<RfpHldDiagramDraftPayload> = {}
): RfpHldDiagramDraftPayload {
  return {
    payloadKind: RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND,
    createdAt: CREATED_AT,
    createdBy: "drafter@example.com",
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceReviewArtifactId: REVIEW_ID,
    sourceModelVersion: 1,
    diagramType: "topology",
    title: "HLD Topology Diagram Draft",
    nodes: [
      { id: "n-1", label: "Core Switch", nodeType: "switch", zoneId: "z-1", sourceRefIds: ["sr-1"] },
      { id: "n-2", label: "Access Switch", nodeType: "switch", zoneId: "z-1", sourceRefIds: ["sr-1"] },
    ],
    links: [
      {
        id: "l-1",
        label: "Core to Access",
        fromNodeId: "n-1",
        toNodeId: "n-2",
        linkType: "ethernet",
        sourceRefIds: ["sr-1"],
      },
    ],
    zones: [{ id: "z-1", label: "Campus Zone", nodeIds: ["n-1", "n-2"], sourceRefIds: ["sr-1"] }],
    sourceReferences: [
      { id: "sr-1", artifactId: MODEL_ID, artifactType: "hld_design_model" },
      { id: "diagram-source-bundle", artifactId: BUNDLE_ID, artifactType: "hld_source_bundle" },
      { id: "diagram-source-review", artifactId: REVIEW_ID, artifactType: "hld_design_model_review" },
    ],
    validationFindings: [],
    ...overrides,
  };
}

function validDiagramArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: DIAGRAM_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_diagram",
    status: "needs_review",
    version: 1,
    payload: validDiagramPayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

// Upstream rows carry an opaque payload the service must never read or leak.
function validModelArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: MODEL_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model",
    status: "approved",
    version: 1,
    payload: { secret: UPSTREAM_SENTINEL },
    sourceFileIds: [],
    sourceArtifactIds: [BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
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
    payload: { secret: UPSTREAM_SENTINEL },
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function validReviewArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: REVIEW_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_review",
    status: "generated",
    version: 1,
    payload: { secret: UPSTREAM_SENTINEL },
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

/** Drive getProjectArtifactById by id for the diagram and its three source rows. */
function setArtifactRows(
  diagram: ProjectArtifact | null,
  model: ProjectArtifact | null,
  bundle: ProjectArtifact | null,
  review: ProjectArtifact | null
): void {
  mockGetArtifactById.mockImplementation(async (_t: string, _p: string, id: string) => {
    if (id === DIAGRAM_ID) return diagram;
    if (id === MODEL_ID) return model;
    if (id === BUNDLE_ID) return bundle;
    if (id === REVIEW_ID) return review;
    return null;
  });
}

function makeCreated(decision: ProjectApproval["decision"] = "approved") {
  const approval: ProjectApproval = {
    id: "appr-diagram-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    artifactId: DIAGRAM_ID,
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
  overrides: Partial<ReviewRfpHldDiagramArtifactInput> = {}
): Promise<ReviewRfpHldDiagramArtifactResult> {
  return reviewRfpHldDiagramArtifact({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: DIAGRAM_ID,
    decision: "approved",
    decidedBy: DECIDER,
    ...overrides,
  });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  // Reset call history too: no clearMocks/mockReset is configured globally, so
  // every test must start from a clean getProjectArtifactById call count for the
  // toHaveBeenCalledTimes assertions below to be meaningful.
  mockGetArtifactById.mockReset();
  setArtifactRows(
    validDiagramArtifact(),
    validModelArtifact(),
    validBundleArtifact(),
    validReviewArtifact()
  );
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
});

describe("reviewRfpHldDiagramArtifact - input validation", () => {
  it("throws on blank artifactId before any store call", async () => {
    await expect(review({ artifactId: "  " })).rejects.toThrow("artifactId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("throws on blank decidedBy before any store call", async () => {
    await expect(review({ decidedBy: " " })).rejects.toThrow("decidedBy is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });
});

describe("reviewRfpHldDiagramArtifact - gates before approval", () => {
  it("returns not_found and never loads an artifact or approves when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    expect(await review()).toEqual({ status: "not_found" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns wrong_mode lean summary (no tenantId/payload) for a non-rfp project", async () => {
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
    setArtifactRows(null, validModelArtifact(), validBundleArtifact(), validReviewArtifact());
    expect(await review()).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, DIAGRAM_ID);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found for a foreign-project artifact", async () => {
    setArtifactRows(
      validDiagramArtifact({ projectId: "other" }),
      validModelArtifact(),
      validBundleArtifact(),
      validReviewArtifact()
    );
    expect(await review()).toEqual({ status: "artifact_not_found" });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_hld_diagram for the wrong type or wrong stage", async () => {
    setArtifactRows(
      validDiagramArtifact({ type: "hld_design_model" }),
      validModelArtifact(),
      validBundleArtifact(),
      validReviewArtifact()
    );
    const wrongType = await review();
    expect(wrongType.status).toBe("artifact_not_hld_diagram");
    if (wrongType.status !== "artifact_not_hld_diagram") throw new Error("unreachable");
    expect("payload" in wrongType.artifact).toBe(false);

    setArtifactRows(
      validDiagramArtifact({ stageId: "compliance_matrix_review" }),
      validModelArtifact(),
      validBundleArtifact(),
      validReviewArtifact()
    );
    expect((await review()).status).toBe("artifact_not_hld_diagram");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_reviewable for every non-reviewable status before any source check", async () => {
    for (const status of [
      "approved", "rejected", "stale", "failed", "missing", "not_applicable",
    ] as ProjectArtifactStatus[]) {
      mockCreateApproval.mockClear();
      setArtifactRows(
        validDiagramArtifact({ status }),
        validModelArtifact(),
        validBundleArtifact(),
        validReviewArtifact()
      );
      const result = await review();
      expect(result.status, status).toBe("artifact_not_reviewable");
      expect(mockCreateApproval, status).not.toHaveBeenCalled();
    }
  });
});

describe("reviewRfpHldDiagramArtifact - approval source-chain gate", () => {
  it("approves a current valid needs_review diagram and records exactly one approval", async () => {
    const result = await review({ decidedAt: DECIDED_AT, note: "diagram approved" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: DIAGRAM_ID,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
      note: "diagram approved",
    });
    // Diagram + the three source rows were each loaded by id.
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, DIAGRAM_ID);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, MODEL_ID);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, BUNDLE_ID);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, REVIEW_ID);
  });

  it("blocks an invalid persisted payload as invalid_hld_diagram_payload before loading sources", async () => {
    setArtifactRows(
      validDiagramArtifact({ payload: { junk: true } }),
      validModelArtifact(),
      validBundleArtifact(),
      validReviewArtifact()
    );
    const result = await review();
    expect(result.status).toBe("invalid_hld_diagram_payload");
    if (result.status !== "invalid_hld_diagram_payload") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks when the diagram row source ids are not exactly [model, bundle, review]", async () => {
    for (const sourceArtifactIds of [
      [MODEL_ID, BUNDLE_ID], // missing review
      [BUNDLE_ID, MODEL_ID, REVIEW_ID], // wrong order
      [MODEL_ID, BUNDLE_ID, REVIEW_ID, "extra"], // extra id
    ]) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockClear();
      setArtifactRows(
        validDiagramArtifact({ sourceArtifactIds }),
        validModelArtifact(),
        validBundleArtifact(),
        validReviewArtifact()
      );
      const result = await review();
      expect(result.status).toBe("stale_hld_diagram_source_chain");
      if (result.status !== "stale_hld_diagram_source_chain") throw new Error("unreachable");
      expect(result.staleCode).toBe("source_artifact_ids_mismatch");
      // The row tie short-circuits before any source row is loaded.
      expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("blocks with source_model_unavailable for a missing/wrong/foreign/unapproved model", async () => {
    const variants: Array<ProjectArtifact | null> = [
      null,
      validModelArtifact({ type: "hld_source_bundle" }),
      validModelArtifact({ stageId: "compliance_matrix_review" }),
      validModelArtifact({ projectId: "other" }),
      validModelArtifact({ status: "needs_review" }),
    ];
    for (const model of variants) {
      mockCreateApproval.mockClear();
      setArtifactRows(validDiagramArtifact(), model, validBundleArtifact(), validReviewArtifact());
      const result = await review();
      expect(result.status).toBe("stale_hld_diagram_source_chain");
      if (result.status !== "stale_hld_diagram_source_chain") throw new Error("unreachable");
      expect(result.staleCode).toBe("source_model_unavailable");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("blocks with source_bundle_unavailable for a missing/wrong/foreign/unapproved bundle", async () => {
    const variants: Array<ProjectArtifact | null> = [
      null,
      validBundleArtifact({ type: "hld_intake" }),
      validBundleArtifact({ stageId: "compliance_matrix_review" }),
      validBundleArtifact({ projectId: "other" }),
      validBundleArtifact({ status: "needs_review" }),
    ];
    for (const bundle of variants) {
      mockCreateApproval.mockClear();
      setArtifactRows(validDiagramArtifact(), validModelArtifact(), bundle, validReviewArtifact());
      const result = await review();
      expect(result.status).toBe("stale_hld_diagram_source_chain");
      if (result.status !== "stale_hld_diagram_source_chain") throw new Error("unreachable");
      expect(result.staleCode).toBe("source_bundle_unavailable");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("blocks with source_review_unavailable for a missing/wrong/foreign/inactive review", async () => {
    const variants: Array<ProjectArtifact | null> = [
      null,
      validReviewArtifact({ type: "hld_design_model" }),
      validReviewArtifact({ stageId: "compliance_matrix_review" }),
      validReviewArtifact({ projectId: "other" }),
      validReviewArtifact({ status: "rejected" }),
      validReviewArtifact({ status: "failed" }),
      validReviewArtifact({ status: "stale" }),
    ];
    for (const reviewRow of variants) {
      mockCreateApproval.mockClear();
      setArtifactRows(validDiagramArtifact(), validModelArtifact(), validBundleArtifact(), reviewRow);
      const result = await review();
      expect(result.status).toBe("stale_hld_diagram_source_chain");
      if (result.status !== "stale_hld_diagram_source_chain") throw new Error("unreachable");
      expect(result.staleCode).toBe("source_review_unavailable");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("approves when the review is needs_review or approved (active, non-generated)", async () => {
    for (const status of ["needs_review", "approved"] as ProjectArtifactStatus[]) {
      mockCreateApproval.mockClear().mockResolvedValue(makeCreated());
      setArtifactRows(
        validDiagramArtifact(),
        validModelArtifact(),
        validBundleArtifact(),
        validReviewArtifact({ status })
      );
      const result = await review();
      expect(result.status, status).toBe("ok");
      expect(mockCreateApproval, status).toHaveBeenCalledTimes(1);
    }
  });

  it("blocks with source_chain_mismatch when the model row is not tied to exactly [bundle]", async () => {
    setArtifactRows(
      validDiagramArtifact(),
      validModelArtifact({ sourceArtifactIds: ["wrong-bundle"] }),
      validBundleArtifact(),
      validReviewArtifact()
    );
    const result = await review();
    expect(result.status).toBe("stale_hld_diagram_source_chain");
    if (result.status !== "stale_hld_diagram_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_chain_mismatch");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks with source_chain_mismatch when the review row is not tied to exactly [model, bundle]", async () => {
    for (const sourceArtifactIds of [[MODEL_ID], [BUNDLE_ID, MODEL_ID], [MODEL_ID, "wrong"]]) {
      mockCreateApproval.mockClear();
      setArtifactRows(
        validDiagramArtifact(),
        validModelArtifact(),
        validBundleArtifact(),
        validReviewArtifact({ sourceArtifactIds })
      );
      const result = await review();
      expect(result.status).toBe("stale_hld_diagram_source_chain");
      if (result.status !== "stale_hld_diagram_source_chain") throw new Error("unreachable");
      expect(result.staleCode).toBe("source_chain_mismatch");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });
});

describe("reviewRfpHldDiagramArtifact - rejection retires bad drafts", () => {
  it("rejects a current valid needs_review diagram with the canonical decision", async () => {
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));
    const result = await review({ decision: "rejected" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: DIAGRAM_ID, decision: "rejected" })
    );
  });

  it("rejects a malformed draft without running any source-chain store check", async () => {
    setArtifactRows(
      validDiagramArtifact({ payload: { junk: true } }),
      validModelArtifact(),
      validBundleArtifact(),
      validReviewArtifact()
    );
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));
    const result = await review({ decision: "rejected" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    // Only the target diagram artifact is loaded; no model/bundle/review lookups.
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, DIAGRAM_ID);
  });

  it("rejects a stale/mismatched draft without running any source-chain store check", async () => {
    setArtifactRows(
      validDiagramArtifact({ sourceArtifactIds: ["stale", "ids", "only"] }),
      validModelArtifact(),
      validBundleArtifact(),
      validReviewArtifact()
    );
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));
    const result = await review({ decision: "rejected" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
  });
});

describe("reviewRfpHldDiagramArtifact - result hygiene", () => {
  it("ok result returns lean summaries and leaks no payload body, upstream payload, or tenantId", async () => {
    const payload = validDiagramPayload({ createdBy: PAYLOAD_SENTINEL });
    setArtifactRows(
      validDiagramArtifact({ payload: payload as unknown as Record<string, unknown> }),
      validModelArtifact(),
      validBundleArtifact(),
      validReviewArtifact()
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
    expect(json).not.toContain(UPSTREAM_SENTINEL);
    expect(json).not.toContain(TENANT);
  });

  it("invalid and stale results leak no payload, upstream payload, tenantId, or forbidden field/markup", async () => {
    setArtifactRows(
      validDiagramArtifact({ payload: { junk: true, createdBy: PAYLOAD_SENTINEL } }),
      validModelArtifact(),
      validBundleArtifact(),
      validReviewArtifact()
    );
    const invalid = await review();
    expect(invalid.status).toBe("invalid_hld_diagram_payload");
    if (invalid.status !== "invalid_hld_diagram_payload") throw new Error("unreachable");
    expect("payload" in invalid.artifact).toBe(false);
    expect(JSON.stringify(invalid)).not.toContain(PAYLOAD_SENTINEL);
    expect(JSON.stringify(invalid)).not.toContain(TENANT);

    // source_chain_mismatch loads the upstream model row; its payload must not leak.
    setArtifactRows(
      validDiagramArtifact(),
      validModelArtifact({ sourceArtifactIds: ["wrong-bundle"] }),
      validBundleArtifact(),
      validReviewArtifact()
    );
    const stale = await review();
    expect(stale.status).toBe("stale_hld_diagram_source_chain");
    if (stale.status !== "stale_hld_diagram_source_chain") throw new Error("unreachable");
    expect("payload" in stale.artifact).toBe(false);
    const staleJson = JSON.stringify(stale);
    expect(staleJson).not.toContain(UPSTREAM_SENTINEL);
    expect(staleJson).not.toContain(TENANT);
    for (const forbidden of ["unitPrice", "totalPrice", "acceptedSku", "<mxfile", "<svg", "```"]) {
      expect(staleJson, forbidden).not.toContain(forbidden);
    }
  });
});

describe("reviewRfpHldDiagramArtifact - approval store outcomes", () => {
  it("maps a null createProjectApproval to approval_failed", async () => {
    mockCreateApproval.mockResolvedValue(null);
    expect(await review()).toEqual({ status: "approval_failed" });
  });

  it("lets an unexpected createProjectApproval error bubble", async () => {
    mockCreateApproval.mockRejectedValue(new Error("db boom"));
    await expect(review()).rejects.toThrow("db boom");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-diagram-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-diagram-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project/artifact/approval stores, the approval helper, the diagram contract, and types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-approval-store",
      "@/lib/projects/approvals",
      "@/lib/projects/project-rfp-hld-diagram",
      "@/types/project",
    ]);
  });

  it("uses createProjectApproval as its only create/update/delete mutation", () => {
    const mutationTokens = source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(Array.from(new Set(mutationTokens))).toEqual(["createProjectApproval"]);
  });

  it("imports no fs/path/raw-doc, file/evidence store, AI/provider, pricing/sku/catalog/config, route/component, or final-output", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/project-rfp-hld-diagram-draft"',
      'from "@/lib/catalog',
      'from "@/lib/adapters',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "next/server"',
      'from "react"',
      "@anthropic-ai",
      "openai",
      "pdf-parse",
      "mammoth",
      "docxtemplater",
      "drawio",
      "<mxfile",
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
