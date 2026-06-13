import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the configuration-expansion draft wrapper service so the route's
// auth-gate, tenant/param authority, body-ignoring, and result-mapping are tested
// independent of the DB and the lower-level service.
const { mockRequireAuth, mockCreateDraft } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCreateDraft: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-config-expansion-draft", () => ({
  createProjectRfpConfigurationExpansionDraft: mockCreateDraft,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/configuration-expansion/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/configuration-expansion/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-1";
const ARTIFACT_ID = "art-skur-1";
const NORM_ID = "art-nb-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const ARTIFACT_SUMMARY = {
  id: "art-cfg-1",
  projectId: PROJECT,
  stageId: "configuration_expansion_review",
  type: "configuration_expansion",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-norm", "file-sku"],
  sourceArtifactIds: [NORM_ID, ARTIFACT_ID],
  createdAt: "2026-05-21T09:00:00.000Z",
  updatedAt: "2026-05-21T09:30:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "configuration_expansion_draft",
  sourceNormalizedBoqArtifactId: NORM_ID,
  sourceNormalizedBoqArtifactVersion: 3,
  sourceSkuResolutionArtifactId: ARTIFACT_ID,
  sourceSkuResolutionArtifactVersion: 2,
  sourceFileIds: ["file-norm", "file-sku"],
  rulePackId: "honeywell-mvp-composed-batch1-batch2-batch3",
  rulePackVersion: "1.0.0",
  rulePackStatus: "approved",
  rulePackSourceScope: "Honeywell MVP / Batch 1 + Batch 2 + Batch 3 (composed)",
  lineCount: 5,
  summary: {
    customerLineCount: 1,
    addedLineCount: 4,
    totalLineCount: 5,
    requiresReviewCount: 4,
    includedItemCount: 1,
  },
};

const SKU_ARTIFACT_SUMMARY = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "sku_resolution",
  type: "sku_resolution",
  status: "needs_review",
  version: 2,
  sourceFileIds: ["file-sku"],
  sourceArtifactIds: [NORM_ID],
  createdAt: "2026-05-21T08:00:00.000Z",
  updatedAt: "2026-05-21T08:30:00.000Z",
};

const NORM_ARTIFACT_SUMMARY = {
  id: NORM_ID,
  projectId: PROJECT,
  stageId: "boq_format_validation",
  type: "normalized_boq",
  status: "stale",
  version: 4,
  sourceFileIds: ["file-norm"],
  sourceArtifactIds: [],
  createdAt: "2026-05-20T08:00:00.000Z",
  updatedAt: "2026-05-20T08:30:00.000Z",
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Quick BoM Bid",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

// The route ignores the body; the mock exposes json/formData spies seeded with
// decoy tenant/project/artifact fields so a test can prove neither is read.
function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() =>
      Promise.resolve({
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        artifactId: "attacker-artifact",
        skuResolutionArtifactId: "attacker-artifact",
      })
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockCreateDraft.mockReset().mockResolvedValue({
    status: "ok",
    artifact: ARTIFACT_SUMMARY,
    payloadSummary: PAYLOAD_SUMMARY,
  });
});

describe("POST .../rfp/artifacts/[artifactId]/configuration-expansion - auth", () => {
  it("returns the requireAuth response and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const res = await POST(req(), PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });
});

describe("POST .../rfp/artifacts/[artifactId]/configuration-expansion - tenant/param authority", () => {
  it("uses session.tenantId plus route params only and never reads the request body", async () => {
    const request = req();

    await POST(request, PARAMS);

    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    expect(mockCreateDraft).toHaveBeenCalledWith({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
      skuResolutionArtifactId: ARTIFACT_ID,
    });

    const arg = mockCreateDraft.mock.calls[0][0];
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.skuResolutionArtifactId).not.toBe("attacker-artifact");

    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("POST .../rfp/artifacts/[artifactId]/configuration-expansion - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockCreateDraft.mockResolvedValue({ status: "not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode and includes the project summary", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps sku_resolution_not_found to 404 sku_resolution_artifact_not_found", async () => {
    mockCreateDraft.mockResolvedValue({ status: "sku_resolution_not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("sku_resolution_artifact_not_found");
  });

  it("maps artifact_not_sku_resolution to 409 with the source artifact", async () => {
    const artifact = { ...SKU_ARTIFACT_SUMMARY, type: "priced_boq" };
    mockCreateDraft.mockResolvedValue({
      status: "artifact_not_sku_resolution",
      artifact,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_sku_resolution");
    expect(body.artifact).toEqual(artifact);
  });

  it("maps sku_resolution_not_approved to 409 sku_resolution_artifact_not_approved with the artifact", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "sku_resolution_not_approved",
      artifact: SKU_ARTIFACT_SUMMARY,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("sku_resolution_artifact_not_approved");
    expect(body.artifact).toEqual(SKU_ARTIFACT_SUMMARY);
  });

  it("maps invalid_sku_resolution_payload to 409 invalid_sku_resolution_payload", async () => {
    mockCreateDraft.mockResolvedValue({ status: "invalid_sku_resolution_payload" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("invalid_sku_resolution_payload");
  });

  it("maps normalized_boq_not_found to 404 normalized_boq_artifact_not_found", async () => {
    mockCreateDraft.mockResolvedValue({ status: "normalized_boq_not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("normalized_boq_artifact_not_found");
  });

  it("maps artifact_not_normalized_boq to 409 with the artifact", async () => {
    const artifact = { ...NORM_ARTIFACT_SUMMARY, type: "priced_boq" };
    mockCreateDraft.mockResolvedValue({
      status: "artifact_not_normalized_boq",
      artifact,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_normalized_boq");
    expect(body.artifact).toEqual(artifact);
  });

  it("maps normalized_boq_version_mismatch to 409 normalized_boq_artifact_version_mismatch with the artifact", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "normalized_boq_version_mismatch",
      artifact: NORM_ARTIFACT_SUMMARY,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("normalized_boq_artifact_version_mismatch");
    expect(body.artifact).toEqual(NORM_ARTIFACT_SUMMARY);
  });

  it("maps normalized_boq_not_ready to 409 normalized_boq_artifact_not_ready", async () => {
    mockCreateDraft.mockResolvedValue({ status: "normalized_boq_not_ready" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("normalized_boq_artifact_not_ready");
  });

  it("maps invalid_normalized_boq_payload to 409 invalid_normalized_boq_payload", async () => {
    mockCreateDraft.mockResolvedValue({ status: "invalid_normalized_boq_payload" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("invalid_normalized_boq_payload");
  });

  it("maps ok to 201 with { artifact, payloadSummary } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
    });
    expect("status" in body).toBe(false);
  });
});

describe("POST .../rfp/artifacts/[artifactId]/configuration-expansion - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreateDraft.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_configuration_expansion_draft_failed");
    expect(body.error).toBe(
      "Unable to create RFP configuration expansion draft."
    );
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../rfp/artifacts/[artifactId]/configuration-expansion - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/configuration-expansion/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-config-expansion-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the draft wrapper service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-config-expansion-draft",
    ]);
  });

  it("does not import DB, stores, the builder, the reviewed-expansion service, pricing, export, runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/config-expansion"',
      'from "@/lib/projects/config-expansion-artifact"',
      'from "@/lib/projects/config-expansion-review"',
      'from "@/lib/projects/honeywell',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
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
      "@google/generative-ai",
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
