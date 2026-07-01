import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock the store boundaries, the four UPSTREAM payload validators, and the read-only
// regeneration guard. The Stage 6H-0I-A rfp_hld_document contract validator stays REAL,
// so the deterministically built generated payload (drawio XML included) is genuinely
// gated before any write.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockCreateArtifact,
  mockGuard,
  mockValidateDocModel,
  mockValidateSourceBundle,
  mockValidateModel,
  mockValidateDiagram,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockCreateArtifact: vi.fn(),
  mockGuard: vi.fn(),
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
vi.mock("@/lib/projects/project-rfp-hld-final-authority-regeneration-guard", () => ({
  evaluateRfpHldFinalAuthorityRegenerationGuard: mockGuard,
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
  createRfpHldDocumentGenerated,
  type CreateRfpHldDocumentGeneratedInput,
  type CreateRfpHldDocumentGeneratedResult,
} from "@/lib/projects/project-rfp-hld-document-generated";
import { validateRfpHldDocumentPayload } from "@/lib/projects/project-rfp-hld-document";

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

// The diagram carries topology nodes/links; the generated draw.io XML is built from these.
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
      title: "Topology",
      nodes: [
        { id: "n1", label: "Core Switch" },
        { id: "n2", label: 'Edge & <Router>' },
      ],
      links: [{ id: "l1", label: "uplink", fromNodeId: "n1", toNodeId: "n2" }],
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

function generate(
  overrides: Partial<CreateRfpHldDocumentGeneratedInput> = {}
): Promise<CreateRfpHldDocumentGeneratedResult> {
  return createRfpHldDocumentGenerated({
    tenantId: TENANT,
    projectId: PROJECT,
    createdBy: CREATED_BY,
    documentModelArtifactId: DOCMODEL_ID,
    createdAt: CREATED_DATE,
    ...overrides,
  });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset();
  setArtifactRows(docModelArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact());
  mockGuard.mockReset().mockResolvedValue({ blocked: false });
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

describe("createRfpHldDocumentGenerated - input guards", () => {
  it("throws on blank projectId/createdBy/documentModelArtifactId before any store call", async () => {
    await expect(generate({ projectId: "  " })).rejects.toThrow("projectId");
    await expect(generate({ createdBy: " " })).rejects.toThrow("createdBy");
    await expect(generate({ documentModelArtifactId: "" })).rejects.toThrow(
      "documentModelArtifactId"
    );
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("createRfpHldDocumentGenerated - happy path", () => {
  it("creates one needs_review generated hld_document with no source files", async () => {
    const result = await generate();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");

    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const arg = mockCreateArtifact.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.type).toBe("hld_document");
    expect(arg.status).toBe("needs_review");
    expect(arg.stageId).toBe("hld_design_delta_review");
    expect(arg.sourceFileIds).toEqual([]);
    expect(arg.sourceArtifactIds).toEqual([BUNDLE_ID, MODEL_ID, DIAGRAM_ID, DOCMODEL_ID]);

    const payload = arg.payload as Record<string, unknown>;
    expect(payload.payloadKind).toBe("rfp_hld_document");
    expect(payload.sourceMode).toBe("generated_drawio_output");
    expect((payload.finalAuthority as Record<string, unknown>).authorityKind).toBe(
      "se_approved_generated_hld"
    );
    expect(payload.supersedesArtifactIds).toEqual([DIAGRAM_ID, DOCMODEL_ID]);
    expect(result.payloadSummary.sourceMode).toBe("generated_drawio_output");
  });

  it("builds a valid, deterministic, label-escaped draw.io XML never returned in summaries", async () => {
    const first = await generate();
    const second = await generate();
    if (first.status !== "ok" || second.status !== "ok") throw new Error("unreachable");

    const xml1 = (mockCreateArtifact.mock.calls[0][0] as Record<string, unknown>)
      .payload as Record<string, unknown>;
    const xml2 = (mockCreateArtifact.mock.calls[1][0] as Record<string, unknown>)
      .payload as Record<string, unknown>;
    const drawio = xml1.drawioXml as string;

    // The built payload passes the REAL contract validator (mxfile, safe, well-formed).
    expect(validateRfpHldDocumentPayload(xml1)).toEqual({ valid: true, errors: [] });
    // Deterministic for the same inputs.
    expect(drawio).toBe(xml2.drawioXml as string);
    // Labels are escaped; no raw markup leaks into the XML body.
    expect(drawio).toContain("Edge &amp; &lt;Router&gt;");
    expect(drawio).not.toContain("<Router>");
    // Lean summaries never carry the XML body, only its length.
    expect("drawioXml" in first.payloadSummary).toBe(false);
    expect(JSON.stringify(first)).not.toContain("mxfile");
    expect(first.payloadSummary.drawioXmlLength).toBe((drawio as string).length);
  });
});

describe("createRfpHldDocumentGenerated - regeneration guard", () => {
  it("blocks and writes nothing when an approved final authority already exists", async () => {
    const finalAuthority = { project: {}, artifact: {}, payloadSummary: {}, finalAuthorityStatus: "approved_manual_drawio_upload" };
    mockGuard.mockResolvedValueOnce({ blocked: true, finalAuthority });
    const result = await generate();
    expect(result.status).toBe("final_hld_already_approved");
    if (result.status !== "final_hld_already_approved") throw new Error("unreachable");
    expect(result.finalAuthority).toEqual(finalAuthority);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("createRfpHldDocumentGenerated - project + source-chain gates (no write)", () => {
  it("returns not_found / wrong_mode without touching artifacts", async () => {
    mockGetProjectById.mockResolvedValueOnce(null);
    expect(await generate()).toEqual({ status: "not_found" });

    mockGetProjectById.mockResolvedValueOnce(makeProject({ mode: "quick_bom" }));
    const wrong = await generate();
    expect(wrong.status).toBe("wrong_mode");
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks on missing/stale/invalid upstream artifacts and writes nothing", async () => {
    setArtifactRows(null, bundleArtifact(), modelArtifact(), diagramArtifact());
    expect((await generate()).status).toBe("precondition_failed");

    mockValidateDocModel.mockReturnValueOnce({ valid: false, errors: ["bad"] });
    setArtifactRows(docModelArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact());
    expect(await generate()).toEqual({
      status: "precondition_failed",
      code: "document_model_invalid",
    });

    setArtifactRows(docModelArtifact(), bundleArtifact(), null, diagramArtifact());
    expect(await generate()).toEqual({
      status: "precondition_failed",
      code: "design_model_unavailable",
    });

    setArtifactRows(docModelArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact({ version: 8 }));
    expect((await generate() as { code?: string }).code).toBe("source_chain_mismatch");

    setArtifactRows(docModelArtifact(), bundleArtifact(), modelArtifact(), diagramArtifact(), null);
    expect(await generate()).toEqual({
      status: "precondition_failed",
      code: "source_review_unavailable",
    });

    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-document-generated.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-document-generated.test.ts"
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

  it("asserts no pricing/SKU/catalog/config authority tokens", () => {
    for (const token of ["unitPrice", "totalPrice", "acceptedSku", "catalogDecision", "configurationDecision"]) {
      expect(source, token).not.toContain(token);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
