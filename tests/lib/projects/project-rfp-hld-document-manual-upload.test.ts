import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock the store boundaries plus the three UPSTREAM payload validators (document model,
// source bundle, design model, diagram). The Stage 6H-0I-A rfp_hld_document contract
// validator stays REAL, so the built manual-upload payload is genuinely gated before
// any write.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockCreateArtifact,
  mockValidateDocModel,
  mockValidateSourceBundle,
  mockValidateModel,
  mockValidateDiagram,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockCreateArtifact: vi.fn(),
  mockValidateDocModel: vi.fn(),
  mockValidateSourceBundle: vi.fn(),
  mockValidateModel: vi.fn(),
  mockValidateDiagram: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProjectById }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  createProjectArtifactVersion: mockCreateArtifact,
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
  createRfpHldDocumentManualUpload,
  type CreateRfpHldDocumentManualUploadInput,
  type CreateRfpHldDocumentManualUploadResult,
} from "@/lib/projects/project-rfp-hld-document-manual-upload";

const TENANT = "77777777-7777-7777-7777-777777777777";
const PROJECT = "proj-1";
const DOCMODEL_ID = "hdocm-1";
const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const DIAGRAM_ID = "hdg-1";
const REVIEW_ID = "hrev-1";
const CREATED_AT = "2026-06-30T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);
const CREATED_BY = "u-se-9";

