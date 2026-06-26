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

// Mock ONLY the store boundaries plus the two compact upstream payload validators
// (source bundle + design model). isArtifactReviewable, the Stage 6H-A document-model
// contract validator, and the Stage 6G-A diagram contract validator all stay REAL, so
// the reviewability gate and the document-model/diagram payload + source-chain
// re-validation are true integration checks over the supplied fixtures.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockCreateApproval,
  mockValidateBundle,
  mockValidateModel,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockCreateApproval: vi.fn(),
  mockValidateBundle: vi.fn(),
  mockValidateModel: vi.fn(),
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
vi.mock("@/lib/projects/project-rfp-hld-source-bundle", () => ({
  validateRfpHldSourceBundlePayload: mockValidateBundle,
}));
vi.mock("@/lib/projects/project-rfp-hld-design-model", () => ({
  validateRfpHldDesignModelPayload: mockValidateModel,
}));

import {
  reviewRfpHldDocumentModelArtifact,
  type ReviewRfpHldDocumentModelArtifactInput,
  type ReviewRfpHldDocumentModelArtifactResult,
} from "@/lib/projects/project-rfp-hld-document-model-approval";
import {
  RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND,
  type RfpHldDocumentModelPayload,
} from "@/lib/projects/project-rfp-hld-document-model";
import {
  RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND,
  type RfpHldDiagramDraftPayload,
} from "@/lib/projects/project-rfp-hld-diagram";

const TENANT = "55555555-5555-5555-5555-555555555555";
const PROJECT = "proj-1";
const DOCMODEL_ID = "hdocm-1";
const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const DIAGRAM_ID = "hdg-1";
const REVIEW_ID = "hrev-1";
const DECIDER = "u-approver-9";
const CREATED_AT = "2026-06-24T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);
const DECIDED_AT = new Date("2026-06-24T10:00:00.000Z");

// Sentinels embedded in each upstream/target payload body. The service reads several
// of them while gating but must never surface one in any result.
const DOCMODEL_SENTINEL = "SECRET-DOCMODEL-CREATED-BY";
const BUNDLE_SENTINEL = "SECRET-BUNDLE-PAYLOAD";
const MODEL_SENTINEL = "SECRET-MODEL-PAYLOAD";
const DIAGRAM_SENTINEL = "SECRET-DIAGRAM-CREATED-BY";
const REVIEW_SENTINEL = "SECRET-REVIEW-PAYLOAD";

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

/** A fully valid Stage 6H-A document-model payload (the REAL validator gates it). */
function validDocModelPayload(
  overrides: Partial<RfpHldDocumentModelPayload> = {}
): RfpHldDocumentModelPayload {
  return {
    payloadKind: RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND,
    createdAt: CREATED_AT,
    createdBy: DOCMODEL_SENTINEL,
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldDiagramArtifactId: DIAGRAM_ID,
    sourceModelVersion: 1,
    sourceDiagramVersion: 1,
    title: "HLD Document Model",
    documentPurpose: "Internal structured HLD document spine for engineer review.",
    coveredDomains: [],
    excludedDomains: [],
    assumptions: [],
    designSummary: [],
    topologySummary: [],
    siteOrScopeSummary: [],
    implementationNotes: [],
    dependencies: [],
    risksAndCaveats: [],
    complianceTraceSummary: [],
    boqTraceSummary: [],
    diagramReferences: [
      {
        id: "diagram-reference-1",
        diagramArtifactId: DIAGRAM_ID,
        diagramTitle: "HLD Topology Diagram",
        diagramType: "topology",
        sourceRefIds: [DIAGRAM_ID],
      },
    ],
    validationFindings: [],
    ...overrides,
  };
}

