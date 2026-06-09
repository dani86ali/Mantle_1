/**
 * Canonical default Project Quick BoM SKU lookup catalog.
 *
 * Builds the single default CatalogLookupIndex used by Quick BoM SKU resolution
 * when no explicit catalog index is supplied. It composes two approved
 * deterministic sources only:
 *   1. the committed local STC historical/mock catalog projection already used by
 *      getLocalMockCatalogLookupIndex();
 *   2. the approved Honeywell MVP demo SKU metadata projection from
 *      getHoneywellDemoCatalogItems().
 * Local mock entries keep precedence on any shared SKU; the Honeywell metadata
 * only adds SKUs the local mock catalog misses (e.g. C9300X-48HX-A,
 * C9300L-24P-4X-A, CW9178I-CFG). This is SKU recognition only - the merged index
 * is NOT pricing authority, NOT configuration authority, NOT replacement/
 * substitution authority, and NOT broad production Cisco-catalog authority. The
 * listPrice/currency fields exist only because CatalogLookupItem carries them for
 * compatibility; pricing stays separate.
 *
 * PURE HELPER: imports only catalog-lookup and honeywell-demo-catalog-fixture. No
 * DB, API/UI, auth, env, engine, coordinator, adapter (beyond the local mock-data
 * helper reached via catalog-lookup), pricing/export service, runner, AI/LLM, or
 * network client. Every catalog item is freshly copied so callers can never mutate
 * shared fixture or cached-index state.
 */
import {
  buildCatalogLookupIndex,
  getLocalMockCatalogLookupIndex,
  type CatalogLookupIndex,
  type CatalogLookupItem,
} from "@/lib/projects/catalog-lookup";
import { getHoneywellDemoCatalogItems } from "@/lib/projects/honeywell-demo-catalog-fixture";

/** Provenance tag for the canonical default Quick BoM approved-catalog lookup index. */
export const DEFAULT_QUICK_BOM_CATALOG_SOURCE =
  "default_quick_bom_approved_catalog" as const;

/**
 * Merge the local mock catalog projection with the approved Honeywell demo SKU
 * metadata into one flat CatalogLookupItem map. Local mock entries win on any
 * shared trimmed SKU key; Honeywell items are projected to CatalogLookupItem shape
 * and added only when the local catalog does not already carry that SKU.
 */
function buildDefaultItems(): Record<string, CatalogLookupItem> {
  const items: Record<string, CatalogLookupItem> = {};

  // Local STC historical/mock catalog first (legacy authority for SKUs it carries).
  const local = getLocalMockCatalogLookupIndex();
  for (const [sku, item] of Array.from(local.exact.entries())) {
    items[sku] = { ...item };
  }

  // Approved Honeywell MVP demo SKU metadata fills only the SKUs the local catalog
  // misses; never overrides an existing local entry. Optics stay flat (no relationships).
  for (const item of Object.values(getHoneywellDemoCatalogItems())) {
    const trimmedSku = item.sku.trim();
    if (trimmedSku === "" || trimmedSku in items) continue;
    items[trimmedSku] = {
      sku: item.sku,
      description: item.description,
      listPrice: item.listPrice,
      currency: item.currency,
      vendor: "Cisco",
      productCategory: item.category,
      priceListId: "honeywell_mvp_demo_catalog_supplement",
    };
  }

  return items;
}

let cachedDefaultIndex: CatalogLookupIndex | undefined;

/**
 * The canonical default Quick BoM SKU lookup index (local mock + approved Honeywell
 * demo SKU metadata), built once and cached. Tagged DEFAULT_QUICK_BOM_CATALOG_SOURCE
 * so matches and draft summaries report the canonical default source.
 */
export function getDefaultQuickBomCatalogLookupIndex(): CatalogLookupIndex {
  if (cachedDefaultIndex) return cachedDefaultIndex;
  cachedDefaultIndex = buildCatalogLookupIndex(
    buildDefaultItems(),
    DEFAULT_QUICK_BOM_CATALOG_SOURCE
  );
  return cachedDefaultIndex;
}
