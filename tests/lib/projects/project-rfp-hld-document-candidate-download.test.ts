import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";
import {
  RFP_HLD_DOCUMENT_AUTHORITY_KIND_GENERATED,
  RFP_HLD_DOCUMENT_AUTHORITY_KIND_MANUAL,
  RFP_HLD_DOCUMENT_PAYLOAD_KIND,
  RFP_HLD_DOCUMENT_SOURCE_MODE_GENERATED,
  RFP_HLD_DOCUMENT_SOURCE_MODE_MANUAL,
  type RfpHldDocumentPayload,
} from "@/lib/projects/project-rfp-hld-document";

const {
  mockGetProjectById,
  mockGetProjectArtifactById,
  mockIsArtifactReviewable,
  mockEvaluateSourceChain,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetProjectArtifactById: vi.fn(),
  mockIsArtifactReviewable: vi.fn(),
  mockEvaluateSourceChain: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetProjectArtifactById,
}));
vi.mock("@/lib/projects/approvals", () => ({
  isArtifactReviewable: mockIsArtifactReviewable,
}));
vi.mock("@/lib/projects/project-rfp-hld-document-source-chain", () => ({
  evaluateRfpHldDocumentSourceChain: mockEvaluateSourceChain,
}));

import {
  loadProjectRfpHldDocumentCandidateDownload,
  RFP_HLD_DOCUMENT_CANDIDATE_MIME,
} from "@/lib/projects/project-rfp-hld-document-candidate-download";

const TENANT = "44444444-4444-4444-4444-444444444444";
const PROJECT_ID = "proj-rfp-hld-1";
const ARTIFACT_ID = "art-generated-hld-doc-1";
const DRAWIO_XML = "<mxfile><diagram>generated-candidate-secret</diagram></mxfile>";

const PROJECT: Project = {
  id: PROJECT_ID,
  tenantId: TENANT,
  name: "Acme RFP",
  customerName: "Acme Corp",
  mode: "rfp",
  files: [],
  evidence: [],
  stages: [],
  artifacts: [],
  approvals: [],
  createdAt: new Date("2026-06-30T00:00:00.000Z"),
  updatedAt: new Date("2026-06-30T01:00:00.000Z"),
};

const GENERATED_PAYLOAD: RfpHldDocumentPayload = {
  payloadKind: RFP_HLD_DOCUMENT_PAYLOAD_KIND,
  sourceMode: RFP_HLD_DOCUMENT_SOURCE_MODE_GENERATED,
  createdAt: "2026-06-30T12:00:00.000Z",
  createdBy: "u-se",
  title: "Generated HLD Candidate",
  uploadedFileName: "generated-candidate.drawio",
  drawioXml: DRAWIO_XML,
  sourceArtifactIds: ["hsb-1", "hdm-1", "hdg-1", "hdo-1", "hdocm-1"],
  sourceHldSourceBundleArtifactId: "hsb-1",
  sourceHldDesignModelArtifactId: "hdm-1",
  sourceHldDiagramArtifactId: "hdg-1",
  sourceHldDiagramOutputArtifactId: "hdo-1",
  sourceHldDocumentModelArtifactId: "hdocm-1",
  sourceBundleVersion: 1,
  sourceModelVersion: 2,
  sourceDiagramVersion: 3,
  sourceDiagramOutputVersion: 4,
  sourceDocumentModelVersion: 5,
  finalAuthority: {
    authorityKind: RFP_HLD_DOCUMENT_AUTHORITY_KIND_GENERATED,
    effectiveWhenArtifactStatus: "approved",
  },
  supersedesArtifactIds: ["hdg-1", "hdo-1", "hdocm-1"],
};

const MANUAL_PAYLOAD: RfpHldDocumentPayload = {
  ...GENERATED_PAYLOAD,
  sourceMode: RFP_HLD_DOCUMENT_SOURCE_MODE_MANUAL,
  uploadedFileName: "manual-upload.drawio",
  sourceArtifactIds: ["hsb-1", "hdm-1", "hdg-1", "hdocm-1"],
  finalAuthority: {
    authorityKind: RFP_HLD_DOCUMENT_AUTHORITY_KIND_MANUAL,
    effectiveWhenArtifactStatus: "approved",
  },
};
delete MANUAL_PAYLOAD.sourceHldDiagramOutputArtifactId;
delete MANUAL_PAYLOAD.sourceDiagramOutputVersion;

function artifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: ARTIFACT_ID,
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type: "hld_document",
    status: "needs_review",
    version: 3,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: ["hsb-1", "hdm-1", "hdg-1", "hdo-1", "hdocm-1"],
    createdAt: new Date("2026-06-30T12:00:00.000Z"),
    updatedAt: new Date("2026-06-30T12:05:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(PROJECT);
  mockGetProjectArtifactById.mockReset().mockResolvedValue(artifact());
  mockIsArtifactReviewable.mockReset().mockReturnValue(true);
  mockEvaluateSourceChain
    .mockReset()
    .mockResolvedValue({ kind: "valid", payload: GENERATED_PAYLOAD });
});

describe("loadProjectRfpHldDocumentCandidateDownload - authority inputs", () => {
  it("loads by session tenant, route project id, and route artifact id only", async () => {
    await loadProjectRfpHldDocumentCandidateDownload({
      tenantId: TENANT,
      projectId: PROJECT_ID,
      artifactId: ARTIFACT_ID,
    });

    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT_ID);
    expect(mockGetProjectArtifactById).toHaveBeenCalledWith(
      TENANT,
      PROJECT_ID,
      ARTIFACT_ID
    );
    expect(mockEvaluateSourceChain).toHaveBeenCalledWith(
      TENANT,
      PROJECT_ID,
      expect.objectContaining({ id: ARTIFACT_ID })
    );
  });
});

describe("loadProjectRfpHldDocumentCandidateDownload - ok", () => {
  it("serves only a reviewable generated candidate with a valid source chain", async () => {
    const res = await loadProjectRfpHldDocumentCandidateDownload({
      tenantId: TENANT,
      projectId: PROJECT_ID,
      artifactId: ARTIFACT_ID,
    });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.mimeType).toBe(RFP_HLD_DOCUMENT_CANDIDATE_MIME);
    expect(res.filename).toBe("BOMATIC-HLD-candidate-v3.drawio");
    expect(res.filename).toMatch(/^[A-Za-z0-9.\-]+$/);
    expect(res.bytes).toEqual(new TextEncoder().encode(DRAWIO_XML));
    expect(Buffer.from(res.bytes).toString("utf8")).toBe(DRAWIO_XML);
    expect(res.contentLength).toBe(res.bytes.byteLength);
    expect(res.artifact).toMatchObject({
      id: ARTIFACT_ID,
      type: "hld_document",
      stageId: "hld_design_delta_review",
      status: "needs_review",
      version: 3,
    });
    expect(res.payloadSummary).toMatchObject({
      payloadKind: "rfp_hld_document",
      sourceMode: "generated_drawio_output",
      title: "Generated HLD Candidate",
      drawioXmlLength: DRAWIO_XML.length,
      sourceHldDiagramOutputArtifactId: "hdo-1",
      sourceDiagramOutputVersion: 4,
    });
    expect("drawioXml" in res.payloadSummary).toBe(false);
    expect("payload" in res).toBe(false);
  });
});

