"use client";

import { cn } from "@/lib/utils";
import type { PricingTier, TierName } from "@/engines/e3/types";

const SAR = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

const TIER_ORDER: TierName[] = ["good", "better", "best"];

const TIER_LABEL: Record<TierName, string> = {
  good: "Good",
  better: "Better",
  best: "Best",
};

export interface TierPanelProps {
  tiers: PricingTier[];
  selectedTier: TierName;
  onSelectTier: (tier: TierName) => void;
}

export function TierPanel({ tiers, selectedTier, onSelectTier }: TierPanelProps) {
  const byName = new Map(tiers.map((t) => [t.name, t]));
  const ordered = TIER_ORDER.map((n) => byName.get(n)).filter(
    (t): t is PricingTier => Boolean(t),
  );
  const selected = byName.get(selectedTier) ?? ordered[0] ?? null;
  const goodTotal = byName.get("good")?.totals.grandTotal ?? 0;

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-[var(--border)] bg-bg-card">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Pricing tiers</h2>
        <p className="mt-0.5 text-xs text-text-tertiary">
          Choose which tier the commercial section reflects.
        </p>
      </div>

      <div className="flex border-b border-[var(--border)] bg-bg-primary">
        {ordered.map((t) => {
          const isActive = t.name === selectedTier;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => onSelectTier(t.name)}
              className={cn(
                "flex-1 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary",
              )}
            >
              {TIER_LABEL[t.name]}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">{selected.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              {selected.description}
            </p>
          </div>

          <dl className="space-y-2 rounded-card border border-[var(--border)] bg-bg-primary p-3">
            <Row label="Hardware" value={selected.totals.hardwareTotal} />
            <Row label="Software" value={selected.totals.softwareTotal} />
            <Row label="Services" value={selected.totals.serviceTotal} />
            <div className="border-t border-[var(--border)] pt-2">
              <Row
                label="Grand total"
                value={selected.totals.grandTotal}
                emphasis
              />
            </div>
            {selected.name !== "good" && goodTotal > 0 && (
              <p className="pt-1 text-xs text-text-tertiary">
                {((selected.totals.grandTotal / goodTotal - 1) * 100).toFixed(1)}% above Good
              </p>
            )}
          </dl>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Compare all tiers
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-text-tertiary">
                  <th className="py-1.5 pr-2 font-medium">Tier</th>
                  <th className="py-1.5 text-right font-medium">Total</th>
                  <th className="py-1.5 pl-2 text-right font-medium">vs Good</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((t) => {
                  const vsGood = goodTotal > 0 ? (t.totals.grandTotal / goodTotal - 1) * 100 : 0;
                  const isSel = t.name === selectedTier;
                  return (
                    <tr
                      key={t.name}
                      className={cn(
                        "border-b border-[var(--border)] last:border-0",
                        isSel && "bg-accent-muted",
                      )}
                    >
                      <td className="py-1.5 pr-2 text-text-primary">{TIER_LABEL[t.name]}</td>
                      <td className="py-1.5 text-right font-mono font-semibold text-text-primary">
                        {SAR.format(t.totals.grandTotal)}
                      </td>
                      <td className="py-1.5 pl-2 text-right font-mono text-text-secondary">
                        {t.name === "good" ? "—" : `+${vsGood.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </aside>
  );
}

function Row({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={cn("text-xs", emphasis ? "font-semibold text-text-primary" : "text-text-secondary")}>
        {label}
      </dt>
      <dd
        className={cn(
          "font-mono",
          emphasis ? "text-base font-semibold text-text-primary" : "text-sm text-text-primary",
        )}
      >
        {SAR.format(value)}
      </dd>
    </div>
  );
}
