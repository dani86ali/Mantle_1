/**
 * Honeywell MVP demo catalog lookup overlay (explicit opt-in only).
 *
 * Converts the Prompt 104 Honeywell demo catalog supplement into a
 * CatalogLookupIndex for use by deterministic lookup tests and later
 * explicitly opted-in services. This overlay does NOT change default runtime
 * catalog lookup behavior. It does NOT price artifacts or create production
 * pricing authority. It does NOT create configuration authority or parent/child
 * relationships. Optics remain standalone flat items only.
 *
 * PURE HELPER: imports only catalog-lookup and honeywell-demo-catalog-fixture.
 * No DB, API/UI, engine, coordinator, adapter, AI/LLM, workbook/export,
 * artifact store, route, or pricing engine code.
 */
import {
  buildCatalogLookupIndex,
  lookupCatalogSku,
  lookupCatalogSkus,
  type CatalogLookupIndex,
  type CatalogLookupItem,
  type CatalogLookupResult,
} from "@/lib/projects/catalog-lookup";
import { getHoneywellDemoCatalogItems } from "@/lib/projects/honeywell-demo-catalog-fixture";

/**
 * Authority boundary: explicit opt-in overlay for Honeywell MVP demo scope only.
 * Grants no production catalog, broad Cisco, configuration, replacement/substitution,
 * production pricing, runtime AI, or default-runtime-wiring authority.
 * Does not attach optics under switches.
 */
export const HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY = {
  scope: "honeywell_mvp_demo_only",
  explicitOptInOverlay: true,
  changesDefaultRuntimeCatalogLookup: false,
  productionCiscoCatalogAuthority: false,
  broadCiscoGeneralSkuAuthority: false,
  configurationAuthority: false,
  parentChildRelationshipAuthority: false,
  replacementAuthority: false,
  skuSubstitutionAuthority: false,
  productionPricingAuthority: false,
  pricesArtifacts: false,
  runtimeAi: false,
  wiredIntoDefaultRuntimeSkuResolution: false,
  attachesOpticsUnderSwitches: false,
} as const;

/**
 * Project the Honeywell demo catalog supplement items into CatalogLookupItem
 * shape. Each item carries a list price field only because CatalogLookupItem
 * requires it; this overlay does NOT price artifacts and does NOT create
 * production pricing authority.
 *
 * Returns a fresh Record so callers cannot mutate shared fixture state.
 */
export function getHoneywellDemoCatalogLookupItems(): Record<string, CatalogLookupItem> {
  const fixtureItems = getHoneywellDemoCatalogItems();
  const result: Record<string, CatalogLookupItem> = {};
  for (const [key, item] of Object.entries(fixtureItems)) {
    result[key] = {
      sku: item.sku,
      description: item.description,
      listPrice: item.listPrice,
      currency: item.currency,
      vendor: "Cisco",
      productCategory: item.category,
      priceListId: "honeywell_mvp_demo_catalog_supplement",
    };
  }
  return result;
}

/**
 * Build a fresh CatalogLookupIndex over the Honeywell demo catalog supplement.
 * Each call returns a new index; callers cannot mutate shared state.
 */
export function getHoneywellDemoCatalogLookupIndex(): CatalogLookupIndex {
  return buildCatalogLookupIndex(getHoneywellDemoCatalogLookupItems());
}

/**
 * Resolve one SKU against the Honeywell demo catalog overlay only.
 * Delegates to lookupCatalogSku with an explicit overlay index.
 * Never accepts, replaces, prices, or performs AI inference.
 */
export function lookupHoneywellDemoCatalogSku(sku: string): CatalogLookupResult {
  return lookupCatalogSku(sku, getHoneywellDemoCatalogLookupIndex());
}

/**
 * Resolve many SKUs against the Honeywell demo catalog overlay only.
 * One result per input, original order and duplicates preserved.
 * Delegates to lookupCatalogSkus with an explicit overlay index.
 */
export function lookupHoneywellDemoCatalogSkus(skus: readonly string[]): CatalogLookupResult[] {
  return lookupCatalogSkus(skus, getHoneywellDemoCatalogLookupIndex());
}
