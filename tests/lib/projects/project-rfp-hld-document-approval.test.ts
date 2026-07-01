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

// Mock ONLY the store boundaries plus the UPSTREAM payload validators (document
// model, source bundle, design model, diagram). isArtifactReviewable and the Stage 6H-0I-A
// rfp_hld_document contract validator stay REAL, so the reviewability gate and the
// persisted-upload payload + source-chain re-validation are true integration checks.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockCreateApproval,
  mockValidateDocModel,
  mockValidateSourceBundle,
  mockValidateModel,
  mockValidateDiagram,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockCreateApproval: vi.fn(),
  mockValidateDocModel: vi.fn(),
  mockValidateSourceBundle: vi.fn(),
  mockValidateModel: vi.fn(),
  mockValidateDiagram: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProjectById }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: mockCreateApproval,
}));
vi.mock("@/lib/projects/project-rfp-hld-document-model", () => ({
  validateRfpHldDocumentModelPayload: mockValidateDocModel,
}));
vi.mock("@/lib/projects/project-rfp-hld-source-bundle", () => ({
  validateRfpHldSourceBundlePayload: mockValidateSourceBundle,
}));
vi.mock("@/lib/projects/project-rfp-hld-design-model", () => ({
  validateRfpHldDesignModelPayload: mockValidateModel,
}));
vi.mock("@/lib/projects/project-rfp-hld-diagram", () => ({
  validateRfpHldDiagramDraftPayload: mockValidateDiagram,
}));

import {
  reviewRfpHldDocumentArtifact,
  type ReviewRfpHldDocumentArtifactInput,
  type ReviewRfpHldDocumentArtifactResult,
} from "@/lib/projects/project-rfp-hld-document-approval";

const TENANT = "88888888-8888-8888-8888-888888888888";
const PROJECT = "proj-1";
const DOC_ID = "hdoc-1";
const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const DIAGRAM_ID = "hdg-1";
const DOCMODEL_ID = "hdocm-1";
const REVIEW_ID = "hrev-1";
const DECIDER = "u-approver-9";
const CREATED_AT = "2026-06-30T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);
const DECIDED_AT = new Date("2026-06-30T10:00:00.000Z");

const DRAWIO_SENTINEL = "SECRET-DRAWIO-XML-BODY";
const VALID_DRAWIO =
  `<mxfile host="app"><diagram id="d1" name="Page-1">${DRAWIO_SENTINEL}` +
  `<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>`;

function validDocumentPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_document",
    sourceMode: "manual_drawio_upload",
    createdAt: CREATED_AT,
    createdBy: "u-se-9",
    title: "Final HLD Topology",
    uploadedFileName: "acme-hld.drawio",
    drawioXml: VALID_DRAWIO,
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID, DOCMODEL_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldDiagramArtifactId: DIAGRAM_ID,
    sourceHldDocumentModelArtifactId: DOCMODEL_ID,
    sourceBundleVersion: 1,
    sourceModelVersion: 2,
    sourceDiagramVersion: 5,
    sourceDocumentModelVersion: 3,
    finalAuthority: {
      authorityKind: "se_manual_drawio_upload",
      effectiveWhenArtifactStatus: "approved",
    },
    supersedesArtifactIds: [DIAGRAM_ID, DOCMODEL_ID],
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Acme RFP",
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

function documentArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: DOC_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_document",
    status: "needs_review",
    version: 1,
    payload: validDocumentPayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID, DOCMODEL_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function bundleArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: BUNDLE_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "approved",
    version: 1,
    payload: { kind: "bundle" },
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function modelArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: MODEL_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model",
    status: "approved",
    version: 2,
    payload: { sourceHldSourceBundleArtifactId: BUNDLE_ID, sourceArtifactIds: [BUNDLE_ID] },
    sourceFileIds: [],
    sourceArtifactIds: [BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function diagramArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: DIAGRAM_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_diagram",
    status: "approved",
    version: 5,
    payload: {
      sourceHldDesignModelArtifactId: MODEL_ID,
      sourceHldSourceBundleArtifactId: BUNDLE_ID,
      sourceReviewArtifactId: REVIEW_ID,
      sourceModelVersion: 2,
    },
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function reviewArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: REVIEW_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_review",
    status: "generated",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function docModelArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: DOCMODEL_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_document_model",
    status: "approved",
    version: 3,
    payload: {
      sourceHldSourceBundleArtifactId: BUNDLE_ID,
      sourceHldDesignModelArtifactId: MODEL_ID,
      sourceHldDiagramArtifactId: DIAGRAM_ID,
      sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
      sourceModelVersion: 2,
      sourceDiagramVersion: 5,
    },
    sourceFileIds: [],
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function setArtifactRows(
  doc: ProjectArtifact | null,
  bundle: ProjectArtifact | null,
  model: ProjectArtifact | null,
  diagram: ProjectArtifact | null,
  docModel: ProjectArtifact | null,
  review: ProjectArtifact | null = reviewArtifact()
): void {
  mockGetArtifactById.mockImplementation(async (_t: string, _p: string, id: string) => {
    if (id === DOC_ID) return doc;
    if (id === BUNDLE_ID) return bundle;
    if (id === MODEL_ID) return model;
    if (id === DIAGRAM_ID) return diagram;
    if (id === DOCMODEL_ID) return docModel;
    if (id === REVIEW_ID) return review;
    return null;
  });
}

function makeCreated(decision: ProjectApproval["decision"] = "approved") {
  return {
    approval: {
      id: "appr-doc-1",
      projectId: PROJECT,
      stageId: "hld_design_delta_review" as const,
      artifactId: DOC_ID,
      artifactVersion: 1,
      decision,
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
    } as ProjectApproval,
    artifactStatus: (decision === "approved" ? "approved" : "rejected") as ProjectArtifactStatus,
    stageStatus: (decision === "approved" ? "approved" : "rejected") as ProjectStageStatus,
  };
}

function review(
  overrides: Partial<ReviewRfpHldDocumentArtifactInput> = {}
): Promise<ReviewRfpHldDocumentArtifactResult> {
  return reviewRfpHldDocumentArtifact({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: DOC_ID,
    decision: "approved",
    decidedBy: DECIDER,
    ...overrides,
  });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset();
  setArtifactRows(documentArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact(), docModelArtifact());
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
  mockValidateDocModel.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateSourceBundle.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateModel.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateDiagram.mockReset().mockReturnValue({ valid: true, errors: [] });
});

