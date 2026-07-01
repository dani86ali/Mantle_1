import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock ONLY the final-authority selector so the download service's status mapping,
// byte encoding, and canonical filename derivation are tested independent of the DB,
// stores, and the source-chain evaluator.
const { mockSelectAuthority } = vi.hoisted(() => ({
  mockSelectAuthority: vi.fn(),
}));

vi.mock("@/lib/projects/project-rfp-hld-document-final-authority", () => ({
  selectRfpHldFinalAuthority: mockSelectAuthority,
}));

import {
  loadProjectRfpHldDocumentDownload,
  RFP_HLD_DOCUMENT_MIME,
} from "@/lib/projects/project-rfp-hld-document-download";

const TENANT = "22222222-2222-2222-2222-222222222222";
const PROJECT = "proj-rfp-hld-1";

const DRAWIO_XML = "<mxfile><diagram>secret-topology</diagram></mxfile>";

const PROJECT_SUMMARY = {
  id: PROJECT,
  name: "Acme RFP",
  customerName: "Acme Corp / Gulf",
  mode: "rfp" as const,
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
};

const ARTIFACT_SUMMARY = {
  id: "art-doc-1",
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_document",
  status: "approved",
  version: 4,
  sourceFileIds: [],
  sourceArtifactIds: ["hsb-1", "hdm-1", "hdg-1", "hdocm-1"],
  createdAt: "2026-06-30T12:00:00.000Z",
  updatedAt: "2026-06-30T12:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_document",
  sourceMode: "manual_drawio_upload",
  title: "Final HLD Topology",
  uploadedFileName: "attacker-name.drawio",
  drawioXmlLength: DRAWIO_XML.length,
  authorityKind: "se_manual_drawio_upload",
  effectiveWhenArtifactStatus: "approved",
  supersedesArtifactIds: ["hdg-1", "hdocm-1"],
  sourceHldSourceBundleArtifactId: "hsb-1",
  sourceHldDesignModelArtifactId: "hdm-1",
  sourceHldDiagramArtifactId: "hdg-1",
  sourceHldDocumentModelArtifactId: "hdocm-1",
  sourceBundleVersion: 1,
  sourceModelVersion: 2,
  sourceDiagramVersion: 5,
  sourceDocumentModelVersion: 3,
};

const AUTHORITY = {
  artifact: ARTIFACT_SUMMARY,
  payloadSummary: PAYLOAD_SUMMARY,
  finalAuthorityStatus: "approved_manual_drawio_upload",
};

const OK_RESULT = {
  status: "ok",
  project: PROJECT_SUMMARY,
  authority: AUTHORITY,
  payload: { drawioXml: DRAWIO_XML, payloadKind: "rfp_hld_document" },
};

beforeEach(() => {
  mockSelectAuthority.mockReset().mockResolvedValue(OK_RESULT);
});

describe("loadProjectRfpHldDocumentDownload - selector delegation", () => {
  it("calls the selector with tenant + project id only", async () => {
    await loadProjectRfpHldDocumentDownload({ tenantId: TENANT, projectId: PROJECT });
    expect(mockSelectAuthority).toHaveBeenCalledTimes(1);
    const arg = mockSelectAuthority.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
  });
});

describe("loadProjectRfpHldDocumentDownload - ok", () => {
  it("returns the exact validated draw.io XML bytes with a stable mime + content length", async () => {
    const res = await loadProjectRfpHldDocumentDownload({ tenantId: TENANT, projectId: PROJECT });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.mimeType).toBe(RFP_HLD_DOCUMENT_MIME);
    expect(res.bytes).toEqual(new TextEncoder().encode(DRAWIO_XML));
    expect(Buffer.from(res.bytes).toString("utf8")).toBe(DRAWIO_XML);
    expect(res.contentLength).toBe(res.bytes.byteLength);
  });

  it("derives a canonical, header-safe filename and never trusts the raw uploaded filename", async () => {
    const res = await loadProjectRfpHldDocumentDownload({ tenantId: TENANT, projectId: PROJECT });
    if (res.status !== "ok") throw new Error("expected ok");
    // BOMATIC-HLD-<sanitized customer>-v<version>.<ext derived from upload>
    expect(res.filename).toBe("BOMATIC-HLD-Acme-Corp-Gulf-v4.drawio");
    expect(res.filename).not.toContain("attacker-name");
    // Header-safe: no path separators, quotes, whitespace, or control chars.
    expect(res.filename).toMatch(/^[A-Za-z0-9.\-]+$/);
  });

  it("derives the .xml extension from a validated .xml upload only", async () => {
    mockSelectAuthority.mockResolvedValueOnce({
      ...OK_RESULT,
      authority: {
        ...AUTHORITY,
        payloadSummary: { ...PAYLOAD_SUMMARY, uploadedFileName: "final.XML" },
      },
    });
    const res = await loadProjectRfpHldDocumentDownload({ tenantId: TENANT, projectId: PROJECT });
    if (res.status !== "ok") throw new Error("expected ok");
    expect(res.filename).toBe("BOMATIC-HLD-Acme-Corp-Gulf-v4.xml");
  });

  it("returns the sanitized authority summary but never the full payload", async () => {
    const res = await loadProjectRfpHldDocumentDownload({ tenantId: TENANT, projectId: PROJECT });
    if (res.status !== "ok") throw new Error("expected ok");
    expect(res.finalAuthority).toEqual(AUTHORITY);
    expect("payload" in res).toBe(false);
    expect("drawioXml" in res.finalAuthority.payloadSummary).toBe(false);
  });
});

