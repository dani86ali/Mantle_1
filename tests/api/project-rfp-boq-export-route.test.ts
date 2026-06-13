import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the RFP BoQ export wrapper service so the route's auth-gate,
// tenant/param authority, body-ignoring, and result-mapping are tested independent of
// the DB and the lower-level shared export-package core.
const { mockRequireAuth, mockCreateExport } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCreateExport: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-boq-export", () => ({
  createProjectRfpBoqExportPackage: mockCreateExport,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/export-package/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/export-package/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT_ID = "art-pb-rfp-7";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const ARTIFACT_SUMMARY = {
  id: "art-ep-rfp-1",
  projectId: PROJECT,
  stageId: "export_approval",
  type: "export_package",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-1"],
  sourceArtifactIds: [ARTIFACT_ID],
  createdAt: "2026-05-21T10:00:00.000Z",
  updatedAt: "2026-05-21T10:30:00.000Z",
};

const TOTALS = {
  totalPriceSar: 1000,
  productTotalSar: 600,
  serviceTotalSar: 300,
  subscriptionTotalSar: 100,
  vatAmountSar: 150,
  totalIncVatSar: 1150,
  pricedLineCount: 3,
  unpricedLineCount: 1,
  missingDecisionCount: 0,
  notAcceptedCount: 1,
  missingPriceCount: 0,
};

const CATEGORY_SOURCE = {
  source: "honeywell_mvp_demo_mantle_category_fixture",
  scope: "honeywell_mvp_demo_only",
  demoFixtureAuthority: true,
  productionPricingAuthority: false,
  configurationAuthority: false,
  runtimeAi: false,
  runtimeCatalogLookup: false,
  replacementAuthority: false,
  silentSkuSubstitution: false,
};

const PAYLOAD_SUMMARY = {
  exportType: "mantle_price_estimate_workbook",
  sourcePricedBoqArtifactId: ARTIFACT_ID,
  sourcePricedBoqArtifactVersion: 4,
  sourceConfigurationExpansionArtifactId: "art-ce-7",
  sourceConfigurationExpansionArtifactVersion: 3,
  sourceNormalizedBoqArtifactId: "art-nb-7",
  sourceNormalizedBoqArtifactVersion: 5,
  sourceSkuResolutionArtifactId: "art-skur-3",
  sourceSkuResolutionArtifactVersion: 2,
  sourceFileIds: ["file-1"],
  workbookFilePath: "C:/Pre-Sales/out/written-mantle.xlsx",
  rowCount: 3,
  totals: TOTALS,
  warnings: ["demo-export-warning-1"],
  categorySource: CATEGORY_SOURCE,
};

const EXPORT_SUMMARY = {
  rowCount: 3,
  totals: TOTALS,
  warnings: ["demo-export-warning-1"],
  workbookFilePath: "C:/Pre-Sales/out/written-mantle.xlsx",
};

// A non-rfp (quick_bom) project drives the wrong_mode branch and the RFP message.
const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

// The route ignores the body; the mock seeds json/formData/text spies with decoy
// authority/path/category fields so a test can prove none is read.
function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() =>
      Promise.resolve({
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        artifactId: "attacker-artifact",
        pricedBoqArtifactId: "attacker-artifact",
        outputPath: "C:/attacker/evil.xlsx",
        filePath: "C:/attacker/also-evil.xlsx",
        categoryByAcceptedSku: { HACK: "subscription" },
        pricingConfig: { currency: "SAR" },
        approvedBy: "attacker-approver",
        status: "approved",
        decidedBy: "attacker",
      })
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
    text: vi.fn(() => Promise.resolve("tenantId=attacker-tenant")),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockCreateExport.mockReset().mockResolvedValue({
    status: "ok",
    artifact: ARTIFACT_SUMMARY,
    payloadSummary: PAYLOAD_SUMMARY,
    exportSummary: EXPORT_SUMMARY,
  });
});

