import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the RFP BoQ pricing wrapper service so the route's auth-gate,
// tenant/param authority, body-ignoring, and result-mapping are tested independent of
// the DB and the lower-level pricing service.
const { mockRequireAuth, mockCreatePricedBoq } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCreatePricedBoq: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-boq-pricing", () => ({
  createProjectRfpBoqPricedBoq: mockCreatePricedBoq,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/priced-boq/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/priced-boq/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-1";
const ARTIFACT_ID = "art-ce-7";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const ARTIFACT_SUMMARY = {
  id: "art-pb-1",
  projectId: PROJECT,
  stageId: "boq_pricing_review",
  type: "priced_boq",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-1"],
  sourceArtifactIds: [ARTIFACT_ID],
  createdAt: "2026-05-21T09:00:00.000Z",
  updatedAt: "2026-05-21T09:30:00.000Z",
};

const PRICING_SUMMARY = {
  inputLineCount: 2,
  pricedLineCount: 1,
  unpricedLineCount: 1,
  missingDecisionCount: 0,
  notAcceptedCount: 0,
  missingPriceCount: 1,
  totals: {
    currency: "SAR",
    lineCount: 1,
    subtotalListPriceSar: 200,
    subtotalSellPriceSar: 240,
    vatAmountSar: 36,
    totalIncVatSar: 276,
  },
};

const PAYLOAD_SUMMARY = {
  sourceConfigurationExpansionArtifactId: ARTIFACT_ID,
  sourceConfigurationExpansionArtifactVersion: 3,
  sourceNormalizedBoqArtifactId: "art-nb-7",
  sourceNormalizedBoqArtifactVersion: 5,
  sourceSkuResolutionArtifactId: "art-skur-3",
  sourceSkuResolutionArtifactVersion: 2,
  sourceFileIds: ["file-1"],
  pricingConfig: {
    currency: "SAR",
    mode: "markup",
    ratePercent: 20,
    vatRatePercent: 15,
    roundingDecimals: 2,
  },
  pricingSource: {
    source: "honeywell_mvp_demo_pricing_fixture",
    scope: "honeywell_mvp_demo_only",
    currency: "SAR",
    demoFixtureAuthority: true,
    productionPricingAuthority: false,
    runtimeAiPricing: false,
    runtimeCatalogLookup: false,
    replacementAuthority: false,
    silentSkuSubstitution: false,
  },
  pricingAuthority: {
    profileId: "honeywell-mvp-demo-pricing-authority-profile",
    scope: "honeywell_mvp_demo_only",
    approvalRecordId: "prompt-119-user-approved-honeywell-demo-pricing-authority",
    activeSource: "committed_honeywell_demo_pricing_fixture",
    activeSourceFixtureId: "honeywell-mvp-demo-pricing-fixture",
    activeSourceStatus: "approved_demo_fixture",
    activeSourceWorkbookPath: "C:/Pre-Sales/Benchmarck_Files/Estimate_NB167337237YA.xlsx",
    activeSourceSheetName: "EstimateDetails_NB167337237YA",
    currency: "SAR",
    pricedSkuCount: 50,
    missingPriceSkuCount: 0,
    boundary: {
      deterministicPricingAuthority: true,
      demoFixtureAuthority: true,
      currentLocalGplSarCsvTemporarilyApproved: true,
      activeRuntimeSourceReadsExternalGplCsv: false,
      productionCiscoPricingAuthority: false,
      broadCiscoGeneralPricingAuthority: false,
      runtimeAiPricing: false,
      runtimeCatalogLookup: false,
      configurationAuthority: false,
      replacementAuthority: false,
      skuSubstitutionAuthority: false,
      silentSkuSubstitution: false,
      missingPricesReported: true,
    },
  },
  lineCount: 2,
  summary: PRICING_SUMMARY,
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Quick BoM Project",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

// The route ignores the body; the mock seeds json/formData spies with decoy
// pricing/authority fields so a test can prove neither is read.
function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() =>
      Promise.resolve({
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        artifactId: "attacker-artifact",
        configurationExpansionArtifactId: "attacker-artifact",
        pricingConfig: { currency: "USD", mode: "margin", ratePercent: 99 },
        unitListPriceSarBySku: { HACK: { currency: "USD", unitListPriceSar: 1 } },
        decidedBy: "attacker",
      })
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockCreatePricedBoq.mockReset().mockResolvedValue({
    status: "ok",
    artifact: ARTIFACT_SUMMARY,
    payloadSummary: PAYLOAD_SUMMARY,
    pricingSummary: PRICING_SUMMARY,
  });
});