describe("loadProjectRfpHldDocumentDownload - blocked statuses never leak the draw.io XML", () => {
  it("maps not_found", async () => {
    mockSelectAuthority.mockResolvedValueOnce({ status: "not_found" });
    const res = await loadProjectRfpHldDocumentDownload({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({ status: "not_found" });
  });

  it("maps wrong_mode with the project summary", async () => {
    mockSelectAuthority.mockResolvedValueOnce({ status: "wrong_mode", project: PROJECT_SUMMARY });
    const res = await loadProjectRfpHldDocumentDownload({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({ status: "wrong_mode", project: PROJECT_SUMMARY });
    expect(JSON.stringify(res)).not.toContain("secret-topology");
  });

  it("maps not_finalized with blockerCode + optional pending latestArtifact", async () => {
    mockSelectAuthority.mockResolvedValueOnce({
      status: "not_finalized",
      project: PROJECT_SUMMARY,
      blockerCode: "no_final_hld_document",
    });
    const none = await loadProjectRfpHldDocumentDownload({ tenantId: TENANT, projectId: PROJECT });
    expect(none).toEqual({
      status: "not_finalized",
      project: PROJECT_SUMMARY,
      blockerCode: "no_final_hld_document",
    });
    if (none.status === "not_finalized") expect("latestArtifact" in none).toBe(false);

    mockSelectAuthority.mockResolvedValueOnce({
      status: "not_finalized",
      project: PROJECT_SUMMARY,
      blockerCode: "manual_upload_pending_review",
      latestArtifact: { ...ARTIFACT_SUMMARY, status: "needs_review" },
    });
    const pending = await loadProjectRfpHldDocumentDownload({ tenantId: TENANT, projectId: PROJECT });
    if (pending.status !== "not_finalized") throw new Error("expected not_finalized");
    expect(pending.blockerCode).toBe("manual_upload_pending_review");
    expect(pending.latestArtifact).toEqual({ ...ARTIFACT_SUMMARY, status: "needs_review" });
    expect("bytes" in pending).toBe(false);
    expect(JSON.stringify(pending)).not.toContain("secret-topology");
  });

  it("maps stale_final_authority with blockerCode + artifact summary", async () => {
    mockSelectAuthority.mockResolvedValueOnce({
      status: "stale_final_authority",
      project: PROJECT_SUMMARY,
      blockerCode: "source_diagram_unavailable",
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await loadProjectRfpHldDocumentDownload({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({
      status: "stale_final_authority",
      project: PROJECT_SUMMARY,
      blockerCode: "source_diagram_unavailable",
      artifact: ARTIFACT_SUMMARY,
    });
    expect(JSON.stringify(res)).not.toContain("secret-topology");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-document-download.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the final-authority selector/types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual(["@/lib/projects/project-rfp-hld-document-final-authority"]);
  });

  it("touches no store, approval, filesystem, provider/AI, catalog, pricing, config, or raw-parser module", () => {
    for (const forbidden of [
      "@/lib/db/",
      "node:fs",
      '"fs"',
      "@/lib/projects/project-rfp-hld-document-approval",
      "@/lib/projects/project-rfp-hld-document-manual-upload",
      "@/lib/catalog",
      "@/lib/adapters",
      "@/lib/ai",
      "@/lib/llm",
      "@anthropic-ai",
      "openai",
      '@/lib/projects/pricing"',
      "@/lib/projects/config-expansion",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it("performs no mutation / creation", () => {
    for (const forbidden of ["createProjectArtifact", "createProjectApproval", "updateProject"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("is ASCII-only", () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
