"use client";

/**
 * SKU resolution line-review panel (extracted from the Quick BoM page).
 *
 * Loaded on demand from the read-only review route; the panel's review projection is
 * null until the engineer clicks "Load SKU review lines" (the main workspace stays
 * payload-free).
 *
 * Review uses a checkbox/table flow, not per-line Accept/Reject buttons. Every
 * `needs_review` row gets exactly one checkbox:
 *  - Eligible priced same-SKU rows (one suggestion equal to the original SKU, no
 *    reject/defer guidance) are selectable and checked by default - submitting accepts
 *    that exact same SKU (never a substitution).
 *  - Deferred/non-priced rows (carrying reject/defer guidance) and any other
 *    non-same-SKU row are unselectable (disabled, unchecked) and impossible to approve;
 *    submitting rejects them.
 * One "Submit review decisions" action records an explicit decision for EVERY review
 * row in a single POST: checked -> accept (the same SKU), unchecked -> reject. Nothing
 * is auto-accepted, replaced, or substituted.
 *
 * A successful POST mints a NEW sku_resolution version (new artifact id). When the
 * minted artifact still needs_review the panel auto-refreshes against the returned id;
 * when it is no longer needs_review the panel clears so the normal artifact approval
 * controls appear (review submission is NOT stage approval). When the loaded artifact
 * is already decided (not needs_review) the panel shows a read-only decision table.
 * The body carries only { actions: [...sanitizedActions] }; no tenant/project/artifact/
 * decidedBy/decidedAt/pricing/authority field is ever sent.
 */

import { useCallback, useState } from "react";
import type {
  QuickBomSkuResolutionReviewLine,
  QuickBomSkuResolutionReviewWorkspace,
} from "@/lib/projects/project-quick-bom-sku-resolution-review-workspace";
import { APPROVE_BTN, Card, StatusBadge, bodyMessage } from "./quick-bom-review-ui";
import { SkuResolutionReviewReadOnly } from "./sku-resolution-review-readonly";
import { SkuRelatedConfiguredNote } from "./sku-related-configured-note";

const SKU_REVIEW_ERROR = "Unable to load or update the SKU line review.";

/** Stable per-line key: its source file + row pair. */
function lineKey(line: QuickBomSkuResolutionReviewLine): string {
  return `${line.sourceFileId}::${line.sourceRowNumber}`;
}

/**
 * A row is approvable (selectable, checked by default) only when it still needs review,
 * carries NO reject/defer guidance, carries exactly one suggestion, and that suggestion
 * is the same SKU as the original (case-insensitive, trimmed). This excludes
 * deferred/non-priced guided rows, unresolved, ambiguous, multi-suggestion, and
 * different-SKU rows - none of which may be approved through this panel.
 */
function isApprovableLine(line: QuickBomSkuResolutionReviewLine): boolean {
  if (line.status !== "needs_review") return false;
  if (line.reviewGuidance?.action === "reject") return false;
  if (line.suggestions.length !== 1) return false;
  const suggested = line.suggestions[0].suggestedSku.trim().toLowerCase();
  const original = line.originalSku.trim().toLowerCase();
  return suggested !== "" && suggested === original;
}

/** A row carries an explicit deferred/non-priced reject recommendation. */
function isDeferredLine(line: QuickBomSkuResolutionReviewLine): boolean {
  return line.status === "needs_review" && line.reviewGuidance?.action === "reject";
}

interface SkuResolutionReviewPanelProps {
  projectId: string;
  artifactId: string;
  onReviewSubmitted: () => Promise<void> | void;
}

