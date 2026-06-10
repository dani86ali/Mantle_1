import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the creation service so the route's auth-gate, body validation,
// and result-mapping are tested deterministically, independent of the DB.
const { mockRequireAuth, mockCreate } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-quick-bom-creation", () => ({
  createQuickBomProject: mockCreate,
}));

import { POST } from "@/app/api/projects/quick-bom/route";
import * as routeModule from "@/app/api/projects/quick-bom/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const OK_RESULT = {
  status: "ok",
  project: {
    id: "proj-1",
    tenantId: SESSION.tenantId,
    name: "Honeywell Refresh",
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
  stages: [
    {
      id: "stage-boq_format_validation",
      stageId: "boq_format_validation",
      order: 10,
      status: "not_started",
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-06-02T11:30:00.000Z",
    },
  ],
};

function req(body: unknown, opts: { invalidJson?: boolean } = {}): NextRequest {
  return {
    headers: { get: () => null },
    json: opts.invalidJson
      ? () => Promise.reject(new Error("bad json"))
      : () => Promise.resolve(body),
  } as unknown as NextRequest;
}

function validBody(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    name: "Honeywell Refresh",
    customerName: "Honeywell",
    pricingConfig: {
      mode: "margin",
      ratePercent: 30,
      vatRatePercent: 15,
      roundingDecimals: 2,
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockCreate.mockReset().mockResolvedValue(OK_RESULT);
});

describe("POST /api/projects/quick-bom - auth", () => {
  it("returns the requireAuth NextResponse directly and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const res = await POST(req(validBody()));

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects/quick-bom - body validation", () => {
  it("returns 400 for invalid JSON without calling the service", async () => {
    const res = await POST(req(undefined, { invalidJson: true }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_quick_bom_project_create_request");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid bodies without calling the service", async () => {
    const badBodies: unknown[] = [
      null,
      "string-body",
      42,
      {},
      { name: 123, pricingConfig: { mode: "margin", ratePercent: 10 } },
      { name: "X" },
      { name: "X", pricingConfig: null },
      { name: "X", pricingConfig: {} },
      { name: "X", pricingConfig: { mode: "bad", ratePercent: 10 } },
      { name: "X", pricingConfig: { mode: "margin" } },
      { name: "X", pricingConfig: { mode: "margin", ratePercent: "10" } },
      { name: "X", pricingConfig: { mode: "margin", ratePercent: NaN } },
      {
        name: "X",
        customerName: 5,
        pricingConfig: { mode: "margin", ratePercent: 10 },
      },
      {
        name: "X",
        pricingConfig: { mode: "margin", ratePercent: 10, vatRatePercent: "x" },
      },
      {
        name: "X",
        pricingConfig: {
          mode: "margin",
          ratePercent: 10,
          roundingDecimals: "x",
        },
      },
    ];
    for (const body of badBodies) {
      mockCreate.mockClear();
      const res = await POST(req(body));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("invalid_quick_bom_project_create_request");
      expect(mockCreate).not.toHaveBeenCalled();
    }
  });
});

describe("POST /api/projects/quick-bom - tenant authority", () => {
  it("ignores body tenantId, mode, createdBy, and decidedBy and passes session.tenantId only", async () => {
    await POST(
      req(
        validBody({
          tenantId: "attacker-tenant",
          mode: "rfp",
          createdBy: "attacker",
          decidedBy: "attacker",
        })
      )
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0];
    expect(arg).toEqual({
      tenantId: SESSION.tenantId,
      name: "Honeywell Refresh",
      customerName: "Honeywell",
      pricingConfig: {
        mode: "margin",
        ratePercent: 30,
        vatRatePercent: 15,
        roundingDecimals: 2,
      },
    });
    expect(arg.tenantId).toBe(SESSION.tenantId);
    for (const key of ["mode", "createdBy", "decidedBy"]) {
      expect(key in arg).toBe(false);
    }
  });
});

describe("POST /api/projects/quick-bom - result mapping", () => {
  it("maps ok to 201 with project and stages and no status discriminator", async () => {
    const res = await POST(req(validBody()));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      project: OK_RESULT.project,
      stages: OK_RESULT.stages,
    });
    expect("status" in body).toBe(false);
  });

  it("maps service invalid_input to 400 with the service code and error", async () => {
    mockCreate.mockResolvedValue({
      status: "invalid_input",
      code: "project_name_required",
      error: "Project name is required.",
    });

    const res = await POST(req(validBody()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("project_name_required");
    expect(body.error).toBe("Project name is required.");
  });

  it("maps a service duplicate_project_name result to 400 with the service code and error (QBM-LOG-001)", async () => {
    const message =
      "Duplicate Project Name. Test #1 already exists in your projects.";
    mockCreate.mockResolvedValue({
      status: "invalid_input",
      code: "duplicate_project_name",
      error: message,
    });

    const res = await POST(req(validBody()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("duplicate_project_name");
    expect(body.error).toBe(message);
    // No internal details beyond the controlled code/error are exposed.
    expect(Object.keys(body).sort()).toEqual(["code", "error"]);
  });

  it("maps a service invalid_pricing_config result to 400 with the service code and error", async () => {
    const guardMessage =
      "Margin ratePercent must be a finite number from 0 up to, but not including, 100.";
    mockCreate.mockResolvedValue({
      status: "invalid_input",
      code: "invalid_pricing_config",
      error: guardMessage,
    });

    const res = await POST(req(validBody()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_pricing_config");
    expect(body.error).toBe(guardMessage);
  });
});

describe("POST /api/projects/quick-bom - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown message", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreate.mockRejectedValue(new Error(secret));

    const res = await POST(req(validBody()));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("quick_bom_project_create_failed");
    expect(body.error).toBe("Unable to create Quick BoM project.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST /api/projects/quick-bom - route surface", () => {
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
    "src/app/api/projects/quick-bom/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-quick-bom-create-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the creation service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-quick-bom-creation",
    ]);
  });

  it("does not import DB, mutation, pricing execution, export, runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/pricing"',
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
