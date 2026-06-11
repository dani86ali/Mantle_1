/**
 * Pure, deterministic helper: compose several SEPARATELY-APPROVED config-expansion
 * rule packs into ONE in-memory approved pack, merging by parentSku so packs that
 * intentionally share parent SKUs (Honeywell Batch 1 + Batch 2) can be used together
 * without tripping buildConfigurationExpansionDraft's duplicate-parent-SKU guard. The
 * composed parent gets a deterministic ruleId and every merged child's sourceRuleId is
 * rewritten to it so existing runtime validation passes. Composition only: approves
 * nothing new, infers no lines, replaces no SKUs, reads no files, prices nothing, runs
 * no AI. MVP_CANONICAL_PROJECT_STATE.md (11A.1).
 */
import type {
  ConfigExpansionOptionGroup,
  ConfigExpansionParentRule,
  ConfigExpansionRulePack,
  ConfigExpansionTermOptionGroup,
} from "@/lib/projects/config-expansion-types";

// Exact guard messages; tests assert on these by substring.
const NO_INPUT_PACKS = "Approved rule-pack composition requires at least one input pack.";
const PACK_NOT_APPROVED = "Approved rule-pack composition requires each input pack status to be approved.";
const PACK_STILL_REQUIRES_APPROVAL = "Approved rule-pack composition requires each input pack approvalRequired to be false.";
const PACK_HAS_REPLACEMENTS = "Approved rule-pack composition does not carry replacementCandidates; replacements are a separate approval path.";
const PARENT_NOT_APPROVED = "Approved rule-pack composition requires each parent rule to be approved.";
const PARENT_NO_EVIDENCE = "Approved rule-pack composition requires each parent rule to carry evidence.";
const CHILD_NOT_APPROVED = "Approved rule-pack composition requires each child rule to be approved.";
const CHILD_NO_EVIDENCE = "Approved rule-pack composition requires each child rule to carry evidence.";
const CHILD_RULE_ID_MISMATCH = "Approved rule-pack composition requires each child sourceRuleId to match its source parent ruleId.";
const RULE_ID_TO_DIFFERENT_SKU = "Approved rule-pack composition found one parent ruleId mapped to different parent SKUs.";
const DUPLICATE_CHILD_SKU = "Approved rule-pack composition found a duplicate child SKU under one composed parent SKU.";
const PARENT_METADATA_CONFLICT = "Approved rule-pack composition found conflicting parent metadata for a shared parent SKU";
const OPTION_GROUP_CONFLICT = "Approved rule-pack composition found a conflicting optionGroup definition for a shared optionGroupId.";
const TERM_GROUP_CONFLICT = "Approved rule-pack composition found a conflicting termOptionGroup definition for a shared termGroupId.";

/** Input for {@link composeApprovedConfigExpansionRulePacks}. All fields are read-only. */
export interface ComposeApprovedConfigExpansionRulePacksInput {
  rulePackId: string;
  name: string;
  version: string;
  sourceScope: string;
  rulePacks: readonly ConfigExpansionRulePack[];
  createdFromEvidence?: ConfigExpansionRulePack["createdFromEvidence"];
}

/** Recursive structural deep-copy for plain JSON data (objects/arrays/primitives). */
function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => deepCopy(entry)) as unknown as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) out[key] = deepCopy(entry);
    return out as T;
  }
  return value;
}

/** Order-sensitive structural equality for plain JSON data. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((entry, i) => deepEqual(entry, b[i]));
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as Record<string, unknown>);
    const bk = Object.keys(b as Record<string, unknown>);
    return ak.length === bk.length && ak.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/** Append items not already structurally present (first-seen union); copies on insert. */
function unionPush<T>(into: T[], item: T): void {
  if (!into.some((seen) => deepEqual(seen, item))) into.push(deepCopy(item));
}

/** Merge a uniquely-identified definition first-seen; reject a non-identical duplicate. */
function mergeById<T>(byId: Map<string, T>, order: string[], id: string, item: T, conflictMessage: string): void {
  const existing = byId.get(id);
  if (existing !== undefined) {
    if (!deepEqual(existing, item)) throw new Error(conflictMessage);
    return;
  }
  byId.set(id, deepCopy(item));
  order.push(id);
}

/**
 * Compose already-approved rule packs into one approved in-memory pack, merging parents
 * by parentSku. Throws on any non-approved input or structural conflict (it never
 * mis-composes silently); the merged result passes buildConfigurationExpansionDraft.
 */
