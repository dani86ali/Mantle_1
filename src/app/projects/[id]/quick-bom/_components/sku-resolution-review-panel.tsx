"use client";

/**
 * SKU resolution line-review panel (extracted from the Quick BoM page, Prompts 127/153).
 *
 * Loaded on demand from the read-only review route; the panel's review projection is
 * null until the engineer clicks "Load SKU review lines" (the main workspace stays
 * payload-free). Cleared after every successful review POST.
 *
 * Besides per-line accept/reject and the same-SKU batch accept, lines carrying a
 * read-model reject/defer recommendation are excluded from the same-SKU batch and can
 * be rejected together via an explicit reject/defer batch (sanitized
 * { decision: "reject", sourceFileId, sourceRowNumber, note? } actions). The
 * recommendation is advisory and the engineer must click - nothing is auto-rejected,
 * replaced, or substituted.
 *
 * A successful POST mints a NEW sku_resolution version (new artifact id). When the
 * minted artifact still needs_review, the panel stays open and auto-refreshes against
 * the returned new artifact id - the engineer never re-clicks "Load SKU review lines"
 * after each action. When the minted artifact is no longer needs_review, the panel
 * clears so the normal artifact approval controls appear. The parent workspace is
 * refreshed either way (via onReviewSubmitted) so the spine points at the latest
 * version. This is line review, not stage approval - nothing is approved here. The body
 * carries only { actions: [...sanitizedActions] }; no tenant/project/artifact/decidedBy/
 * decidedAt/pricing/authority field is ever sent.
 */

import { useCallback, useState } from "react";
import type {
  QuickBomSkuResolutionReviewLine,
  QuickBomSkuResolutionReviewWorkspace,
} from "@/lib/projects/project-quick-bom-sku-resolution-review-workspace";
import {
  APPROVE_BTN,
  REJECT_BTN,
  Card,
  StatusBadge,
  bodyMessage,
  promptNote,
} from "./quick-bom-review-ui";

const SKU_REVIEW_ERROR = "Unable to load or update the SKU line review.";

/**
 * A SKU review line is safe to batch-accept only when it still needs review, carries
 * NO reject/defer guidance, carries exactly one suggestion, and that suggestion is the
 * same SKU as the original (case-insensitive, trimmed). This deliberately excludes
 * deferred/non-priced guided lines, unresolved, ambiguous, multi-suggestion, already-
 * decided, and different-SKU lines.
 */
function isSameSkuSuggestionAcceptable(line: QuickBomSkuResolutionReviewLine): boolean {
  if (line.status !== "needs_review") return false;
  if (line.reviewGuidance?.action === "reject") return false;
  if (line.suggestions.length !== 1) return false;
  const suggested = line.suggestions[0].suggestedSku.trim().toLowerCase();
  const original = line.originalSku.trim().toLowerCase();
  return suggested !== "" && suggested === original;
}

/**
 * A SKU review line is eligible for the explicit reject/defer batch only when it still
 * needs review and carries a reject/defer recommendation (a known deferred/non-priced
 * Honeywell row). Already-decided lines are excluded.
 */
