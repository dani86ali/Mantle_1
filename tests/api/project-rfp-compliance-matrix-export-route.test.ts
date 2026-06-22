import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockRequireAuth, mockExport } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockExport: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-compliance-matrix-export", () => ({
  exportRfpComplianceMatrixCsv: mockExport,
}));

import { GET } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/export/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/export/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-compliance-matrix-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT } };

const CSV = "Section Reference,Description,Comply/Not Comply,Notes\r\n3.1,Req,Comply,ok";
const OK_RESULT = {
  status: "ok",
  csv: CSV,
  bytes: Buffer.from(CSV, "utf8"),
  contentType: "text/csv; charset=utf-8",
  contentLength: Buffer.byteLength(CSV, "utf8"),
  filename: "BOMATIC-RFP-Compliance-Matrix-STC_RFP_Bid-v3.csv",
  rowCount: 1,
};

function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.reject(new Error("body should not be read"))),
    url: "https://app.bomatic.ai/x?artifactId=attacker&tenantId=attacker",
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockExport.mockReset().mockResolvedValue(OK_RESULT);
});

it("returns unauth response before calling the service", async () => {
  const unauth = NextResponse.json({ error: "no" }, { status: 401 });
  mockRequireAuth.mockReturnValueOnce(unauth);
  expect(await GET(req(), PARAMS)).toBe(unauth);
  expect(mockExport).not.toHaveBeenCalled();
});

it("passes only the session tenant and route ids; never reads body or query", async () => {
  const request = req();
  await GET(request, PARAMS);
  expect(request.json).not.toHaveBeenCalled();
  expect(mockExport).toHaveBeenCalledWith({
    tenantId: SESSION.tenantId,
    projectId: PROJECT,
    artifactId: ARTIFACT,
  });
});

it("returns the csv bytes with download headers on ok", async () => {
  const res = await GET(req(), PARAMS);
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  expect(res.headers.get("Content-Disposition")).toBe(
    `attachment; filename="${OK_RESULT.filename}"`
  );
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  expect(res.headers.get("Content-Length")).toBe(String(OK_RESULT.contentLength));
  expect(await res.text()).toBe(CSV);
});

it("maps each service status to the documented HTTP code", async () => {
  for (const [result, status, code] of [
    [{ status: "not_found" }, 404, "project_not_found"],
    [{ status: "wrong_mode", project: { id: PROJECT, mode: "quick_bom" } }, 409, "wrong_project_mode"],
    [{ status: "compliance_matrix_not_found" }, 404, "compliance_matrix_artifact_not_found"],
    [{ status: "artifact_not_compliance_matrix" }, 409, "artifact_not_compliance_matrix"],
    [{ status: "compliance_matrix_not_approved" }, 409, "compliance_matrix_artifact_not_approved"],
    [{ status: "invalid_payload" }, 409, "compliance_matrix_invalid_payload"],
    [{ status: "no_exportable_rows" }, 409, "compliance_matrix_no_exportable_rows"],
  ] as const) {
    mockExport.mockResolvedValueOnce(result);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  }
});

it("maps an unexpected service error to 500 without leaking it", async () => {
  mockExport.mockRejectedValueOnce(new Error("secret-stack"));
  const res = await GET(req(), PARAMS);
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.code).toBe("rfp_compliance_matrix_export_failed");
  expect(JSON.stringify(json)).not.toContain("secret-stack");
});

it("exports GET only and keeps route imports narrow", () => {
  expect(typeof routeModule.GET).toBe("function");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
  }

  const source = readFileSync(
    join(
      process.cwd(),
      "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/export/route.ts"
    ),
    "utf8"
  );
  const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
  expect(froms).toEqual([
    "next/server",
    "@/lib/middleware/auth",
    "@/lib/projects/project-rfp-compliance-matrix-export",
  ]);
  for (const forbidden of [
    "request.json",
    "request.nextUrl",
    "searchParams",
    "createProjectArtifactVersion",
    "@anthropic-ai",
  ]) {
    expect(source).not.toContain(forbidden);
  }
  expect(/[^\x00-\x7F]/.test(source)).toBe(false);
});
