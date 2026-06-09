import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import CatalogPage from "@/app/catalog/page";
import type { QuickBomCatalogAuthoritySurface } from "@/lib/projects/quick-bom-catalog-authority-surface";

const CATALOG: QuickBomCatalogAuthoritySurface = {
  label: "Default Quick BoM authority pack",
  catalog: {
    source: "default_quick_bom_approved_catalog",
    entryCount: 2,
  },
  pricing: {
    source: "active_approved_pricing_authority",
    currency: "SAR",
    coveredSkuCount: 1,
    missingPriceSkuCount: 1,
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
  entries: [
    {
      sku: "C9300X-48HX-A",
      description: "Switch",
      category: "Switching",
      vendor: "Cisco",
      recognitionCoverage: "recognized_by_default_catalog",
      pricingCoverage: "priced_by_active_authority",
      configRuleCoverage: "parent_rule_available",
    },
    {
      sku: "UNKNOWN-PRICE",
      description: "Report-only entry",
      category: "Report-only",
      vendor: "Cisco",
      recognitionCoverage: "recognized_by_default_catalog",
      pricingCoverage: "missing_price_report_only",
      configRuleCoverage: "no_parent_rule",
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(catalog: QuickBomCatalogAuthoritySurface | null = CATALOG) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      if (url.endsWith("/api/catalog/quick-bom")) {
        return Promise.resolve(jsonResponse({ catalog }));
      }
      return Promise.resolve(jsonResponse({}, 404));
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CatalogPage", () => {
  it("loads active/default Quick BoM authority coverage and shows boundaries", async () => {
    const calls = stubFetch();

    render(<CatalogPage />);

    expect(await screen.findByText("C9300X-48HX-A")).toBeInTheDocument();
    expect(screen.getByText("UNKNOWN-PRICE")).toBeInTheDocument();
    expect(screen.getByText("Authority Boundaries")).toBeInTheDocument();
    expect(screen.getByText("Runtime AI decisions")).toBeInTheDocument();
    expect(screen.getByText("Silent SKU substitution")).toBeInTheDocument();
    expect(screen.getByText("Pricing and configuration authority")).toBeInTheDocument();
    expect(screen.getByText("Deferred/report-only")).toBeInTheDocument();
    expect(screen.getByText("Parent rule")).toBeInTheDocument();
    expect(screen.getByText("No parent rule")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/Honeywell/i);
    expect(calls).toEqual(["/api/catalog/quick-bom"]);
  });

  it("renders an empty authority state when the API has no catalog payload", async () => {
    stubFetch(null);

    render(<CatalogPage />);

    expect(
      await screen.findByText("No Catalog authority coverage available.")
    ).toBeInTheDocument();
  });
});

describe("CatalogPage static source checks", () => {
  const SRC_PATH = join(process.cwd(), "src/app/catalog/page.tsx");
  const TEST_PATH = join(process.cwd(), "tests/ui/catalog-page.test.tsx");
  const source = readFileSync(SRC_PATH, "utf8");

  it("uses the Quick BoM authority surface instead of stale legacy catalog tabs", () => {
    expect(source).toContain('fetch("/api/catalog/quick-bom")');
    expect(source).not.toContain("/api/catalog/fortinet");
    expect(source).not.toContain("fortinet-tab");
    expect(source).not.toContain("cisco-tab");
    expect(source).not.toContain("BOMATIC_Device_Specs");
    expect(source).not.toMatch(/\bHoneywell\b/);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
