"use client";

/**
 * Configuration-expansion line-review panel (extracted from the Quick BoM page,
 * Prompt 128).
 *
 * Loaded on demand from the read-only review route (the main workspace stays
 * payload-free). The engineer marks every expansion line accept/reject; local
 * decisions are tracked keyed by lineId and the complete batch is POSTed on submit.
 * Both the loaded review and the local decisions are cleared after a successful POST.
 *
 * The submitted batch carries exactly one explicit decision per expansion line, in
 * draft order, and none for customer lines. The batch is built from the loaded lines
 * (origin === "expansion") so a customer line can never receive a decision; the body
 * carries only { decisions: [...] } with each decision sanitized to lineId/action/note.
 * A successful POST mints a NEW reviewed (non-draft) artifact, so the panel clears and
 * the parent workspace is refreshed (via onReviewSubmitted); the artifact is never
 * marked approved client-side. Nothing posts until every expansion line has an explicit
 * decision.
 */

import { useCallback, useState } from "react";
import type {
  QuickBomConfigExpansionReviewLine,
  QuickBomConfigExpansionReviewWorkspace,
} from "@/lib/projects/project-quick-bom-config-expansion-review-workspace";
import {
  APPROVE_BTN,
  REJECT_BTN,
  Card,
  humanize,
  bodyMessage,
  promptNote,
} from "./quick-bom-review-ui";

const CONFIG_REVIEW_ERROR =
  "Unable to load or submit the configuration expansion line review.";

interface ConfigurationExpansionReviewPanelProps {
  projectId: string;
  artifactId: string;
  onReviewSubmitted: () => Promise<void> | void;
}

