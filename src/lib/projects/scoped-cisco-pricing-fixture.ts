/**
 * Scoped Cisco Quick BoM pricing source loader.
 *
 * Serves the committed data/quick-bom/scoped-cisco-pricing-fixture.json: an
 * approved, SCOPED per-SKU SAR list price map plus Mantle total-bucket category map
 * for exactly the approved Cisco collaboration and industrial switching Quick BoM
 * scope, plus a Mantle export presentation row-order SKU occurrence sequence (with
 * the duplicate STK-RACK-DINRAIL= occurrence preserved). Each unit list price is the
 * approved workbook ListPrice column value for that item row (SAR-only).
 *
 * BOUNDARY (scoped pricing source authority ONLY): this is NOT production Cisco
 * pricing authority, NOT broad Cisco-general pricing, NOT runtime AI pricing, NOT
 * runtime catalog lookup, NOT configuration authority, NOT replacement authority, and
 * it authorizes NO silent SKU substitution and NO silent omission of unsupported or
 * non-Cisco lines. Configuration authority stays separate from pricing authority.
 *
 * PURE LOADER: it statically imports ONLY the committed JSON fixture and reads no file
 * at runtime. It imports no pricing math, priced-BoQ, config-expansion, catalog
 * lookup, DB, API/UI, engine, adapter, AI/LLM, workbook/export, or package module.
 * Getters return fresh deep copies, so a caller can never mutate the committed fixture.
 */
import fixtureJson from "../../../data/quick-bom/scoped-cisco-pricing-fixture.json";

/** Mantle total-bucket category for a scoped Cisco SKU. */
export type ScopedCiscoMantleCategory = "product" | "service";

/** Explicit scoped SAR list price. Structurally identical to ExplicitSarUnitPrice. */
export interface ScopedCiscoUnitListPriceSar {
  currency: "SAR";
  unitListPriceSar: number;
}

/** One approved-workbook source line backing a scoped Cisco unit price. */
export interface ScopedCiscoPriceSourceLine {
  lineNumber: string;
  sourceQuantity: number;
  rawListPrice: number;
  rawExtendedListPrice: number;
}

/** Per-SKU approved-workbook evidence backing one scoped Cisco unit price. */
export interface ScopedCiscoPriceSourceEvidence {
  sourceType: "approved_scoped_workbook";
  workbookPath: string;
  sheetName: string;
  sourceLines: ScopedCiscoPriceSourceLine[];
}

/** Top-level source-evidence provenance block for the whole fixture. */
export interface ScopedCiscoFixtureSourceEvidence {
  primarySourceType: "approved_scoped_workbook";
  workbookPath: string;
  sheetName: string;
  derivationNote: "unit_sar_list_price_is_workbook_listprice_column";
  note: string;
}

/** Explicit scoped pricing-source boundary block for the whole fixture. */
export interface ScopedCiscoPricingFixtureBoundary {
  deterministicPricingAuthority: true;
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

/** Full shape of the committed scoped Cisco Quick BoM pricing fixture. */
export interface ScopedCiscoPricingFixture {
  fixtureId: "scoped-cisco-quick-bom-pricing-fixture";
  scope: "scoped_cisco_quick_bom_pricing_source";
  status: "approved_scoped_pricing_source";
  boundary: ScopedCiscoPricingFixtureBoundary;
  currency: "SAR";
  skuCount: number;
  rowOrderOccurrenceCount: number;
  supportServiceOccurrenceCount: number;
  scopedExtendedListPriceTotalSar: number;
  sourceEvidence: ScopedCiscoFixtureSourceEvidence;
  supportServiceSkus: string[];
  unitListPriceSarBySku: Record<string, ScopedCiscoUnitListPriceSar>;
  categoryBySku: Record<string, ScopedCiscoMantleCategory>;
  priceSourceEvidenceBySku: Record<string, ScopedCiscoPriceSourceEvidence>;
  /**
   * Mantle EXPORT PRESENTATION row order only: the 44-entry approved-workbook item-row
   * SKU occurrence sequence (with the duplicate STK-RACK-DINRAIL= occurrence preserved),
   * used to order the generated Mantle workbook rows to match the approved benchmark.
   * Order/presentation evidence only - NOT pricing authority, NOT configuration
   * authority, NOT replacement authority, and it authorizes no SKU substitution.
   */
  mantleRowOrderSkuSequence: string[];
  /** Per-occurrence approved-workbook quantity aligned with mantleRowOrderSkuSequence. */
  mantleRowOrderQuantities: number[];
  knownLimitations: string[];
}

// The static JSON import widens string/boolean literals (e.g. "SAR" -> string), so the
// committed fixture is read through `unknown` into the contract type. The fixture is
// regression-tested against this shape, so the assertion never masks a bad fixture.
const FIXTURE = fixtureJson as unknown as ScopedCiscoPricingFixture;

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
 * Return the full scoped Cisco Quick BoM pricing fixture as a fresh deep copy. Scoped
 * pricing-source authority only (see the module boundary); never production pricing.
 */
export function getScopedCiscoPricingFixture(): ScopedCiscoPricingFixture {
  return deepCopy(FIXTURE);
}

/**
 * Return the per-SKU scoped SAR list price map as a fresh deep copy. Each value is an
 * explicit SAR list price (currency + unitListPriceSar) and carries no discount, margin,
 * markup, VAT, FX, or sell-price authority. Scoped pricing-source authority only.
 */
export function getScopedCiscoUnitListPriceSarBySku(): Record<string, ScopedCiscoUnitListPriceSar> {
  return deepCopy(FIXTURE.unitListPriceSarBySku);
}

/**
 * Return the per-SKU Mantle total-bucket category map as a fresh deep copy. Category
 * affects only Mantle total buckets, never rule/configuration authority. Scoped only.
 */
export function getScopedCiscoMantleCategoryBySku(): Record<string, ScopedCiscoMantleCategory> {
  return deepCopy(FIXTURE.categoryBySku);
}

/**
 * Return the Mantle export presentation row-order SKU occurrence sequence as a fresh
 * copy (44 entries, duplicate STK-RACK-DINRAIL= preserved). Export presentation/order
 * evidence only: never pricing authority, never configuration authority, never
 * replacement authority, and it authorizes no SKU substitution or re-resolution.
 */
export function getScopedCiscoMantleRowOrderSkuSequence(): string[] {
  return deepCopy(FIXTURE.mantleRowOrderSkuSequence);
}
