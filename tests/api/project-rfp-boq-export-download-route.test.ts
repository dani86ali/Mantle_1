import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the RFP BoQ export download service so the route's auth-gate,
// tenant/param authority, body/query-ignoring, byte streaming, and result-mapping are
// tested independent of the DB, the lower-level shared download core, and the real
// filesystem.
const { mockRequireAuth, mockLoadDownload } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadDownload: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-boq-export-download", () => ({
  loadProjectRfpBoqExportDownload: mockLoadDownload,
}));

import { GET } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/export-package/download/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/export-package/download/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT_ID = "art-ep-rfp-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// "PK\x03\x04" zip magic plus a few payload bytes so the round-trip is observable.
const BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x11, 0x22, 0x33]);
const FILENAME = "BOMATIC-RFP-BoQ-Honeywell-v1.xlsx";

const ARTIFACT_SUMMARY = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "export_approval",
  type: "export_package",
  status: "approved",
  version: 1,
  sourceFileIds: ["file-1"],
  sourceArtifactIds: ["art-pb-rfp-7"],
  createdAt: "2026-05-21T10:00:00.000Z",
  updatedAt: "2026-05-21T10:30:00.000Z",
};

const OK_RESULT = {
  status: "ok",
  bytes: BYTES,
  mimeType: XLSX_MIME,
  filename: FILENAME,
  contentLength: BYTES.byteLength,
  artifact: ARTIFACT_SUMMARY,
};

// A non-rfp (quick_bom) project drives the wrong_mode branch and the RFP message.
const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

// The route ignores the body and the query string; the mock seeds json/formData/text/
// arrayBuffer spies with decoy authority fields so a test can prove none is read.
function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() =>
      Promise.resolve({
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        artifactId: "attacker-artifact",
        filePath: "C:/attacker/evil.xlsx",
        outputPath: "C:/attacker/also-evil.xlsx",
        filename: "attacker.xlsx",
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

describe("GET .../rfp/.../export-package/download - auth", () => {
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

describe("GET .../rfp/.../export-package/download - tenant/param authority", () => {
  it("uses session.tenantId plus route params only and never reads the request body/query", async () => {
    const request = req();

    await GET(request, PARAMS);

    expect(mockLoadDownload).toHaveBeenCalledTimes(1);
    expect(mockLoadDownload).toHaveBeenCalledWith({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
      artifactId: ARTIFACT_ID,
    });

    const arg = mockLoadDownload.mock.calls[0][0];
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.artifactId).not.toBe("attacker-artifact");
    // No body-supplied path/filename/status authority ever reaches the service.
    expect("filePath" in arg).toBe(false);
    expect("outputPath" in arg).toBe(false);
    expect("filename" in arg).toBe(false);
    expect("status" in arg).toBe(false);

    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(request.text).not.toHaveBeenCalled();
    expect(request.arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("GET .../rfp/.../export-package/download - ok byte stream", () => {
  it("streams the workbook bytes with xlsx content-type, attachment disposition, no-store, and content-length", async () => {
    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(XLSX_MIME);
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="${FILENAME}"`
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Length")).toBe(String(BYTES.byteLength));

    const buf = Buffer.from(await res.arrayBuffer());
    expect(new Uint8Array(buf)).toEqual(BYTES);
  });

  it("does not leak the status discriminator or artifact summary into the binary body", async () => {
    const res = await GET(req(), PARAMS);

    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.byteLength).toBe(BYTES.byteLength);
  });
});

describe("GET .../rfp/.../export-package/download - result mapping", () => {
  const SIMPLE: Array<[Record<string, unknown>, number, string]> = [
    [{ status: "not_found" }, 404, "project_not_found"],
    [{ status: "export_package_not_found" }, 404, "export_package_artifact_not_found"],
    [{ status: "artifact_not_export_package" }, 409, "artifact_not_export_package"],
    [{ status: "export_package_not_approved" }, 409, "export_package_artifact_not_approved"],
    [{ status: "export_package_file_missing" }, 409, "export_package_file_missing"],
    [{ status: "export_package_file_invalid" }, 409, "export_package_file_invalid"],
    [{ status: "export_package_file_unavailable" }, 404, "export_package_file_unavailable"],
  ];

  it.each(SIMPLE)("maps %o to the right HTTP status and code", async (result, httpStatus, code) => {
    mockLoadDownload.mockResolvedValue(result);

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(httpStatus);
    const body = await res.json();
    expect(body.code).toBe(code);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect("status" in body).toBe(false);
  });

  it("maps wrong_mode to 409 wrong_project_mode with the RFP message and the project summary", async () => {
    mockLoadDownload.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });
});

describe("GET .../rfp/.../export-package/download - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadDownload.mockRejectedValue(new Error(secret));

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_boq_export_download_failed");
    expect(body.error).toBe("Unable to download RFP BoQ export package.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET .../rfp/.../export-package/download - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/export-package/download/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-boq-export-download-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the RFP download service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-boq-export-download",
    ]);
  });

  it("does not import DB, stores, the download core, the quick-bom lane, the rfp export-create service, mantle/fixture/pricing/config, runner, AI, catalog, engine, coordinator, adapter, or artifact/approval creation modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "getProjectArtifactById",
      "getProjectById",
      'from "@/lib/projects/project-boq-export-download-core',
      'from "@/lib/projects/project-quick-bom',
      'from "@/lib/projects/project-rfp-boq-export"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/honeywell',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/export',
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