export function ConfigurationExpansionReviewPanel({
  projectId,
  artifactId,
  onReviewSubmitted,
}: ConfigurationExpansionReviewPanelProps) {
  const [configReview, setConfigReview] = useState<QuickBomConfigExpansionReviewWorkspace | null>(null);
  const [configReviewError, setConfigReviewError] = useState<string | null>(null);
  const [configReviewBusy, setConfigReviewBusy] = useState(false);
  const [configDecisions, setConfigDecisions] = useState<
    Record<string, { action: "accept" | "reject"; note?: string }>
  >({});

  // GET the read-only configuration-expansion line-review projection for one draft
  // artifact. Resets any in-progress local decisions so a fresh load starts clean.
  // Controlled errors only, never a stack.
  const loadConfigReview = useCallback(
    async (id: string): Promise<void> => {
      setConfigReviewError(null);
      setConfigReviewBusy(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/quick-bom/artifacts/${id}/configuration-expansion/review`
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setConfigReview(null);
          setConfigReviewError(bodyMessage(body) ?? CONFIG_REVIEW_ERROR);
          return;
        }
        const review = (body as { review?: QuickBomConfigExpansionReviewWorkspace } | null)
          ?.review;
        if (!review) {
          setConfigReview(null);
          setConfigReviewError(CONFIG_REVIEW_ERROR);
          return;
        }
        setConfigDecisions({});
        setConfigReview(review);
      } catch {
        setConfigReview(null);
        setConfigReviewError(CONFIG_REVIEW_ERROR);
      } finally {
        setConfigReviewBusy(false);
      }
    },
    [projectId]
  );

  // POST one complete configuration-expansion review batch: exactly one explicit
  // decision per expansion line, in draft order, and none for customer lines. The
  // batch is built from the loaded lines (origin === "expansion") so a customer line
  // can never receive a decision; the body carries only { decisions: [...] } with each
  // decision sanitized to lineId/action/note. A successful POST mints a NEW reviewed
  // (non-draft) artifact, so we clear the panel and refresh the main workspace; the
  // artifact is never marked approved client-side. Nothing posts until every expansion
  // line has an explicit decision.
  const submitConfigReview = useCallback(async (): Promise<void> => {
    if (configReview === null) return;
    const expansionLines = configReview.lines.filter(
      (line) => line.origin === "expansion"
    );
    if (!expansionLines.every((line) => configDecisions[line.lineId] !== undefined)) {
      return;
    }
    const decisions = expansionLines.map((line) => {
      const decision = configDecisions[line.lineId];
      return {
        lineId: line.lineId,
        action: decision.action,
        ...(decision.note !== undefined ? { note: decision.note } : {}),
      };
    });
    setConfigReviewError(null);
    setConfigReviewBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/quick-bom/artifacts/${artifactId}/configuration-expansion/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisions }),
        }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setConfigReviewError(bodyMessage(body) ?? CONFIG_REVIEW_ERROR);
        return;
      }
      setConfigReview(null);
      setConfigDecisions({});
      await onReviewSubmitted();
    } catch {
      setConfigReviewError(CONFIG_REVIEW_ERROR);
    } finally {
      setConfigReviewBusy(false);
    }
  }, [projectId, artifactId, configReview, configDecisions, onReviewSubmitted]);

  // Record an explicit accept for one expansion line locally. No POST happens here -
  // the complete batch is submitted only when every expansion line has been decided.
  function onAcceptConfigLine(line: QuickBomConfigExpansionReviewLine): void {
    setConfigDecisions((prev) => ({ ...prev, [line.lineId]: { action: "accept" } }));
  }

  // Explicit local batch accept: mark every expansion-origin line as accepted in one
  // click. Customer-origin lines never receive a decision. This only sets local state -
  // it never POSTs and never approves the configuration_expansion artifact. A later
  // per-line reject can still override one of these accepts before the engineer submits.
  function onAcceptAllExpansionLines(
    review: QuickBomConfigExpansionReviewWorkspace
  ): void {
    setConfigDecisions((prev) => {
      const next = { ...prev };
      for (const line of review.lines) {
        if (line.origin === "expansion") {
          next[line.lineId] = { action: "accept" };
        }
      }
      return next;
    });
  }

  // Record an explicit reject for one expansion line locally; optionally attach a note.
  function onRejectConfigLine(line: QuickBomConfigExpansionReviewLine): void {
    const note = promptNote();
    setConfigDecisions((prev) => ({
      ...prev,
      [line.lineId]: { action: "reject", ...(note !== undefined ? { note } : {}) },
    }));
  }

  // Submit is blocked until every expansion line has an explicit accept/reject; an
  // empty array (vacuously true) is enabled only when the draft has no expansion lines.
  const configExpansionLines = configReview
    ? configReview.lines.filter((line) => line.origin === "expansion")
    : [];
  const allConfigExpansionDecided = configExpansionLines.every(
    (line) => configDecisions[line.lineId] !== undefined
  );

  return (
    <Card title="Configuration expansion line review">
      <p className="mt-2 text-xs text-text-secondary">
        Accept or reject every expansion line. Customer lines are read-only. All
        expansion lines must be decided before the batch can be submitted.
      </p>
      <button
        type="button"
        data-testid="config-review-load"
        disabled={configReviewBusy}
        onClick={() => void loadConfigReview(artifactId)}
        className={`mt-3 ${APPROVE_BTN}`}
      >
        Load configuration expansion review lines
      </button>
      {configReviewError && (
        <div
          data-testid="config-review-error"
          className="mt-3 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive"
        >
          {configReviewError}
        </div>
      )}
      {configReview && (
        <div className="mt-3 space-y-3">
          <p
            data-testid="config-review-summary"
            className="text-xs text-text-secondary"
          >
            {configReview.reviewSummary.totalLineCount} lines:{" "}
            {configReview.reviewSummary.customerLineCount} customer,{" "}
            {configReview.reviewSummary.expansionLineCount} expansion,{" "}
            {configReview.reviewSummary.requiresDecisionCount} require decision,{" "}
            {configReview.reviewSummary.includedItemCount} included items
          </p>
          <button
            type="button"
            data-testid="config-review-accept-all-expansion"
            disabled={configReviewBusy || configExpansionLines.length === 0}
            onClick={() => onAcceptAllExpansionLines(configReview)}
            className={APPROVE_BTN}
          >
            Accept all expansion lines ({configExpansionLines.length})
          </button>
          <ol className="space-y-2">
            {configReview.lines.map((line) => {
              const decision = configDecisions[line.lineId];
              return (
                <li
                  key={line.lineId}
                  data-testid="config-review-line"
                  className="rounded-button border border-[var(--border)] p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {line.sku}
                    </span>
                    <span className="text-xs text-text-tertiary capitalize">
                      {line.origin}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-secondary">{line.description}</p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    Qty: {line.quantity}
                    {line.relationshipType ? ` | ${humanize(line.relationshipType)}` : ""}
                    {line.sourceRuleId ? ` | rule: ${line.sourceRuleId}` : ""}
                    {line.evidenceCount > 0
                      ? ` | evidence: ${line.evidenceCount} (${line.evidenceSourceTypes.join(", ")})`
                      : ""}
                  </p>
                  {line.origin === "expansion" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        data-testid="config-review-accept"
                        disabled={configReviewBusy}
                        onClick={() => onAcceptConfigLine(line)}
                        className={`${APPROVE_BTN}${decision?.action === "accept" ? " ring-2 ring-accent" : ""}`}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        data-testid="config-review-reject"
                        disabled={configReviewBusy}
                        onClick={() => onRejectConfigLine(line)}
                        className={`${REJECT_BTN}${decision?.action === "reject" ? " ring-2 ring-destructive/50" : ""}`}
                      >
                        Reject
                      </button>
                      {decision && (
                        <span className="text-xs text-text-secondary">
                          {decision.action}
                          {decision.note ? `: ${decision.note}` : ""}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            data-testid="config-review-submit"
            disabled={configReviewBusy || !allConfigExpansionDecided}
            onClick={() => void submitConfigReview()}
            className={`${APPROVE_BTN}`}
          >
            Submit configuration expansion review
          </button>
        </div>
      )}
    </Card>
  );
}
