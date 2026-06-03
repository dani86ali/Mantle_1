/**
 * Pure, deterministic helper: normalized BoQ lines + reviewed SKU decisions + an
 * APPROVED config-expansion rule pack -> a config-expansion draft. Never replaces
 * SKUs, prices, looks up, or mutates input. MVP_CANONICAL_PROJECT_STATE.md (11, 11A).
 */
import type { CanonicalBoqLine, SkuResolutionDecision } from "@/types/project";
import type {
  ConfigExpansionChildRule,
  ConfigExpansionParentRule,
  ConfigExpansionRulePack,
  ConfigurationExpansionDraftLine,
  ConfigurationExpansionDraftSummary,
} from "@/lib/projects/config-expansion-types";

// Exact guard messages; tests assert on these.
const PACK_NOT_APPROVED = "Configuration expansion rule pack must be approved.";
const PARENT_NOT_APPROVED = "Configuration expansion parent rule must be approved.";
const CHILD_NOT_APPROVED = "Configuration expansion child rule must be approved.";
const PARENT_NO_EVIDENCE = "Configuration expansion parent rule must carry evidence.";
const CHILD_NO_EVIDENCE = "Configuration expansion child rule must carry evidence.";
const CHILD_NO_QUANTITY_VALUE = "Configuration expansion child rule requires quantityValue for fixed quantity rules.";
const DUPLICATE_DECISION = "Duplicate SKU resolution decision for BoQ line.";
const DUPLICATE_PARENT_RULE_ID = "Configuration expansion rule pack has a duplicate parent ruleId.";
const DUPLICATE_PARENT_SKU = "Configuration expansion rule pack has a duplicate parent SKU.";
const CHILD_RULE_ID_MISMATCH = "Configuration expansion child rule sourceRuleId must match its parent ruleId.";

/** Input for {@link buildConfigurationExpansionDraft}. All fields are read-only. */
export interface BuildConfigurationExpansionDraftInput {
  lines: readonly CanonicalBoqLine[];
  decisions: readonly SkuResolutionDecision[];
  rulePack: ConfigExpansionRulePack;
}

export interface ConfigurationExpansionDraft {
  lines: ConfigurationExpansionDraftLine[];
  summary: ConfigurationExpansionDraftSummary;
}

function decisionKey(ref: { sourceFileId: string; sourceRowNumber: number }): string {
  return `${ref.sourceFileId}::${ref.sourceRowNumber}`;
}

/** Reject anything but a fully approved pack with unique, self-consistent rules. */
function validateRulePack(pack: ConfigExpansionRulePack): void {
  if (pack.status !== "approved" || pack.approvalRequired !== false) throw new Error(PACK_NOT_APPROVED);
  const seenRuleIds = new Set<string>();
  const seenParentSkus = new Set<string>();
  for (const parent of pack.parentRules) {
    if (parent.approved !== true || parent.approvalRequired !== false) throw new Error(PARENT_NOT_APPROVED);
    if (parent.evidence.length < 1) throw new Error(PARENT_NO_EVIDENCE);
    if (seenRuleIds.has(parent.ruleId)) throw new Error(DUPLICATE_PARENT_RULE_ID);
    seenRuleIds.add(parent.ruleId);
    if (seenParentSkus.has(parent.parentSku)) throw new Error(DUPLICATE_PARENT_SKU);
    seenParentSkus.add(parent.parentSku);
    for (const child of parent.childLines) {
      if (child.approved !== true || child.approvalRequired !== false) throw new Error(CHILD_NOT_APPROVED);
      if (child.evidence.length < 1) throw new Error(CHILD_NO_EVIDENCE);
      if (child.sourceRuleId !== parent.ruleId) throw new Error(CHILD_RULE_ID_MISMATCH);
      if (child.quantityRule !== "same_as_parent" && child.quantityValue === undefined) throw new Error(CHILD_NO_QUANTITY_VALUE);
    }
  }
}

function indexDecisions(
  decisions: readonly SkuResolutionDecision[]
): Map<string, SkuResolutionDecision> {
  const byKey = new Map<string, SkuResolutionDecision>();
  for (const decision of decisions) {
    const key = decisionKey(decision);
    if (byKey.has(key)) throw new Error(DUPLICATE_DECISION);
    byKey.set(key, decision);
  }
  return byKey;
}

