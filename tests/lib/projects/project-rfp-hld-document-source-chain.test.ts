import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ProjectArtifact } from "@/types/project";

// Mock ONLY the store boundary plus the UPSTREAM payload validators (document model,
// source bundle, design model, diagram, diagram output). The Stage 6H-0I-A rfp_hld_document
// contract validator stays REAL, so the persisted payload + five/four-source re-tie is a
// genuine integration check of the shared evaluator.
const {
  mockGetArtifactById,
  mockValidateDocModel,
  mockValidateSourceBundle,
  mockValidateModel,
  mockValidateDiagram,
  mockValidateDiagramOutput,
} = vi.hoisted(() => ({
  mockGetArtifactById: vi.fn(),
  mockValidateDocModel: vi.fn(),
  mockValidateSourceBundle: vi.fn(),
  mockValidateModel: vi.fn(),
  mockValidateDiagram: vi.fn(),
  mockValidateDiagramOutput: vi.fn(),
}));

vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
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
vi.mock("@/lib/projects/project-rfp-hld-diagram-output", () => ({
  validateRfpHldDiagramOutputPayload: mockValidateDiagramOutput,
}));

import { evaluateRfpHldDocumentSourceChain } from "@/lib/projects/project-rfp-hld-document-source-chain";

const TENANT = "77777777-7777-7777-7777-777777777777";
const PROJECT = "proj-1";
const DOC_ID = "hdoc-1";
const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const DIAGRAM_ID = "hdg-1";
const DIAGRAM_OUTPUT_ID = "hdgo-1";
const DOCMODEL_ID = "hdocm-1";
const REVIEW_ID = "hrev-1";
const CREATED_AT = "2026-06-30T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);