function isDeferredRejectGuided(line: QuickBomSkuResolutionReviewLine): boolean {
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

  // GET the read-only SKU line-review projection for one sku_resolution artifact.
  // This is the only place the page fetches review lines; the main workspace read
  // model never carries them. Controlled errors only, never a stack.
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

  // POST one or more explicit accept/reject actions to the existing review route.
  // A successful POST mints a NEW sku_resolution version (new artifact id). When the
  // minted artifact still needs_review, the panel stays open and auto-refreshes
  // against the returned new artifact id - the engineer never re-clicks "Load SKU
  // review lines" after each action. When the minted artifact is no longer
  // needs_review, the panel clears so the normal artifact approval controls appear.
  // The main workspace is refreshed either way so the spine points at the latest
  // version. This is line review, not stage approval - nothing is approved here. The
  // body carries only { actions: [...sanitizedActions] }; no tenant/project/artifact/
  // decidedBy/decidedAt/pricing/authority field is ever sent.
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

  // Accept one line by choosing exactly one of its existing suggestions. No SKU is
  // invented here - acceptedSku is always one the server already suggested.
  function onAcceptSkuLine(
    line: QuickBomSkuResolutionReviewLine,
    acceptedSku: string
  ): void {
    void submitSkuReviewActions([
      {
        decision: "accept",
        sourceFileId: line.sourceFileId,
        sourceRowNumber: line.sourceRowNumber,
        acceptedSku,
      },
    ]);
  }

  // Reject one line; optionally attach a note. Never carries an acceptedSku.
  function onRejectSkuLine(line: QuickBomSkuResolutionReviewLine): void {
    const note = promptNote();
    void submitSkuReviewActions([
      {
        decision: "reject",
        sourceFileId: line.sourceFileId,
        sourceRowNumber: line.sourceRowNumber,
        ...(note !== undefined ? { note } : {}),
      },
    ]);
  }

  // Explicit batch accept for the safe same-SKU lines only: each must still be
  // needs_review, carry exactly one suggestion, and that suggestion must equal the
  // original SKU (case-insensitive, trimmed). Ambiguous, multi-suggestion, unresolved,
  // already-decided, or different-SKU lines are excluded. acceptedSku is the suggested
  // SKU the server already produced - never invented. One POST carries every eligible
  // accept; nothing is auto-clicked or inferred - the engineer triggers this explicitly.
  function onAcceptAllSameSku(review: QuickBomSkuResolutionReviewWorkspace): void {
    const actions = review.lines
      .filter(isSameSkuSuggestionAcceptable)
      .map((line) => ({
        decision: "accept",
        sourceFileId: line.sourceFileId,
        sourceRowNumber: line.sourceRowNumber,
        acceptedSku: line.suggestions[0].suggestedSku,
      }));
    void submitSkuReviewActions(actions);
  }

  // Explicit batch reject/defer for the guided non-priced lines only: each must still
  // be needs_review and carry a reject/defer recommendation. One POST carries every
  // eligible reject; the engineer triggers this explicitly - nothing is auto-rejected.
  // Each action is sanitized to { decision: "reject", sourceFileId, sourceRowNumber,
  // note? }; the optional note is the advisory recommendation reason - never a tenant/
  // project/artifact/decidedBy/decidedAt/pricing/authority/replacement field, and never
  // an acceptedSku.
  function onRejectAllDeferred(review: QuickBomSkuResolutionReviewWorkspace): void {
    const actions = review.lines.filter(isDeferredRejectGuided).map((line) => ({
      decision: "reject",
      sourceFileId: line.sourceFileId,
      sourceRowNumber: line.sourceRowNumber,
      ...(line.reviewGuidance?.note !== undefined
        ? { note: line.reviewGuidance.note }
        : {}),
    }));
    void submitSkuReviewActions(actions);
  }

  // Lines safe to batch-accept (single same-SKU suggestion still needing review).
  const sameSkuEligibleCount = skuReview
    ? skuReview.lines.filter(isSameSkuSuggestionAcceptable).length
    : 0;
  // Lines flagged for explicit reject/defer (deferred non-priced rows still needing review).
  const deferredRejectCount = skuReview
    ? skuReview.lines.filter(isDeferredRejectGuided).length
    : 0;

  return (
    <Card title="SKU line review">
      <p className="mt-2 text-xs text-text-secondary">
        Accept one suggested SKU per line or reject the line. Every decision is an
        explicit, server-recorded action - nothing is auto-accepted or auto-rejected.
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
          <p
            data-testid="sku-review-summary"
            className="text-xs text-text-secondary"
          >
            {skuReview.reviewSummary.totalLineCount} lines:{" "}
            {skuReview.reviewSummary.needsReviewCount} need review,{" "}
            {skuReview.reviewSummary.acceptedCount} accepted,{" "}
            {skuReview.reviewSummary.rejectedCount} rejected,{" "}
            {skuReview.reviewSummary.unresolvedCount} unresolved
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="sku-review-accept-all-same-sku"
              disabled={skuReviewBusy || sameSkuEligibleCount === 0}
              onClick={() => onAcceptAllSameSku(skuReview)}
              className={APPROVE_BTN}
            >
              Accept all same-SKU suggestions ({sameSkuEligibleCount})
            </button>
            <button
              type="button"
              data-testid="sku-review-reject-all-deferred"
              disabled={skuReviewBusy || deferredRejectCount === 0}
              onClick={() => onRejectAllDeferred(skuReview)}
              className={REJECT_BTN}
            >
              Reject all deferred non-priced rows ({deferredRejectCount})
            </button>
          </div>
          <ol className="space-y-2">
            {skuReview.lines.map((line) => (
              <li
                key={`${line.sourceFileId}::${line.sourceRowNumber}`}
                data-testid="sku-review-line"
                className="rounded-button border border-[var(--border)] p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-text-primary">
                    {line.originalSku}
                  </span>
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
                {line.status === "needs_review" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {line.suggestions.map((suggestion) => (
                      <button
                        key={suggestion.suggestedSku}
                        type="button"
                        data-testid="sku-review-accept"
                        disabled={skuReviewBusy}
                        onClick={() =>
                          onAcceptSkuLine(line, suggestion.suggestedSku)
                        }
                        className={APPROVE_BTN}
                      >
                        Accept {suggestion.suggestedSku}
                      </button>
                    ))}
                    <button
                      type="button"
                      data-testid="sku-review-reject"
                      disabled={skuReviewBusy}
                      onClick={() => onRejectSkuLine(line)}
                      className={REJECT_BTN}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}