describe("POST .../rfp/.../export-package - auth", () => {
  it("returns the requireAuth response and skips the service and body reads when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockCreateExport).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(request.text).not.toHaveBeenCalled();
  });
});

describe("POST .../rfp/.../export-package - tenant/param authority", () => {
  it("uses session.tenantId plus route params only and never reads the request body", async () => {
    const request = req();

    await POST(request, PARAMS);

    expect(mockCreateExport).toHaveBeenCalledTimes(1);
    expect(mockCreateExport).toHaveBeenCalledWith({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
      pricedBoqArtifactId: ARTIFACT_ID,
    });

    const arg = mockCreateExport.mock.calls[0][0];
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.pricedBoqArtifactId).not.toBe("attacker-artifact");
    // No body-supplied path/category/pricing/approval authority reaches the service.
    for (const leaked of [
      "outputPath",
      "filePath",
      "categoryByAcceptedSku",
      "pricingConfig",
      "approvedBy",
      "status",
      "decidedBy",
    ]) {
      expect(leaked in arg).toBe(false);
    }

    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(request.text).not.toHaveBeenCalled();
  });
});

describe("POST .../rfp/.../export-package - result mapping", () => {
  const SIMPLE: Array<[Record<string, unknown>, number, string]> = [
    [{ status: "not_found" }, 404, "project_not_found"],
    [{ status: "priced_boq_not_found" }, 404, "priced_boq_artifact_not_found"],
    [{ status: "artifact_not_priced_boq" }, 409, "artifact_not_priced_boq"],
    [{ status: "priced_boq_not_approved" }, 409, "priced_boq_artifact_not_approved"],
    [{ status: "invalid_priced_boq_payload" }, 409, "invalid_priced_boq_payload"],
    [{ status: "export_workbook_failed" }, 500, "export_workbook_failed"],
  ];

  it.each(SIMPLE)("maps %o to the right HTTP status and code", async (result, httpStatus, code) => {
    mockCreateExport.mockResolvedValue(result);

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(httpStatus);
    const body = await res.json();
    expect(body.code).toBe(code);
    // Every error body carries a human-readable error string and never leaks the
    // internal status discriminator the route maps from (mirrors the ok-body check).
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect("status" in body).toBe(false);
  });

  it("maps wrong_mode to 409 wrong_project_mode with the RFP message and the project summary", async () => {
    mockCreateExport.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps ok to 200 with { artifact, payloadSummary, exportSummary } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
      exportSummary: EXPORT_SUMMARY,
    });
    expect("status" in body).toBe(false);
  });
});

describe("POST .../rfp/.../export-package - service failure", () => {
  it("maps an unexpected service error to a controlled 500 distinct from the workbook 500, without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreateExport.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_boq_export_package_failed");
    expect(body.code).not.toBe("export_workbook_failed");
    expect(body.error).toBe("Unable to create RFP BoQ export package.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../rfp/.../export-package - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/export-package/route.ts"
  );
  const TEST_PATH = join(process.cwd(), "tests/api/project-rfp-boq-export-route.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the RFP export wrapper service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-boq-export",
    ]);
  });

  it("does not import DB, stores, the export core/helpers, mantle/fixture, runner, quick-bom lane, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/honeywell',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/project-boq-export-core',
      'from "@/lib/projects/project-quick-bom',
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

  it("does not read the request body or query (no json/formData/text/arrayBuffer/searchParams)", () => {
    expect(source).not.toContain("request.json");
    expect(source).not.toContain("request.formData");
    expect(source).not.toContain("request.text");
    expect(source).not.toContain(".json()");
    expect(source).not.toContain(".formData()");
    expect(source).not.toContain(".text()");
    expect(source).not.toContain(".arrayBuffer(");
    expect(source).not.toContain("searchParams");
    expect(source).not.toContain("nextUrl");
    expect(source).not.toContain("request.url");
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
