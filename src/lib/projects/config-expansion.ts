/**
 * Pure, deterministic helper: normalized BoQ lines + reviewed SKU decisions + an
 * APPROVED config-expansion rule pack -> a config-expansion draft. Never replaces
 * SKUs, prices, looks up, or mutates input. MVP_CANONICAL_PROJECT_STATE.md (11, 11A).
 */
import type { CanonicalBoqLine, SkuResolutionDecision } from "@/types/project";
import type {
  ConfigExpansionChildRule,
  ConfigExpansionParentRule,
  ConfigExpansionRelationshipType,
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
// Batch 1 advanced-model guards: fail loudly rather than mis-evaluate (RULE_MODEL_GAP_REPORT).
const RELATED_SKU_SCOPE_UNSUPPORTED = "Configuration expansion same_as_related_sku_total quantity model supports only project scope.";
const SELECTED_OPTION_GROUP_REQUIRED = "Configuration expansion selected_option_count quantity model requires an optionGroupId.";
const DUPLICATE_POLICY_UNSUPPORTED = "Configuration expansion duplicate policy supports only project_sku scope with match \"sku\" and existing_satisfies_required.";

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
      validateAdvancedChild(child);
    }
  }
}

/**
 * Reject the advanced (Batch 1) model fields the runtime evaluator cannot honor,
 * so an out-of-scope pack fails loudly instead of being silently mis-evaluated.
 * Supported: same_as_related_sku_total (project scope), selected_option_count, and
 * a project_sku duplicate policy matched by sku with existing_satisfies_required.
 */
