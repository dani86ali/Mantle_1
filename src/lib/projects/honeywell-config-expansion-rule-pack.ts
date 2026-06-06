/**
 * Active Honeywell Quick BoM runtime configuration-expansion selector.
 *
 * Assembles the live Honeywell MVP expansion rule pack from the committed,
 * separately-approved Batch 1 + Batch 2 + Batch 3 packs by composing them in memory
 * with composeApprovedConfigExpansionRulePacks. The approved authority for Honeywell
 * runtime configuration expansion is exactly those three batches. The subsequent
 * batch is a decision record only (its optics are standalone customer BoQ lines and
 * its replacements remain deferred); it approves no runtime expansion rule pack, so
 * it is intentionally absent here, as are all candidate (unapproved) packs.
 *
 * Selection/composition only: it reads already-approved committed packs, approves
 * nothing new, infers no lines, substitutes no SKUs, carries no replacement handling,
 * reads no live filesystem at call time, encodes no category/catalog/pricing
 * authority, and runs no AI. The composer deep-copies every node, so each call
 * returns a fresh, fully-owned object: a caller that mutates the result cannot
 * corrupt a later call or the committed source packs.
 *
 * After composition it applies a Honeywell-scope CCW-like child ordering to the two
 * approved switch parents (presentation fidelity only): it reorders existing child
 * lines into the sequence Cisco CCW prints them, adding/removing/repricing nothing.
 * MVP_CANONICAL_PROJECT_STATE.md (section 11A.1).
 */
import { composeApprovedConfigExpansionRulePacks } from "@/lib/projects/config-expansion-rule-pack-composer";
import type {
  ConfigExpansionChildRule,
  ConfigExpansionParentRule,
  ConfigExpansionRulePack,
} from "@/lib/projects/config-expansion-types";
import batch1Approved from "../../../data/config-expansion/honeywell-batch1-approved-rules.json";
import batch2Approved from "../../../data/config-expansion/honeywell-batch2-approved-rules.json";
import batch3Approved from "../../../data/config-expansion/honeywell-batch3-approved-rules.json";

/** Deterministic id of the active composed Honeywell MVP expansion rule pack. */
export const HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID =
  "honeywell-mvp-composed-batch1-batch2-batch3";

/** Version of the active composed Honeywell MVP expansion rule pack. */
export const HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION = "1.0.0";

/** Display name of the active composed Honeywell MVP expansion rule pack. */
export const HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_NAME =
  "Honeywell MVP Composed Batch 1 + Batch 2 + Batch 3 Runtime Configuration Expansion Rules";

/** Scope label of the active composed Honeywell MVP expansion rule pack. */
export const HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE =
  "Honeywell MVP / Batch 1 + Batch 2 + Batch 3 (composed)";

/** Ids of the committed approved packs the active pack is composed from, in order. */
export const HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_PACK_IDS = [
  "honeywell-batch1-approved-rules",
  "honeywell-batch2-approved-rules",
  "honeywell-batch3-approved-rules",
] as const;

// Static JSON imports widen string-literal fields (e.g. status) to `string`, so the
// committed approved packs are read through `unknown` into the contract type. The
// composer revalidates every pack at runtime and throws on any non-approved or
// malformed input, so this assertion never masks a bad pack.
const APPROVED_SOURCE_PACKS: readonly ConfigExpansionRulePack[] = [
  batch1Approved as unknown as ConfigExpansionRulePack,
  batch2Approved as unknown as ConfigExpansionRulePack,
  batch3Approved as unknown as ConfigExpansionRulePack,
];

/**
 * CCW-like child order for the active Honeywell switch parents. Each entry lists, in
 * the exact sequence Cisco CCW prints them under that switch, the SAME child SKUs the
 * composed pack already carries - so applying it adds, removes, replaces, and reprices
 * nothing; only these two switch parents are reordered. (section 11A.1)
 */
