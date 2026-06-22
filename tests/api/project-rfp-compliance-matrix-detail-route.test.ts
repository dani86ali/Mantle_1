import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockRequireAuth, mockLoadDetail } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadDetail: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-compliance-matrix-inspection", () => ({
  loadRfpComplianceMatrixDetail: mockLoadDetail,
}));

import { GET } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/route";
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
const PROJECT_SUMMARY = {
  id: PROJECT,
  name: "STC RFP Bid",
  mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};
const ARTIFACT_SUMMARY = {
  id: ARTIFACT,
  projectId: PROJECT,
  stageId: "compliance_matrix_review",
  type: "compliance_matrix",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-rfp-1"],
  sourceArtifactIds: ["art-requirements-baseline-1"],
  createdAt: "2026-06-11T12:00:00.000Z",
  updatedAt: "2026-06-11T12:00:00.000Z",
};
const MATRIX = {
  payloadKind: "rfp_compliance_matrix",
  sourceRequirementsBaselineArtifactId: "art-requirements-baseline-1",
  sourceEvidencePackageArtifactId: "art-evidence-package-1",
  createdBy: SESSION.userId,
  createdAt: "2026-06-11T12:00:00.000Z",
  sourceFileIds: ["file-rfp-1"],
  sourceArtifactIds: ["art-requirements-baseline-1", "art-evidence-package-1"],
  reviewedBy: SESSION.userId,
  reviewedAt: "2026-06-12T09:00:00.000Z",
  reviewedDecisionCount: 1,
  activeRowCount: 1,
  removedRowCount: 0,
  sourceComplianceMatrixArtifactId: "art-compliance-matrix-prev",
  sourceComplianceMatrixArtifactVersion: 1,
  rows: [
    {
      id: "RFP-COMP-001",
      requirementId: "RFP-REQ-001",
      requirementText: "Provide access switches.",
      category: "technical",
      priority: "mandatory",
      complianceStatus: "needs_review",
      response: "Compliant.",
      evidenceReferences: [],
      sectionReference: "SEC-3.1",
      responseLane: "technical",
      ownerLane: "project_delivery",
      hldImpact: "required",
      tpImpact: "potential",
      boqConfigImpact: "none",
      requiresOwnerReview: true,
      rowReviewStatus: "reviewed",
      reviewHistory: [
        {
          action: "edited",
          at: "2026-06-12T09:00:00.000Z",
          by: SESSION.userId,
          note: "Reviewed the response.",
        },
      ],
    },
  ],
};
const DETAIL_OK = {
  status: "ok",
  project: PROJECT_SUMMARY,
  artifact: ARTIFACT_SUMMARY,
  matrix: MATRIX,
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
  mockLoadDetail.mockReset().mockResolvedValue(DETAIL_OK);
});

it("passes only session tenant and route ids to the detail service", async () => {
  const request = req({ tenantId: "attacker", artifactId: "attacker" });

  const res = await GET(request, PARAMS);

  expect(res.status).toBe(200);
  expect(request.json).not.toHaveBeenCalled();
  expect(request.formData).not.toHaveBeenCalled();
  expect(mockLoadDetail).toHaveBeenCalledWith({
    tenantId: SESSION.tenantId,
    projectId: PROJECT,
    artifactId: ARTIFACT,
  });
});

it("maps service results without leaking unexpected errors", async () => {
  const unauth = NextResponse.json({ error: "no" }, { status: 401 });
  mockRequireAuth.mockReturnValueOnce(unauth);
  expect(await GET(req(), PARAMS)).toBe(unauth);

  for (const [result, status] of [
    [{ status: "not_found" }, 404],
    [{ status: "artifact_not_found" }, 404],
    [{ status: "artifact_not_compliance_matrix", artifact: ARTIFACT_SUMMARY }, 409],
    [{ status: "invalid_payload", artifact: ARTIFACT_SUMMARY }, 409],
    [{ status: "wrong_mode", project: { ...PROJECT_SUMMARY, mode: "quick_bom" } }, 409],
  ] as const) {
    mockLoadDetail.mockResolvedValueOnce(result);
    expect((await GET(req(), PARAMS)).status).toBe(status);
  }

  const ok = await GET(req(), PARAMS);
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({
    project: PROJECT_SUMMARY,
    artifact: ARTIFACT_SUMMARY,
    matrix: MATRIX,
  });

  mockLoadDetail.mockRejectedValueOnce(new Error("secret-stack"));
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
    join(
      process.cwd(),
      "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/route.ts"
    ),
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