function acceptedSkuFor(decision: SkuResolutionDecision | undefined): string | undefined {
  if (!decision || decision.status !== "accepted") return undefined;
  return decision.acceptedSku?.trim() || undefined;
}

function childQuantity(child: ConfigExpansionChildRule, parentQuantity: number): number {
  if (child.quantityRule === "same_as_parent") return parentQuantity;
  if (child.quantityValue === undefined) throw new Error(CHILD_NO_QUANTITY_VALUE);
  if (child.quantityRule === "fixed") return child.quantityValue;
  return parentQuantity * child.quantityValue;
}

function customerLine(
  line: CanonicalBoqLine,
  lineId: string,
  acceptedSku: string | undefined
): ConfigurationExpansionDraftLine {
  return {
    lineId,
    origin: "customer",
    sku: line.sku,
    description: line.description,
    quantity: line.quantity,
    sourceFileId: line.sourceFileId,
    ...(line.sourceSheetName !== undefined ? { sourceSheetName: line.sourceSheetName } : {}),
    sourceRowNumber: line.sourceRowNumber,
    originalLineNumber: line.originalLineNumber,
    originalSku: line.sku,
    ...(acceptedSku !== undefined ? { acceptedSku } : {}),
    originalCells: { ...line.originalCells },
  };
}

/** An auto-added expansion line; review is still required from an approved pack. */
function expansionLine(
  child: ConfigExpansionChildRule,
  lineId: string,
  parent: CanonicalBoqLine,
  parentLineId: string,
  quantity: number
): ConfigurationExpansionDraftLine {
  return {
    lineId,
    origin: "expansion",
    sku: child.sku,
    description: child.description,
    quantity,
    parentLineId,
    parentLineNumber: parent.originalLineNumber,
    relationshipType: child.relationshipType,
    quantityRule: child.quantityRule,
    includedItem: child.includedItem,
    sourceRuleId: child.sourceRuleId,
    evidence: child.evidence.map((citation) => ({ ...citation })),
    approvalRequired: true,
    approved: false,
  };
}

/**
 * Walk customer lines in order: a line whose human-ACCEPTED SKU starts a segment per
 * its matched parent rule; each approved child not already present is added after it.
 */
export function buildConfigurationExpansionDraft(
  input: BuildConfigurationExpansionDraftInput
): ConfigurationExpansionDraft {
  const { lines, decisions, rulePack } = input;
  validateRulePack(rulePack);
  const decisionByKey = indexDecisions(decisions);

  const parentRuleBySku = new Map<string, ConfigExpansionParentRule>();
  for (const parent of rulePack.parentRules) parentRuleBySku.set(parent.parentSku, parent);

  const acceptedSkus = lines.map((line) => acceptedSkuFor(decisionByKey.get(decisionKey(line))));
  const matchedRules = acceptedSkus.map((sku) => (sku ? parentRuleBySku.get(sku) : undefined));

  const draftLines: ConfigurationExpansionDraftLine[] = [];
  let addedLineCount = 0;
  let requiresReviewCount = 0;
  let includedItemCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parentLineId = `line-${i + 1}`;
    draftLines.push(customerLine(line, parentLineId, acceptedSkus[i]));

    const rule = matchedRules[i];
    if (!rule) continue;

    // Parent segment: this line through the line before the next parent match.
    let end = i + 1;
    while (end < lines.length && matchedRules[end] === undefined) end++;
    const present = new Set<string>();
    for (let k = i; k < end; k++) present.add(acceptedSkus[k] ?? lines[k].sku);

    let ordinal = 0;
    for (const child of rule.childLines) {
      if (present.has(child.sku)) continue;
      ordinal += 1;
      const added = expansionLine(
        child,
        `${parentLineId}-x${ordinal}`,
        line,
        parentLineId,
        childQuantity(child, line.quantity)
      );
      draftLines.push(added);
      addedLineCount += 1;
      requiresReviewCount += 1;
      if (added.includedItem) includedItemCount += 1;
    }
  }

  return {
    lines: draftLines,
    summary: {
      customerLineCount: lines.length,
      addedLineCount,
      totalLineCount: lines.length + addedLineCount,
      requiresReviewCount,
      includedItemCount,
    },
  };
}
