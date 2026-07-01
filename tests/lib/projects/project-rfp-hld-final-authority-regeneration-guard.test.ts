import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock ONLY the read-only final-authority selector so the guard's block/pass-through
// decision and result hygiene are tested in isolation. The guard performs no store
// read of its own; the selector is its only collaborator.
const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("@/lib/projects/project-rfp-hld-document-final-authority", () => ({
  selectRfpHldFinalAuthority: mockSelect,
}));

import { evaluateRfpHldFinalAuthorityRegenerationGuard } from "@/lib/projects/project-rfp-hld-final-authority-regeneration-guard";

const TENANT = "88888888-8888-8888-8888-888888888888";
const PROJECT = "proj-guard-1";
const INPUT = { tenantId: TENANT, projectId: PROJECT };

const DRAWIO_SENTINEL = "SECRET-DRAWIO-XML-BODY";

const PROJECT_SUMMARY = {
  id: PROJECT,
  name: "Acme RFP",
  mode: "rfp" as const,
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
};

const ARTIFACT_SUMMARY = {
  id: "hdoc-1",
  projectId: PROJECT,
  stageId: "hld_design_delta_review" as const,
  type: "hld_document" as const,
  status: "approved" as const,
  version: 3,
  sourceFileIds: [],
  sourceArtifactIds: ["hsb-1", "hdm-1", "hdg-1", "hdocm-1"],
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_document" as const,
  sourceMode: "manual_drawio_upload" as const,
  title: "Final HLD Topology",
  uploadedFileName: "acme-hld.drawio",
  drawioXmlLength: 128,
  authorityKind: "se_manual_drawio_upload" as const,
  effectiveWhenArtifactStatus: "approved" as const,
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

/** A full selector `ok` result whose internal payload carries the draw.io XML. */
function okResult() {
  return {
    status: "ok",
    project: PROJECT_SUMMARY,
    authority: {
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
      finalAuthorityStatus: "approved_manual_drawio_upload",
    },
    // The full validated payload the guard must NEVER surface.
    payload: {
      payloadKind: "rfp_hld_document",
      drawioXml: `<mxfile>${DRAWIO_SENTINEL}</mxfile>`,
      title: "Final HLD Topology",
    },
  };
}

beforeEach(() => {
  mockSelect.mockReset();
});

describe("evaluateRfpHldFinalAuthorityRegenerationGuard - blocks only on ok", () => {
  it("blocks when the selector returns ok and carries the sanitized summary", async () => {
    mockSelect.mockResolvedValue(okResult());

    const result = await evaluateRfpHldFinalAuthorityRegenerationGuard(INPUT);

    expect(result.blocked).toBe(true);
    if (!result.blocked) throw new Error("unreachable");
    expect(result.finalAuthority).toEqual({
      project: PROJECT_SUMMARY,
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
      finalAuthorityStatus: "approved_manual_drawio_upload",
    });
    expect(mockSelect).toHaveBeenCalledWith(INPUT);
  });

  it("does not leak the full payload or the draw.io XML body", async () => {
    mockSelect.mockResolvedValue(okResult());

    const result = await evaluateRfpHldFinalAuthorityRegenerationGuard(INPUT);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(DRAWIO_SENTINEL);
    // The body field never crosses; only the sanitized length may appear.
    expect(serialized).not.toContain('"drawioXml":');
    expect(serialized).not.toContain("<mxfile");
    if (!result.blocked) throw new Error("unreachable");
    expect("payload" in result.finalAuthority).toBe(false);
    // Only the draw.io length crosses the boundary, never the body.
    expect(result.finalAuthority.payloadSummary.drawioXmlLength).toBe(128);
  });
});

describe("evaluateRfpHldFinalAuthorityRegenerationGuard - pass-through statuses", () => {
  const notOk: Array<[string, unknown]> = [
    ["not_found", { status: "not_found" }],
    [
      "wrong_mode",
      { status: "wrong_mode", project: PROJECT_SUMMARY },
    ],
    [
      "not_finalized/no_final_hld_document",
      {
        status: "not_finalized",
        project: PROJECT_SUMMARY,
        blockerCode: "no_final_hld_document",
      },
    ],
    [
      "not_finalized/manual_upload_pending_review",
      {
        status: "not_finalized",
        project: PROJECT_SUMMARY,
        blockerCode: "manual_upload_pending_review",
        latestArtifact: ARTIFACT_SUMMARY,
      },
    ],
    [
      "stale_final_authority",
      {
        status: "stale_final_authority",
        project: PROJECT_SUMMARY,
        blockerCode: "invalid_hld_document_payload",
        artifact: ARTIFACT_SUMMARY,
      },
    ],
  ];

  for (const [label, selection] of notOk) {
    it(`does not block on selector ${label}`, async () => {
      mockSelect.mockResolvedValue(selection);
      const result = await evaluateRfpHldFinalAuthorityRegenerationGuard(INPUT);
      expect(result).toEqual({ blocked: false });
    });
  }
});

describe("project-rfp-hld-final-authority-regeneration-guard - module purity (static)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-final-authority-regeneration-guard.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-final-authority-regeneration-guard.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the read-only final-authority selector", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual(["@/lib/projects/project-rfp-hld-document-final-authority"]);
  });

  it("imports no provider/AI, pricing/SKU/catalog/config, raw-file, approval-mutation, or route/UI module", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    for (const forbidden of [
      "@anthropic-ai", "anthropic", "@google/generative-ai", "openai",
      "pdf-parse", "mammoth", "xlsx",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    for (const f of froms) {
      expect(f).not.toContain("@/lib/ai");
      expect(f).not.toContain("@/lib/llm");
      expect(f).not.toContain("@/lib/adapters");
      expect(f).not.toContain("@/lib/catalog");
      expect(f).not.toContain("@/engines");
      expect(f).not.toContain("pricing");
      expect(f).not.toContain("priced-boq");
      expect(f).not.toContain("sku-resolution");
      expect(f).not.toContain("config-expansion");
      expect(f).not.toContain("project-file-store");
      expect(f).not.toContain("project-evidence-store");
      expect(f).not.toContain("next/server");
      expect(f).not.toContain("@/components");
      expect(f).not.toContain("@/app/");
    }
  });

  it("never surfaces the full payload or draw.io XML from the selector", () => {
    expect(source).not.toContain(".payload,");
    expect(source).not.toContain("drawioXml");
    expect(source).not.toContain("createProjectApproval(");
  });

  it("keeps source and test files ASCII-only", () => {
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});
