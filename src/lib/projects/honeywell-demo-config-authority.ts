/**
 * Honeywell MVP demo configuration authority profile.
 *
 * Records the user-approved Honeywell MVP configuration authority boundary
 * (Prompt 116). This module codifies that approval as an explicit pure profile.
 * It does not change runtime behavior; runtime wiring is deferred to the next prompt.
 *
 * Authority boundary: approved structured catalog/rule artifacts, Honeywell MVP scope
 * only. No pricing authority, no production Cisco/broad Cisco authority, no runtime AI,
 * no silent replacement/substitution, no optics-under-switches, unknown relationships
 * deferred.
 *
 * PURE: imports only the capability helper and the approved Honeywell rule-pack
 * selector. No DB, pricing, API/UI, engine, coordinator, adapter, AI/LLM,
 * workbook/export, artifact store, route, filesystem, or package code.
 * All getters return fresh copies; callers cannot mutate shared state.
 */
import {
  getHoneywellDemoSkuCapabilityProfile,
  getHoneywellDemoSkuCapability,
} from "@/lib/projects/honeywell-demo-sku-capability";
import {
  getHoneywellMvpConfigExpansionRulePack,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
  HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE,
} from "@/lib/projects/honeywell-config-expansion-rule-pack";

/** Approval record id for Prompt 116 user-approved Honeywell config authority. */
export const HONEYWELL_CONFIG_AUTHORITY_APPROVAL_RECORD_ID =
  "prompt-116-user-approved-honeywell-config-authority";

/** How this module participates in configuration expansion. */
export type HoneywellConfigAuthorityDisposition =
  | "expand_by_approved_rule_pack"
  | "preserve_known_rule_pack_child"
  | "preserve_standalone_customer_line"
  | "defer_unknown_relationship";

/** Explicit authority boundary for the Honeywell MVP demo configuration authority. */
export interface HoneywellDemoConfigAuthorityBoundary {
  scope: "honeywell_mvp_demo_only";
  configurationAuthority: true;
  approvedStructuredRuleAuthority: true;
  approvedStructuredCatalogEvidence: true;
  pricingAuthority: false;
  productionCiscoCatalogAuthority: false;
  broadCiscoGeneralAuthority: false;
  runtimeAi: false;
  replacementAuthority: false;
  skuSubstitutionAuthority: false;
  silentSkuSubstitution: false;
  unknownRelationshipsDeferred: true;
  attachesOpticsUnderSwitches: false;
}

/** Full serializable config authority profile for all known Honeywell MVP demo SKUs. */
export interface HoneywellDemoConfigAuthorityProfile {
  profileId: "honeywell-mvp-demo-config-authority-profile";
  scope: "honeywell_mvp_demo_only";
  approvalRecordId: string;
  rulePackId: string;
  rulePackVersion: string;
  rulePackSourceScope: string;
  rulePackStatus: "approved";
  knownSkuCount: number;
  expandableParentCount: number;
  standaloneCustomerBoqLineCount: number;
  rulePackChildOnlyCount: number;
  skuDispositionMap: Record<string, HoneywellConfigAuthorityDisposition>;
  boundary: HoneywellDemoConfigAuthorityBoundary;
}

/** Per-SKU serializable config authority disposition. */
export interface HoneywellDemoConfigAuthoritySkuResult {
  sku: string;
  knownSku: boolean;
  disposition: HoneywellConfigAuthorityDisposition;
  deferred: boolean;
  expandableParent: boolean;
  standaloneCustomerBoqLine: boolean;
  rulePackChildOnly: boolean;
  childCount: number;
  childSkus: string[];
  parentSkus: string[];
  rulePackId: string;
  rulePackVersion: string;
  rulePackSourceScope: string;
  rulePackStatus: "approved";
  boundary: HoneywellDemoConfigAuthorityBoundary;
}

