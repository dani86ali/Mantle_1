/**
 * Pure Project-domain helpers that apply EXPLICIT human SKU-resolution review
 * decisions to existing SkuResolutionDecision rows.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (section 8).
 *
 * This is line-level SKU review (accept/reject/manual/out_of_scope), NOT Project
 * stage/artifact approval. A human actor (`decidedBy`) is always required; nothing
 * is ever auto-accepted. `accept`/`reject` act only on a `needs_review` row;
 * accepting requires the chosen SKU to match one of the row's existing suggestions,
 * and a deferred/non-priced row can NEVER be accepted - a deterministic guard that
 * holds even when such a row carries a same-SKU suggestion, so a crafted direct API
 * accept is refused server-side. `manual` (non-Cisco / third-party / manual-
 * commercial) and `out_of_scope` (intentionally excluded from Cisco Quick BoM
 * pricing) classify an unsupported row and may target a `needs_review` OR an
 * `unresolved` row; like `reject` they never carry an `acceptedSku` and never price a
 * row. It does NO catalog lookup, creates no artifact version, and touches no DB,
 * artifact store, approvals, staleness, engines, AI, pricing, or API/UI. Pure:
 * returns fresh decisions and never mutates its input decisions, actions, or
 * suggestion arrays.
 */
import type { SkuResolutionDecision } from "@/types/project";
import { isDeferredReviewSku } from "@/lib/projects/sku-deferred-review-set";

/** Fields common to both review actions. */
interface SkuResolutionReviewActionBase {
  sourceFileId: string;
  sourceRowNumber: number;
  /** Required human actor; a blank value is rejected. */
  decidedBy: string;
  /** When the human decided; defaults to now if omitted. */
  decidedAt?: Date;
  note?: string;
}

/** Accept a `needs_review` row by choosing one of its existing suggestions. */
export interface SkuResolutionAcceptAction extends SkuResolutionReviewActionBase {
  decision: "accept";
  acceptedSku: string;
}

/** Reject a `needs_review` row; carries no accepted SKU. */
export interface SkuResolutionRejectAction extends SkuResolutionReviewActionBase {
  decision: "reject";
}

/**
 * Classify a row as a manual / third-party / non-Cisco commercial line. Carries
 * no accepted SKU and may target a `needs_review` OR an `unresolved` row.
 */
export interface SkuResolutionManualAction extends SkuResolutionReviewActionBase {
  decision: "manual";
}

/**
 * Mark a row as intentionally excluded from Cisco Quick BoM pricing. Carries no
 * accepted SKU and may target a `needs_review` OR an `unresolved` row.
 */
export interface SkuResolutionOutOfScopeAction
  extends SkuResolutionReviewActionBase {
  decision: "out_of_scope";
}

/** One explicit human review choice targeting a decision by file + row. */
export type SkuResolutionReviewAction =
  | SkuResolutionAcceptAction
  | SkuResolutionRejectAction
  | SkuResolutionManualAction
  | SkuResolutionOutOfScopeAction;

/** Outcome of applying a batch of review actions, plus deterministic counts. */
export interface SkuResolutionReviewResult {
  decisions: SkuResolutionDecision[];
  /** Number of actions actually applied to a decision. */
  appliedCount: number;
  needsReviewCount: number;
  acceptedCount: number;
  rejectedCount: number;
  unresolvedCount: number;
  /** Rows explicitly classified as manual / third-party / non-Cisco. */
  manualCount: number;
  /** Rows explicitly excluded from Cisco Quick BoM pricing. */
  outOfScopeCount: number;
}

const DECIDED_BY_REQUIRED = "decidedBy is required.";
const NOT_REVIEWABLE = "SKU resolution decision is not reviewable.";
const ACCEPTED_SKU_REQUIRED = "acceptedSku is required.";
const ACCEPTED_SKU_NO_MATCH = "Accepted SKU must match an existing suggestion.";
const REJECT_HAS_ACCEPTED_SKU = "Rejected SKU resolution cannot include acceptedSku.";
const UNSUPPORTED_HAS_ACCEPTED_SKU =
  "Manual or out-of-scope SKU resolution cannot include acceptedSku.";
const ACCEPT_DEFERRED_NOT_ALLOWED =
  "Deferred non-priced SKU resolution row cannot be accepted.";
const DUPLICATE_ACTION = "Duplicate SKU resolution action for decision.";
const MISSING_TARGET = "SKU resolution action target was not found.";

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/** Deterministic identity for a decision/action: its source file + row pair. */
export function getSkuResolutionDecisionKey(decision: {
  sourceFileId: string;
  sourceRowNumber: number;
}): string {
  return `${decision.sourceFileId}::${decision.sourceRowNumber}`;
}

/** Only `needs_review` rows may be accepted or rejected. */
export function isSkuResolutionDecisionReviewable(
  decision: SkuResolutionDecision
): boolean {
  return decision.status === "needs_review";
}

/**
 * Which decision states each action may target. `accept`/`reject` act only on a
 * `needs_review` row (existing behavior). `manual`/`out_of_scope` classify an
 * unsupported row and may additionally target an `unresolved` row, so the engineer
 * can explicitly dispose of a row that resolution could not match.
 */
function isDecisionTargetableByAction(
  decision: SkuResolutionDecision,
  action: SkuResolutionReviewAction
): boolean {
  if (action.decision === "manual" || action.decision === "out_of_scope") {
    return decision.status === "needs_review" || decision.status === "unresolved";
  }
  return isSkuResolutionDecisionReviewable(decision);
}

