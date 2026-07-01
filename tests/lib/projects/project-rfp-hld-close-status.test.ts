import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock ONLY the final-authority selector so the close-status service's status mapping,
// closedAt derivation, and payload/draw.io non-leakage are tested independent of the
// DB, stores, and the source-chain evaluator.
const { mockSelectAuthority } = vi.hoisted(() => ({
  mockSelectAuthority: vi.fn(),
}));

vi.mock("@/lib/projects/project-rfp-hld-document-final-authority", () => ({
  selectRfpHldFinalAuthority: mockSelectAuthority,
}));

import {
  getRfpHldCloseStatus,
  RFP_HLD_CLOSE_STATUS,
  RFP_HLD_CLOSE_KIND,
} from "@/lib/projects/project-rfp-hld-close-status";

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
  updatedAt: "2026-06-30T18:45:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_document",
  sourceMode: "manual_drawio_upload",
  title: "Final HLD Topology",
  uploadedFileName: "final.drawio",
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

describe("getRfpHldCloseStatus - selector delegation", () => {
  it("calls the selector exactly once with tenant + project id only", async () => {
    await getRfpHldCloseStatus({ tenantId: TENANT, projectId: PROJECT });
    expect(mockSelectAuthority).toHaveBeenCalledTimes(1);
    const arg = mockSelectAuthority.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
  });
});

describe("getRfpHldCloseStatus - closed", () => {
  it("maps ok -> closed with stable close status/kind, closedAt from artifact updatedAt, and the authority summary", async () => {
    const res = await getRfpHldCloseStatus({ tenantId: TENANT, projectId: PROJECT });
    expect(res.status).toBe("closed");
    if (res.status !== "closed") return;
    expect(res.closeStatus).toBe(RFP_HLD_CLOSE_STATUS);
    expect(res.closeStatus).toBe("hld_closed_on_final_authority");
    expect(res.closeKind).toBe(RFP_HLD_CLOSE_KIND);
    expect(res.closedAt).toBe(ARTIFACT_SUMMARY.updatedAt);
    expect(res.project).toEqual(PROJECT_SUMMARY);
    expect(res.finalAuthority).toEqual(AUTHORITY);
  });

  it("never exposes the selector payload or draw.io XML in a closed result", async () => {
    const res = await getRfpHldCloseStatus({ tenantId: TENANT, projectId: PROJECT });
    if (res.status !== "closed") throw new Error("expected closed");
    expect("payload" in res).toBe(false);
    expect("drawioXml" in res.finalAuthority.payloadSummary).toBe(false);
    expect(JSON.stringify(res)).not.toContain("secret-topology");
    // Only the length metric is exposed, never the XML body itself.
    expect(res.finalAuthority.payloadSummary.drawioXmlLength).toBe(DRAWIO_XML.length);
  });
});

describe("getRfpHldCloseStatus - not_found / wrong_mode", () => {
  it("maps not_found", async () => {
    mockSelectAuthority.mockResolvedValueOnce({ status: "not_found" });
    const res = await getRfpHldCloseStatus({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({ status: "not_found" });
  });

  it("maps wrong_mode with the lean project summary", async () => {
    mockSelectAuthority.mockResolvedValueOnce({ status: "wrong_mode", project: PROJECT_SUMMARY });
    const res = await getRfpHldCloseStatus({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({ status: "wrong_mode", project: PROJECT_SUMMARY });
  });
});

describe("getRfpHldCloseStatus - blocked/not_closed", () => {
  it("maps not_finalized with no pending artifact", async () => {
    mockSelectAuthority.mockResolvedValueOnce({
      status: "not_finalized",
      project: PROJECT_SUMMARY,
      blockerCode: "no_final_hld_document",
    });
    const res = await getRfpHldCloseStatus({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({
      status: "blocked",
      blocker: "not_closed",
      project: PROJECT_SUMMARY,
      blockerCode: "no_final_hld_document",
    });
    if (res.status === "blocked" && res.blocker === "not_closed") {
      expect("latestArtifact" in res).toBe(false);
    }
  });

  it("maps not_finalized preserving the pending latestArtifact", async () => {
    mockSelectAuthority.mockResolvedValueOnce({
      status: "not_finalized",
      project: PROJECT_SUMMARY,
      blockerCode: "manual_upload_pending_review",
      latestArtifact: { ...ARTIFACT_SUMMARY, status: "needs_review" },
    });
    const res = await getRfpHldCloseStatus({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({
      status: "blocked",
      blocker: "not_closed",
      project: PROJECT_SUMMARY,
      blockerCode: "manual_upload_pending_review",
      latestArtifact: { ...ARTIFACT_SUMMARY, status: "needs_review" },
    });
  });
});

describe("getRfpHldCloseStatus - blocked/stale_final_authority", () => {
  it("maps stale_final_authority preserving the stale blocker code and artifact summary", async () => {
    mockSelectAuthority.mockResolvedValueOnce({
      status: "stale_final_authority",
      project: PROJECT_SUMMARY,
      blockerCode: "source_diagram_unavailable",
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await getRfpHldCloseStatus({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({
      status: "blocked",
      blocker: "stale_final_authority",
      project: PROJECT_SUMMARY,
      blockerCode: "source_diagram_unavailable",
      artifact: ARTIFACT_SUMMARY,
    });
    expect(JSON.stringify(res)).not.toContain("secret-topology");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-close-status.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-close-status.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the final-authority selector/types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual(["@/lib/projects/project-rfp-hld-document-final-authority"]);
  });

  it("touches no store, mutation, provider/AI, raw-doc, pricing, SKU, catalog, or config module", () => {
    for (const forbidden of [
      "@/lib/db/",
      "node:fs",
      '"fs"',
      "createProjectArtifact",
      "createProjectApproval",
      "updateProject",
      "@/lib/projects/project-rfp-hld-document-approval",
      "@/lib/projects/project-rfp-hld-document-manual-upload",
      "@/lib/projects/project-rfp-hld-document-download",
      "@/lib/catalog",
      "@/lib/adapters",
      "@/lib/ai",
      "@/lib/llm",
      "@anthropic-ai",
      "openai",
      '@/lib/projects/pricing"',
      "@/lib/projects/config-expansion",
      "next/server",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
