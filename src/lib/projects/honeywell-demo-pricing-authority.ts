/**
 * Honeywell MVP demo pricing authority profile.
 *
 * Records the user-approved Honeywell MVP demo pricing authority boundary
 * (Prompt 119). This module codifies that approval as an explicit pure profile.
 * It does not change runtime pricing behavior.
 *
 * Authority boundary: committed Honeywell demo pricing fixture, Honeywell MVP scope
 * only. The current local cisco_gpl_sar.csv is approved only as temporary Honeywell
 * demo evidence if later converted into an approved committed structured source; this
 * profile does not read it at runtime. Unknown SKUs are missing-price/report-only.
 *
 * PURE: imports only the committed Honeywell demo pricing fixture loader.
 * No DB, catalog, pricing math, API/UI, engine, coordinator, adapter, AI/LLM,
 * workbook/export, priced-BoQ, config-expansion, rule-pack, runner, or package code.
 * All getters return fresh copies; callers cannot mutate shared state.
 */
import {
  getHoneywellDemoPricingFixture,
  type HoneywellDemoMantleCategory,
  type HoneywellDemoPriceSourceEvidence,
} from "@/lib/projects/honeywell-demo-pricing-fixture";

/** Approval record id for Prompt 119 user-approved Honeywell demo pricing authority. */
export const HONEYWELL_PRICING_AUTHORITY_APPROVAL_RECORD_ID =
  "prompt-119-user-approved-honeywell-demo-pricing-authority";

/** Explicit authority boundary for the Honeywell MVP demo pricing authority. */
export interface HoneywellDemoPricingAuthorityBoundary {
  deterministicPricingAuthority: true;
  demoFixtureAuthority: true;
  currentLocalGplSarCsvTemporarilyApproved: true;
  activeRuntimeSourceReadsExternalGplCsv: false;
  productionCiscoPricingAuthority: false;
  broadCiscoGeneralPricingAuthority: false;
  runtimeAiPricing: false;
  runtimeCatalogLookup: false;
  configurationAuthority: false;
  replacementAuthority: false;
  skuSubstitutionAuthority: false;
  silentSkuSubstitution: false;
  missingPricesReported: true;
}

/** Full serializable pricing authority profile for all known Honeywell MVP demo SKUs. */
export interface HoneywellDemoPricingAuthorityProfile {
  profileId: "honeywell-mvp-demo-pricing-authority-profile";
  scope: "honeywell_mvp_demo_only";
  approvalRecordId: string;
  activeSource: "committed_honeywell_demo_pricing_fixture";
  activeSourceFixtureId: string;
  activeSourceStatus: "approved_demo_fixture";
  activeSourceWorkbookPath: string;
  activeSourceSheetName: string;
  currency: "SAR";
  pricedSkuCount: number;
  missingPriceSkuCount: number;
  skuStatusMap: Record<string, "priced_from_demo_fixture">;
  boundary: HoneywellDemoPricingAuthorityBoundary;
}

/** Per-SKU serializable pricing authority result. */
export interface HoneywellDemoPricingAuthoritySkuResultPriced {
  sku: string;
  status: "priced_from_demo_fixture";
  missingPrice: false;
  currency: "SAR";
  unitListPriceSar: number;
  mantleCategory: HoneywellDemoMantleCategory;
  sourceEvidence: HoneywellDemoPriceSourceEvidence;
  boundary: HoneywellDemoPricingAuthorityBoundary;
}

export interface HoneywellDemoPricingAuthoritySkuResultMissing {
  sku: string;
  status: "missing_price_report_only";
  missingPrice: true;
  boundary: HoneywellDemoPricingAuthorityBoundary;
}

export type HoneywellDemoPricingAuthoritySkuResult =
  | HoneywellDemoPricingAuthoritySkuResultPriced
  | HoneywellDemoPricingAuthoritySkuResultMissing;

const STATIC_BOUNDARY: HoneywellDemoPricingAuthorityBoundary = {
  deterministicPricingAuthority: true,
  demoFixtureAuthority: true,
  currentLocalGplSarCsvTemporarilyApproved: true,
  activeRuntimeSourceReadsExternalGplCsv: false,
  productionCiscoPricingAuthority: false,
  broadCiscoGeneralPricingAuthority: false,
  runtimeAiPricing: false,
  runtimeCatalogLookup: false,
  configurationAuthority: false,
  replacementAuthority: false,
  skuSubstitutionAuthority: false,
  silentSkuSubstitution: false,
  missingPricesReported: true,
} as const;

/**
 * Return the full pricing authority profile for all known Honeywell MVP demo SKUs as a
 * fresh serializable object.
 */
export function getHoneywellDemoPricingAuthorityProfile(): HoneywellDemoPricingAuthorityProfile {
  const fixture = getHoneywellDemoPricingFixture();
  const skuStatusMap: Record<string, "priced_from_demo_fixture"> = {};
  for (const sku of Object.keys(fixture.unitListPriceSarBySku)) {
    skuStatusMap[sku] = "priced_from_demo_fixture";
  }

  return {
    profileId: "honeywell-mvp-demo-pricing-authority-profile",
    scope: "honeywell_mvp_demo_only",
    approvalRecordId: HONEYWELL_PRICING_AUTHORITY_APPROVAL_RECORD_ID,
    activeSource: "committed_honeywell_demo_pricing_fixture",
    activeSourceFixtureId: fixture.fixtureId,
    activeSourceStatus: fixture.status,
    activeSourceWorkbookPath: fixture.sourceEvidence.workbookPath,
    activeSourceSheetName: fixture.sourceEvidence.sheetName,
    currency: "SAR",
    pricedSkuCount: fixture.skuCount,
    missingPriceSkuCount: 0,
    skuStatusMap,
    boundary: { ...STATIC_BOUNDARY },
  };
}

/**
 * Return the pricing authority result for a single SKU as a fresh serializable object.
 * Unknown or out-of-scope SKUs return "missing_price_report_only" and never throw.
 * The original requested SKU is preserved exactly; no substitution or normalization.
 */
export function getHoneywellDemoPricingAuthorityForSku(
  sku: string
): HoneywellDemoPricingAuthoritySkuResult {
  const fixture = getHoneywellDemoPricingFixture();
  const priceEntry = fixture.unitListPriceSarBySku[sku];

  if (!priceEntry) {
    return {
      sku,
      status: "missing_price_report_only",
      missingPrice: true,
      boundary: { ...STATIC_BOUNDARY },
    };
  }

  const evidence = fixture.priceSourceEvidenceBySku[sku];
  const category = fixture.categoryByAcceptedSku[sku];

  return {
    sku,
    status: "priced_from_demo_fixture",
    missingPrice: false,
    currency: "SAR",
    unitListPriceSar: priceEntry.unitListPriceSar,
    mantleCategory: category,
    sourceEvidence: {
      sourceType: evidence.sourceType,
      workbookPath: evidence.workbookPath,
      sheetName: evidence.sheetName,
      worksheetRowNumber: evidence.worksheetRowNumber,
      ccwLineNumber: evidence.ccwLineNumber,
      sourceQuantity: evidence.sourceQuantity,
      rawListPrice: evidence.rawListPrice,
      rawExtendedListPrice: evidence.rawExtendedListPrice,
      rawSellingPrice: evidence.rawSellingPrice,
      derivationNote: evidence.derivationNote,
    },
    boundary: { ...STATIC_BOUNDARY },
  };
}
