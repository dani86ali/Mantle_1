import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockRequireAuth, mockSurface } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockSurface: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/quick-bom-catalog-authority-surface", () => ({
  getQuickBomCatalogAuthoritySurface: mockSurface,
}));

import { GET } from "@/app/api/catalog/quick-bom/route";
import * as routeModule from "@/app/api/catalog/quick-bom/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const CATALOG = {
  label: "Default Quick BoM authority pack",
  catalog: {
    source: "default_quick_bom_approved_catalog",
    entryCount: 1,
  },
  pricing: {
    source: "active_approved_pricing_authority",
    currency: "SAR",
    coveredSkuCount: 1,
    missingPriceSkuCount: 0,
  },
  configurationRules: {
    source: "active_approved_configuration_rules",
    status: "approved",
    parentRuleCount: 1,
    childRuleCount: 2,
    sourcePackCount: 3,
  },
  boundaries: {
    runtimeAiDecisions: false,
    liveCatalogLookup: false,
    broadProductionCatalogAuthority: false,
    broadProductionPricingAuthority: false,
    replacementAuthority: false,
    silentSkuSubstitution: false,
    configurationAuthoritySeparateFromPricing: true,
    missingDataDeferred: true,
  },
  entries: [],
};

function req(): NextRequest {
  return { headers: { get: () => null } } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockSurface.mockReset().mockReturnValue(CATALOG);
});

describe("GET /api/catalog/quick-bom - auth", () => {
  it("returns the requireAuth response directly and skips the read model when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const res = await GET(req());

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockSurface).not.toHaveBeenCalled();
  });
});

describe("GET /api/catalog/quick-bom - authority coverage", () => {
  it("returns display-only Quick BoM authority coverage", async () => {
    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(mockSurface).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toEqual({ catalog: CATALOG });
  });

  it("maps read-model failures to a controlled 500 without exposing thrown details", async () => {
    const secret = "catalog-stack-secret";
    mockSurface.mockImplementation(() => {
      throw new Error(secret);
    });

    const res = await GET(req());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("quick_bom_catalog_authority_failed");
    expect(body.error).toBe("Unable to load Quick BoM catalog authority coverage.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET /api/catalog/quick-bom - route surface", () => {
  it("exports GET only", () => {
    expect(typeof routeModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("GET /api/catalog/quick-bom - static source checks", () => {
  const SRC_PATH = join(process.cwd(), "src/app/api/catalog/quick-bom/route.ts");
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/catalog-quick-bom-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, auth, and the authority read model", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/quick-bom-catalog-authority-surface",
    ]);
  });

  it("does not import customer BoQ processing, pricing, export, catalog lookup, or AI modules", () => {
    for (const forbidden of [
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/pricing',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/project-quick-bom',
      'from "@/lib/projects/catalog-lookup"',
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
