/**
 * Honeywell MVP demo price/category fixture loader.
 *
 * Serves the committed data/quick-bom/honeywell-demo-pricing-fixture.json: a
 * TEMPORARY, demo-only per-SKU SAR list price map and Mantle total-bucket category
 * map for exactly the 50 Honeywell MVP target SKUs (every unique configuration-
 * expansion parent/child SKU plus the two standalone customer BoQ optics), plus a
 * Mantle export presentation row-order SKU occurrence sequence (CCW item-row order,
 * presentation/order evidence only, no pricing/config/replacement authority). Each
 * demo price is the effective per-unit list price derived from the configured CCW
 * estimate (Estimate_NB167337237YA.xlsx) as Extended ListPrice / Quantity, which
 * deliberately captures term/effective unit pricing.
 *
 * BOUNDARY (demo fixture authority ONLY): this is not production Cisco pricing
 * authority, not broad Cisco-general pricing, not runtime AI pricing, not runtime
 * catalog lookup, not replacement authority, and it authorizes no silent SKU
 * substitution. Production pricing must later come from an approved Cisco
 * API/CCW/catalog pricing integration or a separately approved pricing source.
 * Configuration authority stays separate from pricing authority.
 *
 * PURE LOADER: it statically imports ONLY the committed JSON fixture and reads no
 * file at runtime. It imports no pricing engine, catalog lookup, DB, API/UI,
 * export/workbook, AI/LLM, or package module. The return types declared below are
 * local but structurally identical to ExplicitSarUnitPrice (priced-boq) and
 * MantleLineCategory (mantle-price-estimate-model), so the price map drops straight
 * into buildPricedExpandedBoqDraft and the category map into
 * buildMantlePriceEstimateModel without importing either module. Getters return deep
 * copies, so a caller can never mutate the committed fixture state.
 */
import fixtureJson from "../../../data/quick-bom/honeywell-demo-pricing-fixture.json";

/** Mantle total-bucket category. Structurally identical to MantleLineCategory. */
export type HoneywellDemoMantleCategory = "product" | "service" | "subscription";

/** Explicit demo SAR list price. Structurally identical to ExplicitSarUnitPrice. */
export interface HoneywellDemoUnitListPriceSar {
  currency: "SAR";
  unitListPriceSar: number;
}

/** Per-SKU CCW-estimate evidence backing one demo unit price. */
export interface HoneywellDemoPriceSourceEvidence {
  sourceType: "ccw_estimate";
  workbookPath: string;
  sheetName: string;
  worksheetRowNumber: number;
  ccwLineNumber: string;
  sourceQuantity: number;
  rawListPrice: number;
  rawExtendedListPrice: number;
  rawSellingPrice: number;
  derivationNote: "extended_list_price_divided_by_quantity";
}

/** Top-level source-evidence boundary block for the whole fixture. */
export interface HoneywellDemoFixtureSourceEvidence {
  primarySourceType: "ccw_estimate";
  workbookPath: string;
  sheetName: string;
  derivationNote: "extended_list_price_divided_by_quantity";
  note: string;
}

/** Full shape of the committed Honeywell MVP demo pricing fixture. */
export interface HoneywellDemoPricingFixture {
  fixtureId: "honeywell-mvp-demo-pricing-fixture";
  scope: "honeywell_mvp_demo_only";
  status: "approved_demo_fixture";
  demoFixtureAuthority: true;
  productionPricingAuthority: false;
  runtimeAiPricing: false;
  runtimeCatalogLookup: false;
  replacementAuthority: false;
  silentSkuSubstitution: false;
  currency: "SAR";
  skuCount: number;
  sourceEvidence: HoneywellDemoFixtureSourceEvidence;
  standaloneOptics: string[];
  unitListPriceSarBySku: Record<string, HoneywellDemoUnitListPriceSar>;
  priceSourceEvidenceBySku: Record<string, HoneywellDemoPriceSourceEvidence>;
  categoryByAcceptedSku: Record<string, HoneywellDemoMantleCategory>;
  /**
   * Mantle EXPORT PRESENTATION row order only: the 60-entry CCW item-row SKU
   * occurrence sequence (with duplicates) from Estimate_NB167337237YA.xlsx, used to
   * order the generated Mantle workbook rows to match the approved benchmark. This is
   * order/presentation evidence only - NOT pricing authority, NOT configuration
   * authority, NOT replacement authority, and it authorizes no SKU substitution or
   * re-resolution.
   */
  mantleRowOrderSkuSequence: string[];
  knownLimitations: string[];
}

// The static JSON import widens string/boolean literals (e.g. "SAR" -> string), so
// the committed fixture is read through `unknown` into the contract type. The fixture
// is regression-tested against this shape, so the assertion never masks a bad fixture.
const FIXTURE = fixtureJson as unknown as HoneywellDemoPricingFixture;

/** Recursive structural deep-copy for plain JSON data (objects/arrays/primitives). */
function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => deepCopy(entry)) as unknown as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = deepCopy(entry);
    }
    return out as T;
  }
  return value;
}

/**
 * Return the full Honeywell MVP demo pricing fixture as a fresh deep copy. Demo
 * fixture authority only (see the module boundary); never production pricing authority.
 */
export function getHoneywellDemoPricingFixture(): HoneywellDemoPricingFixture {
  return deepCopy(FIXTURE);
}

/**
 * Return the per-SKU demo SAR list price map as a fresh deep copy, ready to pass as
 * buildPricedExpandedBoqDraft's unitListPriceSarBySku. Each value is an explicit SAR
 * list price (currency + unitListPriceSar) and carries no discount, margin, markup,
 * VAT, FX, or sell-price authority. Demo fixture authority only.
 */
export function getHoneywellDemoUnitListPriceSarBySku(): Record<string, HoneywellDemoUnitListPriceSar> {
  return deepCopy(FIXTURE.unitListPriceSarBySku);
}

/**
 * Return the per-SKU Mantle total-bucket category map as a fresh deep copy, ready to
 * pass as buildMantlePriceEstimateModel's categoryByAcceptedSku. Category affects
 * only Mantle total buckets, never rule/configuration authority. Demo fixture only.
 */
export function getHoneywellDemoMantleCategoryByAcceptedSku(): Record<string, HoneywellDemoMantleCategory> {
  return deepCopy(FIXTURE.categoryByAcceptedSku);
}

/**
 * Return the Mantle export presentation row-order SKU occurrence sequence as a fresh
 * copy, ready to pass as buildMantlePriceEstimateModel's rowOrderSkuSequence. It is the
 * 60-entry CCW item-row order (including duplicate SKU occurrences) from the configured
 * estimate, used ONLY to order the generated Mantle workbook rows to match the approved
 * benchmark. This is export presentation/order evidence only: never pricing authority,
 * never configuration authority, never replacement authority, and it authorizes no SKU
 * substitution or re-resolution. Demo fixture authority only.
 */
export function getHoneywellDemoMantleRowOrderSkuSequence(): string[] {
  return deepCopy(FIXTURE.mantleRowOrderSkuSequence);
}
