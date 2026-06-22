/**
 * Quick BoM approved pricing sources composer.
 *
 * Combines the two already-approved Quick BoM pricing sources into one merged view:
 * the Honeywell MVP demo pricing source (first) and the scoped Cisco pricing source
 * (second). It does NOT wire runtime pricing, export, or workspace behavior.
 *
 * AUTHORITY BOUNDARY: pricing-source authority only. This is NOT production Cisco
 * pricing authority, NOT broad Cisco-general pricing, NOT runtime AI pricing, NOT
 * runtime catalog lookup, NOT configuration authority, NOT replacement authority, and
 * it authorizes NO silent SKU substitution and NO silent omission. Configuration
 * authority stays separate from pricing authority.
 *
 * PURE COMPOSER: imports ONLY the four approved source modules below. No DB, catalog,
 * pricing math, priced-BoQ, config-expansion, AI/LLM, export/workbook, engine,
 * adapter, runner, or package code. Getters return fresh copies; callers cannot mutate
 * shared state. If a SKU key appears in both sources, getters throw a deterministic
 * conflict error before returning a combined map (price and category maps stay
 * disjoint across sources).
 */
import {
  getHoneywellDemoMantleCategoryByAcceptedSku,
  getHoneywellDemoMantleRowOrderSkuSequence,
  getHoneywellDemoUnitListPriceSarBySku,
  type HoneywellDemoMantleCategory,
  type HoneywellDemoUnitListPriceSar,
} from "@/lib/projects/honeywell-demo-pricing-fixture";
import {
  getHoneywellDemoPricingAuthorityProfile,
  HONEYWELL_PRICING_AUTHORITY_APPROVAL_RECORD_ID,
} from "@/lib/projects/honeywell-demo-pricing-authority";
import {
  getScopedCiscoMantleCategoryBySku,
  getScopedCiscoMantleRowOrderSkuSequence,
  getScopedCiscoUnitListPriceSarBySku,
  type ScopedCiscoMantleCategory,
  type ScopedCiscoUnitListPriceSar,
} from "@/lib/projects/scoped-cisco-pricing-fixture";
import {
  getScopedCiscoPricingAuthorityProfile,
  SCOPED_CISCO_PRICING_AUTHORITY_APPROVAL_RECORD_ID,
} from "@/lib/projects/scoped-cisco-pricing-authority";

/** Combined explicit SAR unit list price; structurally identical across both sources. */
export type QuickBomApprovedUnitListPriceSar =
  | HoneywellDemoUnitListPriceSar
  | ScopedCiscoUnitListPriceSar;

/** Combined Mantle total-bucket category across both sources. */
export type QuickBomApprovedMantleCategory =
  | HoneywellDemoMantleCategory
  | ScopedCiscoMantleCategory;

