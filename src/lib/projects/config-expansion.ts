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
  ConfigurationExpansionSkuResolutionStatus,
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
  acceptedSku: string | undefined,
  skuResolutionStatus: ConfigurationExpansionSkuResolutionStatus | undefined
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
    ...(skuResolutionStatus !== undefined ? { skuResolutionStatus } : {}),
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
 * A preserved customer row: its source line, stable draft line id (preserved-order),
 * SKU-resolution status (absent for a no-decision row), the orderable acceptedSku
 * (present ONLY when accepted with a nonblank SKU), and the expansion children
 * collected under it. A non-orderable row carries no acceptedSku and no children.
 */
interface PreservedCustomerRow {
  line: CanonicalBoqLine;
  lineId: string;
  status?: ConfigurationExpansionSkuResolutionStatus;
  acceptedSku?: string;
  children: ConfigurationExpansionDraftLine[];
}

/**
 * An orderable customer row: a preserved row that is accepted with a nonblank
 * acceptedSku. This is the ONLY kind of row eligible for parent-rule matching, child
 * expansion, segment/present-SKU duplicate detection, and the project-wide accepted
 * quantity maps - exactly the set the accept-only gate used to carry forward.
 */
interface OrderableCustomerRow {
  row: PreservedCustomerRow;
  acceptedSku: string;
}

/**
 * Build a configuration-expansion draft from normalized BoQ lines and reviewed SKU
 * decisions against an APPROVED rule pack. Every customer row is PRESERVED as a
 * customer draft line in original order EXCEPT an explicitly `rejected` row: a
 * rejected row is an explicit human exclusion, omitted from the draft but counted in
 * the summary so the omission is never silent. Preserved rows keep their source
 * identity and original cells, and carry their SKU-resolution status when they had a
 * decision; a no-decision row is preserved with no status and no acceptedSku.
 * Duplicate-looking rows are preserved as separate lines (never deduped by SKU), and
 * stable line IDs (`line-1`, `line-2`, ...) follow preserved customer-row order -
 * identical to the prior behavior when only accepted rows are preserved.
 *
 * Only a preserved row that is `accepted` with a nonblank acceptedSku is ORDERABLE: it
 * carries that acceptedSku and is the only kind of row eligible for parent-rule
 * matching and child expansion. Manual, out_of_scope, unresolved, needs_review,
 * accepted-without-acceptedSku, and no-decision rows are visible customer evidence -
 * preserved and never priced - but never orderable, so they never expand and never
 * count toward parent-segment duplicate detection or the project-wide accepted
 * quantity maps. Configuration authority only; never replaces SKUs, prices, or looks
 * up a catalog. MVP_CANONICAL_PROJECT_STATE.md (11, 11A).
 */
