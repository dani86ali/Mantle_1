import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock ONLY the HLD close-status service so this gate's status mapping, blocker-code
// derivation, and payload/draw.io non-leakage are tested independent of the DB, stores,
// the final-authority selector, and the source-chain evaluator.
const { mockCloseStatus } = vi.hoisted(() => ({
  mockCloseStatus: vi.fn(),
}));

vi.mock("@/lib/projects/project-rfp-hld-close-status", () => ({
  getRfpHldCloseStatus: mockCloseStatus,
  RFP_HLD_CLOSE_STATUS: "hld_closed_on_final_authority",
  RFP_HLD_CLOSE_KIND: "approved_manual_drawio_upload_final",
}));

import {
  getRfpTpHandoffGate,
  RFP_TP_HANDOFF_GATE_STATUS_READY,
  RFP_TP_HANDOFF_GATE_STATUS_BLOCKED,
} from "@/lib/projects/project-rfp-tp-handoff-gate";

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

const FINAL_AUTHORITY = {
  artifact: ARTIFACT_SUMMARY,
  payloadSummary: {
    payloadKind: "rfp_hld_document",
    title: "Final HLD Topology",
    uploadedFileName: "final.drawio",
    drawioXmlLength: DRAWIO_XML.length,
  },
  finalAuthorityStatus: "approved_manual_drawio_upload",
};

const CLOSED_RESULT = {
  status: "closed",
  project: PROJECT_SUMMARY,
  closeStatus: "hld_closed_on_final_authority",
  closeKind: "approved_manual_drawio_upload_final",
  closedAt: ARTIFACT_SUMMARY.updatedAt,
  finalAuthority: FINAL_AUTHORITY,
};

beforeEach(() => {
  mockCloseStatus.mockReset().mockResolvedValue(CLOSED_RESULT);
});

describe("getRfpTpHandoffGate - close-status delegation", () => {
  it("calls the close-status service exactly once with tenant + project id only", async () => {
    await getRfpTpHandoffGate({ tenantId: TENANT, projectId: PROJECT });
    expect(mockCloseStatus).toHaveBeenCalledTimes(1);
    const arg = mockCloseStatus.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
  });
});

describe("getRfpTpHandoffGate - ready", () => {
  it("maps closed -> ready with tp_handoff_ready gate and a sanitized hldClose summary", async () => {
    const res = await getRfpTpHandoffGate({ tenantId: TENANT, projectId: PROJECT });
    expect(res.status).toBe("ready");
    if (res.status !== "ready") return;
    expect(res.gateStatus).toBe(RFP_TP_HANDOFF_GATE_STATUS_READY);
    expect(res.gateStatus).toBe("tp_handoff_ready");
    expect(res.project).toEqual(PROJECT_SUMMARY);
    expect(res.hldClose).toEqual({
      closeStatus: "hld_closed_on_final_authority",
      closeKind: "approved_manual_drawio_upload_final",
      closedAt: ARTIFACT_SUMMARY.updatedAt,
      finalAuthority: FINAL_AUTHORITY,
    });
  });

  it("never exposes an HLD payload or draw.io XML in a ready result", async () => {
    const res = await getRfpTpHandoffGate({ tenantId: TENANT, projectId: PROJECT });
    if (res.status !== "ready") throw new Error("expected ready");
    expect("payload" in res).toBe(false);
    expect("drawioXml" in res.hldClose.finalAuthority.payloadSummary).toBe(false);
    expect(JSON.stringify(res)).not.toContain("secret-topology");
    // Only the length metric is carried through, never the XML body itself.
    expect(res.hldClose.finalAuthority.payloadSummary.drawioXmlLength).toBe(DRAWIO_XML.length);
  });
});

