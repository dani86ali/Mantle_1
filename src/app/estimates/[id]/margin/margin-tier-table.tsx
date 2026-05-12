"use client";

import { cn } from "@/lib/utils";
import type { PricingTier, TierName } from "@/engines/e3/types";

const SAR = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

const TIER_ORDER: TierName[] = ["good", "better", "best"];
const TIER_LABEL: Record<TierName, string> = { good: "Good", better: "Better", best: "Best" };

export function TierComparison({
  tiers,
  totalCost,
  recommended = "better",
}: {
  tiers: PricingTier[];
  totalCost: number;
  recommended?: TierName;
}) {
  if (tiers.length === 0) return null;
  const byName = new Map(tiers.map((t) => [t.name, t]));
  const ordered = TIER_ORDER.map((n) => byName.get(n)).filter((t): t is PricingTier => Boolean(t));
  const goodTotal = byName.get("good")?.totals.grandTotal ?? 0;

  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-primary">
      <div className="border-b border-[var(--border)] px-4 py-2.5">
        <h2 className="text-sm font-semibold text-text-primary">Tier Comparison</h2>
        <p className="mt-0.5 text-xs text-text-tertiary">
          Margin assumes a shared cost basis of {SAR.format(totalCost)} across tiers.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-text-tertiary">
            <th className="px-4 py-2 font-medium">Tier</th>
            <th className="px-4 py-2 text-right font-medium">Grand Total</th>
            <th className="px-4 py-2 text-right font-medium">Margin</th>
            <th className="px-4 py-2 text-right font-medium">vs Good</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((t) => {
            const total = t.totals.grandTotal;
            const margin = total > 0 ? (total - totalCost) / total : 0;
            const vsGood = goodTotal > 0 ? (total / goodTotal - 1) * 100 : 0;
            const isRec = t.name === recommended;
            return (
              <tr key={t.name} className={cn("border-b border-[var(--border)] last:border-0", isRec && "bg-accent-muted")}>
                <td className="px-4 py-2 text-text-primary">
                  {TIER_LABEL[t.name]}
                  {isRec && (
                    <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-text-primary">
                      Recommended
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right font-mono font-semibold text-text-primary">{SAR.format(total)}</td>
                <td className="px-4 py-2 text-right font-mono text-text-primary">{(margin * 100).toFixed(1)}%</td>
                <td className="px-4 py-2 text-right font-mono text-text-secondary">
                  {t.name === "good" ? "—" : `+${vsGood.toFixed(1)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