/** True when an action carries a defined `acceptedSku` (only `accept` may). */
function actionCarriesAcceptedSku(action: SkuResolutionReviewAction): boolean {
  return (
    "acceptedSku" in action &&
    (action as { acceptedSku?: unknown }).acceptedSku !== undefined
  );
}

/** Fresh copies of a decision's suggestions so results never alias the input. */
function copySuggestions(
  decision: SkuResolutionDecision
): SkuResolutionDecision["suggestions"] {
  return decision.suggestions.map((suggestion) => ({ ...suggestion }));
}

/** Preserved source identity shared by accepted and rejected results. */
function preservedSource(decision: SkuResolutionDecision) {
  return {
    sourceFileId: decision.sourceFileId,
    sourceRowNumber: decision.sourceRowNumber,
    originalLineNumber: decision.originalLineNumber,
    originalSku: decision.originalSku,
  };
}

/**
 * Apply one explicit human review action to one decision, returning a fresh
 * SkuResolutionDecision. `decidedBy` must be nonblank and the decision must be in a
 * state the action may target: `accept`/`reject` need `needs_review`, while
 * `manual`/`out_of_scope` accept `needs_review` OR `unresolved`. Accepting requires a
 * nonblank `acceptedSku` that matches an existing suggestion; `reject`, `manual`, and
 * `out_of_scope` must not carry an `acceptedSku`. Never mutates the input decision,
 * its suggestions, or the action.
 */
export function applySkuResolutionReviewAction(
  decision: SkuResolutionDecision,
  action: SkuResolutionReviewAction
): SkuResolutionDecision {
  if (isBlank(action.decidedBy)) throw new Error(DECIDED_BY_REQUIRED);
  if (!isDecisionTargetableByAction(decision, action)) throw new Error(NOT_REVIEWABLE);

  const decidedAt = action.decidedAt ?? new Date();
  const base = {
    ...preservedSource(decision),
    suggestions: copySuggestions(decision),
    decidedBy: action.decidedBy,
    decidedAt,
    ...(action.note !== undefined ? { note: action.note } : {}),
  };

  if (action.decision === "accept") {
    // Server-side guard: a deferred/non-priced row can never be accepted, even when it
    // carries a same-SKU suggestion that would otherwise pass the suggestion-match
    // check. This is keyed on the row's own originalSku, so a crafted direct API accept
    // is refused regardless of the action's acceptedSku.
    if (isDeferredReviewSku(decision.originalSku)) {
      throw new Error(ACCEPT_DEFERRED_NOT_ALLOWED);
    }
    if (isBlank(action.acceptedSku)) throw new Error(ACCEPTED_SKU_REQUIRED);
    const matches = decision.suggestions.some(
      (suggestion) => suggestion.suggestedSku === action.acceptedSku
    );
    if (!matches) throw new Error(ACCEPTED_SKU_NO_MATCH);
    return { ...base, status: "accepted", acceptedSku: action.acceptedSku };
  }

  // reject / manual / out_of_scope are non-priced dispositions and never carry an
  // acceptedSku; an attached SKU is a programming/crafted-request error and is refused.
  if (actionCarriesAcceptedSku(action)) {
    throw new Error(
      action.decision === "reject"
        ? REJECT_HAS_ACCEPTED_SKU
        : UNSUPPORTED_HAS_ACCEPTED_SKU
    );
  }
  if (action.decision === "manual") return { ...base, status: "manual" };
  if (action.decision === "out_of_scope") return { ...base, status: "out_of_scope" };
  return { ...base, status: "rejected" };
}

/**
 * Apply a batch of explicit human review actions to existing decisions, keyed by
 * source file + row. Decision order is preserved; each decision keeps its
 * existing state unless a matching action targets it. Duplicate actions for one
 * decision and actions whose target decision does not exist are rejected before
 * anything is applied. Never mutates the input decisions, actions, or their
 * suggestion arrays.
 */
export function applySkuResolutionReviewActions(
  decisions: readonly SkuResolutionDecision[],
  actions: readonly SkuResolutionReviewAction[]
): SkuResolutionReviewResult {
  const actionsByKey = new Map<string, SkuResolutionReviewAction>();
  for (const action of actions) {
    const key = getSkuResolutionDecisionKey(action);
    if (actionsByKey.has(key)) throw new Error(DUPLICATE_ACTION);
    actionsByKey.set(key, action);
  }

  const decisionKeys = new Set(decisions.map(getSkuResolutionDecisionKey));
  for (const key of Array.from(actionsByKey.keys())) {
    if (!decisionKeys.has(key)) throw new Error(MISSING_TARGET);
  }

  let appliedCount = 0;
  let needsReviewCount = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  let unresolvedCount = 0;
  let manualCount = 0;
  let outOfScopeCount = 0;

  const resultDecisions = decisions.map((decision) => {
    const action = actionsByKey.get(getSkuResolutionDecisionKey(decision));
    const next = action ? applySkuResolutionReviewAction(decision, action) : decision;
    if (action) appliedCount++;

    if (next.status === "needs_review") needsReviewCount++;
    else if (next.status === "accepted") acceptedCount++;
    else if (next.status === "rejected") rejectedCount++;
    else if (next.status === "unresolved") unresolvedCount++;
    else if (next.status === "manual") manualCount++;
    else if (next.status === "out_of_scope") outOfScopeCount++;

    return next;
  });

  return {
    decisions: resultDecisions,
    appliedCount,
    needsReviewCount,
    acceptedCount,
    rejectedCount,
    unresolvedCount,
    manualCount,
    outOfScopeCount,
  };
}