describe("loadProjectRfpHldDocumentCandidateDownload - fail closed", () => {
  it("rejects missing projects and non-RFP projects", async () => {
    mockGetProjectById.mockResolvedValueOnce(null);
    expect(
      await loadProjectRfpHldDocumentCandidateDownload({
        tenantId: TENANT,
        projectId: PROJECT_ID,
        artifactId: ARTIFACT_ID,
      })
    ).toEqual({ status: "not_found" });
    expect(mockGetProjectArtifactById).not.toHaveBeenCalled();

    mockGetProjectById.mockResolvedValueOnce({
      ...PROJECT,
      mode: "quick_bom",
    });
    const wrongMode = await loadProjectRfpHldDocumentCandidateDownload({
      tenantId: TENANT,
      projectId: PROJECT_ID,
      artifactId: ARTIFACT_ID,
    });
    expect(wrongMode.status).toBe("wrong_mode");
    expect(mockGetProjectArtifactById).toHaveBeenCalledTimes(0);
  });

  it("rejects missing or cross-project artifacts as not found", async () => {
    mockGetProjectArtifactById.mockResolvedValueOnce(null);
    const missing = await loadProjectRfpHldDocumentCandidateDownload({
      tenantId: TENANT,
      projectId: PROJECT_ID,
      artifactId: ARTIFACT_ID,
    });
    expect(missing).toEqual({ status: "artifact_not_found" });

    mockGetProjectArtifactById.mockResolvedValueOnce(
      artifact({ projectId: "other-project" })
    );
    const crossProject = await loadProjectRfpHldDocumentCandidateDownload({
      tenantId: TENANT,
      projectId: PROJECT_ID,
      artifactId: ARTIFACT_ID,
    });
    expect(crossProject).toEqual({ status: "artifact_not_found" });
  });

  it("rejects wrong stage, wrong type, generated status, and approved final authority", async () => {
    for (const badArtifact of [
      artifact({ stageId: "proposal_review" }),
      artifact({ type: "hld_document_model" }),
    ]) {
      mockGetProjectArtifactById.mockResolvedValueOnce(badArtifact);
      const res = await loadProjectRfpHldDocumentCandidateDownload({
        tenantId: TENANT,
        projectId: PROJECT_ID,
        artifactId: ARTIFACT_ID,
      });
      expect(res.status).toBe("artifact_not_hld_document");
      expect(mockEvaluateSourceChain).not.toHaveBeenCalled();
    }

    for (const badArtifact of [
      artifact({ status: "generated" }),
      artifact({ status: "approved" }),
    ]) {
      mockGetProjectArtifactById.mockResolvedValueOnce(badArtifact);
      const res = await loadProjectRfpHldDocumentCandidateDownload({
        tenantId: TENANT,
        projectId: PROJECT_ID,
        artifactId: ARTIFACT_ID,
      });
      expect(res.status).toBe("artifact_not_reviewable");
      expect(mockEvaluateSourceChain).not.toHaveBeenCalled();
    }
  });

  it("rejects an artifact the shared reviewability helper does not accept", async () => {
    mockIsArtifactReviewable.mockReturnValueOnce(false);
    const res = await loadProjectRfpHldDocumentCandidateDownload({
      tenantId: TENANT,
      projectId: PROJECT_ID,
      artifactId: ARTIFACT_ID,
    });
    expect(res.status).toBe("artifact_not_reviewable");
    expect(mockEvaluateSourceChain).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads, stale source chains, and manual uploads", async () => {
    mockEvaluateSourceChain.mockResolvedValueOnce({ kind: "invalid_payload" });
    const invalid = await loadProjectRfpHldDocumentCandidateDownload({
      tenantId: TENANT,
      projectId: PROJECT_ID,
      artifactId: ARTIFACT_ID,
    });
    expect(invalid.status).toBe("invalid_payload");

    mockEvaluateSourceChain.mockResolvedValueOnce({
      kind: "stale",
      staleCode: "source_diagram_output_unavailable",
    });
    const stale = await loadProjectRfpHldDocumentCandidateDownload({
      tenantId: TENANT,
      projectId: PROJECT_ID,
      artifactId: ARTIFACT_ID,
    });
    expect(stale.status).toBe("stale_source_chain");
    if (stale.status === "stale_source_chain") {
      expect(stale.staleCode).toBe("source_diagram_output_unavailable");
    }

    mockEvaluateSourceChain.mockResolvedValueOnce({
      kind: "valid",
      payload: MANUAL_PAYLOAD,
    });
    const manual = await loadProjectRfpHldDocumentCandidateDownload({
      tenantId: TENANT,
      projectId: PROJECT_ID,
      artifactId: ARTIFACT_ID,
    });
    expect(manual.status).toBe("not_generated_candidate");
  });

  it("never includes draw.io XML or raw payload in blocked results", async () => {
    mockEvaluateSourceChain.mockResolvedValueOnce({
      kind: "stale",
      staleCode: "source_chain_mismatch",
    });
    const res = await loadProjectRfpHldDocumentCandidateDownload({
      tenantId: TENANT,
      projectId: PROJECT_ID,
      artifactId: ARTIFACT_ID,
    });
    const raw = JSON.stringify(res);
    expect(raw).not.toContain("generated-candidate-secret");
    expect(raw).not.toContain("drawioXml");
    expect(raw).not.toContain("payload");
    expect(raw).not.toContain("mxfile");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-document-candidate-download.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("does not import the final-authority selector or final download service", () => {
    for (const forbidden of [
      "project-rfp-hld-document-final-authority",
      "project-rfp-hld-document-download",
      "selectRfpHldFinalAuthority",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("touches no mutation, provider, raw-doc parser, pricing, SKU, catalog, or config module", () => {
    for (const forbidden of [
      "createProjectArtifact",
      "createProjectApproval",
      "retireProjectArtifactVersion",
      "updateProject",
      "node:fs",
      '"fs"',
      "@/lib/adapters",
      "@/lib/ai",
      "@/lib/llm",
      "@anthropic-ai",
      "openai",
      "@/lib/catalog",
      '@/lib/projects/pricing"',
      "@/lib/projects/config-expansion",
      "pdf",
      "docx",
      "xlsx",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("is ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