export function composeApprovedConfigExpansionRulePacks(
  input: ComposeApprovedConfigExpansionRulePacksInput,
): ConfigExpansionRulePack {
  const { rulePackId, name, version, sourceScope, rulePacks } = input;
  if (rulePacks.length < 1) throw new Error(NO_INPUT_PACKS);

  const parentOrder: string[] = [];
  const parentBySku = new Map<string, ConfigExpansionParentRule>();
  const childSkusBySku = new Map<string, Set<string>>();
  const ruleIdToParentSku = new Map<string, string>();
  const optionGroupOrder: string[] = [];
  const optionGroupById = new Map<string, ConfigExpansionOptionGroup>();
  const termGroupOrder: string[] = [];
  const termGroupById = new Map<string, ConfigExpansionTermOptionGroup>();

  for (const pack of rulePacks) {
    if (pack.status !== "approved") throw new Error(PACK_NOT_APPROVED);
    if (pack.approvalRequired !== false) throw new Error(PACK_STILL_REQUIRES_APPROVAL);
    if (pack.replacementCandidates && pack.replacementCandidates.length > 0) throw new Error(PACK_HAS_REPLACEMENTS);

    for (const parent of pack.parentRules) {
      if (parent.approved !== true || parent.approvalRequired !== false) throw new Error(PARENT_NOT_APPROVED);
      if (parent.evidence.length < 1) throw new Error(PARENT_NO_EVIDENCE);

      const priorSku = ruleIdToParentSku.get(parent.ruleId);
      if (priorSku !== undefined && priorSku !== parent.parentSku) throw new Error(RULE_ID_TO_DIFFERENT_SKU);
      ruleIdToParentSku.set(parent.ruleId, parent.parentSku);

      const composedRuleId = `${rulePackId}::${parent.parentSku}`;
      let composed = parentBySku.get(parent.parentSku);
      if (composed === undefined) {
        composed = {
          ruleId: composedRuleId,
          parentSku: parent.parentSku,
          parentDescription: parent.parentDescription,
          ...(parent.relationshipType !== undefined ? { relationshipType: parent.relationshipType } : {}),
          evidence: [],
          childLines: [],
          approvalRequired: false,
          approved: true,
          ...(parent.evidenceScope !== undefined ? { evidenceScope: parent.evidenceScope } : {}),
        };
        parentBySku.set(parent.parentSku, composed);
        childSkusBySku.set(parent.parentSku, new Set<string>());
        parentOrder.push(parent.parentSku);
      } else {
        if (composed.parentDescription !== parent.parentDescription) throw new Error(`${PARENT_METADATA_CONFLICT}: parentDescription "${parent.parentSku}".`);
        if (composed.relationshipType !== parent.relationshipType) throw new Error(`${PARENT_METADATA_CONFLICT}: relationshipType "${parent.parentSku}".`);
        if (composed.evidenceScope !== parent.evidenceScope) throw new Error(`${PARENT_METADATA_CONFLICT}: evidenceScope "${parent.parentSku}".`);
      }

      for (const citation of parent.evidence) unionPush(composed.evidence, citation);

      const seenChildSkus = childSkusBySku.get(parent.parentSku) as Set<string>;
      for (const child of parent.childLines) {
        if (child.approved !== true || child.approvalRequired !== false) throw new Error(CHILD_NOT_APPROVED);
        if (child.evidence.length < 1) throw new Error(CHILD_NO_EVIDENCE);
        if (child.sourceRuleId !== parent.ruleId) throw new Error(CHILD_RULE_ID_MISMATCH);
        if (seenChildSkus.has(child.sku)) throw new Error(DUPLICATE_CHILD_SKU);
        seenChildSkus.add(child.sku);
        const composedChild = deepCopy(child);
        composedChild.sourceRuleId = composedRuleId;
        composed.childLines.push(composedChild);
      }
    }

    for (const group of pack.optionGroups ?? []) mergeById(optionGroupById, optionGroupOrder, group.optionGroupId, group, OPTION_GROUP_CONFLICT);
    for (const group of pack.termOptionGroups ?? []) mergeById(termGroupById, termGroupOrder, group.termGroupId, group, TERM_GROUP_CONFLICT);
  }

  let createdFromEvidence = input.createdFromEvidence !== undefined ? deepCopy(input.createdFromEvidence) : undefined;
  if (createdFromEvidence === undefined) {
    const union: NonNullable<ConfigExpansionRulePack["createdFromEvidence"]> = [];
    for (const pack of rulePacks) for (const entry of pack.createdFromEvidence ?? []) unionPush(union, entry);
    if (union.length > 0) createdFromEvidence = union;
  }

  return {
    rulePackId,
    name,
    version,
    status: "approved",
    approvalRequired: false,
    sourceScope,
    ...(createdFromEvidence !== undefined ? { createdFromEvidence } : {}),
    parentRules: parentOrder.map((sku) => parentBySku.get(sku) as ConfigExpansionParentRule),
    ...(optionGroupOrder.length > 0 ? { optionGroups: optionGroupOrder.map((id) => optionGroupById.get(id) as ConfigExpansionOptionGroup) } : {}),
    ...(termGroupOrder.length > 0 ? { termOptionGroups: termGroupOrder.map((id) => termGroupById.get(id) as ConfigExpansionTermOptionGroup) } : {}),
  };
}
