import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockRequireAuth,
  mockArchiveProject,
  mockRestoreProject,
  mockGetProjectById,
  mockQuickBomProjectNameExists,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockArchiveProject: vi.fn(),
  mockRestoreProject: vi.fn(),
  mockGetProjectById: vi.fn(),
  mockQuickBomProjectNameExists: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/db/project-store", () => ({
  archiveProject: mockArchiveProject,
  restoreProject: mockRestoreProject,
  getProjectById: mockGetProjectById,
  quickBomProjectNameExists: mockQuickBomProjectNameExists,
}));

import { POST, DELETE } from "@/app/api/projects/[id]/archive/route";
import * as routeModule from "@/app/api/projects/[id]/archive/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Project } from "@/types/project";

const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PROJECT_ID = "proj-1";

function req(): NextRequest {
  return { headers: { get: () => null } } as unknown as NextRequest;
}

function ctx(id = PROJECT_ID): { params: { id: string } } {
  return { params: { id } };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    tenantId: SESSION.tenantId,
    name: "Honeywell Quick BoM",
    customerName: "Honeywell",
    mode: "quick_bom",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-06-02T11:30:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockArchiveProject.mockReset().mockResolvedValue(true);
  mockRestoreProject.mockReset().mockResolvedValue(true);
  mockGetProjectById.mockReset();
  mockQuickBomProjectNameExists.mockReset().mockResolvedValue(false);
});

describe("POST /api/projects/[id]/archive - auth", () => {
  it("returns the requireAuth response and never touches the store when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const res = await POST(req(), ctx());

    expect(res).toBe(unauth);
    expect(mockArchiveProject).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects/[id]/archive - archive", () => {
  it("archives the project tenant-scoped and returns 200", async () => {
    const res = await POST(req(), ctx());

    expect(res.status).toBe(200);
    expect(mockArchiveProject).toHaveBeenCalledWith(SESSION.tenantId, PROJECT_ID);
    await expect(res.json()).resolves.toEqual({ archived: true });
  });

  it("returns 404 when the project is not found for the tenant", async () => {
    mockArchiveProject.mockResolvedValue(false);

    const res = await POST(req(), ctx());

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("project_not_found");
  });

  it("maps a store failure to a controlled 500", async () => {
    mockArchiveProject.mockRejectedValue(new Error("db-secret"));

    const res = await POST(req(), ctx());

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("db-secret");
  });
});

describe("DELETE /api/projects/[id]/archive - restore", () => {
  it("restores an archived project and returns 200", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({ archivedAt: new Date("2026-05-25T12:00:00.000Z") })
    );

    const res = await DELETE(req(), ctx());

    expect(res.status).toBe(200);
    expect(mockGetProjectById).toHaveBeenCalledWith(SESSION.tenantId, PROJECT_ID, {
      includeArchived: true,
    });
    expect(mockRestoreProject).toHaveBeenCalledWith(SESSION.tenantId, PROJECT_ID);
    await expect(res.json()).resolves.toEqual({ restored: true });
  });

  it("returns 404 when the target is missing and never restores", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const res = await DELETE(req(), ctx());

    expect(res.status).toBe(404);
    expect(mockRestoreProject).not.toHaveBeenCalled();
  });

  it("returns 409 duplicate and does NOT restore when an archived Quick BoM name collides with an active project", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({
        name: "Honeywell Refresh",
        archivedAt: new Date("2026-05-25T12:00:00.000Z"),
      })
    );
    mockQuickBomProjectNameExists.mockResolvedValue(true);

    const res = await DELETE(req(), ctx());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("duplicate_project_name");
    expect(body.error).toBe(
      "Duplicate Project Name. Honeywell Refresh already exists in your active projects."
    );
    expect(mockRestoreProject).not.toHaveBeenCalled();
  });

  it("skips the duplicate check for an already-active target and restores successfully", async () => {
    // archivedAt undefined => already active; the name check must be skipped.
    mockGetProjectById.mockResolvedValue(makeProject({ name: "Honeywell Refresh" }));
    mockQuickBomProjectNameExists.mockResolvedValue(true);

    const res = await DELETE(req(), ctx());

    expect(res.status).toBe(200);
    expect(mockQuickBomProjectNameExists).not.toHaveBeenCalled();
    expect(mockRestoreProject).toHaveBeenCalledWith(SESSION.tenantId, PROJECT_ID);
  });

  it("does not run the duplicate check for an archived RFP project", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({ mode: "rfp", archivedAt: new Date("2026-05-25T12:00:00.000Z") })
    );

    const res = await DELETE(req(), ctx());

    expect(res.status).toBe(200);
    expect(mockQuickBomProjectNameExists).not.toHaveBeenCalled();
    expect(mockRestoreProject).toHaveBeenCalled();
  });

  it("returns 404 when restore reports the project no longer exists", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({ archivedAt: new Date("2026-05-25T12:00:00.000Z") })
    );
    mockRestoreProject.mockResolvedValue(false);

    const res = await DELETE(req(), ctx());

    expect(res.status).toBe(404);
  });
});

describe("project archive route - response hygiene", () => {
  it("builds a fresh NextResponse per call (no reused module-level response object)", async () => {
    mockArchiveProject.mockResolvedValue(false);

    const res1 = await POST(req(), ctx());
    const res2 = await POST(req(), ctx());

    // Single-use response objects: two 404s must be distinct instances.
    expect(res1).not.toBe(res2);
    expect(res1.status).toBe(404);
    expect(res2.status).toBe(404);
  });

  it("exposes only POST and DELETE handlers", () => {
    expect(typeof routeModule.POST).toBe("function");
    expect(typeof routeModule.DELETE).toBe("function");
    for (const method of ["GET", "PATCH", "PUT"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("project archive route - static source checks", () => {
  const SRC_PATH = join(process.cwd(), "src/app/api/projects/[id]/archive/route.ts");
  const TEST_PATH = join(process.cwd(), "tests/api/project-archive-route.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("does not create module-level NextResponse objects (responses built in helpers/handlers)", () => {
    // No top-level `const X = NextResponse.json(...)`. Every NextResponse.json call
    // must sit inside a function body, not at module scope.
    expect(source).not.toMatch(/^const\s+\w+\s*=\s*NextResponse\.json/m);
  });

  it("does no hard delete", () => {
    expect(source).not.toContain("deleteProject");
    expect(source).not.toMatch(/\.delete\(/);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