export function buildConfigurationExpansionDraft(
  input: BuildConfigurationExpansionDraftInput
): ConfigurationExpansionDraft {
  const { lines, decisions, rulePack } = input;
  validateRulePack(rulePack);
  const decisionByKey = indexDecisions(decisions);

  const parentRuleBySku = new Map<string, ConfigExpansionParentRule>();
  for (const parent of rulePack.parentRules) parentRuleBySku.set(parent.parentSku, parent);

  // Preserve every customer row in original order EXCEPT explicitly rejected rows
  // (explicit exclusions, counted below). A preserved row records its decision status
  // and, only when accepted with a nonblank SKU, its orderable acceptedSku. Stable
  // line IDs follow preserved order. Per-status tallies feed the additive summary.
  const preserved: PreservedCustomerRow[] = [];
  const orderable: OrderableCustomerRow[] = [];
  let rejectedCustomerLineCount = 0;
  let manualCustomerLineCount = 0;
  let outOfScopeCustomerLineCount = 0;
  let unresolvedCustomerLineCount = 0;
  let needsReviewCustomerLineCount = 0;
  let acceptedWithoutSkuCustomerLineCount = 0;
  let noDecisionCustomerLineCount = 0;

  for (const line of lines) {
    const decision = decisionByKey.get(decisionKey(line));
    if (decision?.status === "rejected") {
      rejectedCustomerLineCount += 1;
      continue;
    }
    const acceptedSku = acceptedSkuFor(decision);
    const row: PreservedCustomerRow = {
      line,
      lineId: `line-${preserved.length + 1}`,
      ...(decision !== undefined ? { status: decision.status } : {}),
      ...(acceptedSku !== undefined ? { acceptedSku } : {}),
      children: [],
    };
    preserved.push(row);
    if (acceptedSku !== undefined) orderable.push({ row, acceptedSku });

    if (decision === undefined) noDecisionCustomerLineCount += 1;
    else if (decision.status === "accepted") {
      if (acceptedSku === undefined) acceptedWithoutSkuCustomerLineCount += 1;
    } else if (decision.status === "manual") manualCustomerLineCount += 1;
    else if (decision.status === "out_of_scope") outOfScopeCustomerLineCount += 1;
    else if (decision.status === "unresolved") unresolvedCustomerLineCount += 1;
    else if (decision.status === "needs_review") needsReviewCustomerLineCount += 1;
  }

  // Expansion reasons over ORDERABLE rows only (the same set the accept-only gate
  // carried forward): segments, present-SKU duplicate checks, the project-wide
  // accepted quantity map, and the project_sku duplicate policy all ignore preserved
  // non-orderable rows. Each orderable row keeps its preserved-order line id, so an
  // expansion line still nests under the exact customer line that produced it.
  const matchedRules = orderable.map((entry) => parentRuleBySku.get(entry.acceptedSku));

  const acceptedQtyBySku = new Map<string, number>();
  for (const entry of orderable) {
    acceptedQtyBySku.set(entry.acceptedSku, (acceptedQtyBySku.get(entry.acceptedSku) ?? 0) + entry.row.line.quantity);
  }
  const addedQtyBySku = new Map<string, number>();

  let addedLineCount = 0;
  let requiresReviewCount = 0;
  let includedItemCount = 0;

  for (let i = 0; i < orderable.length; i++) {
    const { row } = orderable[i];
    const { line } = row;
    const parentLineId = row.lineId;

    const rule = matchedRules[i];
    if (!rule) continue;

    // Parent segment: this orderable line through the line before the next orderable
    // parent match. Computed over orderable rows only; non-orderable rows are invisible
    // to segment/present-SKU duplicate detection (they are customer evidence, not
    // orderable configured SKUs).
    let end = i + 1;
    while (end < orderable.length && matchedRules[end] === undefined) end++;
    const present = new Set<string>();
    for (let k = i; k < end; k++) present.add(orderable[k].acceptedSku);

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
      row.children.push(added);
      addedLineCount += 1;
      requiresReviewCount += 1;
      if (added.includedItem) includedItemCount += 1;
      addedQtyBySku.set(child.sku, (addedQtyBySku.get(child.sku) ?? 0) + quantity);
    }
  }

  // Emit in preserved customer-row order, each orderable row immediately followed by
  // its auto-added expansion children (customer-then-children order).
  const draftLines: ConfigurationExpansionDraftLine[] = [];
  for (const row of preserved) {
    draftLines.push(customerLine(row.line, row.lineId, row.acceptedSku, row.status));
    for (const child of row.children) draftLines.push(child);
  }

  return {
    lines: draftLines,
    summary: {
      customerLineCount: preserved.length,
      addedLineCount,
      totalLineCount: preserved.length + addedLineCount,
      requiresReviewCount,
      includedItemCount,
      inputCustomerLineCount: lines.length,
      acceptedCustomerLineCount: orderable.length,
      nonAcceptedCustomerLineCount: preserved.length - orderable.length,
      manualCustomerLineCount,
      outOfScopeCustomerLineCount,
      rejectedCustomerLineCount,
      unresolvedCustomerLineCount,
      needsReviewCustomerLineCount,
      acceptedWithoutSkuCustomerLineCount,
      noDecisionCustomerLineCount,
    },
  };
}
