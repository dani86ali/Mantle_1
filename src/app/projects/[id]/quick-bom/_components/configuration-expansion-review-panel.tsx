"use client";

/**
 * Configuration-expansion line-review panel (extracted from the Quick BoM page,
 * Prompt 128; checkbox/table review flow, bug/qbm-config-review-checkbox).
 *
 * Loaded on demand from the read-only review route (the main workspace stays
 * payload-free). The panel runs in one of two modes the parent page selects:
 *
 *   - mode="draft" (the configuration_expansion DRAFT artifact): the engineer reviews
 *     every expansion line as a checkbox row. Expansion rows are SELECTED (= accept) by
 *     default; deselecting a row marks it reject (with an optional note). One Submit
 *     action records the complete batch of explicit decisions - exactly one per
 *     expansion line, in draft order, none for customer lines. Customer lines are
 *     read-only. A "Select all" bulk action re-selects expansion rows but NEVER
 *     overwrites a row the engineer explicitly deselected, so a bulk click cannot wipe
 *     out deliberate exclusions. A successful POST mints a NEW reviewed (non-draft)
 *     artifact, so the panel clears and the parent workspace is refreshed (via
 *     onReviewSubmitted); the artifact is never marked approved client-side.
 *
 *   - mode="reviewed" (the reviewed/approved non-draft artifact): a READ-ONLY view of
 *     the recorded decisions (accepted / rejected per expansion line) so approved
 *     configuration-expansion decisions stay readable after approval. No checkboxes, no
 *     submit - stage approval stays on the separate generic Approve/Reject control.
 *
 * The submitted batch carries each decision sanitized to lineId/action/note; the body
 * carries only { decisions: [...] }. The per-row `explicit` flag is client-side only
 * and is never sent.
 */

import { useCallback, useState } from "react";
import type {
  QuickBomConfigExpansionReviewLine,
  QuickBomConfigExpansionReviewWorkspace,
} from "@/lib/projects/project-quick-bom-config-expansion-review-workspace";
import {
  APPROVE_BTN,
  Card,
  humanize,
  bodyMessage,
  promptNote,
} from "./quick-bom-review-ui";

const CONFIG_REVIEW_ERROR =
  "Unable to load or submit the configuration expansion line review.";

type ReviewMode = "draft" | "reviewed";

/** One expansion-line selection: selected (= accept) plus whether the engineer set it. */
interface LineSelection {
  selected: boolean;
  /** True once the engineer toggles this row; protects it from a bulk "Select all". */
  explicit: boolean;
  note?: string;
}

interface ConfigurationExpansionReviewPanelProps {
  projectId: string;
  artifactId: string;
  /** "draft" = editable checkbox review; "reviewed" = read-only recorded decisions. */
  mode: ReviewMode;
  /** Called after a successful draft-review POST. Unused (and optional) in reviewed mode. */
  onReviewSubmitted?: () => Promise<void> | void;
}

