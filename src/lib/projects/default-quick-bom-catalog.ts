/**
 * Canonical default Project Quick BoM SKU lookup catalog.
 *
 * Builds the single default CatalogLookupIndex used by Quick BoM SKU resolution
 * when no explicit catalog index is supplied. It composes five approved
 * deterministic sources only:
 *   1. the committed local STC historical/mock catalog projection already used by
 *      getLocalMockCatalogLookupIndex();
 *   2. the approved Honeywell MVP demo SKU metadata projection from
 *      getHoneywellDemoCatalogItems();
 *   3. the Honeywell known same-SKU metadata for the Batch 4 historical/deferred
 *      replacement-candidate SKUs from getHoneywellKnownSameSkuCatalogItems();
 *   4. the Cisco collaboration / Room Kit EQX approved same-SKU recognition scope
 *      from getCiscoCollaborationApprovedSkuScopeItems();
 *   5. the Cisco industrial switching / accessory approved same-SKU recognition
 *      scope from getCiscoIndustrialSwitchingApprovedSkuScopeItems().
 * Local mock entries keep precedence on any shared SKU; the Honeywell demo
 * metadata only adds SKUs the local mock catalog misses (e.g. C9300X-48HX-A,
 * C9300L-24P-4X-A, CW9178I-CFG); the known same-SKU metadata then fills only the
 * remaining missing historical SKUs (e.g. C9300-DNX-A-48-3Y, CON-L1NBX-C9300XY4)
 * as same-SKU recognition rows; the Cisco collaboration scope fills only the
 * remaining missing Room Kit EQX SKUs (e.g. CS-KIT-EQX-C-K9, CON-SNT-CSKITEK9)
 * as zero-price same-SKU recognition rows, never overriding a positive-priced
 * local row (e.g. CS-MIC-TABLE-J, CON-SNT-CS5HEJMI stay local-priced); the Cisco
 * industrial switching scope last fills only the remaining missing industrial
 * SKUs (e.g. IEM-3500-14T2S=, IE-1000-4P2S-LM) as zero-price same-SKU recognition
 * rows, never overriding a positive-priced local row (e.g. STK-RACK-DINRAIL= stays
 * local-priced). This is SKU recognition only - the merged index
 * is NOT pricing authority, NOT configuration authority, NOT replacement/
 * substitution authority, and NOT broad production Cisco-catalog authority. The
 * known same-SKU rows recognize each historical SKU as ITSELF and never map it to
 * a current replacement SKU; the Batch 4 decision (no replacement approved, no
 * silent substitution, optics standalone) stands. The listPrice/currency fields
 * exist only because CatalogLookupItem carries them for compatibility; pricing
 * stays separate.
 *
 * PURE HELPER: imports only catalog-lookup, honeywell-demo-catalog-fixture,
 * honeywell-known-sku-catalog, quick-bom-cisco-collaboration-sku-scope, and
 * quick-bom-cisco-industrial-sku-scope. No
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
import { getHoneywellKnownSameSkuCatalogItems } from "@/lib/projects/honeywell-known-sku-catalog";
import { getCiscoCollaborationApprovedSkuScopeItems } from "@/lib/projects/quick-bom-cisco-collaboration-sku-scope";
import { getCiscoIndustrialSwitchingApprovedSkuScopeItems } from "@/lib/projects/quick-bom-cisco-industrial-sku-scope";

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

  // Honeywell known same-SKU metadata fills only the remaining missing historical/
  // deferred SKUs as same-SKU recognition rows; never overrides a local or demo
  // entry, and never maps a historical SKU to a current replacement SKU.
  for (const item of Object.values(getHoneywellKnownSameSkuCatalogItems())) {
    const trimmedSku = item.sku.trim();
    if (trimmedSku === "" || trimmedSku in items) continue;
    items[trimmedSku] = { ...item };
  }

  // Cisco collaboration / Room Kit EQX approved same-SKU recognition scope fills
  // only the remaining missing collaboration SKUs as zero-price recognition rows;
  // never overrides a local/demo/known entry (so positive-priced local rows such
  // as CS-MIC-TABLE-J and CON-SNT-CS5HEJMI keep their local prices), and never
  // maps a SKU to a replacement. The zero listPrice is a placeholder, not pricing.
  for (const item of Object.values(getCiscoCollaborationApprovedSkuScopeItems())) {
    const trimmedSku = item.sku.trim();
    if (trimmedSku === "" || trimmedSku in items) continue;
    items[trimmedSku] = {
      sku: item.sku,
      description: item.description,
      listPrice: item.listPrice,
      currency: item.currency,
      vendor: item.vendor,
      priceListId: item.priceListId,
    };
  }

  // Cisco industrial switching / accessory approved same-SKU recognition scope
  // fills only the remaining missing industrial SKUs as zero-price recognition
  // rows; never overrides a local/demo/known/collaboration entry (so a positive-
  // priced local row such as STK-RACK-DINRAIL= keeps its local price), and never
  // maps a SKU to a replacement. The zero listPrice is a placeholder, not pricing.
  for (const item of Object.values(
    getCiscoIndustrialSwitchingApprovedSkuScopeItems()
  )) {
    const trimmedSku = item.sku.trim();
    if (trimmedSku === "" || trimmedSku in items) continue;
    items[trimmedSku] = {
      sku: item.sku,
      description: item.description,
      listPrice: item.listPrice,
      currency: item.currency,
      vendor: item.vendor,
      priceListId: item.priceListId,
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
