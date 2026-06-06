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
 * MVP_CANONICAL_PROJECT_STATE.md (section 11A.1).
 */
import { composeApprovedConfigExpansionRulePacks } from "@/lib/projects/config-expansion-rule-pack-composer";
import type { ConfigExpansionRulePack } from "@/lib/projects/config-expansion-types";
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
 * Compose and return the active Honeywell MVP runtime configuration-expansion rule
 * pack from the committed Batch 1 + Batch 2 + Batch 3 approved packs. Returns a
 * fresh, fully-owned object on every call; the caller may mutate it without
 * affecting any later call or the committed source packs.
 */
export function getHoneywellMvpConfigExpansionRulePack(): ConfigExpansionRulePack {
  return composeApprovedConfigExpansionRulePacks({
    rulePackId: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
    name: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_NAME,
    version: HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
    sourceScope: HONEYWELL_MVP_CONFIG_EXPANSION_SOURCE_SCOPE,
    rulePacks: APPROVED_SOURCE_PACKS,
  });
}
