/**
 * Quick BoM Catalog authority surface read model.
 *
 * This is display-only metadata for the Catalog tab. It summarizes the active/default
 * approved Quick BoM SKU-recognition catalog, pricing coverage, configuration-rule
 * coverage, and authority boundaries. It does not process customer BoQs, choose SKUs,
 * substitute SKUs, price rows, expand configurations, approve rules, read external
 * catalogs, or invoke AI.
 */
import { getDefaultQuickBomCatalogLookupIndex } from "@/lib/projects/default-quick-bom-catalog";
import { getHoneywellDemoPricingAuthorityProfile } from "@/lib/projects/honeywell-demo-pricing-authority";
import { getHoneywellMvpConfigExpansionRulePack } from "@/lib/projects/honeywell-config-expansion-rule-pack";

export interface QuickBomCatalogAuthorityEntry {
  sku: string;
  description: string;
  category: string;
  vendor: string;
  recognitionCoverage: "recognized_by_default_catalog";
  pricingCoverage: "priced_by_active_authority" | "missing_price_report_only";
  configRuleCoverage: "parent_rule_available" | "no_parent_rule";
}

export interface QuickBomCatalogAuthoritySurface {
  label: "Default Quick BoM authority pack";
  catalog: {
    source: "default_quick_bom_approved_catalog";
    entryCount: number;
  };
  pricing: {
    source: "active_approved_pricing_authority";
    currency: string;
    coveredSkuCount: number;
    missingPriceSkuCount: number;
  };
  configurationRules: {
    source: "active_approved_configuration_rules";
    status: "approved";
    parentRuleCount: number;
    childRuleCount: number;
    sourcePackCount: number;
  };
  boundaries: {
    runtimeAiDecisions: false;
    liveCatalogLookup: false;
    broadProductionCatalogAuthority: false;
    broadProductionPricingAuthority: false;
    replacementAuthority: false;
    silentSkuSubstitution: false;
    configurationAuthoritySeparateFromPricing: true;
    missingDataDeferred: true;
  };
  entries: QuickBomCatalogAuthorityEntry[];
}

function category(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Uncategorized";
}

function uiSafeText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  const text = trimmed ? trimmed : fallback;
  return text.replace(/\bHoneywell\b/gi, "Default authority pack");
}

export function getQuickBomCatalogAuthoritySurface(): QuickBomCatalogAuthoritySurface {
  const catalog = getDefaultQuickBomCatalogLookupIndex();
  const pricing = getHoneywellDemoPricingAuthorityProfile();
  const rules = getHoneywellMvpConfigExpansionRulePack();

  const pricedSkus = new Set(Object.keys(pricing.skuStatusMap));
  const parentRuleSkus = new Set(rules.parentRules.map((rule) => rule.parentSku));
  const childRuleCount = rules.parentRules.reduce(
    (count, rule) => count + rule.childLines.length,
    0
  );

  const entries = Array.from(catalog.exact.values())
    .map((item): QuickBomCatalogAuthorityEntry => ({
      sku: item.sku,
      description: uiSafeText(item.description, ""),
      category: uiSafeText(category(item.productCategory), "Uncategorized"),
      vendor: uiSafeText(item.vendor, "Unknown"),
      recognitionCoverage: "recognized_by_default_catalog",
      pricingCoverage: pricedSkus.has(item.sku)
        ? "priced_by_active_authority"
        : "missing_price_report_only",
      configRuleCoverage: parentRuleSkus.has(item.sku)
        ? "parent_rule_available"
        : "no_parent_rule",
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  return {
    label: "Default Quick BoM authority pack",
    catalog: {
      source: "default_quick_bom_approved_catalog",
      entryCount: entries.length,
    },
    pricing: {
      source: "active_approved_pricing_authority",
      currency: pricing.currency,
      coveredSkuCount: pricing.pricedSkuCount,
      missingPriceSkuCount: pricing.missingPriceSkuCount,
    },
    configurationRules: {
      source: "active_approved_configuration_rules",
      status: "approved",
      parentRuleCount: rules.parentRules.length,
      childRuleCount,
      sourcePackCount: 3,
    },
    boundaries: {
      runtimeAiDecisions: false,
      liveCatalogLookup: false,
      broadProductionCatalogAuthority: false,
      broadProductionPricingAuthority: false,
      replacementAuthority: false,
      silentSkuSubstitution: false,
      configurationAuthoritySeparateFromPricing: true,
      missingDataDeferred: true,
    },
    entries,
  };
}
