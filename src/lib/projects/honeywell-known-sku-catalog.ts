/**
 * Honeywell known same-SKU catalog metadata (same-SKU recognition only).
 *
 * Exposes a flat CatalogLookupItem map for the 11 historical/deferred
 * replacement-candidate SKUs recorded in the Honeywell Batch 4 decision evidence.
 * These SKUs appear in the real 52-line Honeywell BoQ upload but are missed by
 * both the local STC mock catalog and the approved Honeywell demo SKU metadata,
 * so a default Quick BoM SKU-resolution pass cannot recognize them. Adding them
 * here lets an engineer see each one as a KNOWN same-SKU row and explicitly
 * accept/reject the customer-provided SKU.
 *
 * SAME-SKU ONLY. Each row's suggested SKU IS the historical SKU itself. This
 * module approves NO replacement, NO substitution, NO current-SKU mapping, NO
 * configuration/child relationship, and NO pricing. listPrice is 0 and currency
 * is "SAR" solely because CatalogLookupItem carries those fields; they are NOT
 * pricing authority and pricing stays separate. The Batch 4 decision stands: no
 * replacement candidate is approved, no silent substitution occurs, and optics
 * remain standalone customer BoQ rows (handled elsewhere, not here).
 *
 * PURE HELPER: imports only the CatalogLookupItem type from catalog-lookup. No
 * DB, API/UI, engine, coordinator, adapter, pricing/export service, runner,
 * AI/LLM, or network client. Every call returns freshly copied rows so a caller
 * can never mutate shared module state.
 */
import type { CatalogLookupItem } from "@/lib/projects/catalog-lookup";

/** Provenance tag for the Honeywell known same-SKU supplement (recognition, not pricing). */
export const HONEYWELL_KNOWN_SKU_PRICE_LIST_ID =
  "honeywell_known_same_sku_supplement" as const;

/**
 * The 11 historical/deferred replacement-candidate SKUs from the Honeywell Batch 4
 * decision evidence. Each is recognized as ITSELF (same-SKU); none is mapped to a
 * current replacement SKU. NOTE: a few (e.g. SC9300UK9-1712, C9300L-STACK-BLANK)
 * are already carried by earlier default sources; they are listed here for Batch 4
 * completeness, and the default composer keeps the earlier (local/demo) row.
 */
const KNOWN_SAME_SKUS = [
  "C9300-DNX-A-48-3Y",
  "C9300L-DNX-A-24-3Y",
  "SC9300UK9-1712",
  "S9300LUK9-1712",
  "SPACES-EXT-S",
  "CON-L1NBX-C9300XY4",
  "CON-L1SWX-93XA48MY",
  "CON-L1NBX-C93024PX",
  "CON-L1SWX-3LXA24MY",
  "CON-SNT-P7PK94P1",
  "C9300L-STACK-BLANK",
] as const;

/** Build one fresh same-SKU recognition row for a historical SKU. */
function buildKnownItem(sku: string): CatalogLookupItem {
  return {
    sku,
    description: `Known Honeywell historical SKU / deferred replacement candidate: ${sku}`,
    listPrice: 0,
    currency: "SAR",
    vendor: "Cisco",
    priceListId: HONEYWELL_KNOWN_SKU_PRICE_LIST_ID,
  };
}

/**
 * Fresh-copy map (keyed by SKU) of same-SKU recognition rows for the 11 known
 * Honeywell historical/deferred replacement-candidate SKUs. Every call rebuilds
 * the rows so callers can never mutate shared state.
 */
export function getHoneywellKnownSameSkuCatalogItems(): Record<string, CatalogLookupItem> {
  const items: Record<string, CatalogLookupItem> = {};
  for (const sku of KNOWN_SAME_SKUS) {
    items[sku] = buildKnownItem(sku);
  }
  return items;
}