describe("POST .../rfp/.../priced-boq - auth", () => {
  it("returns the requireAuth response and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockCreatePricedBoq).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("POST .../rfp/.../priced-boq - tenant/param authority", () => {
  it("uses session.tenantId plus route params only and never reads the request body", async () => {
    const request = req();

    await POST(request, PARAMS);

    expect(mockCreatePricedBoq).toHaveBeenCalledTimes(1);
    expect(mockCreatePricedBoq).toHaveBeenCalledWith({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
      configurationExpansionArtifactId: ARTIFACT_ID,
    });

    const arg = mockCreatePricedBoq.mock.calls[0][0];
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.configurationExpansionArtifactId).not.toBe("attacker-artifact");
    // No body-supplied pricing authority ever reaches the service.
    expect("pricingConfig" in arg).toBe(false);
    expect("unitListPriceSarBySku" in arg).toBe(false);
    expect("approver" in arg).toBe(false);
    expect("decidedBy" in arg).toBe(false);

    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("POST .../rfp/.../priced-boq - result mapping", () => {
  const SIMPLE: Array<[Record<string, unknown>, number, string]> = [
    [{ status: "not_found" }, 404, "project_not_found"],
    [{ status: "pricing_config_missing" }, 409, "project_pricing_config_missing"],
    [{ status: "configuration_expansion_not_found" }, 404, "configuration_expansion_artifact_not_found"],
    [{ status: "artifact_not_configuration_expansion" }, 409, "artifact_not_configuration_expansion"],
    [{ status: "invalid_configuration_expansion_payload" }, 409, "invalid_configuration_expansion_payload"],
    [{ status: "configuration_expansion_not_approved" }, 409, "configuration_expansion_artifact_not_approved"],
    [{ status: "rule_pack_not_approved" }, 409, "configuration_expansion_rule_pack_not_approved"],
    [{ status: "invalid_project_pricing_config" }, 409, "invalid_project_pricing_config"],
    [{ status: "invalid_demo_pricing_fixture" }, 500, "invalid_demo_pricing_fixture"],
  ];

  it.each(SIMPLE)("maps %o to the right HTTP status and code", async (result, httpStatus, code) => {
    mockCreatePricedBoq.mockResolvedValue(result);

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(httpStatus);
    expect((await res.json()).code).toBe(code);
  });

  it("maps wrong_mode to 409 wrong_project_mode with the RFP message and project summary", async () => {
    mockCreatePricedBoq.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps ok to 200 with { artifact, payloadSummary, pricingSummary } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
      pricingSummary: PRICING_SUMMARY,
    });
    expect("status" in body).toBe(false);
  });
});

describe("POST .../rfp/.../priced-boq - service failure", () => {
  it("maps an unexpected service error to a controlled 500 distinct from the demo-fixture 500, without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreatePricedBoq.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_boq_pricing_failed");
    expect(body.code).not.toBe("invalid_demo_pricing_fixture");
    expect(body.error).toBe("Unable to create RFP priced BoQ.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../rfp/.../priced-boq - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/priced-boq/route.ts"
  );
  const TEST_PATH = join(process.cwd(), "tests/api/project-rfp-boq-pricing-route.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the RFP pricing wrapper service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-boq-pricing",
    ]);
  });

  it("does not import DB, mutation helpers, the pricing core/service/helpers, priced-boq artifact, config-expansion, export, runner, Quick BoM, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/project-boq-pricing-core"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/honeywell',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/project-quick-bom',
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
