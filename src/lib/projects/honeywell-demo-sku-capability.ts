/**
 * Honeywell MVP demo SKU capability profile (read-only evidence/support).
 *
 * Joins the Honeywell demo catalog supplement, approved Batch 1+2+3 rule pack,
 * and demo pricing fixture to answer: for a given Honeywell MVP demo SKU, do we
 * have catalog lookup coverage, approved configuration-expansion rule coverage,
 * and pricing coverage, and what should happen if no approved relationship exists?
 *
 * PURE READ-ONLY: imports only the three approved demo sources listed below.
 * No DB, API/UI, engine, coordinator, adapter, AI/LLM, workbook/export, artifact
 * store, route, filesystem, or package code. No new runtime authority is created.
 * All getters return fresh copies; callers cannot mutate shared state.
 */
import { getHoneywellDemoCatalogFixture } from "@/lib/projects/honeywell-demo-catalog-fixture";
import {
  getHoneywellMvpConfigExpansionRulePack,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
  HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE,
} from "@/lib/projects/honeywell-config-expansion-rule-pack";
import {
  getHoneywellDemoPricingFixture,
} from "@/lib/projects/honeywell-demo-pricing-fixture";

/**
 * How this SKU participates in the approved Honeywell MVP demo scope.
 * - "expandable_parent": approved rule-pack parent SKU.
 * - "rule_pack_child": SKU that appears only as an approved child line.
 * - "standalone_customer_boq_line": one of the two standalone customer-requested optics.
 * - "unknown_deferred": out-of-scope; no approved relationship.
 */
export type HoneywellDemoSkuCapabilityKind =
  | "expandable_parent"
  | "rule_pack_child"
  | "standalone_customer_boq_line"
  | "unknown_deferred";

/** Authority boundary carried on every capability: no new runtime authority. */
export interface HoneywellDemoSkuCapabilityBoundary {
  scope: "honeywell_mvp_demo_only";
  productionCiscoCatalogAuthority: false;
  productionPricingAuthority: false;
  broadCiscoGeneralAuthority: false;
  configurationAuthority: false;
  replacementAuthority: false;
  skuSubstitutionAuthority: false;
  runtimeAi: false;
  newAuthorityCreated: false;
}

/** Read-only per-SKU capability shape. Serializable; no functions. */
export interface HoneywellDemoSkuCapability {
  sku: string;
  kind: HoneywellDemoSkuCapabilityKind;
  catalogCovered: boolean;
  pricingCovered: boolean;
  expansionParentCovered: boolean;
  expansionChildCovered: boolean;
  standaloneCustomerBoqLine: boolean;
  deferred: boolean;
  childCount: number;
  childSkus: string[];
  parentSkus: string[];
  rulePackId: string | null;
  rulePackVersion: string | null;
  rulePackSourceScope: string | null;
  catalogSource: string | null;
  pricingSource: string | null;
  boundary: HoneywellDemoSkuCapabilityBoundary;
}

/** Full serializable capability profile for all known Honeywell MVP demo SKUs. */
export interface HoneywellDemoSkuCapabilityProfile {
  profileId: "honeywell-mvp-demo-sku-capability-profile";
  scope: "honeywell_mvp_demo_only";
  catalogFixtureId: string;
  rulePackId: string;
  rulePackVersion: string;
  rulePackSourceScope: string;
  pricingFixtureId: string;
  totalKnownSkuCount: number;
  expandableParentCount: number;
  rulePackChildOnlyCount: number;
  standaloneCustomerBoqLineCount: number;
  unknownDeferredCount: number;
  capabilities: Record<string, HoneywellDemoSkuCapability>;
  boundary: HoneywellDemoSkuCapabilityBoundary;
}

const STATIC_BOUNDARY: HoneywellDemoSkuCapabilityBoundary = {
  scope: "honeywell_mvp_demo_only",
  productionCiscoCatalogAuthority: false,
  productionPricingAuthority: false,
  broadCiscoGeneralAuthority: false,
  configurationAuthority: false,
  replacementAuthority: false,
  skuSubstitutionAuthority: false,
  runtimeAi: false,
  newAuthorityCreated: false,
} as const;