describe("getRfpTpHandoffGate - not_found / wrong_mode", () => {
  it("maps not_found", async () => {
    mockCloseStatus.mockResolvedValueOnce({ status: "not_found" });
    const res = await getRfpTpHandoffGate({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({ status: "not_found" });
  });

  it("maps wrong_mode with the lean project summary", async () => {
    mockCloseStatus.mockResolvedValueOnce({ status: "wrong_mode", project: PROJECT_SUMMARY });
    const res = await getRfpTpHandoffGate({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({ status: "wrong_mode", project: PROJECT_SUMMARY });
  });
});

describe("getRfpTpHandoffGate - blocked/not_closed", () => {
  it("maps no_final_hld_document -> blocked hld_not_closed with no latestArtifact", async () => {
    mockCloseStatus.mockResolvedValueOnce({
      status: "blocked",
      blocker: "not_closed",
      project: PROJECT_SUMMARY,
      blockerCode: "no_final_hld_document",
    });
    const res = await getRfpTpHandoffGate({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({
      status: "blocked",
      gateStatus: RFP_TP_HANDOFF_GATE_STATUS_BLOCKED,
      blockerCode: "hld_not_closed",
      hldCloseBlockerCode: "no_final_hld_document",
      project: PROJECT_SUMMARY,
    });
    if (res.status === "blocked") expect("latestArtifact" in res).toBe(false);
  });

  it("maps manual_upload_pending_review -> blocked hld_manual_upload_pending_review preserving latestArtifact", async () => {
    const pending = { ...ARTIFACT_SUMMARY, status: "needs_review" };
    mockCloseStatus.mockResolvedValueOnce({
      status: "blocked",
      blocker: "not_closed",
      project: PROJECT_SUMMARY,
      blockerCode: "manual_upload_pending_review",
      latestArtifact: pending,
    });
    const res = await getRfpTpHandoffGate({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({
      status: "blocked",
      gateStatus: "tp_handoff_blocked",
      blockerCode: "hld_manual_upload_pending_review",
      hldCloseBlockerCode: "manual_upload_pending_review",
      project: PROJECT_SUMMARY,
      latestArtifact: pending,
    });
  });

  it("maps generated_hld_document_pending_review -> blocked hld_not_closed preserving latestArtifact", async () => {
    const pending = {
      ...ARTIFACT_SUMMARY,
      id: "art-generated-doc-pending",
      status: "needs_review",
    };
    mockCloseStatus.mockResolvedValueOnce({
      status: "blocked",
      blocker: "not_closed",
      project: PROJECT_SUMMARY,
      blockerCode: "generated_hld_document_pending_review",
      latestArtifact: pending,
    });
    const res = await getRfpTpHandoffGate({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({
      status: "blocked",
      gateStatus: "tp_handoff_blocked",
      blockerCode: "hld_not_closed",
      hldCloseBlockerCode: "generated_hld_document_pending_review",
      project: PROJECT_SUMMARY,
      latestArtifact: pending,
    });
    expect(JSON.stringify(res)).not.toContain("secret-topology");
    expect(JSON.stringify(res)).not.toContain("drawioXml");
  });
});

describe("getRfpTpHandoffGate - blocked/stale_final_authority", () => {
  it("maps stale_final_authority -> blocked hld_final_authority_stale preserving the stale code and artifact", async () => {
    mockCloseStatus.mockResolvedValueOnce({
      status: "blocked",
      blocker: "stale_final_authority",
      project: PROJECT_SUMMARY,
      blockerCode: "source_diagram_unavailable",
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await getRfpTpHandoffGate({ tenantId: TENANT, projectId: PROJECT });
    expect(res).toEqual({
      status: "blocked",
      gateStatus: "tp_handoff_blocked",
      blockerCode: "hld_final_authority_stale",
      hldCloseBlockerCode: "source_diagram_unavailable",
      project: PROJECT_SUMMARY,
      artifact: ARTIFACT_SUMMARY,
    });
    expect(JSON.stringify(res)).not.toContain("secret-topology");
  });
});

describe("getRfpTpHandoffGate - only closed opens the gate", () => {
  it("keeps every non-closed close-status state blocked (never ready)", async () => {
    for (const close of [
      { status: "not_found" },
      { status: "wrong_mode", project: PROJECT_SUMMARY },
      {
        status: "blocked",
        blocker: "not_closed",
        project: PROJECT_SUMMARY,
        blockerCode: "no_final_hld_document",
      },
      {
        status: "blocked",
        blocker: "not_closed",
        project: PROJECT_SUMMARY,
        blockerCode: "manual_upload_pending_review",
        latestArtifact: ARTIFACT_SUMMARY,
      },
      {
        status: "blocked",
        blocker: "not_closed",
        project: PROJECT_SUMMARY,
        blockerCode: "generated_hld_document_pending_review",
        latestArtifact: ARTIFACT_SUMMARY,
      },
      {
        status: "blocked",
        blocker: "stale_final_authority",
        project: PROJECT_SUMMARY,
        blockerCode: "invalid_hld_document_payload",
        artifact: ARTIFACT_SUMMARY,
      },
    ]) {
      mockCloseStatus.mockResolvedValueOnce(close);
      const res = await getRfpTpHandoffGate({ tenantId: TENANT, projectId: PROJECT });
      expect(res.status).not.toBe("ready");
    }
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-tp-handoff-gate.ts");
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-tp-handoff-gate.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the HLD close-status service module", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual(["@/lib/projects/project-rfp-hld-close-status"]);
  });

  it("touches no store, mutation, provider/AI, raw-doc, pricing, SKU, catalog, or config module", () => {
    for (const forbidden of [
      "@/lib/db/",
      "node:fs",
      '"fs"',
      "createProjectArtifact",
      "createProjectApproval",
      "updateProject",
      "@/lib/projects/project-rfp-hld-document-final-authority",
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