describe("reviewRfpHldDocumentArtifact - input + type gates", () => {
  it("throws on blank artifactId then decidedBy before any store call", async () => {
    await expect(review({ artifactId: "  " })).rejects.toThrow("artifactId is required.");
    await expect(review({ decidedBy: " " })).rejects.toThrow("decidedBy is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("returns not_found and wrong_mode without loading artifacts", async () => {
    mockGetProjectById.mockResolvedValueOnce(null);
    expect(await review()).toEqual({ status: "not_found" });

    mockGetProjectById.mockResolvedValueOnce(makeProject({ mode: "quick_bom" }));
    expect((await review()).status).toBe("wrong_mode");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_hld_document for the wrong type or stage", async () => {
    setArtifactRows(documentArtifact({ type: "hld_document_model" }), bundleArtifact(), modelArtifact(), diagramArtifact(), docModelArtifact());
    expect((await review()).status).toBe("artifact_not_hld_document");

    setArtifactRows(documentArtifact({ stageId: "compliance_matrix_review" }), bundleArtifact(), modelArtifact(), diagramArtifact(), docModelArtifact());
    expect((await review()).status).toBe("artifact_not_hld_document");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_reviewable for non-reviewable statuses", async () => {
    for (const status of ["approved", "rejected", "stale", "failed"] as ProjectArtifactStatus[]) {
      setArtifactRows(documentArtifact({ status }), bundleArtifact(), modelArtifact(), diagramArtifact(), docModelArtifact());
      expect((await review()).status, status).toBe("artifact_not_reviewable");
    }
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });
});

describe("reviewRfpHldDocumentArtifact - approval source-chain gate", () => {
  it("approves a valid reviewable upload and records exactly one approval", async () => {
    const result = await review({ decidedAt: DECIDED_AT, note: "approved" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, DOCMODEL_ID);
  });

  it("blocks an invalid persisted payload before loading sources", async () => {
    setArtifactRows(documentArtifact({ payload: { junk: true } }), bundleArtifact(), modelArtifact(), diagramArtifact(), docModelArtifact());
    const result = await review();
    expect(result.status).toBe("invalid_hld_document_payload");
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks a row/payload source-id mismatch as source_artifact_ids_mismatch", async () => {
    setArtifactRows(
      documentArtifact({ sourceArtifactIds: [MODEL_ID, BUNDLE_ID, DIAGRAM_ID, DOCMODEL_ID] }),
      bundleArtifact(), modelArtifact(), diagramArtifact(), docModelArtifact()
    );
    const result = await review();
    expect(result.status).toBe("stale_hld_document_source_chain");
    if (result.status !== "stale_hld_document_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_artifact_ids_mismatch");
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
  });

  it("blocks unavailable upstream artifacts with their stable codes", async () => {
    const cases: Array<[ProjectArtifact[], string]> = [
      [[documentArtifact(), null as unknown as ProjectArtifact, modelArtifact(), diagramArtifact(), docModelArtifact()], "source_bundle_unavailable"],
      [[documentArtifact(), bundleArtifact(), null as unknown as ProjectArtifact, diagramArtifact(), docModelArtifact()], "source_model_unavailable"],
      [[documentArtifact(), bundleArtifact(), modelArtifact(), null as unknown as ProjectArtifact, docModelArtifact()], "source_diagram_unavailable"],
      [[documentArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact(), null as unknown as ProjectArtifact], "source_document_model_unavailable"],
    ];
    for (const [rows, code] of cases) {
      setArtifactRows(rows[0], rows[1], rows[2], rows[3], rows[4]);
      const result = await review();
      expect(result.status, code).toBe("stale_hld_document_source_chain");
      if (result.status !== "stale_hld_document_source_chain") throw new Error("unreachable");
      expect(result.staleCode).toBe(code);
    }
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks an invalid approved source bundle payload", async () => {
    mockValidateSourceBundle.mockReturnValue({ valid: false, errors: ["bad bundle"] });
    const result = await review();
    expect(result.status).toBe("stale_hld_document_source_chain");
    if (result.status !== "stale_hld_document_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_bundle_invalid");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks version drift as source_version_mismatch", async () => {
    for (const rows of [
      [documentArtifact(), bundleArtifact({ version: 9 }), modelArtifact(), diagramArtifact(), docModelArtifact()],
      [documentArtifact(), bundleArtifact(), modelArtifact({ version: 9 }), diagramArtifact(), docModelArtifact()],
      [documentArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact({ version: 9 }), docModelArtifact()],
      [documentArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact(), docModelArtifact({ version: 9 })],
    ] as ProjectArtifact[][]) {
      setArtifactRows(rows[0], rows[1], rows[2], rows[3], rows[4]);
      const result = await review();
      expect(result.status).toBe("stale_hld_document_source_chain");
      if (result.status !== "stale_hld_document_source_chain") throw new Error("unreachable");
      expect(result.staleCode).toBe("source_version_mismatch");
    }
  });

  it("blocks a broken document-model tie as source_chain_mismatch", async () => {
    setArtifactRows(
      documentArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact(),
      docModelArtifact({ sourceArtifactIds: [MODEL_ID, BUNDLE_ID, DIAGRAM_ID] })
    );
    const result = await review();
    expect(result.status).toBe("stale_hld_document_source_chain");
    if (result.status !== "stale_hld_document_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_chain_mismatch");

    setArtifactRows(
      documentArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact(),
      docModelArtifact({
        payload: {
          sourceHldSourceBundleArtifactId: BUNDLE_ID,
          sourceHldDesignModelArtifactId: MODEL_ID,
          sourceHldDiagramArtifactId: DIAGRAM_ID,
          sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
          sourceModelVersion: 99,
          sourceDiagramVersion: 5,
        },
      })
    );
    const versionResult = await review();
    expect(versionResult.status).toBe("stale_hld_document_source_chain");
    if (versionResult.status !== "stale_hld_document_source_chain") throw new Error("unreachable");
    expect(versionResult.staleCode).toBe("source_chain_mismatch");
  });

  it("blocks broken diagram row or source review ties", async () => {
    setArtifactRows(
      documentArtifact(),
      bundleArtifact(),
      modelArtifact(),
      diagramArtifact({ sourceArtifactIds: [BUNDLE_ID, MODEL_ID, REVIEW_ID] }),
      docModelArtifact()
    );
    const rowResult = await review();
    expect(rowResult.status).toBe("stale_hld_document_source_chain");
    if (rowResult.status !== "stale_hld_document_source_chain") throw new Error("unreachable");
    expect(rowResult.staleCode).toBe("source_chain_mismatch");

    setArtifactRows(
      documentArtifact(),
      bundleArtifact(),
      modelArtifact(),
      diagramArtifact(),
      docModelArtifact(),
      null
    );
    const missingReview = await review();
    expect(missingReview.status).toBe("stale_hld_document_source_chain");
    if (missingReview.status !== "stale_hld_document_source_chain") throw new Error("unreachable");
    expect(missingReview.staleCode).toBe("source_review_unavailable");

    setArtifactRows(
      documentArtifact(),
      bundleArtifact(),
      modelArtifact(),
      diagramArtifact(),
      docModelArtifact(),
      reviewArtifact({ sourceArtifactIds: [BUNDLE_ID, MODEL_ID] })
    );
    const reviewTie = await review();
    expect(reviewTie.status).toBe("stale_hld_document_source_chain");
    if (reviewTie.status !== "stale_hld_document_source_chain") throw new Error("unreachable");
    expect(reviewTie.staleCode).toBe("source_chain_mismatch");
  });
});

describe("reviewRfpHldDocumentArtifact - rejection retires bad uploads", () => {
  it("rejects a valid reviewable upload with the canonical decision", async () => {
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));
    const result = await review({ decision: "rejected" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: DOC_ID, decision: "rejected" })
    );
  });

  it("rejects a malformed upload without any source-chain store or validator check", async () => {
    setArtifactRows(documentArtifact({ payload: { junk: true } }), bundleArtifact(), modelArtifact(), diagramArtifact(), docModelArtifact());
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));
    const result = await review({ decision: "rejected" });
    expect(result.status).toBe("ok");
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
    expect(mockValidateDocModel).not.toHaveBeenCalled();
  });
});

