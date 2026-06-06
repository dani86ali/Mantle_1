import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the workspace loader so the route's auth-gate and result-mapping
// are tested deterministically, independent of NODE_ENV or the DB.
const { mockRequireAuth, mockLoadWorkspace } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadWorkspace: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-quick-bom-workspace", () => ({
  loadProjectQuickBomWorkspace: mockLoadWorkspace,
}));

import { GET } from "@/app/api/projects/[id]/quick-bom/route";
import * as routeModule from "@/app/api/projects/[id]/quick-bom/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-1";
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
    tenantId: "11111111-1111-1111-1111-111111111111",
    name: "Honeywell Quick BoM",
    customerName: "Honeywell",
    mode: "quick_bom",
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
    steps: [],
    nextStepId: null,
    blockingStepId: null,
    canCreateSkuResolution: false,
    canCreateConfigurationExpansion: false,
    canCreatePricedBoq: false,
    canCreateExportPackage: false,
    isCustomerDeliverableReady: false,
    messages: ["Quick BoM is in progress."],
  },
};

function req(): NextRequest {
  return { headers: { get: () => null } } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadWorkspace
    .mockReset()
    .mockResolvedValue({ status: "ok", workspace: WORKSPACE });
});

describe("GET /api/projects/[id]/quick-bom - auth", () => {
  it("returns the requireAuth NextResponse directly and skips the loader when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const res = await GET(req(), { params: { id: PROJECT } });

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadWorkspace).not.toHaveBeenCalled();
  });

  it("uses requireAuth and passes session.tenantId plus the id param into the loader", async () => {
    await GET(req(), { params: { id: PROJECT } });

    expect(mockRequireAuth).toHaveBeenCalledTimes(1);
    expect(mockLoadWorkspace).toHaveBeenCalledWith(SESSION.tenantId, PROJECT);
  });
});

describe("GET /api/projects/[id]/quick-bom - result mapping", () => {
  it("maps not_found to 404 with code project_not_found", async () => {
    mockLoadWorkspace.mockResolvedValue({ status: "not_found" });

    const res = await GET(req(), { params: { id: "missing" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 with code wrong_project_mode and the project summary", async () => {
    const project = {
      id: PROJECT,
      tenantId: "11111111-1111-1111-1111-111111111111",
      name: "RFP Bid",
      mode: "rfp",
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
    mockLoadWorkspace.mockResolvedValue({ status: "wrong_mode", project });

    const res = await GET(req(), { params: { id: PROJECT } });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(project);
  });

  it("maps ok to 200 with the workspace", async () => {
    const res = await GET(req(), { params: { id: PROJECT } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspace).toEqual(WORKSPACE);
  });
});

describe("GET /api/projects/[id]/quick-bom - loader failure", () => {
  it("maps an unexpected loader error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadWorkspace.mockRejectedValue(new Error(secret));

    const res = await GET(req(), { params: { id: PROJECT } });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("project_quick_bom_workspace_failed");
    expect(body.error).toBe("Unable to load Quick BoM workspace.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET /api/projects/[id]/quick-bom - route surface", () => {
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
    "src/app/api/projects/[id]/quick-bom/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-quick-bom-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the workspace loader", () => {
    const froms = Array.from(
      source.matchAll(/from\s+"([^"]+)"/g),
      (m) => m[1]
    );
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-quick-bom-workspace",
    ]);
  });

  it("does not import DB, mutation, pricing, export, runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/adapters',
      'from "@/lib/agent',
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
