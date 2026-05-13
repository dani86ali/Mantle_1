/**
 * Auth + tenant isolation guards.
 *
 * - getSession returns a default dev session in NODE_ENV=development when
 *   no X-Dev-Session header and no session cookie are present.
 * - getSession honors the X-Dev-Session header when provided.
 * - A representative sample of estimate API route handlers call requireAuth
 *   (spot check via source grep).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";
import { NextRequest } from "next/server";
import {
  getSession,
  DEFAULT_DEV_SESSION,
  type AuthSession,
} from "@/lib/middleware/auth";

function mkRequest(headers: Record<string, string> = {}): NextRequest {
  const lower = new Map<string, string>();
  for (const [k, v] of Object.entries(headers)) lower.set(k.toLowerCase(), v);
  return {
    headers: { get: (k: string) => lower.get(k.toLowerCase()) ?? null },
    cookies: { get: (_k: string) => undefined },
  } as unknown as NextRequest;
}

describe("getSession — dev mode default", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the default dev session when no header and no cookie are present", () => {
    vi.stubEnv("NODE_ENV", "development");
    const session = getSession(mkRequest());
    expect(session).not.toBeNull();
    expect(session).toEqual(DEFAULT_DEV_SESSION);
    expect(session?.tenantId).toBe("stc-solutions");
    expect(session?.role).toBe("engineer");
  });

  it("honors X-Dev-Session header when provided", () => {
    vi.stubEnv("NODE_ENV", "development");
    const custom: AuthSession = {
      userId: "u-1",
      tenantId: "tenant-xyz",
      email: "x@y.z",
      name: "Tester",
      role: "tenant_admin",
    };
    const session = getSession(mkRequest({ "x-dev-session": JSON.stringify(custom) }));
    expect(session).toEqual(custom);
  });

  it("returns null in production when no session cookie is present", () => {
    vi.stubEnv("NODE_ENV", "production");
    const session = getSession(mkRequest());
    expect(session).toBeNull();
  });
});

describe("API routes call requireAuth (spot check)", () => {
  const routes = [
    ["estimates list", "src/app/api/estimates/route.ts"],
    ["estimates [id]", "src/app/api/estimates/[id]/route.ts"],
    ["export", "src/app/api/export/route.ts"],
    ["download", "src/app/api/estimates/[id]/download/route.ts"],
    ["proposal", "src/app/api/estimates/[id]/proposal/route.ts"],
    ["design documents", "src/app/api/estimates/[id]/design/documents/route.ts"],
    ["review delete", "src/app/api/review/[id]/route.ts"],
  ] as const;

  for (const [label, rel] of routes) {
    it(`${label} imports + calls requireAuth`, async () => {
      const source = await readFile(join(process.cwd(), rel), "utf8");
      expect(source).toMatch(/from\s+["']@\/lib\/middleware\/auth["']/);
      expect(source).toMatch(/requireAuth\(request\)/);
    });
  }
});

describe("Tenant filter is applied to key DB queries", () => {
  const tenantFiltered = [
    "src/app/api/estimates/route.ts",
    "src/app/api/estimates/[id]/route.ts",
    "src/app/api/export/route.ts",
    "src/app/api/estimates/[id]/download/route.ts",
    "src/app/api/estimates/[id]/proposal/route.ts",
    "src/app/api/review/[id]/route.ts",
  ];

  for (const rel of tenantFiltered) {
    it(`${rel} references intakes.tenantId or session.tenantId in queries`, async () => {
      const source = await readFile(join(process.cwd(), rel), "utf8");
      expect(source).toMatch(/intakes\.tenantId|session\.tenantId/);
    });
  }
});