describe("reviewRfpHldDocumentArtifact - result hygiene + store outcomes", () => {
  it("ok result leaks no drawio XML, upstream payload, or tenant id", async () => {
    const result = await review();
    expect(result.status).toBe("ok");
    const json = JSON.stringify(result);
    expect(json).not.toContain(DRAWIO_SENTINEL);
    expect(json).not.toContain(TENANT);
    if (result.status !== "ok") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
  });

  it("maps a null createProjectApproval to approval_failed and bubbles other errors", async () => {
    mockCreateApproval.mockResolvedValue(null);
    expect(await review()).toEqual({ status: "approval_failed" });

    mockCreateApproval.mockRejectedValue(new Error("db boom"));
    await expect(review()).rejects.toThrow("db boom");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-document-approval.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-document-approval.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the stores, approval helper, the HLD contracts, and types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-approval-store",
      "@/lib/projects/approvals",
      "@/lib/projects/project-rfp-hld-document-source-chain",
      "@/types/project",
    ]);
  });

  it("uses createProjectApproval as its only create/update/delete mutation", () => {
    const mutationTokens = source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(Array.from(new Set(mutationTokens))).toEqual(["createProjectApproval"]);
  });

  it("imports no AI/provider/catalog/pricing/config/raw-file/route module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "@/lib/catalog',
      'from "@/lib/adapters',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "next/server"',
      "@anthropic-ai",
      "openai",
      "pdf-parse",
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
