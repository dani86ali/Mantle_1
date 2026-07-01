import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the manual-upload service so the route's auth gate, strict body parse,
// tenant/user/param authority, and result mapping are tested independent of the DB.
const { mockRequireAuth, mockUpload } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockUpload: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-document-manual-upload", () => ({
  createRfpHldDocumentManualUpload: mockUpload,
}));

import { POST } from "@/app/api/projects/[id]/rfp/hld-document/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-doc-1";
const SESSION = {
  userId: "u-se",
  tenantId: "99999999-9999-9999-9999-999999999999",
  email: "se@bomatic.ai",
  name: "SE",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT } };

const VALID_BODY = {
  documentModelArtifactId: "hdocm-1",
  title: "Final HLD Topology",
  uploadedFileName: "acme-hld.drawio",
  drawioXml: "<mxfile><diagram></diagram></mxfile>",
};

const ARTIFACT_SUMMARY = {
  id: "art-doc-1",
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_document",
  status: "needs_review",
  version: 1,
  sourceFileIds: [],
  sourceArtifactIds: ["hsb-1", "hdm-1", "hdg-1", "hdocm-1"],
  createdAt: "2026-06-30T12:00:00.000Z",
  updatedAt: "2026-06-30T12:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_document",
  sourceMode: "manual_drawio_upload",
  title: "Final HLD Topology",
  uploadedFileName: "acme-hld.drawio",
  drawioXmlLength: 36,
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

const OK_RESULT = { status: "ok", artifact: ARTIFACT_SUMMARY, payloadSummary: PAYLOAD_SUMMARY };

function req(body: unknown = VALID_BODY): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
  } as unknown as NextRequest;
}

function reqBadJson(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.reject(new SyntaxError("bad"))),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockUpload.mockReset().mockResolvedValue(OK_RESULT);
});

describe("POST hld-document - auth + strict body", () => {
  it("returns the requireAuth response and never parses the body or calls the service", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const request = req();
    const res = await POST(request, PARAMS);
    expect(res.status).toBe(401);
    expect(request.json).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400 and no service call", async () => {
    const res = await POST(reqBadJson(), PARAMS);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_hld_document_request");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects non-object bodies, missing keys, and non-string values", async () => {
    for (const body of [
      null,
      "a string",
      123,
      true,
      [VALID_BODY],
      {},
      { documentModelArtifactId: "x", title: "t", uploadedFileName: "a.drawio" }, // missing drawioXml
      { ...VALID_BODY, documentModelArtifactId: 5 },
      { ...VALID_BODY, note: 7 },
    ]) {
      mockUpload.mockClear();
      const res = await POST(req(body), PARAMS);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("invalid_rfp_hld_document_request");
      expect(mockUpload).not.toHaveBeenCalled();
    }
  });

  it("rejects any extra/forbidden body key and never calls the service", async () => {
    for (const extra of [
      "tenantId", "createdBy", "status", "payload", "sourceArtifactIds",
      "sourceFileIds", "version", "finalAuthority", "sku", "price", "provider",
    ]) {
      mockUpload.mockClear();
      const res = await POST(req({ ...VALID_BODY, [extra]: "x" }), PARAMS);
      expect(res.status).toBe(400);
      expect(mockUpload).not.toHaveBeenCalled();
    }
  });
});

describe("POST hld-document - authority + result mapping", () => {
  it("calls the service with session tenant/user + only the allowed fields", async () => {
    const res = await POST(req({ ...VALID_BODY, note: "  ok  " }), PARAMS);
    expect(res.status).toBe(201);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const arg = mockUpload.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.createdBy).toBe(SESSION.userId);
    expect(arg.documentModelArtifactId).toBe("hdocm-1");
    expect(arg.drawioXml).toBe(VALID_BODY.drawioXml);
    expect(arg.note).toBe("  ok  ");
  });

  it("maps ok to 201 with artifact + payloadSummary and never leaks drawioXml", async () => {
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.artifact).toEqual(ARTIFACT_SUMMARY);
    expect(json.payloadSummary).toEqual(PAYLOAD_SUMMARY);
    expect(JSON.stringify(json)).not.toContain("drawioXml\"");
  });

  it("maps not_found -> 404, wrong_mode -> 409", async () => {
    mockUpload.mockResolvedValueOnce({ status: "not_found" });
    expect((await POST(req(), PARAMS)).status).toBe(404);

    mockUpload.mockResolvedValueOnce({
      status: "wrong_mode",
      project: { id: PROJECT, name: "x", mode: "quick_bom", createdAt: "", updatedAt: "" },
    });
    const wrong = await POST(req(), PARAMS);
    expect(wrong.status).toBe(409);
    expect((await wrong.json()).code).toBe("wrong_project_mode");
  });

  it("maps precondition_failed -> 409 with blockerCode and invalid_payload -> 409 with errors", async () => {
    mockUpload.mockResolvedValueOnce({ status: "precondition_failed", code: "diagram_unavailable" });
    const pre = await POST(req(), PARAMS);
    expect(pre.status).toBe(409);
    expect((await pre.json()).blockerCode).toBe("diagram_unavailable");

    mockUpload.mockResolvedValueOnce({ status: "invalid_payload", errors: ["drawioXml: is not well-formed XML"] });
    const inv = await POST(req(), PARAMS);
    expect(inv.status).toBe(409);
    expect((await inv.json()).errors).toEqual(["drawioXml: is not well-formed XML"]);
  });

  it("maps an unexpected service throw to a controlled 500", async () => {
    mockUpload.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("rfp_hld_document_failed");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/app/api/projects/[id]/rfp/hld-document/route.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only next/server, requireAuth, and the manual-upload service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-document-manual-upload",
    ]);
  });

  it("touches no store/AI/catalog/pricing module", () => {
    for (const forbidden of [
      "@/lib/db/", "@/lib/catalog", "@/lib/adapters", "@/lib/ai", "@anthropic-ai", "openai",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it("is ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