const TENANT_SENTINEL = TENANT;
const DRAWIO_SENTINEL = "SECRET-DRAWIO-XML-BODY";
const VALID_DRAWIO =
  `<mxfile host="app"><diagram id="d1" name="Page-1">${DRAWIO_SENTINEL}` +
  `<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>`;

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
    payload: {
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

function setArtifactRows(
  docModel: ProjectArtifact | null,
  bundle: ProjectArtifact | null,
  model: ProjectArtifact | null,
  diagram: ProjectArtifact | null,
  review: ProjectArtifact | null = reviewArtifact()
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

function upload(
  overrides: Partial<CreateRfpHldDocumentManualUploadInput> = {}
): Promise<CreateRfpHldDocumentManualUploadResult> {
  return createRfpHldDocumentManualUpload({
    tenantId: TENANT,
    projectId: PROJECT,
    createdBy: CREATED_BY,
    documentModelArtifactId: DOCMODEL_ID,
    title: "Final HLD Topology",
    uploadedFileName: "acme-hld.drawio",
    drawioXml: VALID_DRAWIO,
    createdAt: CREATED_DATE,
    ...overrides,
  });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset();
  setArtifactRows(docModelArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact());
  mockCreateArtifact.mockReset().mockImplementation(async (input: Record<string, unknown>) => ({
    id: "art-doc-1",
    projectId: input.projectId,
    stageId: input.stageId,
    type: input.type,
    status: input.status,
    version: 1,
    payload: input.payload,
    sourceFileIds: input.sourceFileIds,
    sourceArtifactIds: input.sourceArtifactIds,
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
  }));
  mockValidateDocModel.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateSourceBundle.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateModel.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateDiagram.mockReset().mockReturnValue({ valid: true, errors: [] });
});

describe("createRfpHldDocumentManualUpload - input guards", () => {
  it("throws on blank projectId/createdBy/documentModelArtifactId before any store call", async () => {
    await expect(upload({ projectId: "  " })).rejects.toThrow("projectId");
    await expect(upload({ createdBy: " " })).rejects.toThrow("createdBy");
    await expect(upload({ documentModelArtifactId: "" })).rejects.toThrow("documentModelArtifactId");
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("createRfpHldDocumentManualUpload - happy path", () => {
  it("creates exactly one needs_review hld_document with no source files and ordered source ids", async () => {
    const result = await upload();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");

    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const arg = mockCreateArtifact.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.type).toBe("hld_document");
    expect(arg.status).toBe("needs_review");
    expect(arg.stageId).toBe("hld_design_delta_review");
    expect(arg.sourceFileIds).toEqual([]);
    expect(arg.sourceArtifactIds).toEqual([BUNDLE_ID, MODEL_ID, DIAGRAM_ID, DOCMODEL_ID]);

    // The persisted payload records the manual upload and the four versions.
    const payload = arg.payload as Record<string, unknown>;
    expect(payload.payloadKind).toBe("rfp_hld_document");
    expect(payload.sourceMode).toBe("manual_drawio_upload");
    expect(payload.sourceBundleVersion).toBe(1);
    expect(payload.sourceModelVersion).toBe(2);
    expect(payload.sourceDiagramVersion).toBe(5);
    expect(payload.sourceDocumentModelVersion).toBe(3);
    expect(payload.supersedesArtifactIds).toEqual([DIAGRAM_ID, DOCMODEL_ID]);

    expect(result.artifact.status).toBe("needs_review");
    expect(result.artifact.sourceArtifactIds).toEqual([BUNDLE_ID, MODEL_ID, DIAGRAM_ID, DOCMODEL_ID]);
  });

  it("returns a lean summary that never leaks drawio XML or the tenant id", async () => {
    const result = await upload({ note: "  SE note  " });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const json = JSON.stringify(result);
    expect(json).not.toContain(DRAWIO_SENTINEL);
    expect(json).not.toContain(TENANT_SENTINEL);
    expect("drawioXml" in result.payloadSummary).toBe(false);
    expect(result.payloadSummary.drawioXmlLength).toBe(VALID_DRAWIO.length);
  });
});

describe("createRfpHldDocumentManualUpload - source-chain gates (no write)", () => {
  it("returns not_found / wrong_mode without touching artifacts", async () => {
    mockGetProjectById.mockResolvedValueOnce(null);
    expect(await upload()).toEqual({ status: "not_found" });

    mockGetProjectById.mockResolvedValueOnce(makeProject({ mode: "quick_bom" }));
    const wrong = await upload();
    expect(wrong.status).toBe("wrong_mode");
    if (wrong.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in wrong.project).toBe(false);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks document_model_unavailable for missing/wrong-type/stage/status/foreign doc model", async () => {
    const variants: Array<ProjectArtifact | null> = [
      null,
      docModelArtifact({ type: "hld_diagram" }),
      docModelArtifact({ stageId: "compliance_matrix_review" }),
      docModelArtifact({ status: "needs_review" }),
      docModelArtifact({ projectId: "other" }),
    ];
    for (const docModel of variants) {
      setArtifactRows(docModel, bundleArtifact(), modelArtifact(), diagramArtifact());
      const result = await upload();
      expect(result).toEqual({ status: "precondition_failed", code: "document_model_unavailable" });
    }
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks document_model_invalid when the doc-model payload fails its contract", async () => {
    mockValidateDocModel.mockReturnValue({ valid: false, errors: ["bad"] });
    expect(await upload()).toEqual({
      status: "precondition_failed",
      code: "document_model_invalid",
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks document_model_source_ids_mismatch for a broken row/payload tie", async () => {
    setArtifactRows(
      docModelArtifact({ sourceArtifactIds: [MODEL_ID, BUNDLE_ID, DIAGRAM_ID] }),
      bundleArtifact(),
      modelArtifact(),
      diagramArtifact()
    );
    expect((await upload()).status).toBe("precondition_failed");
    expect((await upload() as { code?: string }).code).toBe("document_model_source_ids_mismatch");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks source_bundle_unavailable for a missing/unapproved bundle", async () => {
    setArtifactRows(docModelArtifact(), bundleArtifact({ status: "needs_review" }), modelArtifact(), diagramArtifact());
    expect(await upload()).toEqual({ status: "precondition_failed", code: "source_bundle_unavailable" });
  });

  it("blocks source_bundle_invalid when the approved source bundle payload fails its contract", async () => {
    mockValidateSourceBundle.mockReturnValue({ valid: false, errors: ["bad bundle"] });
    expect(await upload()).toEqual({ status: "precondition_failed", code: "source_bundle_invalid" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks design_model_unavailable and design_model_invalid", async () => {
    setArtifactRows(docModelArtifact(), bundleArtifact(), null, diagramArtifact());
    expect(await upload()).toEqual({ status: "precondition_failed", code: "design_model_unavailable" });

    setArtifactRows(docModelArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact());
    mockValidateModel.mockReturnValue({ valid: false, errors: ["bad model"] });
    expect(await upload()).toEqual({ status: "precondition_failed", code: "design_model_invalid" });
  });

  it("blocks source_chain_mismatch for a broken model version or tie", async () => {
    setArtifactRows(docModelArtifact(), bundleArtifact(), modelArtifact({ version: 9 }), diagramArtifact());
    expect((await upload() as { code?: string }).code).toBe("source_chain_mismatch");

    setArtifactRows(
      docModelArtifact(),
      bundleArtifact(),
      modelArtifact({ sourceArtifactIds: ["wrong"] }),
      diagramArtifact()
    );
    expect((await upload() as { code?: string }).code).toBe("source_chain_mismatch");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks diagram_unavailable, diagram_invalid, and a broken diagram tie/version", async () => {
    setArtifactRows(docModelArtifact(), bundleArtifact(), modelArtifact(), null);
    expect(await upload()).toEqual({ status: "precondition_failed", code: "diagram_unavailable" });

    setArtifactRows(docModelArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact());
    mockValidateDiagram.mockReturnValue({ valid: false, errors: ["bad diagram"] });
    expect(await upload()).toEqual({ status: "precondition_failed", code: "diagram_invalid" });
    mockValidateDiagram.mockReturnValue({ valid: true, errors: [] });

    setArtifactRows(docModelArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact({ version: 8 }));
    expect((await upload() as { code?: string }).code).toBe("source_chain_mismatch");

    setArtifactRows(
      docModelArtifact(),
      bundleArtifact(),
      modelArtifact(),
      diagramArtifact({ sourceArtifactIds: [BUNDLE_ID, MODEL_ID, REVIEW_ID] })
    );
    expect((await upload() as { code?: string }).code).toBe("source_chain_mismatch");

    setArtifactRows(
      docModelArtifact(),
      bundleArtifact(),
      modelArtifact(),
      diagramArtifact({
        payload: {
          sourceHldDesignModelArtifactId: "other",
          sourceHldSourceBundleArtifactId: BUNDLE_ID,
          sourceReviewArtifactId: REVIEW_ID,
          sourceModelVersion: 2,
        },
      })
    );
    expect((await upload() as { code?: string }).code).toBe("source_chain_mismatch");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks missing, inactive, or mismatched source review artifacts", async () => {
    setArtifactRows(docModelArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact(), null);
    expect(await upload()).toEqual({ status: "precondition_failed", code: "source_review_unavailable" });

    setArtifactRows(
      docModelArtifact(),
      bundleArtifact(),
      modelArtifact(),
      diagramArtifact(),
      reviewArtifact({ status: "stale" })
    );
    expect(await upload()).toEqual({ status: "precondition_failed", code: "source_review_unavailable" });

    setArtifactRows(
      docModelArtifact(),
      bundleArtifact(),
      modelArtifact(),
      diagramArtifact(),
      reviewArtifact({ sourceArtifactIds: [BUNDLE_ID, MODEL_ID] })
    );
    expect(await upload()).toEqual({ status: "precondition_failed", code: "source_chain_mismatch" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks invalid_payload for a malformed uploaded XML and writes nothing", async () => {
    for (const drawioXml of [
      "<svg><rect/></svg>",
      "<mxfile><diagram></mxfile>",
      "<mxfile><script>x</script></mxfile>",
    ]) {
      const result = await upload({ drawioXml });
      expect(result.status).toBe("invalid_payload");
    }
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-document-manual-upload.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-document-manual-upload.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports no AI/provider/catalog/pricing/config/raw-file/route module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
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
    ]) {
      expect(source, `forbidden: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("performs its only store write through createProjectArtifactVersion", () => {
    expect(source).toContain("createProjectArtifactVersion(");
    for (const banned of ["createProjectApproval(", "updateProjectArtifact(", "deleteProjectArtifact("]) {
      expect(source, banned).not.toContain(banned);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
