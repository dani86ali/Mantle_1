import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the RFP BoQ workspace loader so the route's auth-gate and
// result-mapping are tested deterministically, independent of NODE_ENV or the DB.
const { mockRequireAuth, mockLoadWorkspace } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadWorkspace: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-boq-workspace", () => ({
  loadProjectRfpBoqWorkspace: mockLoadWorkspace,
}));

import { GET } from "@/app/api/projects/[id]/rfp/boq/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/boq/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const SESSION = {
  userId: "u1",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const WORKSPACE = {
  project: {
    id: PROJECT,
    name: "Nesma RFP Bid",
    customerName: "Nesma",
    mode: "rfp",
    pricingConfig: {
      currency: "SAR",
      mode: "margin",
      ratePercent: 30,
      vatRatePercent: 15,
      roundingDecimals: 2,
    },
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-02T11:30:00.000Z",
  },
  stages: [],
  boqFiles: [],
  artifacts: [],
  spineArtifacts: {
    normalized_boq: null,
    sku_resolution: null,
    configuration_expansion: null,
    priced_boq: null,
    export_package: null,
  },
  approvals: [],
  readiness: {
    projectId: PROJECT,
    boqFileCount: 0,
    boqFiles: [],
    hasBoqFiles: false,
    normalizationCandidateFileIds: [],
    quickBomReadiness: { projectId: PROJECT, status: "no_boq" },
    canNormalizeBoq: false,
    canCreateSkuResolution: false,
    canCreateConfigurationExpansion: false,
    canCreatePricedBoq: false,
    canCreateExportPackage: false,
    isCustomerDeliverableReady: false,
    status: "no_boq_file",
    messages: ["Upload a BoQ file to begin the RFP BoQ lane."],
  },
};

// A wrong-mode project summary: a non-RFP project the loader rejects with 409.
const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  customerName: "Honeywell",
  mode: "quick_bom",
  pricingConfig: {
    currency: "SAR",
    mode: "markup",
    ratePercent: 20,
    vatRatePercent: 15,
    roundingDecimals: 2,
  },
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

// Request double with body/query accessors instrumented so a test can prove the
// route NEVER reads the request body or query string - all authority is the
// session tenant and the route param, never caller-supplied input.
interface ReqProbe {
  json: ReturnType<typeof vi.fn>;
  formData: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
  arrayBuffer: ReturnType<typeof vi.fn>;
  searchParamsGet: ReturnType<typeof vi.fn>;
  urlReads: number;
  nextUrlReads: number;
}

function makeReq(): { request: NextRequest; probe: ReqProbe } {
  const probe: ReqProbe = {
    json: vi.fn(() => Promise.reject(new Error("body read"))),
    formData: vi.fn(() => Promise.reject(new Error("body read"))),
    text: vi.fn(() => Promise.reject(new Error("body read"))),
    arrayBuffer: vi.fn(() => Promise.reject(new Error("body read"))),
    searchParamsGet: vi.fn(() => null),
    urlReads: 0,
    nextUrlReads: 0,
  };
  const base: Record<string, unknown> = {
    headers: { get: () => null },
    json: probe.json,
    formData: probe.formData,
    text: probe.text,
    arrayBuffer: probe.arrayBuffer,
  };
  Object.defineProperty(base, "url", {
    get: function () {
      probe.urlReads += 1;
      return "http://localhost/api/projects/proj-rfp-1/rfp/boq?inject=evil";
    },
  });
  Object.defineProperty(base, "nextUrl", {
    get: function () {
      probe.nextUrlReads += 1;
      return { searchParams: { get: probe.searchParamsGet } };
    },
  });
  return { request: base as unknown as NextRequest, probe };
}

