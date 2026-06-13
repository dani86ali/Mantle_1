/**
 * Cisco industrial switching / industrial accessory approved SKU recognition
 * scope (same-SKU recognition only).
 *
 * Exposes a flat catalog-shaped item map for exactly the ten approved Cisco
 * industrial switching / industrial accessory SKUs needed by mixed Cisco industrial
 * switching BoQ processing (IE3500 rugged switch and its SNTC support line, IE-1000 industrial
 * switch and its SNTC support line, industrial DIN-rail power supplies, IoT
 * utilities recognition tokens, a UK power cord, and a DIN-rail rack mount kit).
 * The local STC mock catalog and the Honeywell sources miss most of these, so a
 * default Quick BoM SKU-resolution pass cannot recognize them without this scope.
 * Adding them here lets an engineer see each one as a KNOWN same-SKU row and
 * explicitly accept/reject the customer-provided SKU.
 *
 * SAME-SKU ONLY. Each row's suggested SKU IS the SKU itself. This module approves
 * NO replacement, NO substitution, NO current-SKU mapping, NO configuration/child/
 * accessory relationship, NO support-term/service-duration expansion, and NO
 * pricing. listPrice is 0 and currency is "SAR" SOLELY because the default catalog
 * composer expects catalog-shaped rows; those values are placeholders and are NOT
 * pricing authority. Pricing stays separate. Where the local mock catalog already
 * carries one of these SKUs with a positive price (e.g. STK-RACK-DINRAIL=), the
 * default composer keeps that earlier local row, so these zero placeholders never
 * override real local prices.
 *
 * The official Cisco IE3500, IE1000, and industrial power supply data sheets are
 * supporting product documentation only, not runtime pricing/configuration
 * authority:
 *   https://www.cisco.com/c/en/us/products/collateral/networking/industrial-switches/ie3500-rugged-series/ie3500-rugged-series-ds.html
 *   https://www.cisco.com/c/en/us/products/collateral/switches/industrial-ethernet-1000-series-switches/datasheet-c78-737277.html
 *   https://www.cisco.com/c/en/us/products/collateral/switches/industrial-ethernet-switches/datasheet-c78-742180.html
 *
 * PURE HELPER: this module imports NOTHING (not even a type-only import) so the
 * harness guard never flags a catalog-lookup/runtime boundary here. It performs no
 * runtime AI, no network, no DB, no catalog lookup, no validation, and no
 * configuration decision. Every call returns freshly copied rows so callers can
 * never mutate shared module state.
 */

/**
 * Minimal structural shape matching the fields the default Quick BoM catalog needs
 * from a catalog item. Defined locally on purpose (no catalog-lookup import); it is
 * structurally compatible with CatalogLookupItem at the composition site.
 */
export interface CiscoIndustrialSwitchingApprovedSkuScopeItem {
  sku: string;
  description: string;
  listPrice: number;
  currency: string;
  vendor: string;
  priceListId: string;
}

/** Provenance tag for the Cisco industrial switching approved SKU scope (recognition, not pricing). */
export const CISCO_INDUSTRIAL_SWITCHING_APPROVED_SKU_SCOPE_PRICE_LIST_ID =
  "cisco_industrial_switching_approved_sku_scope" as const;

/**
 * The ten approved Cisco industrial switching / accessory SKUs and their scoped,
 * generic descriptions. Each is recognized as ITSELF (same-SKU); none is mapped to
 * a replacement SKU and none carries child/accessory/support-term expansion.
 */
const APPROVED_SCOPE: ReadonlyArray<{ sku: string; description: string }> = [
  {
    sku: "IEM-3500-14T2S=",
    description:
      "Cisco IE3500 Rugged Series switch, 14 copper ports and 2 SFP uplinks",
  },
  { sku: "CON-SNT-IEM35B2S", description: "SNTC-8X5XNBD Cisco IE3500 14T2S" },
  {
    sku: "PWR-IE480W-PCAC-L=",
    description: "Cisco industrial DIN-rail power supply, 480W AC",
  },
  {
    sku: "IE-1000-4P2S-LM",
    description:
      "Cisco Industrial Ethernet 1000 switch, 4 PoE ports and 2 SFP uplinks",
  },
  { sku: "CON-SNT-I1002SLM", description: "SNTC-8X5XNBD Cisco IE-1000-4P2S-LM" },
  { sku: "IOT-UTILITIES", description: "Cisco IoT utilities" },
  { sku: "IOT-UTIL-OTHER", description: "Cisco IoT utilities other" },
  {
    sku: "PWR-IE170W-PC-AC=",
    description: "Cisco industrial DIN-rail power supply, 170W AC",
  },
  { sku: "CAB-TA-UK=", description: "Cisco AC power cord, United Kingdom" },
  { sku: "STK-RACK-DINRAIL=", description: "Cisco DIN-rail rack mount kit" },
];

/** Build one fresh same-SKU recognition row. listPrice/currency are placeholders, not pricing. */
function buildScopeItem(
  sku: string,
  description: string
): CiscoIndustrialSwitchingApprovedSkuScopeItem {
  return {
    sku,
    description,
    listPrice: 0,
    currency: "SAR",
    vendor: "Cisco",
    priceListId: CISCO_INDUSTRIAL_SWITCHING_APPROVED_SKU_SCOPE_PRICE_LIST_ID,
  };
}

/**
 * Fresh-copy map (keyed by SKU) of same-SKU recognition rows for the ten approved
 * Cisco industrial switching / accessory SKUs. Every call rebuilds the rows so
 * callers can never mutate shared state.
 */
export function getCiscoIndustrialSwitchingApprovedSkuScopeItems(): Record<
  string,
  CiscoIndustrialSwitchingApprovedSkuScopeItem
> {
  const items: Record<string, CiscoIndustrialSwitchingApprovedSkuScopeItem> = {};
  for (const entry of APPROVED_SCOPE) {
    items[entry.sku] = buildScopeItem(entry.sku, entry.description);
  }
  return items;
}
