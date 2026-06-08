/**
 * Honeywell MVP demo catalog supplement projection (flat catalog metadata only).
 *
 * Projects a flat, per-SKU catalog item map for exactly the 50 already-approved Honeywell
 * MVP demo SKU identities (approved rule-pack parents + children plus the two standalone
 * customer BoQ optics); each item carries a description, a Mantle-compatible category, and
 * the already-approved demo SAR list price. It exists because the local STC historical/mock
 * catalog misses key Honeywell parent SKUs, so a later SKU-resolution step needs a demo-
 * scoped supplement to resolve them deterministically. It does NOT wire the supplement into
 * runtime SKU resolution. Full boundary: HONEYWELL_DEMO_CATALOG_FIXTURE_BOUNDARY below;
 * demo scope/limitations: KNOWN_LIMITATIONS below.
 *
 * PURE LOADER: imports only the approved demo rule-pack selector and demo pricing fixture
 * loader (both fresh-copy sources); no DB, API/UI, engine, coordinator, adapter, AI/LLM,
 * workbook/export, artifact store, or route code, and no file read at call time. Every
 * getter builds fresh objects, so a caller can never mutate shared state.
 */
import { getHoneywellMvpConfigExpansionRulePack } from "@/lib/projects/honeywell-config-expansion-rule-pack";
import {
  getHoneywellDemoUnitListPriceSarBySku,
  getHoneywellDemoMantleCategoryByAcceptedSku,
  type HoneywellDemoMantleCategory,
} from "@/lib/projects/honeywell-demo-pricing-fixture";

/**
 * Authority boundary: Honeywell MVP demo scope only; grants no production catalog, broad
 * Cisco SKU, configuration, child-relationship, replacement/substitution, production
 * pricing, or runtime-AI authority, and is not wired into runtime SKU resolution.
 */
export const HONEYWELL_DEMO_CATALOG_FIXTURE_BOUNDARY = {
  scope: "honeywell_mvp_demo_only",
  demoCatalogSupplement: true,
  productionCiscoCatalogAuthority: false,
  broadCiscoGeneralSkuAuthority: false,
  configurationAuthority: false,
  childRelationshipAuthority: false,
  replacementAuthority: false,
  skuSubstitutionAuthority: false,
  productionPricingAuthority: false,
  runtimeAi: false,
  attachesOpticsUnderSwitches: false,
  wiredIntoRuntimeSkuResolution: false,
} as const;

/** Mantle-compatible total-bucket category, reused from the demo pricing fixture. */
export type HoneywellDemoCatalogCategory = HoneywellDemoMantleCategory;

/** Where one item's description was projected from (provenance only, not authority). */
export type HoneywellDemoCatalogDescriptionSource =
  | "config_expansion_rule_pack_parent"
  | "config_expansion_rule_pack_child"
  | "standalone_customer_boq_optic";

/** Per-item provenance: this is a projection of approved demo metadata, not catalog authority. */
export interface HoneywellDemoCatalogItemSource {
  projection: "honeywell_mvp_demo_catalog_supplement";
  descriptionSource: HoneywellDemoCatalogDescriptionSource;
  priceSource: "honeywell_mvp_demo_pricing_fixture";
  categorySource: "honeywell_mvp_demo_pricing_fixture";
  productionCatalogAuthority: false;
}

/**
 * One flat demo catalog item: identity, description, category, and demo SAR list price
 * ONLY. It has no parent/child relationship, replacement, acceptedSku, or review-decision
 * fields; relationships stay in the approved rule packs.
 */
export interface HoneywellDemoCatalogItem {
  sku: string;
  description: string;
  category: HoneywellDemoCatalogCategory;
  currency: "SAR";
  listPrice: number;
  source: HoneywellDemoCatalogItemSource;
}

/** Full Honeywell MVP demo catalog supplement: the flat item map plus its boundary. */
export interface HoneywellDemoCatalogFixture {
  fixtureId: "honeywell-mvp-demo-catalog-fixture";
  scope: "honeywell_mvp_demo_only";
  boundary: typeof HONEYWELL_DEMO_CATALOG_FIXTURE_BOUNDARY;
  skuCount: number;
  standaloneOptics: string[];
  items: Record<string, HoneywellDemoCatalogItem>;
  knownLimitations: string[];
}

/** The two standalone customer-requested BoQ optics; never switch children. */
const STANDALONE_OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="] as const;

/**
 * Explicit demo descriptions for the standalone customer BoQ optics: standalone customer-
 * requested BoQ SKU metadata only (not in the approved rule pack, never a switch child).
 */
const STANDALONE_OPTIC_DESCRIPTIONS: Record<string, string> = {
  "SFP-10G-LR-S=": "Cisco 10GBASE-LR SFP+ Module for SMF (standalone customer BoQ optic)",
  "SFP-10/25G-LR-S=": "Cisco 10/25GBASE-LR SFP28 Module for SMF (standalone customer BoQ optic)",
};