function expectNoBodyOrQueryReads(probe: ReqProbe): void {
  expect(probe.json).not.toHaveBeenCalled();
  expect(probe.formData).not.toHaveBeenCalled();
  expect(probe.text).not.toHaveBeenCalled();
  expect(probe.arrayBuffer).not.toHaveBeenCalled();
  expect(probe.searchParamsGet).not.toHaveBeenCalled();
  expect(probe.urlReads).toBe(0);
  expect(probe.nextUrlReads).toBe(0);
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadWorkspace
    .mockReset()
    .mockResolvedValue({ status: "ok", workspace: WORKSPACE });
});

describe("GET /api/projects/[id]/rfp/boq - auth", () => {
  it("returns the requireAuth NextResponse directly and skips the loader and body/query reads when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const { request, probe } = makeReq();
    const res = await GET(request, { params: { id: PROJECT } });

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadWorkspace).not.toHaveBeenCalled();
    expectNoBodyOrQueryReads(probe);
  });
});

describe("GET /api/projects/[id]/rfp/boq - authority", () => {
  it("passes session.tenantId plus the id param into the loader and reads no body or query", async () => {
    const { request, probe } = makeReq();
    await GET(request, { params: { id: PROJECT } });

    expect(mockRequireAuth).toHaveBeenCalledTimes(1);
    expect(mockRequireAuth.mock.calls[0][0]).toBe(request);
    expect(mockLoadWorkspace).toHaveBeenCalledTimes(1);
    expect(mockLoadWorkspace).toHaveBeenCalledWith(SESSION.tenantId, PROJECT);
    expectNoBodyOrQueryReads(probe);
  });

  it("forwards the exact route param as the project id without deriving it from the request URL", async () => {
    const { request, probe } = makeReq();
    await GET(request, { params: { id: "another-rfp-project" } });

    expect(mockLoadWorkspace).toHaveBeenCalledWith(
      SESSION.tenantId,
      "another-rfp-project"
    );
    expectNoBodyOrQueryReads(probe);
  });
});

describe("GET /api/projects/[id]/rfp/boq - result mapping", () => {
  it("maps not_found to 404 with code project_not_found", async () => {
    mockLoadWorkspace.mockResolvedValue({ status: "not_found" });

    const { request } = makeReq();
    const res = await GET(request, { params: { id: "missing" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("project_not_found");
    expect(body.error).toBe("Project not found.");
  });

  it("maps wrong_mode to 409 with code wrong_project_mode, the RFP message, and the project summary", async () => {
    mockLoadWorkspace.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const { request } = makeReq();
    const res = await GET(request, { params: { id: PROJECT } });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps ok to 200 with the workspace and no status discriminator", async () => {
    const { request } = makeReq();
    const res = await GET(request, { params: { id: PROJECT } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ workspace: WORKSPACE });
    expect("status" in body).toBe(false);
  });
});

describe("GET /api/projects/[id]/rfp/boq - loader failure", () => {
  it("maps an unexpected loader error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadWorkspace.mockRejectedValue(new Error(secret));

    const { request } = makeReq();
    const res = await GET(request, { params: { id: PROJECT } });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("project_rfp_boq_workspace_failed");
    expect(body.error).toBe("Unable to load RFP BoQ workspace.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET /api/projects/[id]/rfp/boq - route surface", () => {
  it("exports GET only; POST, PATCH, PUT, DELETE are undefined", () => {
    expect(typeof routeModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/boq/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-boq-workspace-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the RFP BoQ workspace loader", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-boq-workspace",
    ]);
  });

  it("does not import DB, stores, shared BoQ cores, Quick BoM route/service, pricing, export, config-expansion, fixtures, runner, AI/LLM, catalog, engine, coordinator, adapter, or artifact/approval-creation modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/project-boq-',
      'from "@/lib/projects/project-quick-bom',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/rfp-runner"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/honeywell',
      'from "@/lib/projects/mantle',
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

  it("never reads the request body or query string", () => {
    for (const forbidden of [
      "request.json",
      "request.formData",
      "request.text",
      "request.arrayBuffer",
      "request.body",
      "request.url",
      "request.nextUrl",
      "nextUrl",
      "searchParams",
      ".formData(",
      ".arrayBuffer(",
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
