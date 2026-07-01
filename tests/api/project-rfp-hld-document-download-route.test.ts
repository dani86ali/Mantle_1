import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the final-HLD download service so the route's auth gate,
// tenant/param authority, body/query-ignoring, byte streaming, and result mapping are
// tested independent of the DB, the selector, and the real filesystem.
const { mockRequireAuth, mockLoadDownload } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadDownload: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-document-download", () => ({
  loadProjectRfpHldDocumentDownload: mockLoadDownload,
}));

import { GET } from "@/app/api/projects/[id]/rfp/hld-document/download/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/hld-document/download/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-hld-1";
const SESSION = {
  userId: "u-se",
  tenantId: "33333333-3333-3333-3333-333333333333",
  email: "se@bomatic.ai",
  name: "SE",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT } };

const MIME = "application/vnd.jgraph.mxfile";
const DRAWIO_XML = "<mxfile><diagram>topology</diagram></mxfile>";
const BYTES = new TextEncoder().encode(DRAWIO_XML);
const FILENAME = "BOMATIC-HLD-Acme-Corp-v4.drawio";

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

const FINAL_AUTHORITY = {
  artifact: ARTIFACT_SUMMARY,
  payloadSummary: { title: "Final HLD", uploadedFileName: "acme.drawio" },
  finalAuthorityStatus: "approved_manual_drawio_upload",
};

const OK_RESULT = {
  status: "ok",
  bytes: BYTES,
  mimeType: MIME,
  filename: FILENAME,
  contentLength: BYTES.byteLength,
  finalAuthority: FINAL_AUTHORITY,
};

const PROJECT_SUMMARY = {
  id: PROJECT,
  name: "Acme RFP",
  mode: "rfp",
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Acme Quick BoM",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

// The route ignores the body and the query string; the mock seeds json/formData/text/
// arrayBuffer spies with decoy authority so a test can prove none is read.
function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() =>
      Promise.resolve({
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        artifactId: "attacker-artifact",
        filePath: "C:/attacker/evil.drawio",
        filename: "attacker.drawio",
        status: "approved",
      })
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
    text: vi.fn(() => Promise.resolve("tenantId=attacker-tenant")),
    arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadDownload.mockReset().mockResolvedValue(OK_RESULT);
});

describe("GET hld-document/download - auth", () => {
  it("returns the requireAuth response and skips the service and body reads when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await GET(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadDownload).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(request.text).not.toHaveBeenCalled();
    expect(request.arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("GET hld-document/download - tenant/param authority", () => {
  it("uses session.tenantId + route project id only and never reads the body/query", async () => {
    const request = req();

    await GET(request, PARAMS);

    expect(mockLoadDownload).toHaveBeenCalledTimes(1);
    expect(mockLoadDownload).toHaveBeenCalledWith({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
    });

    const arg = mockLoadDownload.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
    expect("artifactId" in arg).toBe(false);
    expect("filePath" in arg).toBe(false);
    expect("filename" in arg).toBe(false);
    expect("status" in arg).toBe(false);

    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(request.text).not.toHaveBeenCalled();
    expect(request.arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("GET hld-document/download - ok byte stream", () => {
  it("streams the draw.io bytes with the mxfile content-type, attachment disposition, no-store, and content-length", async () => {
    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(MIME);
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="${FILENAME}"`
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Length")).toBe(String(BYTES.byteLength));

    const buf = Buffer.from(await res.arrayBuffer());
    expect(new Uint8Array(buf)).toEqual(BYTES);
    expect(buf.toString("utf8")).toBe(DRAWIO_XML);
  });
});

describe("GET hld-document/download - result mapping", () => {
  it("maps not_found -> 404 project_not_found", async () => {
    mockLoadDownload.mockResolvedValue({ status: "not_found" });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("project_not_found");
    expect("status" in body).toBe(false);
  });

  it("maps wrong_mode -> 409 wrong_project_mode with the project summary", async () => {
    mockLoadDownload.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps not_finalized -> 409 with blockerCode and any pending latestArtifact", async () => {
    mockLoadDownload.mockResolvedValueOnce({
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

    mockLoadDownload.mockResolvedValueOnce({
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
    mockLoadDownload.mockResolvedValue({
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

  it("blocked JSON bodies never carry drawioXml or a payload", async () => {
    mockLoadDownload.mockResolvedValue({
      status: "stale_final_authority",
      project: PROJECT_SUMMARY,
      blockerCode: "source_diagram_unavailable",
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await GET(req(), PARAMS);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("drawioXml");
    expect(raw).not.toContain("payload");
    expect(raw).not.toContain("mxfile");
  });
});

describe("GET hld-document/download - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadDownload.mockRejectedValue(new Error(secret));

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_document_download_failed");
    expect(body.error).toBe("Unable to download the final RFP HLD document.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET hld-document/download - route surface", () => {
  it("exports GET only", () => {
    expect(typeof routeModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/hld-document/download/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-document-download-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only next/server, requireAuth, and the final-HLD download service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-document-download",
    ]);
  });

  it("touches no store/mutation/provider/raw-doc/pricing/SKU/catalog/config module", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "getProjectById",
      "getProjectArtifactById",
      "createProjectArtifact",
      "createProjectApproval",
      "@/lib/projects/project-rfp-hld-document-manual-upload",
      "@/lib/projects/project-rfp-hld-document-approval",
      "@/lib/catalog",
      "@/lib/adapters",
      "@/lib/ai",
      "@/lib/llm",
      "@anthropic-ai",
      "openai",
      '@/lib/projects/pricing"',
      "@/lib/projects/config-expansion",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("does not read the request body or query (no json/formData/text/arrayBuffer/query)", () => {
    for (const forbidden of [
      "request.json",
      "request.formData",
      "request.text",
      "request.arrayBuffer",
      ".json()",
      ".formData()",
      ".text()",
      ".arrayBuffer()",
      "request.url",
      "nextUrl",
      "searchParams",
    ]) {
      expect(source).not.toContain(forbidden);
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
