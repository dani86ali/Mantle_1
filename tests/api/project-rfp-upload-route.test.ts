import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the upload service so the route's auth-gate, multipart parsing,
// tenant authority, and result-mapping are tested independent of the DB/FS.
const { mockRequireAuth, mockUpload } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockUpload: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-upload", () => ({
  uploadRfpProjectFile: mockUpload,
}));

import { POST } from "@/app/api/projects/[id]/rfp/files/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/files/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const OK_FILE = {
  id: "file-1",
  projectId: PROJECT,
  fileRole: "rfp",
  fileName: "STC_RFP.pdf",
  storagePath: "/tmp/bomatic-project-uploads/t/p/u/STC_RFP.pdf",
  mimeType: "application/pdf",
  sizeBytes: 3,
  uploadedAt: "2026-06-07T09:00:00.000Z",
  retainUntil: "2027-06-07T09:00:00.000Z",
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

// File content is an ASCII string (matches the repo upload-test pattern and
// avoids typed-array BlobPart typing); for ASCII, byte length == string length.
function mockFile(name: string, content: string, type = "application/pdf"): File {
  return new File([content], name, { type });
}

function uploadForm(file: File, fileRole: string | null = "rfp"): FormData {
  const form = new FormData();
  form.append("file", file);
  if (fileRole !== null) form.append("fileRole", fileRole);
  return form;
}

function multipartReq(
  form: FormData,
  opts: { invalid?: boolean } = {}
): NextRequest {
  return {
    headers: { get: () => null },
    formData: opts.invalid
      ? () => Promise.reject(new Error("bad multipart"))
      : () => Promise.resolve(form),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockUpload.mockReset().mockResolvedValue({ status: "ok", file: OK_FILE });
});

describe("POST /api/projects/[id]/rfp/files - auth", () => {
  it("returns the requireAuth response and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const res = await POST(
      multipartReq(uploadForm(mockFile("rfp.pdf", "abc"))),
      { params: { id: PROJECT } }
    );

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects/[id]/rfp/files - request validation", () => {
  it("returns 400 and skips the service when request.formData() rejects", async () => {
    const res = await POST(multipartReq(new FormData(), { invalid: true }), {
      params: { id: PROJECT },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_rfp_file_upload_request");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 400 and skips the service for a missing file field", async () => {
    const form = new FormData();
    form.append("fileRole", "rfp");

    const res = await POST(multipartReq(form), { params: { id: PROJECT } });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_file_upload_request");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 400 and skips the service for a non-File file field", async () => {
    const form = new FormData();
    form.append("file", "not-a-file");
    form.append("fileRole", "rfp");

    const res = await POST(multipartReq(form), { params: { id: PROJECT } });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_file_upload_request");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 400 and skips the service for duplicate file fields", async () => {
    const form = new FormData();
    form.append("file", mockFile("a.pdf", "a"));
    form.append("file", mockFile("b.pdf", "b"));
    form.append("fileRole", "rfp");

    const res = await POST(multipartReq(form), { params: { id: PROJECT } });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_file_upload_request");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 400 and skips the service for a missing fileRole field", async () => {
    const res = await POST(
      multipartReq(uploadForm(mockFile("rfp.pdf", "abc"), null)),
      { params: { id: PROJECT } }
    );

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_file_upload_request");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 400 and skips the service for duplicate fileRole fields", async () => {
    const form = uploadForm(mockFile("rfp.pdf", "abc"), "rfp");
    form.append("fileRole", "boq");

    const res = await POST(multipartReq(form), { params: { id: PROJECT } });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_file_upload_request");
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects/[id]/rfp/files - tenant/param authority", () => {
  it("passes session.tenantId, route param id, the fileRole field, real file metadata and bytes, and ignores decoy body fields", async () => {
    const content = "WXYZ";
    const expectedBytes = Array.from(new TextEncoder().encode(content));
    const form = uploadForm(
      mockFile("STC RFP.docx", content, "application/docx"),
      "scope_of_work"
    );
    // Decoy fields that must never reach the service.
    form.append("tenantId", "attacker-tenant");
    form.append("projectId", "attacker-project");
    form.append("mode", "quick_bom");
    form.append("storagePath", "/etc/passwd");
    form.append("createdBy", "attacker");
    form.append("decidedBy", "attacker");

    await POST(multipartReq(form), { params: { id: PROJECT } });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    const arg = mockUpload.mock.calls[0][0];
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.fileName).toBe("STC RFP.docx");
    expect(arg.fileRole).toBe("scope_of_work");
    expect(arg.mimeType).toBe("application/docx");
    expect(arg.sizeBytes).toBe(content.length);
    expect(arg.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(arg.bytes)).toEqual(expectedBytes);

    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    for (const key of ["mode", "storagePath", "createdBy", "decidedBy"]) {
      expect(key in arg).toBe(false);
    }
  });

  it("passes an unknown fileRole string through for the service to reject", async () => {
    mockUpload.mockResolvedValue({
      status: "invalid_file",
      reason: "invalid_role",
    });

    const res = await POST(
      multipartReq(uploadForm(mockFile("rfp.pdf", "abc"), "evidence")),
      { params: { id: PROJECT } }
    );

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload.mock.calls[0][0].fileRole).toBe("evidence");
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_file");
  });
});

describe("POST /api/projects/[id]/rfp/files - result mapping", () => {
  it("maps service not_found to 404 project_not_found", async () => {
    mockUpload.mockResolvedValue({ status: "not_found" });

    const res = await POST(
      multipartReq(uploadForm(mockFile("rfp.pdf", "abc"))),
      { params: { id: "missing" } }
    );

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps service wrong_mode to 409 wrong_project_mode and includes the project summary", async () => {
    mockUpload.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await POST(
      multipartReq(uploadForm(mockFile("rfp.pdf", "abc"))),
      { params: { id: PROJECT } }
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps service invalid_file to 400 invalid_rfp_file", async () => {
    mockUpload.mockResolvedValue({
      status: "invalid_file",
      reason: "unsupported_extension",
    });

    const res = await POST(
      multipartReq(uploadForm(mockFile("legacy.doc", "abc"))),
      { params: { id: PROJECT } }
    );

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_file");
  });

  it("maps service ok to 201 with { file } and no status discriminator", async () => {
    const res = await POST(
      multipartReq(uploadForm(mockFile("rfp.pdf", "abc"))),
      { params: { id: PROJECT } }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ file: OK_FILE });
    expect("status" in body).toBe(false);
  });
});

describe("POST /api/projects/[id]/rfp/files - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockUpload.mockRejectedValue(new Error(secret));

    const res = await POST(
      multipartReq(uploadForm(mockFile("rfp.pdf", "abc"))),
      { params: { id: PROJECT } }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_file_upload_failed");
    expect(body.error).toBe("Unable to upload RFP project file.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST /api/projects/[id]/rfp/files - route surface", () => {
  it("exports POST only", () => {
    expect(typeof routeModule.POST).toBe("function");
    for (const method of ["GET", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/files/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-upload-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the upload service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-upload",
    ]);
  });

  it("does not import DB, mutation stores, parsers/loaders, normalization, artifact/approval/evidence stores, pricing, config expansion, export, runner, AI, catalog, intake, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/boq-file-loader"',
      'from "@/lib/projects/boq-formats"',
      'from "@/lib/projects/boq-normalization"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