/** Build the per-SKU capability map from the three approved demo sources. */
function buildCapabilityMap(): Record<string, HoneywellDemoSkuCapability> {
  const catalog = getHoneywellDemoCatalogFixture();
  const pack = getHoneywellMvpConfigExpansionRulePack();
  const pricing = getHoneywellDemoPricingFixture();

  const catalogSkus = new Set(Object.keys(catalog.items));
  const pricingSkus = new Set(Object.keys(pricing.unitListPriceSarBySku));
  const standaloneOptics = new Set(catalog.standaloneOptics);

  // Build parent->children and child->parents maps from the rule pack.
  const parentToChildren = new Map<string, string[]>();
  const childToParents = new Map<string, string[]>();

  for (const rule of pack.parentRules) {
    const children = rule.childLines.map((c) => c.sku);
    parentToChildren.set(rule.parentSku, children);
    for (const childSku of children) {
      const existing = childToParents.get(childSku);
      if (existing) {
        existing.push(rule.parentSku);
      } else {
        childToParents.set(childSku, [rule.parentSku]);
      }
    }
  }

  const parentSkuSet = new Set(parentToChildren.keys());

  const result: Record<string, HoneywellDemoSkuCapability> = {};

  for (const sku of Object.keys(catalog.items)) {
    const catalogCovered = catalogSkus.has(sku);
    const pricingCovered = pricingSkus.has(sku);
    const isParent = parentSkuSet.has(sku);
    const isChild = childToParents.has(sku);
    const isStandalone = standaloneOptics.has(sku);

    let kind: HoneywellDemoSkuCapabilityKind;
    if (isStandalone) {
      kind = "standalone_customer_boq_line";
    } else if (isParent) {
      kind = "expandable_parent";
    } else if (isChild) {
      kind = "rule_pack_child";
    } else {
      kind = "unknown_deferred";
    }

    const childSkus = isParent ? (parentToChildren.get(sku) ?? []).slice() : [];
    const parentSkusArr = isChild ? (childToParents.get(sku) ?? []).slice() : [];

    result[sku] = {
      sku,
      kind,
      catalogCovered,
      pricingCovered,
      expansionParentCovered: isParent,
      expansionChildCovered: isChild,
      standaloneCustomerBoqLine: isStandalone,
      deferred: false,
      childCount: childSkus.length,
      childSkus,
      parentSkus: parentSkusArr,
      rulePackId: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
      rulePackVersion: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
      rulePackSourceScope: HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE,
      catalogSource: "honeywell_mvp_demo_catalog_supplement",
      pricingSource: "honeywell_mvp_demo_pricing_fixture",
      boundary: { ...STATIC_BOUNDARY },
    };
  }

  return result;
}

/**
 * Return the capability for a single SKU as a fresh copy. Returns `unknown_deferred`
 * for any SKU not in the approved Honeywell MVP demo scope; never throws.
 */
export function getHoneywellDemoSkuCapability(sku: string): HoneywellDemoSkuCapability {
  const map = buildCapabilityMap();
  if (Object.prototype.hasOwnProperty.call(map, sku)) {
    return map[sku];
  }
  return {
    sku,
    kind: "unknown_deferred",
    catalogCovered: false,
    pricingCovered: false,
    expansionParentCovered: false,
    expansionChildCovered: false,
    standaloneCustomerBoqLine: false,
    deferred: true,
    childCount: 0,
    childSkus: [],
    parentSkus: [],
    rulePackId: null,
    rulePackVersion: null,
    rulePackSourceScope: null,
    catalogSource: null,
    pricingSource: null,
    boundary: { ...STATIC_BOUNDARY },
  };
}

/**
 * Return the full capability profile for all known Honeywell MVP demo catalog SKUs
 * as a fresh serializable object. Mutating the result does not affect future calls.
 */
export function getHoneywellDemoSkuCapabilityProfile(): HoneywellDemoSkuCapabilityProfile {
  const catalog = getHoneywellDemoCatalogFixture();
  const pricing = getHoneywellDemoPricingFixture();
  const capabilities = buildCapabilityMap();

  let expandableParentCount = 0;
  let rulePackChildOnlyCount = 0;
  let standaloneCustomerBoqLineCount = 0;
  let unknownDeferredCount = 0;

  for (const cap of Object.values(capabilities)) {
    if (cap.kind === "expandable_parent") expandableParentCount++;
    else if (cap.kind === "rule_pack_child") rulePackChildOnlyCount++;
    else if (cap.kind === "standalone_customer_boq_line") standaloneCustomerBoqLineCount++;
    else unknownDeferredCount++;
  }

  return {
    profileId: "honeywell-mvp-demo-sku-capability-profile",
    scope: "honeywell_mvp_demo_only",
    catalogFixtureId: catalog.fixtureId,
    rulePackId: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
    rulePackVersion: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
    rulePackSourceScope: HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE,
    pricingFixtureId: pricing.fixtureId,
    totalKnownSkuCount: Object.keys(capabilities).length,
    expandableParentCount,
    rulePackChildOnlyCount,
    standaloneCustomerBoqLineCount,
    unknownDeferredCount,
    capabilities,
    boundary: { ...STATIC_BOUNDARY },
  };
}
