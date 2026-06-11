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
 *     default; deselecting a row marks it reject (with an optional note), and re-checking
 *     that same row includes it downstream again. One Submit action records the complete
 *     batch of explicit decisions - exactly one per expansion line, in draft order, none
 *     for customer lines. Customer lines are read-only. There is no bulk select action:
 *     each row is an independent, explicit include/exclude choice. A successful POST mints
 *     a NEW reviewed (non-draft)
 *     artifact, so the panel clears and the parent workspace is refreshed (via
 *     onReviewSubmitted); the artifact is never marked approved client-side.
 *
 *   - mode="reviewed" (the reviewed/approved non-draft artifact): a READ-ONLY view of
 *     the recorded decisions (accepted / rejected per expansion line) so approved
 *     configuration-expansion decisions stay readable after approval. No checkboxes, no
 *     submit - stage approval stays on the separate generic Approve/Reject control.
 *
 * The submitted batch carries each decision sanitized to lineId/action/note; the body
 * carries only { decisions: [...] }. Selected rows submit accept, deselected rows
 * submit reject; there is no client-side `explicit` flag.
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

/** One expansion-line selection: selected (= accept downstream) plus an optional note. */
interface LineSelection {
  selected: boolean;
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
            initial[line.lineId] = { selected: true };
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
  // The body carries only { decisions: [...] } sanitized to lineId/action/note; there
  // is no client-side `explicit` flag. A successful POST mints a NEW reviewed
  // (non-draft) artifact, so we clear the panel and refresh the main workspace; the
  // artifact is never marked approved client-side.
  const submitConfigReview = useCallback(async (): Promise<void> => {
    if (configReview === null) return;
    const expansionLines = configReview.lines.filter(
      (line) => line.origin === "expansion"
    );
    const decisions = expansionLines.map((line) => {
      const selection = selections[line.lineId] ?? { selected: true };
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

  // Toggle one expansion line. Deselecting excludes it downstream and prompts for an
  // optional note (read OUTSIDE the state updater so a StrictMode double-invoke never
  // double-prompts); re-selecting includes it downstream again and clears any note.
  function onToggleLine(line: QuickBomConfigExpansionReviewLine): void {
    const current = selections[line.lineId];
    const nextSelected = !(current?.selected ?? true);
    if (!nextSelected) {
      const note = promptNote();
      setSelections((prev) => ({
        ...prev,
        [line.lineId]: { selected: false, ...(note !== undefined ? { note } : {}) },
      }));
      return;
    }
    setSelections((prev) => ({
      ...prev,
      [line.lineId]: { selected: true },
    }));
  }

  const expansionLines = configReview
    ? configReview.lines.filter((line) => line.origin === "expansion")
    : [];
  const selectedExpansionCount = expansionLines.filter(
    (line) => selections[line.lineId]?.selected ?? true
  ).length;
  const excludedExpansionCount = expansionLines.length - selectedExpansionCount;

  const intro = reviewed
    ? "Recorded configuration expansion decisions (read-only). Accepted lines are in the BoM; rejected lines were excluded."
    : "Expansion lines are selected by default. Uncheck a line to exclude it from downstream pricing and export; re-check that same row to include it again. Customer lines are read-only. One Submit records every decision.";

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
              : `${selectedExpansionCount} selected for downstream, ` +
                `${excludedExpansionCount} excluded ` +
                `(${configReview.reviewSummary?.expansionLineCount ?? 0} expansion lines, ` +
                `${configReview.reviewSummary?.customerLineCount ?? 0} customer lines read-only)`}
          </p>
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
                        {selected
                          ? "Included downstream"
                          : "Excluded by you. Re-check to include downstream."}
                        {selection?.note ? ` Note: ${selection.note}` : ""}
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
