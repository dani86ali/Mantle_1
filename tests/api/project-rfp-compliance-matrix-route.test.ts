import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockRequireAuth, mockLoadList } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadList: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-compliance-matrix-inspection", () => ({
  loadRfpComplianceMatrixList: mockLoadList,
}));

import { GET } from "@/app/api/projects/[id]/rfp/compliance-matrix/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/compliance-matrix/route";
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
const PARAMS = { params: { id: PROJECT } };
const PROJECT_SUMMARY = {
  id: PROJECT,
  name: "STC RFP Bid",
  mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};
const LIST_OK = {
  status: "ok",
  project: PROJECT_SUMMARY,
  artifactCount: 1,
  artifacts: [
    {
      id: "art-compliance-matrix-1",
      projectId: PROJECT,
      stageId: "compliance_matrix_review",
      type: "compliance_matrix",
      status: "needs_review",
      version: 1,
      sourceFileIds: ["file-rfp-1"],
      sourceArtifactIds: ["art-requirements-baseline-1"],
      createdAt: "2026-06-11T12:00:00.000Z",
      updatedAt: "2026-06-11T12:00:00.000Z",
      payloadSummary: {
        payloadKind: "rfp_compliance_matrix",
        rowCount: 1,
        rowIds: ["RFP-COMP-001"],
        requirementIds: ["RFP-REQ-001"],
        statusCounts: {
          compliant: 0,
          partially_compliant: 0,
          non_compliant: 0,
          not_applicable: 0,
          needs_review: 1,
        },
      },
    },
  ],
};

function req(body: unknown = { decoy: true }): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(null)),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadList.mockReset().mockResolvedValue(LIST_OK);
});

it("passes only session tenant and route project to the read-only service", async () => {
  const request = req({ tenantId: "attacker", rows: ["attacker"] });

  const res = await GET(request, PARAMS);

  expect(res.status).toBe(200);
  expect(request.json).not.toHaveBeenCalled();
  expect(request.formData).not.toHaveBeenCalled();
  expect(mockLoadList).toHaveBeenCalledWith({
    tenantId: SESSION.tenantId,
    projectId: PROJECT,
  });
});

it("maps auth, not_found, wrong_mode, ok, and unexpected errors", async () => {
  const unauth = NextResponse.json({ error: "no" }, { status: 401 });
  mockRequireAuth.mockReturnValueOnce(unauth);
  expect(await GET(req(), PARAMS)).toBe(unauth);

  mockLoadList.mockResolvedValueOnce({ status: "not_found" });
  expect((await GET(req(), PARAMS)).status).toBe(404);

  mockLoadList.mockResolvedValueOnce({
    status: "wrong_mode",
    project: { ...PROJECT_SUMMARY, mode: "quick_bom" },
  });
  expect((await GET(req(), PARAMS)).status).toBe(409);

  const ok = await GET(req(), PARAMS);
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({
    project: PROJECT_SUMMARY,
    artifactCount: 1,
    artifacts: LIST_OK.artifacts,
  });

  mockLoadList.mockRejectedValueOnce(new Error("secret-stack"));
  const failed = await GET(req(), PARAMS);
  expect(failed.status).toBe(500);
  expect(JSON.stringify(await failed.json())).not.toContain("secret-stack");
});

it("exports GET only and keeps route imports narrow", () => {
  expect(typeof routeModule.GET).toBe("function");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
  }

  const source = readFileSync(
    join(process.cwd(), "src/app/api/projects/[id]/rfp/compliance-matrix/route.ts"),
    "utf8"
  );
  const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
  expect(froms).toEqual([
    "next/server",
    "@/lib/middleware/auth",
    "@/lib/projects/project-rfp-compliance-matrix-inspection",
  ]);
  expect(source).not.toContain("request.json");
  expect(source).not.toContain("createProjectApproval");
  expect(source).not.toContain("createProjectArtifactVersion");
  expect(source).not.toContain("@anthropic-ai");
});