/** Demo-scope limitations carried on the supplement for reviewers. */
const KNOWN_LIMITATIONS = [
  "Honeywell MVP demo scope only: covers exactly the 50 approved demo SKU identities (rule-pack parents + children plus the two standalone customer BoQ optics); other SKUs are out of scope.",
  "Not production Cisco catalog authority and not broad Cisco-general SKU authority; production catalog resolution must later come from an approved Cisco API/CCW/catalog integration.",
  "Not configuration authority: parent/child derivation stays with the approved configuration-expansion rule packs; items carry no parent/child relationship.",
  "Not pricing authority beyond the already-approved Honeywell demo pricing fixture, and it approves no SKU replacement or silent substitution.",
  "Not wired into runtime SKU resolution: this is a foundation projection only.",
];

/** Guard messages; the projection fails loudly rather than emitting a partial item. */
const MISSING_PRICE = "Honeywell demo catalog supplement is missing a demo price for SKU";
const MISSING_CATEGORY = "Honeywell demo catalog supplement is missing a demo category for SKU";

/** One projected description plus its provenance. */
interface DescriptionEntry {
  description: string;
  source: HoneywellDemoCatalogDescriptionSource;
}

// Derive the ordered SKU universe + per-SKU description provenance from the approved rule
// pack (parents + children, first-seen wins) then the two optics, which always win so an
// optic can never read as a switch child. Price/category are looked up in buildItems.
function deriveDescriptionUniverse(): { order: string[]; descriptionBySku: Record<string, DescriptionEntry> } {
  const pack = getHoneywellMvpConfigExpansionRulePack();
  const descriptionBySku: Record<string, DescriptionEntry> = {};
  const order: string[] = [];
  for (const parent of pack.parentRules) {
    if (!(parent.parentSku in descriptionBySku)) {
      order.push(parent.parentSku);
      descriptionBySku[parent.parentSku] = { description: parent.parentDescription, source: "config_expansion_rule_pack_parent" };
    }
    for (const child of parent.childLines) {
      if (!(child.sku in descriptionBySku)) {
        order.push(child.sku);
        descriptionBySku[child.sku] = { description: child.description, source: "config_expansion_rule_pack_child" };
      }
    }
  }
  for (const optic of STANDALONE_OPTICS) {
    if (!(optic in descriptionBySku)) order.push(optic);
    descriptionBySku[optic] = { description: STANDALONE_OPTIC_DESCRIPTIONS[optic], source: "standalone_customer_boq_optic" };
  }
  return { order, descriptionBySku };
}

// Build the flat demo catalog item map fresh. SKU universe = approved rule-pack
// parents/children + the two optics; each item's demo SAR list price and category come from
// the approved demo pricing fixture and throw if absent (fail-fast on drift).
function buildItems(): Record<string, HoneywellDemoCatalogItem> {
  const prices = getHoneywellDemoUnitListPriceSarBySku();
  const categories = getHoneywellDemoMantleCategoryByAcceptedSku();
  const { order, descriptionBySku } = deriveDescriptionUniverse();
  const items: Record<string, HoneywellDemoCatalogItem> = {};
  for (const sku of order) {
    const price = prices[sku];
    if (price === undefined) throw new Error(`${MISSING_PRICE} "${sku}".`);
    const category = categories[sku];
    if (category === undefined) throw new Error(`${MISSING_CATEGORY} "${sku}".`);
    const entry = descriptionBySku[sku];
    items[sku] = {
      sku,
      description: entry.description,
      category,
      currency: price.currency,
      listPrice: price.unitListPriceSar,
      source: {
        projection: "honeywell_mvp_demo_catalog_supplement",
        descriptionSource: entry.source,
        priceSource: "honeywell_mvp_demo_pricing_fixture",
        categorySource: "honeywell_mvp_demo_pricing_fixture",
        productionCatalogAuthority: false,
      },
    };
  }
  return items;
}

/** Full Honeywell MVP demo catalog supplement as a fresh deep copy: flat item map + boundary. */
export function getHoneywellDemoCatalogFixture(): HoneywellDemoCatalogFixture {
  const items = buildItems();
  return {
    fixtureId: "honeywell-mvp-demo-catalog-fixture",
    scope: "honeywell_mvp_demo_only",
    boundary: { ...HONEYWELL_DEMO_CATALOG_FIXTURE_BOUNDARY },
    skuCount: Object.keys(items).length,
    standaloneOptics: STANDALONE_OPTICS.slice(),
    items,
    knownLimitations: KNOWN_LIMITATIONS.slice(),
  };
}

/** Return the flat demo catalog item map as a fresh deep copy (keyed by SKU). */
export function getHoneywellDemoCatalogItems(): Record<string, HoneywellDemoCatalogItem> {
  return buildItems();
}

/** Return one demo catalog item as a fresh deep copy, or undefined if out of scope. */
export function getHoneywellDemoCatalogItem(sku: string): HoneywellDemoCatalogItem | undefined {
  const items = buildItems();
  return Object.prototype.hasOwnProperty.call(items, sku) ? items[sku] : undefined;
}