const STATIC_BOUNDARY: HoneywellDemoConfigAuthorityBoundary = {
  scope: "honeywell_mvp_demo_only",
  configurationAuthority: true,
  approvedStructuredRuleAuthority: true,
  approvedStructuredCatalogEvidence: true,
  pricingAuthority: false,
  productionCiscoCatalogAuthority: false,
  broadCiscoGeneralAuthority: false,
  runtimeAi: false,
  replacementAuthority: false,
  skuSubstitutionAuthority: false,
  silentSkuSubstitution: false,
  unknownRelationshipsDeferred: true,
  attachesOpticsUnderSwitches: false,
} as const;

function getApprovedPackStatus(): "approved" {
  const pack = getHoneywellMvpConfigExpansionRulePack();
  if (pack.status !== "approved") {
    throw new Error(
      `Honeywell config authority requires an approved rule pack but found status "${pack.status}". ` +
        "This should never happen with the committed pack and indicates accidental authority drift."
    );
  }
  return pack.status;
}

function capabilityKindToDisposition(
  kind: "expandable_parent" | "rule_pack_child" | "standalone_customer_boq_line" | "unknown_deferred"
): HoneywellConfigAuthorityDisposition {
  switch (kind) {
    case "expandable_parent":
      return "expand_by_approved_rule_pack";
    case "rule_pack_child":
      return "preserve_known_rule_pack_child";
    case "standalone_customer_boq_line":
      return "preserve_standalone_customer_line";
    case "unknown_deferred":
      return "defer_unknown_relationship";
  }
}

/**
 * Return the full config authority profile for all known Honeywell MVP demo SKUs as a
 * fresh serializable object. Validates the rule pack is approved before returning.
 */
export function getHoneywellDemoConfigAuthorityProfile(): HoneywellDemoConfigAuthorityProfile {
  const packStatus = getApprovedPackStatus();
  const capProfile = getHoneywellDemoSkuCapabilityProfile();

  const skuDispositionMap: Record<string, HoneywellConfigAuthorityDisposition> = {};
  for (const [sku, cap] of Object.entries(capProfile.capabilities)) {
    skuDispositionMap[sku] = capabilityKindToDisposition(cap.kind);
  }

  return {
    profileId: "honeywell-mvp-demo-config-authority-profile",
    scope: "honeywell_mvp_demo_only",
    approvalRecordId: HONEYWELL_CONFIG_AUTHORITY_APPROVAL_RECORD_ID,
    rulePackId: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
    rulePackVersion: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
    rulePackSourceScope: HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE,
    rulePackStatus: packStatus,
    knownSkuCount: capProfile.totalKnownSkuCount,
    expandableParentCount: capProfile.expandableParentCount,
    standaloneCustomerBoqLineCount: capProfile.standaloneCustomerBoqLineCount,
    rulePackChildOnlyCount: capProfile.rulePackChildOnlyCount,
    skuDispositionMap,
    boundary: { ...STATIC_BOUNDARY },
  };
}

/**
 * Return the config authority disposition for a single SKU as a fresh serializable
 * object. Unknown or out-of-scope SKUs return "defer_unknown_relationship" and never
 * throw; the original requested SKU is preserved exactly.
 */
export function getHoneywellDemoConfigAuthorityForSku(
  sku: string
): HoneywellDemoConfigAuthoritySkuResult {
  const packStatus = getApprovedPackStatus();
  const cap = getHoneywellDemoSkuCapability(sku);
  const disposition = capabilityKindToDisposition(cap.kind);
  const isChild = cap.kind === "rule_pack_child";

  return {
    sku,
    knownSku: !cap.deferred && cap.catalogCovered,
    disposition,
    deferred: disposition === "defer_unknown_relationship",
    expandableParent: cap.expansionParentCovered,
    standaloneCustomerBoqLine: cap.standaloneCustomerBoqLine,
    rulePackChildOnly: isChild,
    childCount: cap.childCount,
    childSkus: cap.childSkus.slice(),
    parentSkus: cap.parentSkus.slice(),
    rulePackId: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
    rulePackVersion: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
    rulePackSourceScope: HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE,
    rulePackStatus: packStatus,
    boundary: { ...STATIC_BOUNDARY },
  };
}
