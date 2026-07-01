import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the manual-upload + final-authority services so the route's auth gate,
// strict body parse, tenant/user/param authority, and result mapping are tested
// independent of the DB.
const { mockRequireAuth, mockUpload, mockSelectAuthority } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockUpload: vi.fn(),
  mockSelectAuthority: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-document-manual-upload", () => ({
  createRfpHldDocumentManualUpload: mockUpload,
}));
vi.mock("@/lib/projects/project-rfp-hld-document-final-authority", () => ({
  selectRfpHldFinalAuthority: mockSelectAuthority,
}));

import { GET, POST } from "@/app/api/projects/[id]/rfp/hld-document/route";
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

const PROJECT_SUMMARY = {
  id: PROJECT,
  name: "Acme RFP",
  mode: "rfp",
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
};

const FINAL_AUTHORITY = {
  artifact: ARTIFACT_SUMMARY,
  payloadSummary: PAYLOAD_SUMMARY,
  finalAuthorityStatus: "approved_manual_drawio_upload",
};

const AUTHORITY_OK_RESULT = {
  status: "ok",
  project: PROJECT_SUMMARY,
  authority: FINAL_AUTHORITY,
  // Full payload the service keeps internally; the route must never return it.
  payload: { drawioXml: "SECRET-DRAWIO-XML-BODY", payloadKind: "rfp_hld_document" },
};

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
  mockSelectAuthority.mockReset().mockResolvedValue(AUTHORITY_OK_RESULT);
});

describe("GET hld-document - auth + final authority mapping", () => {
  it("returns the requireAuth response and never reads the body or calls the service", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const request = req();
    const res = await GET(request, PARAMS);
    expect(res.status).toBe(401);
    expect(request.json).not.toHaveBeenCalled();
    expect(mockSelectAuthority).not.toHaveBeenCalled();
  });

  it("calls the service with session tenant + route project id and never reads the body", async () => {
    const request = req();
    const res = await GET(request, PARAMS);
    expect(res.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    expect(mockSelectAuthority).toHaveBeenCalledTimes(1);
    const arg = mockSelectAuthority.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
  });

  it("maps ok to 200 with project + finalAuthority and never leaks the payload or drawioXml", async () => {
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.project).toEqual(PROJECT_SUMMARY);
    expect(json.finalAuthority).toEqual(FINAL_AUTHORITY);
    expect("payload" in json).toBe(false);
    expect(JSON.stringify(json)).not.toContain("SECRET-DRAWIO-XML-BODY");
    expect(JSON.stringify(json)).not.toContain("drawioXml\"");
  });

  it("maps not_found -> 404 and wrong_mode -> 409", async () => {
    mockSelectAuthority.mockResolvedValueOnce({ status: "not_found" });
    expect((await GET(req(), PARAMS)).status).toBe(404);

    mockSelectAuthority.mockResolvedValueOnce({
      status: "wrong_mode",
      project: { id: PROJECT, name: "x", mode: "quick_bom", createdAt: "", updatedAt: "" },
    });
    const wrong = await GET(req(), PARAMS);
    expect(wrong.status).toBe(409);
    expect((await wrong.json()).code).toBe("wrong_project_mode");
  });

  it("maps not_finalized -> 409 with blockerCode and any pending latestArtifact", async () => {
    mockSelectAuthority.mockResolvedValueOnce({
      status: "not_finalized",
      project: PROJECT_SUMMARY,
      blockerCode: "no_final_hld_document",
    });
    const none = await GET(req(), PARAMS);
    expect(none.status).toBe(409);
    const noneJson = await none.json();
    expect(noneJson.code).toBe("hld_document_not_final");
    expect(noneJson.blockerCode).toBe("no_final_hld_document");
    expect("latestArtifact" in noneJson).toBe(false);

    mockSelectAuthority.mockResolvedValueOnce({
      status: "not_finalized",
      project: PROJECT_SUMMARY,
      blockerCode: "manual_upload_pending_review",
      latestArtifact: ARTIFACT_SUMMARY,
    });
    const pending = await GET(req(), PARAMS);
    expect(pending.status).toBe(409);
    const pendingJson = await pending.json();
    expect(pendingJson.blockerCode).toBe("manual_upload_pending_review");
    expect(pendingJson.latestArtifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps stale_final_authority -> 409 with blockerCode + artifact summary", async () => {
    mockSelectAuthority.mockResolvedValueOnce({
      status: "stale_final_authority",
      project: PROJECT_SUMMARY,
      blockerCode: "source_diagram_unavailable",
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("hld_document_final_authority_stale");
    expect(json.blockerCode).toBe("source_diagram_unavailable");
    expect(json.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps an unexpected service throw to a controlled 500", async () => {
    mockSelectAuthority.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("rfp_hld_document_authority_failed");
  });
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

  it("imports only next/server, requireAuth, and the two upload/authority services", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-document-manual-upload",
      "@/lib/projects/project-rfp-hld-document-final-authority",
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