function validateAdvancedChild(child: ConfigExpansionChildRule): void {
  const model = child.quantityModel;
  if (model?.type === "same_as_related_sku_total" && model.scope !== "project") throw new Error(RELATED_SKU_SCOPE_UNSUPPORTED);
  if (model?.type === "selected_option_count" && !model.optionGroupId) throw new Error(SELECTED_OPTION_GROUP_REQUIRED);
  // Batch 1 honors exactly one duplicate policy shape; any other scope/match/
  // satisfaction is rejected loudly rather than silently ignored.
  const policy = child.duplicatePolicy;
  if (policy && (policy.scope !== "project_sku" || policy.match !== "sku" || policy.quantitySatisfaction !== "existing_satisfies_required")) {
    throw new Error(DUPLICATE_POLICY_UNSUPPORTED);
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

/**
 * Selected-option quantity for a child: the SUM of the resolved quantities of the
 * parent's sibling option child rules in the referenced group (e.g. CAB-C15-CBN
 * follows the selected AC PSU lines). Each sibling resolves through its own v1
 * quantityRule against the parent quantity, so two same_as_parent PSUs under a
 * parent quantity of 7 yield 14 - the consolidated CCW cord count - not a bare
 * count of 2. The evaluated child is never counted, even if it shares the
 * optionGroupId. Optionally narrowed by relationshipFilter. No pricing/catalog/AI.
 */
function selectedOptionQuantity(
  parent: ConfigExpansionParentRule,
  self: ConfigExpansionChildRule,
  optionGroupId: string,
  parentQuantity: number,
  relationshipFilter?: ConfigExpansionRelationshipType[]
): number {
  let total = 0;
  for (const sibling of parent.childLines) {
    if (sibling === self) continue;
    if (sibling.optionGroupId !== optionGroupId) continue;
    if (relationshipFilter && !relationshipFilter.includes(sibling.relationshipType)) continue;
    total += childQuantity(sibling, parentQuantity);
  }
  return total;
}

/**
 * Quantity for an added child line. An advanced quantityModel takes precedence over
 * the frozen v1 quantityRule/quantityValue (the whole point of GAP-1/GAP-3): a
 * related-SKU total tracks the project-wide accepted quantity of relatedSku; a
 * selected-option count follows the chosen options. `advanced` is true for those
 * derived models so the caller can drop a zero-quantity line instead of adding it.
 */
function childAddQuantity(
  child: ConfigExpansionChildRule,
  parentQuantity: number,
  parent: ConfigExpansionParentRule,
  acceptedQtyBySku: ReadonlyMap<string, number>
): { quantity: number; advanced: boolean } {
  const model = child.quantityModel;
  if (model?.type === "same_as_related_sku_total") {
    return { quantity: acceptedQtyBySku.get(model.relatedSku) ?? 0, advanced: true };
  }
  if (model?.type === "selected_option_count") {
    return { quantity: selectedOptionQuantity(parent, child, model.optionGroupId, parentQuantity, model.relationshipFilter), advanced: true };
  }
  return { quantity: childQuantity(child, parentQuantity), advanced: false };
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
 * Walk human-ACCEPTED customer lines in order: a line whose accepted SKU starts a
 * segment per its matched parent rule; each approved child not already present is
 * added after it. This is the canonical gate from reviewed SKU decisions into
 * configuration expansion - only lines whose decision is `accepted` with a non-empty
 * acceptedSku carry forward. Rows with no decision, or `rejected`/`needs_review`/
 * `unresolved`/accepted-without-acceptedSku status, are omitted from the draft.
 */
export function buildConfigurationExpansionDraft(
  input: BuildConfigurationExpansionDraftInput
): ConfigurationExpansionDraft {
  const { lines, decisions, rulePack } = input;
  validateRulePack(rulePack);
  const decisionByKey = indexDecisions(decisions);

  const parentRuleBySku = new Map<string, ConfigExpansionParentRule>();
  for (const parent of rulePack.parentRules) parentRuleBySku.set(parent.parentSku, parent);

  // Canonical accept gate: keep only lines with an accepted, non-empty SKU decision,
  // preserving original BoQ order. Everything downstream (IDs, segments, quantities,
  // summary counts) is computed over these carried-forward lines, never the raw input.
  const accepted: { line: CanonicalBoqLine; acceptedSku: string }[] = [];
  for (const line of lines) {
    const acceptedSku = acceptedSkuFor(decisionByKey.get(decisionKey(line)));
    if (acceptedSku === undefined) continue;
    accepted.push({ line, acceptedSku });
  }

  const matchedRules = accepted.map((entry) => parentRuleBySku.get(entry.acceptedSku));

  // Project-wide accepted customer quantity per effective (accepted) SKU, over the
  // carried-forward lines only. Backs the related-SKU quantity model and the
  // project_sku duplicate policy, both of which reach beyond a single parent segment.
  // addedQtyBySku tracks expansion lines so a project-unique SKU is not re-added
  // across segments.
  const acceptedQtyBySku = new Map<string, number>();
  for (const entry of accepted) {
    acceptedQtyBySku.set(entry.acceptedSku, (acceptedQtyBySku.get(entry.acceptedSku) ?? 0) + entry.line.quantity);
  }
  const addedQtyBySku = new Map<string, number>();

  const draftLines: ConfigurationExpansionDraftLine[] = [];
  let addedLineCount = 0;
  let requiresReviewCount = 0;
  let includedItemCount = 0;

  for (let i = 0; i < accepted.length; i++) {
    const { line, acceptedSku } = accepted[i];
    // IDs follow carried-forward order, not the original normalized index.
    const parentLineId = `line-${i + 1}`;
    draftLines.push(customerLine(line, parentLineId, acceptedSku));

    const rule = matchedRules[i];
    if (!rule) continue;

    // Parent segment: this line through the line before the next parent match, over
    // carried-forward accepted lines only.
    let end = i + 1;
    while (end < accepted.length && matchedRules[end] === undefined) end++;
    const present = new Set<string>();
    for (let k = i; k < end; k++) present.add(accepted[k].acceptedSku);

    let ordinal = 0;
    for (const child of rule.childLines) {
      const { quantity, advanced } = childAddQuantity(child, line.quantity, rule, acceptedQtyBySku);
      // A derived (advanced) model that resolves to zero adds no line: no related
      // SKUs, or no options selected.
      if (advanced && quantity === 0) continue;

      if (child.duplicatePolicy?.scope === "project_sku") {
        // Project-scoped: an existing accepted/added quantity that already satisfies
        // the requirement blocks a duplicate, even across parent segments. When it is
        // insufficient we add the full required line for engineer review rather than
        // silently reconciling a delta.
        const existing = (acceptedQtyBySku.get(child.sku) ?? 0) + (addedQtyBySku.get(child.sku) ?? 0);
        if (existing >= quantity) continue;
      } else if (present.has(child.sku)) {
        continue;
      }

      ordinal += 1;
      const added = expansionLine(child, `${parentLineId}-x${ordinal}`, line, parentLineId, quantity);
      draftLines.push(added);
      addedLineCount += 1;
      requiresReviewCount += 1;
      if (added.includedItem) includedItemCount += 1;
      addedQtyBySku.set(child.sku, (addedQtyBySku.get(child.sku) ?? 0) + quantity);
    }
  }

  return {
    lines: draftLines,
    summary: {
      customerLineCount: accepted.length,
      addedLineCount,
      totalLineCount: accepted.length + addedLineCount,
      requiresReviewCount,
      includedItemCount,
    },
  };
}
