/**
 * Scoped Cisco Quick BoM pricing authority profile.
 *
 * Records the user-approved scoped Cisco Quick BoM pricing authority boundary as an
 * explicit pure profile. It does not change runtime pricing behavior.
 *
 * Authority boundary: committed scoped Cisco pricing fixture, approved Cisco
 * collaboration and industrial switching Quick BoM scope only, SAR-only. Unknown or
 * out-of-scope SKUs are missing-price/report-only (never substituted, never silently
 * omitted). Configuration authority stays separate from pricing authority.
 *
 * PURE: imports only the committed scoped Cisco pricing fixture loader. No DB, catalog,
 * pricing math, API/UI, engine, coordinator, adapter, AI/LLM, workbook/export,
 * priced-BoQ, config-expansion, rule-pack, runner, or package code. All getters return
 * fresh copies; callers cannot mutate shared state.
 */
import {
  getScopedCiscoPricingFixture,
  type ScopedCiscoMantleCategory,
  type ScopedCiscoPriceSourceEvidence,
  type ScopedCiscoPricingFixtureBoundary,
} from "@/lib/projects/scoped-cisco-pricing-fixture";

/** Approval record id for the user-approved scoped Cisco Quick BoM pricing authority. */
export const SCOPED_CISCO_PRICING_AUTHORITY_APPROVAL_RECORD_ID =
  "user-approved-scoped-cisco-quick-bom-pricing-authority";

/** Full serializable pricing authority profile for all known scoped Cisco SKUs. */
export interface ScopedCiscoPricingAuthorityProfile {
  profileId: "scoped-cisco-quick-bom-pricing-authority-profile";
  scope: "scoped_cisco_quick_bom_pricing_source";
  approvalRecordId: string;
  activeSource: "committed_scoped_cisco_pricing_fixture";
  activeSourceFixtureId: string;
  activeSourceStatus: "approved_scoped_pricing_source";
  activeSourceWorkbookPath: string;
  activeSourceSheetName: string;
  currency: "SAR";
  pricedSkuCount: number;
  missingPriceSkuCount: number;
  skuStatusMap: Record<string, "priced_from_scoped_fixture">;
  boundary: ScopedCiscoPricingFixtureBoundary;
}

/** Per-SKU serializable pricing authority result. */
export interface ScopedCiscoPricingAuthoritySkuResultPriced {
  sku: string;
  status: "priced_from_scoped_fixture";
  missingPrice: false;
  currency: "SAR";
  unitListPriceSar: number;
  mantleCategory: ScopedCiscoMantleCategory;
  sourceEvidence: ScopedCiscoPriceSourceEvidence;
  boundary: ScopedCiscoPricingFixtureBoundary;
}

export interface ScopedCiscoPricingAuthoritySkuResultMissing {
  sku: string;
  status: "missing_price_report_only";
  missingPrice: true;
  boundary: ScopedCiscoPricingFixtureBoundary;
}

export type ScopedCiscoPricingAuthoritySkuResult =
  | ScopedCiscoPricingAuthoritySkuResultPriced
  | ScopedCiscoPricingAuthoritySkuResultMissing;

/** Return the canonical scoped Cisco pricing boundary as a fresh object. */
function freshBoundary(): ScopedCiscoPricingFixtureBoundary {
  return { ...getScopedCiscoPricingFixture().boundary };
}

/**
 * Return the full pricing authority profile for all known scoped Cisco SKUs as a fresh
 * serializable object.
 */
export function getScopedCiscoPricingAuthorityProfile(): ScopedCiscoPricingAuthorityProfile {
  const fixture = getScopedCiscoPricingFixture();
  const skuStatusMap: Record<string, "priced_from_scoped_fixture"> = {};
  for (const sku of Object.keys(fixture.unitListPriceSarBySku)) {
    skuStatusMap[sku] = "priced_from_scoped_fixture";
  }

  return {
    profileId: "scoped-cisco-quick-bom-pricing-authority-profile",
    scope: "scoped_cisco_quick_bom_pricing_source",
    approvalRecordId: SCOPED_CISCO_PRICING_AUTHORITY_APPROVAL_RECORD_ID,
    activeSource: "committed_scoped_cisco_pricing_fixture",
    activeSourceFixtureId: fixture.fixtureId,
    activeSourceStatus: fixture.status,
    activeSourceWorkbookPath: fixture.sourceEvidence.workbookPath,
    activeSourceSheetName: fixture.sourceEvidence.sheetName,
    currency: "SAR",
    pricedSkuCount: fixture.skuCount,
    missingPriceSkuCount: 0,
    skuStatusMap,
    boundary: { ...fixture.boundary },
  };
}

/**
 * Return the pricing authority result for a single SKU as a fresh serializable object.
 * Unknown or out-of-scope SKUs return "missing_price_report_only" and never throw. The
 * original requested SKU is preserved exactly; no substitution or silent omission.
 */
export function getScopedCiscoPricingAuthorityForSku(
  sku: string
): ScopedCiscoPricingAuthoritySkuResult {
  const fixture = getScopedCiscoPricingFixture();
  const priceEntry = fixture.unitListPriceSarBySku[sku];

  if (!priceEntry) {
    return {
      sku,
      status: "missing_price_report_only",
      missingPrice: true,
      boundary: freshBoundary(),
    };
  }

  return {
    sku,
    status: "priced_from_scoped_fixture",
    missingPrice: false,
    currency: "SAR",
    unitListPriceSar: priceEntry.unitListPriceSar,
    mantleCategory: fixture.categoryBySku[sku],
    sourceEvidence: fixture.priceSourceEvidenceBySku[sku],
    boundary: freshBoundary(),
  };
}
