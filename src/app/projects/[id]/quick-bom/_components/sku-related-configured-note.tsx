"use client";

/**
 * DISPLAY-ONLY relationship note for a deferred SKU review line. Renders nothing unless
 * the line carries read-only relatedConfiguredItems guidance. It exists to make the
 * review screen honest: the excluded customer row is NOT silently replaced; a related
 * configured item may appear later ONLY as an approved configuration-expansion child
 * under an accepted parent. Pure presentation - no checkbox, no action, no decision.
 */

import type { QuickBomSkuResolutionReviewLineRelatedConfigured } from "@/lib/projects/project-quick-bom-sku-resolution-review-workspace";

interface SkuRelatedConfiguredNoteProps {
  items?: QuickBomSkuResolutionReviewLineRelatedConfigured[];
}

export function SkuRelatedConfiguredNote({ items }: SkuRelatedConfiguredNoteProps) {
  if (items === undefined || items.length === 0) return null;
  return (
    <div
      data-testid="sku-review-related-configured"
      className="mt-0.5 text-xs text-text-secondary"
    >
      <p>Excluded before pricing.</p>
      <p>No silent substitution.</p>
      {items.map((item) => (
        <p
          key={`${item.parentSku}::${item.relatedConfiguredSku}`}
          data-testid="sku-review-related-configured-item"
        >
          Related configured item may appear under parent {item.parentSku}:{" "}
          {item.relatedConfiguredSku}
        </p>
      ))}
    </div>
  );
}
