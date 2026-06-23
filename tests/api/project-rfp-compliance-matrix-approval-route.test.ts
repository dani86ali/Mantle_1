import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockRequireAuth, mockReview } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-compliance-matrix-approval", () => ({
  reviewRfpComplianceMatrixArtifact: mockReview,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/review/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/review/route";
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
const OK_RESULT = {
  status: "ok",
  approval: { id: "approval-1", artifactId: ARTIFACT, decision: "approved" },
  artifactStatus: "approved",
  stageStatus: "approved",
  artifact: ARTIFACT_SUMMARY,
};

function req(body: unknown = { decision: "approved" }): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockReview.mockReset().mockResolvedValue(OK_RESULT);
});

it("passes only session tenant/user, route ids, decision, and optional note", async () => {
  const body = {
    decision: "rejected",
    note: "needs edits",
    tenantId: "attacker",
    projectId: "attacker",
    artifactId: "attacker",
    artifactVersion: 99,
    decidedBy: "attacker",
    status: "approved",
    rows: [{ id: "attacker" }],
    pricing: { total: 1 },
    sku: "C9300",
  };

  const res = await POST(req(body), PARAMS);

  expect(res.status).toBe(200);
  const arg = mockReview.mock.calls[0][0];
  expect(Object.keys(arg).sort()).toEqual([
    "artifactId",
    "decidedBy",
    "decision",
    "note",
    "projectId",
    "tenantId",
  ]);
  expect(arg).toEqual({
    tenantId: SESSION.tenantId,
    projectId: PROJECT,
    artifactId: ARTIFACT,
    decision: "rejected",
    decidedBy: SESSION.userId,
    note: "needs edits",
  });
});

it("validates auth and body shape before calling the service", async () => {
  const unauth = NextResponse.json({ error: "no" }, { status: 401 });
  mockRequireAuth.mockReturnValueOnce(unauth);
  const unauthReq = req();
  expect(await POST(unauthReq, PARAMS)).toBe(unauth);
  expect(unauthReq.json).not.toHaveBeenCalled();

  for (const body of [null, {}, { decision: "maybe" }, []]) {
    mockReview.mockClear();
    const res = await POST(req(body), PARAMS);
    expect(res.status).toBe(400);
    expect(mockReview).not.toHaveBeenCalled();
  }
});

it("maps service results without leaking unexpected errors", async () => {
  for (const [result, status] of [
    [{ status: "not_found" }, 404],
    [{ status: "artifact_not_found" }, 404],
    [{ status: "artifact_not_compliance_matrix", artifact: ARTIFACT_SUMMARY }, 409],
    [{ status: "artifact_not_reviewable", artifact: ARTIFACT_SUMMARY }, 409],
    [{ status: "approval_failed" }, 409],
    [{ status: "wrong_mode", project: { id: PROJECT, mode: "quick_bom" } }, 409],
  ] as const) {
    mockReview.mockResolvedValueOnce(result);
    expect((await POST(req(), PARAMS)).status).toBe(status);
  }

  const ok = await POST(req(), PARAMS);
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({
    approval: OK_RESULT.approval,
    artifactStatus: OK_RESULT.artifactStatus,
    stageStatus: OK_RESULT.stageStatus,
    artifact: ARTIFACT_SUMMARY,
  });

  mockReview.mockRejectedValueOnce(new Error("secret-stack"));
  const failed = await POST(req(), PARAMS);
  expect(failed.status).toBe(500);
  expect(JSON.stringify(await failed.json())).not.toContain("secret-stack");
});

it("maps approval-gate block statuses to 409 with stable codes and rowIds", async () => {
  const cases: Array<[Record<string, unknown>, string, string[] | undefined]> = [
    [{ status: "invalid_compliance_matrix_payload" }, "compliance_matrix_payload_invalid", undefined],
    [{ status: "no_active_rows" }, "compliance_matrix_no_active_rows", undefined],
    [
      { status: "rows_need_review", rowIds: ["RFP-COMP-002"] },
      "compliance_matrix_rows_need_review",
      ["RFP-COMP-002"],
    ],
    [
      { status: "rows_not_reviewed", rowIds: ["RFP-COMP-003"] },
      "compliance_matrix_rows_not_reviewed",
      ["RFP-COMP-003"],
    ],
    [
      { status: "not_applicable_reason_required", rowIds: ["RFP-COMP-004"] },
      "compliance_matrix_not_applicable_reason_required",
      ["RFP-COMP-004"],
    ],
    [
      { status: "removed_reason_required", rowIds: ["RFP-COMP-005"] },
      "compliance_matrix_removed_reason_required",
      ["RFP-COMP-005"],
    ],
  ];

  for (const [result, code, rowIds] of cases) {
    mockReview.mockReset().mockResolvedValueOnce(result);
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe(code);
    if (rowIds) {
      expect(json.rowIds).toEqual(rowIds);
    } else {
      expect(json.rowIds).toBeUndefined();
    }
  }
});

it("maps the Stage 5A configuration-gate blocks to 409 with stable codes", async () => {
  mockReview
    .mockReset()
    .mockResolvedValueOnce({ status: "missing_source_configuration" });
  let res = await POST(req(), PARAMS);
  expect(res.status).toBe(409);
  let json = await res.json();
  expect(json.code).toBe("compliance_matrix_source_configuration_missing");

  mockReview.mockReset().mockResolvedValueOnce({
    status: "configuration_gate_unsatisfied",
    gateStatus: "requires_boq_normalization",
    gateMessage:
      "BoQ must be normalized before configuration expansion can be approved.",
  });
  res = await POST(req(), PARAMS);
  expect(res.status).toBe(409);
  json = await res.json();
  expect(json.code).toBe("compliance_matrix_configuration_gate_unsatisfied");
  expect(json.gateStatus).toBe("requires_boq_normalization");
  expect(json.gateMessage).toBe(
    "BoQ must be normalized before configuration expansion can be approved."
  );

  mockReview.mockReset().mockResolvedValueOnce({
    status: "configuration_gate_mismatch",
    authorizedConfigurationExpansionArtifactId: "art-config-expansion-2",
  });
  res = await POST(req(), PARAMS);
  expect(res.status).toBe(409);
  json = await res.json();
  expect(json.code).toBe("compliance_matrix_configuration_gate_mismatch");
  expect(json.authorizedConfigurationExpansionArtifactId).toBe(
    "art-config-expansion-2"
  );
});

it("exports POST only and keeps route imports narrow", () => {
  expect(typeof routeModule.POST).toBe("function");
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
  }

  const source = readFileSync(
    join(
      process.cwd(),
      "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/review/route.ts"
    ),
    "utf8"
  );
  const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
  expect(froms).toEqual([
    "next/server",
    "@/lib/middleware/auth",
    "@/lib/projects/project-rfp-compliance-matrix-approval",
  ]);
  expect(source).not.toContain("createProjectArtifactVersion");
  expect(source).not.toContain("@anthropic-ai");
});