const HONEYWELL_SWITCH_CHILD_ORDER: Readonly<Record<string, readonly string[]>> = {
  "C9300X-48HX-A": [
    "CON-L1NCD-C9300XY4",
    "C9300-DNA-A-48",
    "CON-L1SWT-C93A48",
    "C9300-DNA-A-48-3Y",
    "TE-EMBEDDED-T",
    "TE-EMBEDDED-T-3Y",
    "D-DNAS-EXT-S-T",
    "D-DNAS-EXT-S-3Y",
    "C9300-NW-A-48",
    "SC9300UK9-1715",
    "TE-C9K-SW",
    "PWR-C1-1100WAC-P",
    "PWR-C1-1100WAC-P/2",
    "C9300-SSD-NONE",
    "STACK-T1-50CM",
    "CAB-SPWR-30CM",
    "C9K-ACC-RBFT",
    "C9K-ACC-SCR-4",
    "CAB-GUIDE-1RU",
    "C9300X-NM-8Y",
    "NETWORK-PNP-LIC",
    "CAB-C15-CBN",
  ],
  "C9300L-24P-4X-A": [
    "CON-L1NCD-C93024PX",
    "C9300L-DNA-A-24",
    "CON-L1SWT-C93LA24",
    "C9300L-DNA-A-24-3Y",
    "TE-EMBEDDED-T",
    "TE-EMBEDDED-T-3Y",
    "D-DNAS-EXT-S-T",
    "D-DNAS-EXT-S-3Y",
    "S9300LUK9-1718",
    "C9300L-NW-A-24",
    "TE-C9K-SW",
    "FAN-T2",
    "PWR-C1-715WAC-P",
    "PWR-C1-715WAC-P/2",
    "CAB-C15-CBN",
    "C9300L-SSD-NONE",
    "C9K-ACC-RBFT",
    "C9K-ACC-SCR-4",
    "CAB-GUIDE-1RU",
    "C9300L-STACK-KIT2",
    "C9300L-STACK-A",
    "STACK-T3A-50CM",
    "NETWORK-PNP-LIC",
  ],
};

// Exact guard messages; an order table that drifts from the composed pack fails loudly.
const ORDER_PARENT_MISSING = "Honeywell switch child ordering expected an ordered parent SKU in the composed pack";
const ORDER_SET_MISMATCH = "Honeywell switch child ordering order table does not match the composed child SKUs";
const ORDER_DUPLICATE_SKU = "Honeywell switch child ordering order table lists a duplicate child SKU";

/**
 * Reorder one parent's childLines in place to `desiredOrder`, after validating the
 * table is an exact permutation of the parent's existing child SKUs: no duplicate in
 * the table, no missing child, no extra child. Throws on any divergence rather than
 * silently dropping, adding, or replacing a line.
 */
function reorderParentChildLines(parent: ConfigExpansionParentRule, desiredOrder: readonly string[]): void {
  const seen = new Set<string>();
  for (const sku of desiredOrder) {
    if (seen.has(sku)) throw new Error(`${ORDER_DUPLICATE_SKU}: "${parent.parentSku}" / "${sku}".`);
    seen.add(sku);
  }

  const existingBySku = new Map<string, ConfigExpansionChildRule>();
  for (const child of parent.childLines) existingBySku.set(child.sku, child);

  const missing = parent.childLines.map((c) => c.sku).filter((sku) => !seen.has(sku));
  const extra = desiredOrder.filter((sku) => !existingBySku.has(sku));
  if (missing.length > 0 || extra.length > 0 || desiredOrder.length !== parent.childLines.length) {
    throw new Error(
      `${ORDER_SET_MISMATCH}: "${parent.parentSku}" (missing [${missing.join(", ")}], extra [${extra.join(", ")}]).`
    );
  }

  parent.childLines = desiredOrder.map((sku) => existingBySku.get(sku) as ConfigExpansionChildRule);
}

/**
 * Apply the CCW-like child order to the active switch parents on an already-composed,
 * caller-owned pack, mutating it in place. Safe because the composer returns a fresh
 * deep copy per call, so this corrupts neither a later call nor the committed source
 * packs. Ordering/presentation only: no line, quantity, pricing, or authority change.
 */
function applyHoneywellSwitchChildOrder(pack: ConfigExpansionRulePack): void {
  for (const [parentSku, desiredOrder] of Object.entries(HONEYWELL_SWITCH_CHILD_ORDER)) {
    const parent = pack.parentRules.find((p) => p.parentSku === parentSku);
    if (parent === undefined) throw new Error(`${ORDER_PARENT_MISSING}: "${parentSku}".`);
    reorderParentChildLines(parent, desiredOrder);
  }
}

/**
 * Compose and return the active Honeywell MVP runtime configuration-expansion rule
 * pack from the committed Batch 1 + Batch 2 + Batch 3 approved packs, then apply the
 * CCW-like switch child ordering. Returns a fresh, fully-owned object on every call;
 * the caller may mutate it without affecting any later call or the committed source
 * packs.
 */
export function getHoneywellMvpConfigExpansionRulePack(): ConfigExpansionRulePack {
  const pack = composeApprovedConfigExpansionRulePacks({
    rulePackId: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
    name: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_NAME,
    version: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
    sourceScope: HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE,
    rulePacks: APPROVED_SOURCE_PACKS,
  });
  applyHoneywellSwitchChildOrder(pack);
  return pack;
}
