import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
  getScopedCiscoPricingAuthorityProfile,
  getScopedCiscoPricingAuthorityForSku,
  SCOPED_CISCO_PRICING_AUTHORITY_APPROVAL_RECORD_ID,
} from "@/lib/projects/scoped-cisco-pricing-authority";
import { getScopedCiscoPricingFixture } from "@/lib/projects/scoped-cisco-pricing-fixture";

/**
 * Regression tests for the scoped Cisco Quick BoM pricing authority profile. The profile
 * codifies the user-approved scoped pricing authority boundary as a pure read over the
 * committed scoped Cisco fixture. It is scoped pricing-source authority only: unknown or
 * out-of-scope SKUs are missing-price/report-only (never substituted, never omitted).
 */

const AUTHORITY_PATH = join(process.cwd(), "src/lib/projects/scoped-cisco-pricing-authority.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/scoped-cisco-pricing-authority.test.ts");

const EXPECTED_BOUNDARY = {
  deterministicPricingAuthority: true,
  scopedCiscoPricingAuthority: true,
  productionCiscoPricingAuthority: false,
  broadCiscoGeneralPricingAuthority: false,
  runtimeAiPricing: false,
  runtimeCatalogLookup: false,
  configurationAuthority: false,
  replacementAuthority: false,
  skuSubstitutionAuthority: false,
  silentSkuSubstitution: false,
  missingPricesReported: true,
};

/** Extract `from "..."` specifiers from module source. */
function importSpecifiers(source: string): string[] {
  const importRegex = /import\s+(?:type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(source)) !== null) found.push(m[1]);
  return found;
}

describe("scoped cisco pricing authority - profile", () => {
  it("returns the full scoped profile bound to the committed fixture", () => {
    const profile = getScopedCiscoPricingAuthorityProfile();
    const fixture = getScopedCiscoPricingFixture();

    expect(profile.profileId).toBe("scoped-cisco-quick-bom-pricing-authority-profile");
    expect(profile.scope).toBe("scoped_cisco_quick_bom_pricing_source");
    expect(profile.approvalRecordId).toBe(SCOPED_CISCO_PRICING_AUTHORITY_APPROVAL_RECORD_ID);
    expect(profile.activeSource).toBe("committed_scoped_cisco_pricing_fixture");
    expect(profile.activeSourceFixtureId).toBe(fixture.fixtureId);
    expect(profile.activeSourceStatus).toBe("approved_scoped_pricing_source");
    expect(profile.activeSourceWorkbookPath).toContain(
      "MARAFIQObsolete_Network_Hardware_Replacement.xlsx"
    );
    expect(profile.activeSourceSheetName).toBe("EstimateDetails_JL164850184VT");
    expect(profile.currency).toBe("SAR");
    expect(profile.pricedSkuCount).toBe(fixture.skuCount);
    expect(profile.missingPriceSkuCount).toBe(0);
    expect(Object.keys(profile.skuStatusMap).sort()).toEqual(
      Object.keys(fixture.unitListPriceSarBySku).sort()
    );
    for (const status of Object.values(profile.skuStatusMap)) {
      expect(status).toBe("priced_from_scoped_fixture");
    }
    expect(profile.boundary).toEqual(EXPECTED_BOUNDARY);
  });

  it("returns a fresh profile each call; mutation cannot leak", () => {
    const first = getScopedCiscoPricingAuthorityProfile();
    first.pricedSkuCount = 0;
    (first.boundary as { scopedCiscoPricingAuthority: boolean }).scopedCiscoPricingAuthority = false;
    first.skuStatusMap["INJECTED"] = "priced_from_scoped_fixture";

    const second = getScopedCiscoPricingAuthorityProfile();
    expect(second.pricedSkuCount).toBeGreaterThan(0);
    expect(second.boundary.scopedCiscoPricingAuthority).toBe(true);
    expect("INJECTED" in second.skuStatusMap).toBe(false);
  });
});

describe("scoped cisco pricing authority - per SKU", () => {
  it("prices a known scoped SKU with its workbook evidence and boundary flags", () => {
    const result = getScopedCiscoPricingAuthorityForSku("CS-KIT-EQX-C-K9");
    expect(result.status).toBe("priced_from_scoped_fixture");
    expect(result.missingPrice).toBe(false);
    if (result.status !== "priced_from_scoped_fixture") throw new Error("unreachable");
    expect(result.currency).toBe("SAR");
    expect(result.unitListPriceSar).toBe(222859.31);
    expect(result.mantleCategory).toBe("product");
    expect(result.sourceEvidence.sourceType).toBe("approved_scoped_workbook");
    expect(result.boundary).toEqual(EXPECTED_BOUNDARY);
  });

  it("classifies a known support SKU as the service Mantle category", () => {
    const result = getScopedCiscoPricingAuthorityForSku("CON-SNT-CSKITEK9");
    if (result.status !== "priced_from_scoped_fixture") throw new Error("expected priced");
    expect(result.mantleCategory).toBe("service");
  });

  it("returns missing-price/report-only for an unknown SKU without throwing or substituting", () => {
    const result = getScopedCiscoPricingAuthorityForSku("NOT-A-REAL-SKU=");
    expect(result.status).toBe("missing_price_report_only");
    expect(result.missingPrice).toBe(true);
    expect(result.sku).toBe("NOT-A-REAL-SKU=");
    expect(result.boundary).toEqual(EXPECTED_BOUNDARY);
    // No substitution: the requested SKU is preserved verbatim.
    expect(result.boundary.missingPricesReported).toBe(true);
    expect(result.boundary.skuSubstitutionAuthority).toBe(false);
  });
});

describe("scoped cisco pricing authority - source hygiene", () => {
  it("imports only the scoped Cisco fixture loader (no DB/catalog/pricing-math/API/UI/AI/package)", () => {
    const specs = importSpecifiers(readFileSync(AUTHORITY_PATH, "utf8"));
    expect(specs).toEqual(["@/lib/projects/scoped-cisco-pricing-fixture"]);
  });

  it("keeps the authority and test sources ASCII-only", () => {
    for (const path of [AUTHORITY_PATH, TEST_PATH]) {
      const text = readFileSync(path, "utf8");
      // eslint-disable-next-line no-control-regex
      expect(/[^\x00-\x7F]/.test(text), path).toBe(false);
    }
  });
});