/** Combined pricing-source authority boundary signals. */
export interface QuickBomApprovedPricingBoundary {
  deterministicPricingAuthority: true;
  demoFixtureAuthority: true;
  scopedCiscoPricingAuthority: true;
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

/** Per-source identity/count entry inside the combined profile. */
export interface QuickBomApprovedPricingSourceEntry {
  profileId: string;
  scope: string;
  approvalRecordId: string;
  activeSource: string;
  activeSourceFixtureId: string;
  activeSourceStatus: string;
  currency: "SAR";
  pricedSkuCount: number;
  missingPriceSkuCount: number;
}

/** Combined pricing authority profile across both approved sources. */
export interface QuickBomApprovedPricingAuthorityProfile {
  profileId: "quick-bom-approved-pricing-sources-profile";
  scope: "quick_bom_approved_pricing_sources";
  currency: "SAR";
  pricedSkuCount: number;
  missingPriceSkuCount: number;
  boundary: QuickBomApprovedPricingBoundary;
  sources: QuickBomApprovedPricingSourceEntry[];
}

/** Generic pricing source summary with authority boundary signals. */
export interface QuickBomApprovedPricingSourceSummary
  extends QuickBomApprovedPricingBoundary {
  source: "quick_bom_approved_pricing_sources";
  currency: "SAR";
  honeywellDemoFixtureIncluded: true;
  scopedCiscoFixtureIncluded: true;
}

/** Category/export provenance summary (no pricing authority signals). */
export interface QuickBomApprovedCategorySourceSummary {
  source: "quick_bom_approved_mantle_category_sources";
  honeywellDemoFixtureIncluded: true;
  scopedCiscoFixtureIncluded: true;
  demoFixtureAuthority: true;
  scopedCiscoCategoryAuthority: true;
  productionPricingAuthority: false;
  configurationAuthority: false;
  runtimeAi: false;
  runtimeCatalogLookup: false;
  replacementAuthority: false;
  silentSkuSubstitution: false;
}

const PRICING_BOUNDARY: QuickBomApprovedPricingBoundary = {
  deterministicPricingAuthority: true,
  demoFixtureAuthority: true,
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
} as const;

/**
 * Merge two disjoint per-SKU maps (Honeywell first, scoped Cisco second). Throws a
 * deterministic conflict error if any SKU key exists in both sources, so the price and
 * category maps never silently overwrite across sources.
 */
function mergeDisjoint<T>(
  honeywell: Record<string, T>,
  cisco: Record<string, T>,
  mapLabel: string
): Record<string, T> {
  const merged: Record<string, T> = { ...honeywell };
  for (const [sku, value] of Object.entries(cisco)) {
    if (Object.prototype.hasOwnProperty.call(merged, sku)) {
      throw new Error(
        "Quick BoM approved pricing source conflict: SKU '" +
          sku +
          "' exists in both Honeywell and scoped Cisco " +
          mapLabel +
          " maps"
      );
    }
    merged[sku] = value;
  }
  return merged;
}

/** Return the combined per-SKU SAR list price map as a fresh disjoint copy. */
export function getQuickBomApprovedUnitListPriceSarBySku(): Record<
  string,
  QuickBomApprovedUnitListPriceSar
> {
  return mergeDisjoint<QuickBomApprovedUnitListPriceSar>(
    getHoneywellDemoUnitListPriceSarBySku(),
    getScopedCiscoUnitListPriceSarBySku(),
    "price"
  );
}

/** Return the combined per-SKU Mantle category map as a fresh disjoint copy. */
export function getQuickBomApprovedMantleCategoryByAcceptedSku(): Record<
  string,
  QuickBomApprovedMantleCategory
> {
  return mergeDisjoint<QuickBomApprovedMantleCategory>(
    getHoneywellDemoMantleCategoryByAcceptedSku(),
    getScopedCiscoMantleCategoryBySku(),
    "category"
  );
}

/**
 * Return the combined Mantle export row-order occurrence sequence as a fresh copy:
 * Honeywell occurrences then scoped Cisco occurrences, with all duplicate occurrences
 * (e.g. STK-RACK-DINRAIL=) preserved. Export presentation/order evidence only.
 */
export function getQuickBomApprovedMantleRowOrderSkuSequence(): string[] {
  return [
    ...getHoneywellDemoMantleRowOrderSkuSequence(),
    ...getScopedCiscoMantleRowOrderSkuSequence(),
  ];
}

/** Return the combined pricing authority profile as a fresh object. */
export function getQuickBomApprovedPricingAuthorityProfile(): QuickBomApprovedPricingAuthorityProfile {
  const honeywell = getHoneywellDemoPricingAuthorityProfile();
  const cisco = getScopedCiscoPricingAuthorityProfile();

  const sources: QuickBomApprovedPricingSourceEntry[] = [
    {
      profileId: honeywell.profileId,
      scope: honeywell.scope,
      approvalRecordId: HONEYWELL_PRICING_AUTHORITY_APPROVAL_RECORD_ID,
      activeSource: honeywell.activeSource,
      activeSourceFixtureId: honeywell.activeSourceFixtureId,
      activeSourceStatus: honeywell.activeSourceStatus,
      currency: "SAR",
      pricedSkuCount: honeywell.pricedSkuCount,
      missingPriceSkuCount: honeywell.missingPriceSkuCount,
    },
    {
      profileId: cisco.profileId,
      scope: cisco.scope,
      approvalRecordId: SCOPED_CISCO_PRICING_AUTHORITY_APPROVAL_RECORD_ID,
      activeSource: cisco.activeSource,
      activeSourceFixtureId: cisco.activeSourceFixtureId,
      activeSourceStatus: cisco.activeSourceStatus,
      currency: "SAR",
      pricedSkuCount: cisco.pricedSkuCount,
      missingPriceSkuCount: cisco.missingPriceSkuCount,
    },
  ];

  return {
    profileId: "quick-bom-approved-pricing-sources-profile",
    scope: "quick_bom_approved_pricing_sources",
    currency: "SAR",
    pricedSkuCount: honeywell.pricedSkuCount + cisco.pricedSkuCount,
    missingPriceSkuCount:
      honeywell.missingPriceSkuCount + cisco.missingPriceSkuCount,
    boundary: { ...PRICING_BOUNDARY },
    sources,
  };
}

/** Return the generic pricing source summary with authority boundary signals. */
export function getQuickBomApprovedPricingSourceSummary(): QuickBomApprovedPricingSourceSummary {
  return {
    source: "quick_bom_approved_pricing_sources",
    currency: "SAR",
    honeywellDemoFixtureIncluded: true,
    scopedCiscoFixtureIncluded: true,
    ...PRICING_BOUNDARY,
  };
}

/** Return the category/export provenance summary (no pricing authority signals). */
export function getQuickBomApprovedCategorySourceSummary(): QuickBomApprovedCategorySourceSummary {
  return {
    source: "quick_bom_approved_mantle_category_sources",
    honeywellDemoFixtureIncluded: true,
    scopedCiscoFixtureIncluded: true,
    demoFixtureAuthority: true,
    scopedCiscoCategoryAuthority: true,
    productionPricingAuthority: false,
    configurationAuthority: false,
    runtimeAi: false,
    runtimeCatalogLookup: false,
    replacementAuthority: false,
    silentSkuSubstitution: false,
  };
}
