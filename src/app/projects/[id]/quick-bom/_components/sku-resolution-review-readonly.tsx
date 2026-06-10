"use client";

/**
 * Read-only SKU resolution review table. Renders the recorded per-line decisions of a
 * sku_resolution artifact that is no longer `needs_review` (e.g. after the review was
 * submitted and the stage approved), so an engineer can still read which SKUs were
 * accepted or rejected. Pure presentation: no fetching, no checkboxes, no submit, and
 * no approve control - stage approval stays with the generic artifact approval panel.
 */

import type { QuickBomSkuResolutionReviewLine } from "@/lib/projects/project-quick-bom-sku-resolution-review-workspace";
import { StatusBadge } from "./quick-bom-review-ui";
import { SkuRelatedConfiguredNote } from "./sku-related-configured-note";

interface SkuResolutionReviewReadOnlyProps {
  lines: QuickBomSkuResolutionReviewLine[];
}

export function SkuResolutionReviewReadOnly({
  lines,
}: SkuResolutionReviewReadOnlyProps) {
  return (
    <ol data-testid="sku-review-readonly" className="space-y-2">
      {lines.map((line) => (
        <li
          key={`${line.sourceFileId}::${line.sourceRowNumber}`}
          data-testid="sku-review-readonly-line"
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
          {line.status === "accepted" && line.acceptedSku !== undefined && (
            <p
              data-testid="sku-review-readonly-accepted"
              className="mt-0.5 text-xs text-success"
            >
              Accepted SKU: {line.acceptedSku}
            </p>
          )}
          {line.note !== undefined && (
            <p className="mt-0.5 text-xs text-text-secondary">Note: {line.note}</p>
          )}
          <SkuRelatedConfiguredNote items={line.relatedConfiguredItems} />
        </li>
      ))}
    </ol>
  );
}