/** A fully valid Stage 6G-A diagram draft payload (the REAL validator gates it). */
function validDiagramPayload(
  overrides: Partial<RfpHldDiagramDraftPayload> = {}
): RfpHldDiagramDraftPayload {
  return {
    payloadKind: RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND,
    createdAt: CREATED_AT,
    createdBy: DIAGRAM_SENTINEL,
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

function validDocModelArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: DOCMODEL_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_document_model",
    status: "needs_review",
    version: 1,
    payload: validDocModelPayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

// The bundle/model payloads stay compact - their validators are mocked. The service
// still reads the design-model payload's source ids, so those fields are real values.
function validBundleArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: BUNDLE_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "approved",
    version: 1,
    payload: { createdBy: BUNDLE_SENTINEL },
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function validModelArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: MODEL_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model",
    status: "approved",
    version: 1,
    payload: {
      createdBy: MODEL_SENTINEL,
      sourceHldSourceBundleArtifactId: BUNDLE_ID,
      sourceArtifactIds: [BUNDLE_ID],
    },
    sourceFileIds: [],
    sourceArtifactIds: [BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function validDiagramArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: DIAGRAM_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_diagram",
    status: "approved",
    version: 1,
    payload: validDiagramPayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
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
    payload: { secret: REVIEW_SENTINEL },
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

/** Drive getProjectArtifactById by id for the document model + its four source rows. */
function setArtifactRows(
  docModel: ProjectArtifact | null,
  bundle: ProjectArtifact | null,
  model: ProjectArtifact | null,
  diagram: ProjectArtifact | null,
  review: ProjectArtifact | null
): void {
  mockGetArtifactById.mockImplementation(async (_t: string, _p: string, id: string) => {
    if (id === DOCMODEL_ID) return docModel;
    if (id === BUNDLE_ID) return bundle;
    if (id === MODEL_ID) return model;
    if (id === DIAGRAM_ID) return diagram;
    if (id === REVIEW_ID) return review;
    return null;
  });
}

function makeCreated(decision: ProjectApproval["decision"] = "approved") {
  const approval: ProjectApproval = {
    id: "appr-docmodel-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    artifactId: DOCMODEL_ID,
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
  overrides: Partial<ReviewRfpHldDocumentModelArtifactInput> = {}
): Promise<ReviewRfpHldDocumentModelArtifactResult> {
  return reviewRfpHldDocumentModelArtifact({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: DOCMODEL_ID,
    decision: "approved",
    decidedBy: DECIDER,
    ...overrides,
  });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  // Reset call history too: no clearMocks/mockReset is configured globally, so every
  // test starts from a clean getProjectArtifactById call count for the
  // toHaveBeenCalledTimes assertions below to be meaningful.
  mockGetArtifactById.mockReset();
  setArtifactRows(
    validDocModelArtifact(),
    validBundleArtifact(),
    validModelArtifact(),
    validDiagramArtifact(),
    validReviewArtifact()
  );
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
  mockValidateBundle.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateModel.mockReset().mockReturnValue({ valid: true, errors: [] });
});

describe("reviewRfpHldDocumentModelArtifact - input validation", () => {
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

describe("reviewRfpHldDocumentModelArtifact - gates before approval", () => {
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
    setArtifactRows(null, validBundleArtifact(), validModelArtifact(), validDiagramArtifact(), validReviewArtifact());
    expect(await review()).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, DOCMODEL_ID);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found for a foreign-project artifact", async () => {
    setArtifactRows(
      validDocModelArtifact({ projectId: "other" }),
      validBundleArtifact(),
      validModelArtifact(),
      validDiagramArtifact(),
      validReviewArtifact()
    );
    expect(await review()).toEqual({ status: "artifact_not_found" });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_hld_document_model for the wrong type or wrong stage", async () => {
    setArtifactRows(
      validDocModelArtifact({ type: "hld_diagram" }),
      validBundleArtifact(),
      validModelArtifact(),
      validDiagramArtifact(),
      validReviewArtifact()
    );
    const wrongType = await review();
    expect(wrongType.status).toBe("artifact_not_hld_document_model");
    if (wrongType.status !== "artifact_not_hld_document_model") throw new Error("unreachable");
    expect("payload" in wrongType.artifact).toBe(false);

    setArtifactRows(
      validDocModelArtifact({ stageId: "compliance_matrix_review" }),
      validBundleArtifact(),
      validModelArtifact(),
      validDiagramArtifact(),
      validReviewArtifact()
    );
    expect((await review()).status).toBe("artifact_not_hld_document_model");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_reviewable for every non-reviewable status before any source check", async () => {
    for (const status of [
      "approved", "rejected", "stale", "failed", "missing", "not_applicable",
    ] as ProjectArtifactStatus[]) {
      mockCreateApproval.mockClear();
      setArtifactRows(
        validDocModelArtifact({ status }),
        validBundleArtifact(),
        validModelArtifact(),
        validDiagramArtifact(),
        validReviewArtifact()
      );
      const result = await review();
      expect(result.status, status).toBe("artifact_not_reviewable");
      expect(mockCreateApproval, status).not.toHaveBeenCalled();
    }
  });
});

describe("reviewRfpHldDocumentModelArtifact - approval source-chain gate", () => {
  it("approves a current valid needs_review document model and records exactly one approval", async () => {
    const result = await review({ decidedAt: DECIDED_AT, note: "document model approved" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: DOCMODEL_ID,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
      note: "document model approved",
    });
    // Document model + the four source rows were each loaded by id.
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, DOCMODEL_ID);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, BUNDLE_ID);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, MODEL_ID);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, DIAGRAM_ID);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, REVIEW_ID);
    // The compact upstream payload validators were genuinely invoked on approval.
    expect(mockValidateBundle).toHaveBeenCalledWith({ createdBy: BUNDLE_SENTINEL });
    expect(mockValidateModel).toHaveBeenCalled();
  });

  it("blocks an invalid persisted payload as invalid_hld_document_model_payload before loading sources", async () => {
    setArtifactRows(
      validDocModelArtifact({ payload: { junk: true } }),
      validBundleArtifact(),
      validModelArtifact(),
      validDiagramArtifact(),
      validReviewArtifact()
    );
    const result = await review();
    expect(result.status).toBe("invalid_hld_document_model_payload");
    if (result.status !== "invalid_hld_document_model_payload") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    // Only the target document model was loaded; no upstream lookups, no validators.
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
    expect(mockValidateBundle).not.toHaveBeenCalled();
    expect(mockValidateModel).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks when the document model row source ids are not exactly [bundle, model, diagram]", async () => {
    for (const sourceArtifactIds of [
      [BUNDLE_ID, MODEL_ID], // missing diagram
      [MODEL_ID, BUNDLE_ID, DIAGRAM_ID], // wrong order
      [BUNDLE_ID, MODEL_ID, DIAGRAM_ID, "extra"], // extra id
    ]) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockClear();
      setArtifactRows(
        validDocModelArtifact({ sourceArtifactIds }),
        validBundleArtifact(),
        validModelArtifact(),
        validDiagramArtifact(),
        validReviewArtifact()
      );
      const result = await review();
      expect(result.status).toBe("stale_hld_document_model_source_chain");
      if (result.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
      expect(result.staleCode).toBe("source_artifact_ids_mismatch");
      // The row tie short-circuits before any source row is loaded.
      expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
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
      setArtifactRows(validDocModelArtifact(), bundle, validModelArtifact(), validDiagramArtifact(), validReviewArtifact());
      const result = await review();
      expect(result.status).toBe("stale_hld_document_model_source_chain");
      if (result.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
      expect(result.staleCode).toBe("source_bundle_unavailable");
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
      setArtifactRows(validDocModelArtifact(), validBundleArtifact(), model, validDiagramArtifact(), validReviewArtifact());
      const result = await review();
      expect(result.status).toBe("stale_hld_document_model_source_chain");
      if (result.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
      expect(result.staleCode).toBe("source_model_unavailable");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("blocks with source_diagram_unavailable for a missing/wrong/foreign/unapproved diagram", async () => {
    const variants: Array<ProjectArtifact | null> = [
      null,
      validDiagramArtifact({ type: "hld_design_model" }),
      validDiagramArtifact({ stageId: "compliance_matrix_review" }),
      validDiagramArtifact({ projectId: "other" }),
      validDiagramArtifact({ status: "needs_review" }),
    ];
    for (const diagram of variants) {
      mockCreateApproval.mockClear();
      setArtifactRows(validDocModelArtifact(), validBundleArtifact(), validModelArtifact(), diagram, validReviewArtifact());
      const result = await review();
      expect(result.status).toBe("stale_hld_document_model_source_chain");
      if (result.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
      expect(result.staleCode).toBe("source_diagram_unavailable");
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
      setArtifactRows(validDocModelArtifact(), validBundleArtifact(), validModelArtifact(), validDiagramArtifact(), reviewRow);
      const result = await review();
      expect(result.status).toBe("stale_hld_document_model_source_chain");
      if (result.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
      expect(result.staleCode).toBe("source_review_unavailable");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("approves when the review is needs_review or approved (active, non-generated)", async () => {
    for (const status of ["needs_review", "approved"] as ProjectArtifactStatus[]) {
      mockCreateApproval.mockClear().mockResolvedValue(makeCreated());
      setArtifactRows(
        validDocModelArtifact(),
        validBundleArtifact(),
        validModelArtifact(),
        validDiagramArtifact(),
        validReviewArtifact({ status })
      );
      const result = await review();
      expect(result.status, status).toBe("ok");
      expect(mockCreateApproval, status).toHaveBeenCalledTimes(1);
    }
  });

  it("blocks an invalid source-bundle payload as source_bundle_invalid (validator is called)", async () => {
    mockValidateBundle.mockReturnValue({ valid: false, errors: ["bad bundle"] });
    const result = await review();
    expect(result.status).toBe("stale_hld_document_model_source_chain");
    if (result.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_bundle_invalid");
    expect(mockValidateBundle).toHaveBeenCalledWith({ createdBy: BUNDLE_SENTINEL });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks an invalid design-model payload as source_model_invalid (validator is called)", async () => {
    mockValidateModel.mockReturnValue({ valid: false, errors: ["bad model"] });
    const result = await review();
    expect(result.status).toBe("stale_hld_document_model_source_chain");
    if (result.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_model_invalid");
    expect(mockValidateModel).toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks an invalid diagram payload as source_diagram_invalid (real diagram validator)", async () => {
    setArtifactRows(
      validDocModelArtifact(),
      validBundleArtifact(),
      validModelArtifact(),
      validDiagramArtifact({ payload: { junk: true } }),
      validReviewArtifact()
    );
    const result = await review();
    expect(result.status).toBe("stale_hld_document_model_source_chain");
    if (result.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_diagram_invalid");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks model and diagram source version mismatches as source_version_mismatch", async () => {
    // Design model artifact version no longer equals the document model sourceModelVersion.
    setArtifactRows(
      validDocModelArtifact(),
      validBundleArtifact(),
      validModelArtifact({ version: 2 }),
      validDiagramArtifact(),
      validReviewArtifact()
    );
    const modelVersion = await review();
    expect(modelVersion.status).toBe("stale_hld_document_model_source_chain");
    if (modelVersion.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
    expect(modelVersion.staleCode).toBe("source_version_mismatch");

    // Diagram artifact version no longer equals the document model sourceDiagramVersion.
    mockCreateApproval.mockClear();
    setArtifactRows(
      validDocModelArtifact(),
      validBundleArtifact(),
      validModelArtifact(),
      validDiagramArtifact({ version: 2 }),
      validReviewArtifact()
    );
    const diagramVersion = await review();
    expect(diagramVersion.status).toBe("stale_hld_document_model_source_chain");
    if (diagramVersion.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
    expect(diagramVersion.staleCode).toBe("source_version_mismatch");

    // Diagram payload's claimed model version no longer equals the current model version.
    mockCreateApproval.mockClear();
    setArtifactRows(
      validDocModelArtifact(),
      validBundleArtifact(),
      validModelArtifact(),
      validDiagramArtifact({
        payload: validDiagramPayload({ sourceModelVersion: 2 }) as unknown as Record<string, unknown>,
      }),
      validReviewArtifact()
    );
    const payloadVersion = await review();
    expect(payloadVersion.status).toBe("stale_hld_document_model_source_chain");
    if (payloadVersion.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
    expect(payloadVersion.staleCode).toBe("source_version_mismatch");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks model, diagram, or review source-chain mismatches as source_chain_mismatch", async () => {
    // Model row not tied to exactly [bundle].
    setArtifactRows(
      validDocModelArtifact(),
      validBundleArtifact(),
      validModelArtifact({ sourceArtifactIds: ["wrong-bundle"] }),
      validDiagramArtifact(),
      validReviewArtifact()
    );
    const modelChain = await review();
    expect(modelChain.status).toBe("stale_hld_document_model_source_chain");
    if (modelChain.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
    expect(modelChain.staleCode).toBe("source_chain_mismatch");

    // Model payload no longer points back at the source bundle.
    mockCreateApproval.mockClear();
    setArtifactRows(
      validDocModelArtifact(),
      validBundleArtifact(),
      validModelArtifact({
        payload: {
          createdBy: MODEL_SENTINEL,
          sourceHldSourceBundleArtifactId: "other-bundle",
          sourceArtifactIds: ["other-bundle"],
        },
      }),
      validDiagramArtifact(),
      validReviewArtifact()
    );
    const modelPayloadChain = await review();
    expect(modelPayloadChain.status).toBe("stale_hld_document_model_source_chain");
    if (modelPayloadChain.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
    expect(modelPayloadChain.staleCode).toBe("source_chain_mismatch");

    // Diagram row not tied to exactly [model, bundle, review].
    mockCreateApproval.mockClear();
    setArtifactRows(
      validDocModelArtifact(),
      validBundleArtifact(),
      validModelArtifact(),
      validDiagramArtifact({ sourceArtifactIds: [BUNDLE_ID, MODEL_ID, REVIEW_ID] }),
      validReviewArtifact()
    );
    const diagramChain = await review();
    expect(diagramChain.status).toBe("stale_hld_document_model_source_chain");
    if (diagramChain.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
    expect(diagramChain.staleCode).toBe("source_chain_mismatch");

    // Review row not tied to exactly [model, bundle].
    mockCreateApproval.mockClear();
    setArtifactRows(
      validDocModelArtifact(),
      validBundleArtifact(),
      validModelArtifact(),
      validDiagramArtifact(),
      validReviewArtifact({ sourceArtifactIds: [BUNDLE_ID, MODEL_ID] })
    );
    const reviewChain = await review();
    expect(reviewChain.status).toBe("stale_hld_document_model_source_chain");
    if (reviewChain.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
    expect(reviewChain.staleCode).toBe("source_chain_mismatch");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });
});

describe("reviewRfpHldDocumentModelArtifact - rejection retires bad models", () => {
  it("rejects a current valid needs_review document model with the canonical decision", async () => {
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));
    const result = await review({ decision: "rejected" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: DOCMODEL_ID, decision: "rejected" })
    );
  });

  it("rejects a malformed model without running any source-chain store or validator check", async () => {
    setArtifactRows(
      validDocModelArtifact({ payload: { junk: true } }),
      validBundleArtifact(),
      validModelArtifact(),
      validDiagramArtifact(),
      validReviewArtifact()
    );
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));
    const result = await review({ decision: "rejected" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    // Only the target document model is loaded; no bundle/model/diagram/review lookups.
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, DOCMODEL_ID);
    expect(mockValidateBundle).not.toHaveBeenCalled();
    expect(mockValidateModel).not.toHaveBeenCalled();
  });

  it("rejects a stale/mismatched model without running any source-chain store check", async () => {
    setArtifactRows(
      validDocModelArtifact({ sourceArtifactIds: ["stale", "ids", "only"] }),
      validBundleArtifact(),
      validModelArtifact(),
      validDiagramArtifact(),
      validReviewArtifact()
    );
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));
    const result = await review({ decision: "rejected" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
  });
});

describe("reviewRfpHldDocumentModelArtifact - result hygiene", () => {
  it("ok result returns lean summaries and leaks no payload body, upstream payload, or tenantId", async () => {
    const result = await review();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactStatus).toBe("approved");
    expect(result.stageStatus).toBe("approved");
    expect("payload" in result.artifact).toBe(false);
    expect("tenantId" in result.artifact).toBe(false);
    const json = JSON.stringify(result);
    // The ok path reads every upstream payload yet leaks none of their sentinels.
    for (const sentinel of [
      DOCMODEL_SENTINEL, BUNDLE_SENTINEL, MODEL_SENTINEL, DIAGRAM_SENTINEL, REVIEW_SENTINEL, TENANT,
    ]) {
      expect(json, sentinel).not.toContain(sentinel);
    }
  });

  it("invalid and stale results leak no payload, upstream payload, tenantId, or forbidden field/markup", async () => {
    setArtifactRows(
      validDocModelArtifact({ payload: { junk: true, createdBy: DOCMODEL_SENTINEL } }),
      validBundleArtifact(),
      validModelArtifact(),
      validDiagramArtifact(),
      validReviewArtifact()
    );
    const invalid = await review();
    expect(invalid.status).toBe("invalid_hld_document_model_payload");
    if (invalid.status !== "invalid_hld_document_model_payload") throw new Error("unreachable");
    expect("payload" in invalid.artifact).toBe(false);
    expect(JSON.stringify(invalid)).not.toContain(DOCMODEL_SENTINEL);
    expect(JSON.stringify(invalid)).not.toContain(TENANT);

    // source_chain_mismatch loads and reads the upstream model payload; it must not leak.
    setArtifactRows(
      validDocModelArtifact(),
      validBundleArtifact(),
      validModelArtifact({
        payload: {
          createdBy: MODEL_SENTINEL,
          sourceHldSourceBundleArtifactId: "other-bundle",
          sourceArtifactIds: ["other-bundle"],
        },
      }),
      validDiagramArtifact(),
      validReviewArtifact()
    );
    const stale = await review();
    expect(stale.status).toBe("stale_hld_document_model_source_chain");
    if (stale.status !== "stale_hld_document_model_source_chain") throw new Error("unreachable");
    expect("payload" in stale.artifact).toBe(false);
    const staleJson = JSON.stringify(stale);
    for (const sentinel of [BUNDLE_SENTINEL, MODEL_SENTINEL, DIAGRAM_SENTINEL, REVIEW_SENTINEL, TENANT]) {
      expect(staleJson, sentinel).not.toContain(sentinel);
    }
    for (const forbidden of [
      "unitPrice", "totalPrice", "acceptedSku", "<mxfile", "<svg", "```", "technical proposal", "export package",
    ]) {
      expect(staleJson, forbidden).not.toContain(forbidden);
    }
  });
});

describe("reviewRfpHldDocumentModelArtifact - approval store outcomes", () => {
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
    "src/lib/projects/project-rfp-hld-document-model-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-document-model-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project/artifact/approval stores, the approval helper, the four HLD contracts, and types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-approval-store",
      "@/lib/projects/approvals",
      "@/lib/projects/project-rfp-hld-document-model",
      "@/lib/projects/project-rfp-hld-source-bundle",
      "@/lib/projects/project-rfp-hld-design-model",
      "@/lib/projects/project-rfp-hld-diagram",
      "@/types/project",
    ]);
  });

  it("uses createProjectApproval as its only create/update/delete mutation", () => {
    const mutationTokens = source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(Array.from(new Set(mutationTokens))).toEqual(["createProjectApproval"]);
  });

  it("imports no fs/path/raw-doc, file/evidence store, AI/provider, pricing/sku/catalog/config, route/component, sibling service, or final-output", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/project-rfp-hld-document-model-draft"',
      'from "@/lib/projects/project-rfp-hld-document-model-inspection"',
      'from "@/lib/projects/project-rfp-hld-generation-readiness"',
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