export function SkuResolutionReviewPanel({
  projectId,
  artifactId,
  onReviewSubmitted,
}: SkuResolutionReviewPanelProps) {
  const [skuReview, setSkuReview] = useState<QuickBomSkuResolutionReviewWorkspace | null>(null);
  const [skuReviewError, setSkuReviewError] = useState<string | null>(null);
  const [skuReviewBusy, setSkuReviewBusy] = useState(false);
  // Checked row keys, keyed by `${sourceFileId}::${sourceRowNumber}`. Seeded from the
  // approvable rows on every (re)load; deferred/non-approvable rows are never selected.
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // GET the read-only SKU line-review projection for one sku_resolution artifact and
  // seed the default selection (approvable same-SKU rows checked). This is the only
  // place the page fetches review lines. Controlled errors only, never a stack.
  const loadSkuReview = useCallback(
    async (id: string): Promise<void> => {
      setSkuReviewError(null);
      setSkuReviewBusy(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/quick-bom/artifacts/${id}/sku-resolution/review`
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setSkuReview(null);
          setSkuReviewError(bodyMessage(body) ?? SKU_REVIEW_ERROR);
          return;
        }
        const review = (body as { review?: QuickBomSkuResolutionReviewWorkspace } | null)
          ?.review;
        if (!review) {
          setSkuReview(null);
          setSkuReviewError(SKU_REVIEW_ERROR);
          return;
        }
        const defaults: Record<string, boolean> = {};
        for (const line of review.lines) {
          if (isApprovableLine(line)) defaults[lineKey(line)] = true;
        }
        setSelected(defaults);
        setSkuReview(review);
      } catch {
        setSkuReview(null);
        setSkuReviewError(SKU_REVIEW_ERROR);
      } finally {
        setSkuReviewBusy(false);
      }
    },
    [projectId]
  );

  // POST one explicit decision for EVERY review row in a single action array. A
  // successful POST mints a NEW sku_resolution version; while it still needs_review the
  // panel auto-refreshes against the returned id, otherwise it clears so the normal
  // artifact approval controls appear. The body carries only { actions }; no tenant/
  // project/artifact/decidedBy/decidedAt/pricing/authority field is ever sent.
  const submitSkuReviewActions = useCallback(
    async (actions: Record<string, unknown>[]): Promise<void> => {
      if (actions.length === 0) return;
      setSkuReviewError(null);
      setSkuReviewBusy(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/quick-bom/artifacts/${artifactId}/sku-resolution/review`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actions }),
          }
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setSkuReviewError(bodyMessage(body) ?? SKU_REVIEW_ERROR);
          return;
        }
        const artifact = (body as { artifact?: { id?: unknown; status?: unknown } } | null)
          ?.artifact;
        const nextId =
          typeof artifact?.id === "string" && artifact.id !== "" ? artifact.id : null;
        const stillNeedsReview = artifact?.status === "needs_review";
        await onReviewSubmitted();
        if (stillNeedsReview && nextId) {
          await loadSkuReview(nextId);
        } else {
          setSkuReview(null);
        }
      } catch {
        setSkuReviewError(SKU_REVIEW_ERROR);
      } finally {
        setSkuReviewBusy(false);
      }
    },
    [projectId, artifactId, onReviewSubmitted, loadSkuReview]
  );

  // Build one explicit decision per `needs_review` row and POST them together. A
  // checked (approvable) row accepts its same-SKU suggestion (never invented); every
  // other review row is rejected, carrying the advisory defer note when deferred. No
  // authority/pricing/catalog/replacement field is ever attached.
  function onSubmitReview(review: QuickBomSkuResolutionReviewWorkspace): void {
    const actions = review.lines
      .filter((line) => line.status === "needs_review")
      .map((line) => {
        if (isApprovableLine(line) && selected[lineKey(line)]) {
          return {
            decision: "accept",
            sourceFileId: line.sourceFileId,
            sourceRowNumber: line.sourceRowNumber,
            acceptedSku: line.suggestions[0].suggestedSku,
          };
        }
        const note = isDeferredLine(line) ? line.reviewGuidance?.note : undefined;
        return {
          decision: "reject",
          sourceFileId: line.sourceFileId,
          sourceRowNumber: line.sourceRowNumber,
          ...(note !== undefined ? { note } : {}),
        };
      });
    void submitSkuReviewActions(actions);
  }

  function toggleLine(line: QuickBomSkuResolutionReviewLine): void {
    const key = lineKey(line);
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const reviewable = skuReview?.artifact.status === "needs_review";
  const reviewRowCount = skuReview
    ? skuReview.lines.filter((line) => line.status === "needs_review").length
    : 0;
  const approveCount = skuReview
    ? skuReview.lines.filter(
        (line) => isApprovableLine(line) && selected[lineKey(line)]
      ).length
    : 0;

  return (
    <Card title="SKU line review">
      <p className="mt-2 text-xs text-text-secondary">
        Review every line in one pass: eligible same-SKU rows are pre-selected for
        approval; deferred non-priced rows cannot be approved. Submitting records an
        explicit accept/reject decision for every reviewed line.
      </p>
      <button
        type="button"
        data-testid="sku-review-load"
        disabled={skuReviewBusy}
        onClick={() => void loadSkuReview(artifactId)}
        className={`mt-3 ${APPROVE_BTN}`}
      >
        Load SKU review lines
      </button>
      {skuReviewError && (
        <div
          data-testid="sku-review-error"
          className="mt-3 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive"
        >
          {skuReviewError}
        </div>
      )}
      {skuReview && (
        <div className="mt-3 space-y-3">
          <p data-testid="sku-review-summary" className="text-xs text-text-secondary">
            {skuReview.reviewSummary.totalLineCount} lines:{" "}
            {skuReview.reviewSummary.needsReviewCount} need review,{" "}
            {skuReview.reviewSummary.acceptedCount} accepted,{" "}
            {skuReview.reviewSummary.rejectedCount} rejected,{" "}
            {skuReview.reviewSummary.unresolvedCount} unresolved
          </p>
          {!reviewable ? (
            <SkuResolutionReviewReadOnly lines={skuReview.lines} />
          ) : (
            <>
              <button
                type="button"
                data-testid="sku-review-submit"
                disabled={skuReviewBusy || reviewRowCount === 0}
                onClick={() => onSubmitReview(skuReview)}
                className={APPROVE_BTN}
              >
                Submit review decisions ({approveCount} approve / {reviewRowCount - approveCount} reject)
              </button>
              <ol className="space-y-2">
                {skuReview.lines.map((line) => {
                  const needsReview = line.status === "needs_review";
                  const approvable = isApprovableLine(line);
                  const key = lineKey(line);
                  return (
                    <li
                      key={key}
                      data-testid="sku-review-line"
                      className="rounded-button border border-[var(--border)] p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2">
                          {needsReview && (
                            <input
                              type="checkbox"
                              data-testid="sku-review-checkbox"
                              data-row={line.sourceRowNumber}
                              checked={approvable ? Boolean(selected[key]) : false}
                              disabled={skuReviewBusy || !approvable}
                              onChange={() => toggleLine(line)}
                            />
                          )}
                          <span className="text-sm font-medium text-text-primary">
                            {line.originalSku}
                          </span>
                        </label>
                        <StatusBadge status={line.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-text-tertiary">
                        Source row {line.sourceRowNumber}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        Suggestions:{" "}
                        {line.suggestions.length === 0
                          ? "none"
                          : line.suggestions.map((s) => s.suggestedSku).join(", ")}
                      </p>
                      {line.reviewGuidance?.action === "reject" && (
                        <p
                          data-testid="sku-review-guidance"
                          className="mt-0.5 text-xs text-warning"
                        >
                          {line.reviewGuidance.note}
                        </p>
                      )}
                      <SkuRelatedConfiguredNote items={line.relatedConfiguredItems} />
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