export function ConfigurationExpansionReviewPanel({
  projectId,
  artifactId,
  mode,
  onReviewSubmitted,
}: ConfigurationExpansionReviewPanelProps) {
  const reviewed = mode === "reviewed";
  // Distinct testid namespace per mode so the editable draft panel and the read-only
  // reviewed viewer never collide in the DOM or in tests.
  const tid = (suffix: string): string =>
    `${reviewed ? "config-approved" : "config-review"}-${suffix}`;

  const [configReview, setConfigReview] = useState<QuickBomConfigExpansionReviewWorkspace | null>(null);
  const [configReviewError, setConfigReviewError] = useState<string | null>(null);
  const [configReviewBusy, setConfigReviewBusy] = useState(false);
  // Expansion-line selections, keyed by lineId. Absent => the default (selected = accept).
  const [selections, setSelections] = useState<Record<string, LineSelection>>({});

  // GET the read-only configuration-expansion line-review projection for one artifact.
  // In draft mode every expansion line starts SELECTED (= accept) by default; resetting
  // selections so a fresh load starts clean. Controlled errors only, never a stack.
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
        const initial: Record<string, LineSelection> = {};
        for (const line of review.lines) {
          if (line.origin === "expansion") {
            initial[line.lineId] = { selected: true, explicit: false };
          }
        }
        setSelections(initial);
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
  // decision per expansion line, in draft order, and none for customer lines. Each
  // expansion line is selected (=> accept) or deselected (=> reject, with its note).
  // The body carries only { decisions: [...] } sanitized to lineId/action/note - the
  // client-side `explicit` flag is never sent. A successful POST mints a NEW reviewed
  // (non-draft) artifact, so we clear the panel and refresh the main workspace; the
  // artifact is never marked approved client-side.
  const submitConfigReview = useCallback(async (): Promise<void> => {
    if (configReview === null) return;
    const expansionLines = configReview.lines.filter(
      (line) => line.origin === "expansion"
    );
    const decisions = expansionLines.map((line) => {
      const selection = selections[line.lineId] ?? { selected: true, explicit: false };
      if (selection.selected) {
        return { lineId: line.lineId, action: "accept" as const };
      }
      return {
        lineId: line.lineId,
        action: "reject" as const,
        ...(selection.note !== undefined ? { note: selection.note } : {}),
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
      setSelections({});
      if (onReviewSubmitted) await onReviewSubmitted();
    } catch {
      setConfigReviewError(CONFIG_REVIEW_ERROR);
    } finally {
      setConfigReviewBusy(false);
    }
  }, [projectId, artifactId, configReview, selections, onReviewSubmitted]);

  // Toggle one expansion line. Deselecting marks it reject and prompts for an optional
  // note (read OUTSIDE the state updater so a StrictMode double-invoke never double-
  // prompts); re-selecting clears any note. Either way the row becomes `explicit` so a
  // later "Select all" cannot silently override the engineer's deliberate choice.
  function onToggleLine(line: QuickBomConfigExpansionReviewLine): void {
    const current = selections[line.lineId];
    const nextSelected = !(current?.selected ?? true);
    if (!nextSelected) {
      const note = promptNote();
      setSelections((prev) => ({
        ...prev,
        [line.lineId]: { selected: false, explicit: true, ...(note !== undefined ? { note } : {}) },
      }));
      return;
    }
    setSelections((prev) => ({
      ...prev,
      [line.lineId]: { selected: true, explicit: true },
    }));
  }

  // Bulk re-select every expansion line EXCEPT rows the engineer explicitly deselected
  // via its own checkbox. This is the safety invariant: a bulk action must not overwrite
  // an explicit per-line reject. `explicit` is set only by onToggleLine, so an
  // individually unchecked row is preserved.
  function onSelectAllExpansionLines(
    review: QuickBomConfigExpansionReviewWorkspace
  ): void {
    setSelections((prev) => {
      const next = { ...prev };
      for (const line of review.lines) {
        if (line.origin !== "expansion") continue;
        const current = next[line.lineId];
        if (current && current.explicit && !current.selected) continue; // keep explicit reject
        next[line.lineId] = { selected: true, explicit: current?.explicit ?? false };
      }
      return next;
    });
  }

  const expansionLines = configReview
    ? configReview.lines.filter((line) => line.origin === "expansion")
    : [];

  const intro = reviewed
    ? "Recorded configuration expansion decisions (read-only). Accepted lines are in the BoM; rejected lines were excluded."
    : "Expansion lines are selected (accepted) by default. Deselect any line to exclude it. Customer lines are read-only. One Submit records every decision.";

  return (
    <Card
      title={
        reviewed
          ? "Configuration expansion decisions (read-only)"
          : "Configuration expansion line review"
      }
    >
      <p className="mt-2 text-xs text-text-secondary">{intro}</p>
      <button
        type="button"
        data-testid={tid("load")}
        disabled={configReviewBusy}
        onClick={() => void loadConfigReview(artifactId)}
        className={`mt-3 ${APPROVE_BTN}`}
      >
        {reviewed
          ? "Load recorded configuration expansion decisions"
          : "Load configuration expansion review lines"}
      </button>
      {configReviewError && (
        <div
          data-testid={tid("error")}
          className="mt-3 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive"
        >
          {configReviewError}
        </div>
      )}
      {configReview && (
        <div className="mt-3 space-y-3">
          <p data-testid={tid("summary")} className="text-xs text-text-secondary">
            {reviewed
              ? `${configReview.reviewedSummary?.totalAcceptedLineCount ?? 0} accepted (` +
                `${configReview.reviewedSummary?.customerLineCount ?? 0} customer, ` +
                `${configReview.reviewedSummary?.acceptedExpansionLineCount ?? 0} expansion), ` +
                `${configReview.reviewedSummary?.rejectedExpansionLineCount ?? 0} rejected`
              : `${configReview.reviewSummary?.totalLineCount ?? 0} lines: ` +
                `${configReview.reviewSummary?.customerLineCount ?? 0} customer, ` +
                `${configReview.reviewSummary?.expansionLineCount ?? 0} expansion, ` +
                `${configReview.reviewSummary?.requiresDecisionCount ?? 0} require decision, ` +
                `${configReview.reviewSummary?.includedItemCount ?? 0} included items`}
          </p>
          {!reviewed && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid={tid("select-all")}
                disabled={configReviewBusy || expansionLines.length === 0}
                onClick={() => onSelectAllExpansionLines(configReview)}
                className={APPROVE_BTN}
              >
                Select all expansion lines ({expansionLines.length})
              </button>
            </div>
          )}
          <ol className="space-y-2">
            {configReview.lines.map((line) => {
              const selection = selections[line.lineId];
              const isExpansion = line.origin === "expansion";
              const selected = selection?.selected ?? true;
              return (
                <li
                  key={line.lineId}
                  data-testid={tid("line")}
                  className="rounded-button border border-[var(--border)] p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text-primary">{line.sku}</span>
                    <span className="text-xs text-text-tertiary capitalize">{line.origin}</span>
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
                  {isExpansion && !reviewed && (
                    <label className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
                      <input
                        type="checkbox"
                        data-testid={tid("checkbox")}
                        disabled={configReviewBusy}
                        checked={selected}
                        onChange={() => onToggleLine(line)}
                      />
                      <span>
                        {selected ? "Accept (selected)" : "Reject (excluded)"}
                        {selection?.note ? `: ${selection.note}` : ""}
                      </span>
                    </label>
                  )}
                  {isExpansion && reviewed && (
                    <p
                      data-testid={tid("decision")}
                      data-decision={line.decision}
                      className={`mt-2 text-xs font-medium ${
                        line.decision === "rejected" ? "text-destructive" : "text-success"
                      }`}
                    >
                      {line.decision === "rejected" ? "Rejected (excluded)" : "Accepted"}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          {!reviewed && (
            <button
              type="button"
              data-testid={tid("submit")}
              disabled={configReviewBusy}
              onClick={() => void submitConfigReview()}
              className={APPROVE_BTN}
            >
              Submit configuration expansion review
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
