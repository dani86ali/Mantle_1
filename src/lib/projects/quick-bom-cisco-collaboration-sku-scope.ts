/**
 * Cisco collaboration / Room Kit EQX approved SKU recognition scope
 * (same-SKU recognition only).
 *
 * Exposes a flat catalog-shaped item map for the approved Cisco collaboration /
 * Room Kit EQX SKUs needed by mixed Cisco collaboration BoQ processing (Room Kit EQX
 * bundle, codec, cameras, speakers, mounting/frame modules, power, cabling,
 * accessories, included items, floor stand kit, table microphone, and their SNTC
 * support lines). The local STC mock catalog and the Honeywell sources miss several
 * of these, so a default Quick BoM SKU-resolution pass cannot recognize them without
 * this scope. Adding them here lets an engineer see each one as a KNOWN same-SKU row
 * and explicitly accept/reject the customer-provided SKU.
 *
 * SAME-SKU ONLY. Each row's suggested SKU IS the SKU itself. This module approves
 * NO replacement, NO substitution, NO current-SKU mapping, NO configuration/child/
 * accessory relationship, NO support-term/service-duration expansion, and NO
 * pricing. listPrice is 0 and currency is "SAR" SOLELY because the default catalog
 * composer expects catalog-shaped rows; those values are placeholders and are NOT
 * pricing authority. Pricing stays separate. Where the local mock catalog already
 * carries one of these SKUs with a positive price, the default composer keeps that
 * earlier local row, so these zero placeholders never override real local prices.
 *
 * The official Cisco Room Kit EQX data sheet / support pages are supporting
 * product documentation only, not runtime pricing authority:
 *   https://www.cisco.com/c/en/us/products/collateral/collaboration-endpoints/spark-room-kit-series/room-kit-eqx-ds.html
 *   https://www.cisco.com/c/en/us/support/collaboration-endpoints/room-kit-eqx/model.html
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
export interface CiscoCollaborationApprovedSkuScopeItem {
  sku: string;
  description: string;
  listPrice: number;
  currency: string;
  vendor: string;
  priceListId: string;
}

/** Provenance tag for the Cisco collaboration approved SKU scope (recognition, not pricing). */
export const CISCO_COLLABORATION_APPROVED_SKU_SCOPE_PRICE_LIST_ID =
  "cisco_collaboration_approved_sku_scope" as const;

/**
 * The approved Cisco collaboration / Room Kit EQX SKUs and their scoped
 * descriptions. Each is recognized as ITSELF (same-SKU); none is mapped to a
 * replacement SKU and none carries child/accessory/support-term expansion.
 */
const APPROVED_SCOPE: ReadonlyArray<{ sku: string; description: string }> = [
  { sku: "CS-KIT-EQX-C-K9", description: "Cisco Room Kit EQX, Carbon Black" },
  {
    sku: "CON-SNT-CSKITEK9",
    description: "SNTC-8X5XNBD Cisco Room Kit EQX, Carbon Black",
  },
  { sku: "CS-MIC-TABLE-J", description: "Cisco Table Microphone" },
  { sku: "CON-SNT-CS5HEJMI", description: "SNTC-8X5XNBD Cisco Table Microphone" },
  { sku: "PWR-CORD-GBR-F", description: "Power Cord for United Kingdom, 5m, 10A" },
  { sku: "CAB-HDMI-MUL4K-9M", description: "Cisco Multi-head Cable, 9m, 4K" },
  { sku: "CAB-EQX-SCREENS", description: "HDMI Cables for Room Kit EQX Screens" },
  { sku: "CS-CODEC-EQ-K9-", description: "Cisco Room Kit EQX Codec" },
  { sku: "CS-RQUADCAM-", description: "Cisco Quad Camera for Room Kit EQX" },
  { sku: "CS-PANO-DNAM4-", description: "Digital Natural Audio Module IV Amplifier" },
  { sku: "CS-EQX-SPK-", description: "Room Kit EQX Top Speaker Unit" },
  { sku: "CS-EQX-BASS-", description: "Room Kit EQX Bass Unit" },
  { sku: "CS-EQX-FAN-", description: "Room Kit EQX Cooling Fan Unit" },
  { sku: "CS-EQX-CENTER-MOD-", description: "Room Kit EQX Center Module" },
  { sku: "CS-EQX-SIDE-MOD-", description: "Room Kit EQX Side Wall Module" },
  { sku: "CS-EQX-FRAME-C-", description: "Room Kit EQX Front Frame Module, Carbon Black" },
  { sku: "CS-EQX-VESA-", description: "Room Kit EQX VESA Bracket for Screens" },
  { sku: "PSU-12VDC-120W-", description: "AC/DC Power Supply, 12V, 120W" },
  { sku: "PSU-24VDC-270W-", description: "AC/DC Power Supply, 24V, 270W" },
  { sku: "CS-EQX-ANT-", description: "Wi-Fi and Bluetooth Antenna Kit for Room Kit EQX" },
  { sku: "CS-PWR-STRIP4-", description: "Power Strip, 1x C14 Inlet, 4x Outlet F" },
  { sku: "PWR-CAB-INT-3.0M-", description: "Internal Power Cable, 3.0m" },
  { sku: "PWR-CAB-INT-0.22M-", description: "Internal Power Cable, 0.22m" },
  { sku: "CAB-ETH-5M-GR-", description: "Ethernet Cable, 5m, Grey" },
  { sku: "CAB-2HDMI-1.5M-GR-", description: "HDMI 2.0 Cable, 1.5m, Grey" },
  { sku: "CAB-ETH-1.5M-GR-", description: "Ethernet Cable, 1.5m, Grey" },
  { sku: "CAB-EQX-SPKR-", description: "Room Kit EQX Speaker Cable" },
  { sku: "PWR-CAB-INT-1.45M-", description: "Internal Power Cable, 1.45m" },
  { sku: "CAB-CAT5E-12M-", description: "Ethernet CAT5E Round Cable, 12m, Gray" },
  { sku: "CS-T10-TS-LX-", description: "Cisco Room Navigator Table Stand, First Light" },
  {
    sku: "CS-EQX-FSK-ST-C-",
    description: "Room Kit EQX Floor Stand without Rear Covers, Carbon Black",
  },
  {
    sku: "CS-EQX-FSK-RC-C-",
    description: "Room Kit EQX Floor Stand Rear Covers, Carbon Black",
  },
  {
    sku: "CS-KIT-EQX-FSK-C",
    description: "Cisco Room Kit EQX Floor Stand Kit, Carbon Black",
  },
];

/** Build one fresh same-SKU recognition row. listPrice/currency are placeholders, not pricing. */
function buildScopeItem(
  sku: string,
  description: string
): CiscoCollaborationApprovedSkuScopeItem {
  return {
    sku,
    description,
    listPrice: 0,
    currency: "SAR",
    vendor: "Cisco",
    priceListId: CISCO_COLLABORATION_APPROVED_SKU_SCOPE_PRICE_LIST_ID,
  };
}

/**
 * Fresh-copy map (keyed by SKU) of same-SKU recognition rows for the approved
 * Cisco collaboration SKUs. Every call rebuilds the rows so callers can never
 * mutate shared state.
 */
export function getCiscoCollaborationApprovedSkuScopeItems(): Record<
  string,
  CiscoCollaborationApprovedSkuScopeItem
> {
  const items: Record<string, CiscoCollaborationApprovedSkuScopeItem> = {};
  for (const entry of APPROVED_SCOPE) {
    items[entry.sku] = buildScopeItem(entry.sku, entry.description);
  }
  return items;
}