const VALID_DRAWIO =
  `<mxfile host="app"><diagram id="d1" name="Page-1"><mxGraphModel><root>` +
  `<mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;

function manualPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

function generatedPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...manualPayload(),
    sourceMode: "generated_drawio_output",
    uploadedFileName: "hld-generated.drawio",
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID, DIAGRAM_OUTPUT_ID, DOCMODEL_ID],
    sourceHldDiagramOutputArtifactId: DIAGRAM_OUTPUT_ID,
    sourceDiagramOutputVersion: 2,
    finalAuthority: {
      authorityKind: "se_approved_generated_hld",
      effectiveWhenArtifactStatus: "approved",
    },
    ...overrides,
  };
}

function documentArtifact(payload: Record<string, unknown>, overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: DOC_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_document",
    status: "approved",
    version: 1,
    payload: payload as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: (payload.sourceArtifactIds as string[]).slice(),
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

function diagramOutputArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: DIAGRAM_OUTPUT_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_diagram_output",
    status: "approved",
    version: 2,
    payload: {
      sourceArtifactIds: [DIAGRAM_ID],
      sourceHldDiagramArtifactId: DIAGRAM_ID,
      sourceDiagramVersion: 5,
    },
    sourceFileIds: [],
    sourceArtifactIds: [DIAGRAM_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

let outputRow: ProjectArtifact | null = diagramOutputArtifact();

function setRows(output: ProjectArtifact | null = diagramOutputArtifact()): void {
  outputRow = output;
  mockGetArtifactById.mockImplementation(async (_t: string, _p: string, id: string) => {
    if (id === BUNDLE_ID) return bundleArtifact();
    if (id === MODEL_ID) return modelArtifact();
    if (id === DIAGRAM_ID) return diagramArtifact();
    if (id === DIAGRAM_OUTPUT_ID) return outputRow;
    if (id === REVIEW_ID) return reviewArtifact();
    if (id === DOCMODEL_ID) return docModelArtifact();
    return null;
  });
}

beforeEach(() => {
  mockGetArtifactById.mockReset();
  setRows();
  mockValidateDocModel.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateSourceBundle.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateModel.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateDiagram.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateDiagramOutput.mockReset().mockReturnValue({ ok: true });
});

describe("evaluateRfpHldDocumentSourceChain - manual four-source chain", () => {
  it("re-validates a manual upload without ever loading a diagram output", async () => {
    const outcome = await evaluateRfpHldDocumentSourceChain(
      TENANT, PROJECT, documentArtifact(manualPayload())
    );
    expect(outcome.kind).toBe("valid");
    expect(mockGetArtifactById).not.toHaveBeenCalledWith(TENANT, PROJECT, DIAGRAM_OUTPUT_ID);
    expect(mockValidateDiagramOutput).not.toHaveBeenCalled();
  });
});

describe("evaluateRfpHldDocumentSourceChain - generated five-source chain", () => {
  it("re-validates a generated document that re-ties to its approved diagram output", async () => {
    const outcome = await evaluateRfpHldDocumentSourceChain(
      TENANT, PROJECT, documentArtifact(generatedPayload())
    );
    expect(outcome.kind).toBe("valid");
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, DIAGRAM_OUTPUT_ID);
  });

  it("goes stale (source_diagram_output_unavailable) when the output is missing", async () => {
    setRows(null);
    const outcome = await evaluateRfpHldDocumentSourceChain(
      TENANT, PROJECT, documentArtifact(generatedPayload())
    );
    expect(outcome).toEqual({ kind: "stale", staleCode: "source_diagram_output_unavailable" });
  });

  it("goes stale (source_diagram_output_unavailable) for a non-approved or wrong-stage output", async () => {
    for (const bad of [
      diagramOutputArtifact({ status: "needs_review" }),
      diagramOutputArtifact({ stageId: "compliance_matrix_review" }),
      diagramOutputArtifact({ type: "hld_diagram" }),
      diagramOutputArtifact({ projectId: "other-project" }),
    ]) {
      setRows(bad);
      const outcome = await evaluateRfpHldDocumentSourceChain(
        TENANT, PROJECT, documentArtifact(generatedPayload())
      );
      expect(outcome).toEqual({ kind: "stale", staleCode: "source_diagram_output_unavailable" });
    }
  });

  it("goes stale (source_version_mismatch) when the output version drifts from the proof", async () => {
    setRows(diagramOutputArtifact({ version: 9 }));
    const outcome = await evaluateRfpHldDocumentSourceChain(
      TENANT, PROJECT, documentArtifact(generatedPayload())
    );
    expect(outcome).toEqual({ kind: "stale", staleCode: "source_version_mismatch" });
  });

  it("goes stale (source_diagram_output_invalid) for an invalid output payload", async () => {
    mockValidateDiagramOutput.mockReturnValue({ ok: false, errors: ["bad"] });
    const outcome = await evaluateRfpHldDocumentSourceChain(
      TENANT, PROJECT, documentArtifact(generatedPayload())
    );
    expect(outcome).toEqual({ kind: "stale", staleCode: "source_diagram_output_invalid" });
  });

  it("goes stale (source_chain_mismatch) for a wrong-source output row/payload tie", async () => {
    // Row source ids do not resolve to the approved diagram.
    setRows(diagramOutputArtifact({ sourceArtifactIds: [MODEL_ID] }));
    expect(
      await evaluateRfpHldDocumentSourceChain(TENANT, PROJECT, documentArtifact(generatedPayload()))
    ).toEqual({ kind: "stale", staleCode: "source_chain_mismatch" });

    // Payload tie points at a different diagram.
    setRows(
      diagramOutputArtifact({
        payload: {
          sourceArtifactIds: [DIAGRAM_ID],
          sourceHldDiagramArtifactId: "other-diagram",
          sourceDiagramVersion: 5,
        },
      })
    );
    expect(
      await evaluateRfpHldDocumentSourceChain(TENANT, PROJECT, documentArtifact(generatedPayload()))
    ).toEqual({ kind: "stale", staleCode: "source_chain_mismatch" });

    // Payload diagram version disagrees with the approved diagram version.
    setRows(
      diagramOutputArtifact({
        payload: {
          sourceArtifactIds: [DIAGRAM_ID],
          sourceHldDiagramArtifactId: DIAGRAM_ID,
          sourceDiagramVersion: 99,
        },
      })
    );
    expect(
      await evaluateRfpHldDocumentSourceChain(TENANT, PROJECT, documentArtifact(generatedPayload()))
    ).toEqual({ kind: "stale", staleCode: "source_chain_mismatch" });
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-document-source-chain.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-document-source-chain.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
