import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockRequireAuth, mockListProjectSummaries } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockListProjectSummaries: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/db/project-store", () => ({
  listProjectSummaries: mockListProjectSummaries,
}));

import { GET } from "@/app/api/projects/route";
import * as routeModule from "@/app/api/projects/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PROJECTS = [
  {
    id: "proj-qbm",
    tenantId: SESSION.tenantId,
    name: "Quick BoM Refresh",
    customerName: "Acme",
    mode: "quick_bom",
    status: "needs_review",
    activeStageId: "sku_resolution",
    activeStageStatus: "needs_review",
    stageCounts: {
      total: 5,
      approved: 1,
      needsReview: 1,
      inProgress: 0,
      blocked: 0,
      rejected: 0,
    },
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-02T11:30:00.000Z",
  },
];

function req(): NextRequest {
  return { headers: { get: () => null } } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockListProjectSummaries.mockReset().mockResolvedValue(PROJECTS);
});

describe("GET /api/projects - auth", () => {
  it("returns the requireAuth response directly and skips the store when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const res = await GET(req());

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockListProjectSummaries).not.toHaveBeenCalled();
  });
});

describe("GET /api/projects - tenant scoped Project list", () => {
  it("uses the authenticated tenant and returns canonical Project summaries", async () => {
    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(mockListProjectSummaries).toHaveBeenCalledTimes(1);
    expect(mockListProjectSummaries).toHaveBeenCalledWith(SESSION.tenantId);
    await expect(res.json()).resolves.toEqual({ projects: PROJECTS });
  });

  it("maps store failures to a controlled 500 without exposing thrown details", async () => {
    const secret = "db-stack-secret";
    mockListProjectSummaries.mockRejectedValue(new Error(secret));

    const res = await GET(req());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("project_list_failed");
    expect(body.error).toBe("Unable to load projects.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET /api/projects - route surface", () => {
  it("exports GET only", () => {
    expect(typeof routeModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("GET /api/projects - static source checks", () => {
  const SRC_PATH = join(process.cwd(), "src/app/api/projects/route.ts");
  const TEST_PATH = join(process.cwd(), "tests/api/projects-route.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, auth, and the canonical Project store", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/db/project-store",
    ]);
  });

  it("does not query legacy estimates or Quick BoM processing services", () => {
    for (const forbidden of [
      "/api/estimates",
      'from "@/lib/projects/project-quick-bom',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/engines',
      "@anthropic-ai",
      "openai",
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
