"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  CollapsibleCard,
  fmtSAR,
  type Anomalies,
  type SimilarDealView,
  type ValidationRow,
} from "./sections";

const SEVERITY_BADGE: Record<string, string> = {
  error: "bg-destructive-muted text-destructive border-destructive/30",
  warning: "bg-warning-muted text-warning border-warning/30",
  info: "bg-blue-muted text-blue border-blue/30",
};

const RISK_TONE: Record<string, string> = {
  low: "bg-success-muted text-success border-success/30",
  medium: "bg-warning-muted text-warning border-warning/30",
  high: "bg-destructive-muted text-destructive border-destructive/30",
};

export function ValidationSection({ results }: { results: ValidationRow[] }) {
  const [open, setOpen] = useState(true);
  const passed = results.filter((r) => r.passed).length;
  const errors = results.filter((r) => !r.passed && r.severity === "error");
  const warnings = results.filter((r) => !r.passed && r.severity === "warning");
  const info = results.filter((r) => !r.passed && r.severity === "info");
  const sorted = [...errors, ...warnings, ...info];
  const total = results.length;
  const passPct = total > 0 ? Math.round((passed / total) * 100) : 0;
  return (
    <CollapsibleCard
      open={open}
      onToggle={() => setOpen((o) => !o)}
      title="Validation Results"
      summary={
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-success-muted px-2 py-0.5 font-medium text-success">
            {passed}/{total} passed ({passPct}%)
          </span>
          <span className="rounded-full bg-warning-muted px-2 py-0.5 font-medium text-warning">
            {warnings.length} warnings
          </span>
          <span className="rounded-full bg-destructive-muted px-2 py-0.5 font-medium text-destructive">
            {errors.length} errors
          </span>
        </span>
      }
    >
      {sorted.length === 0 ? (
        <p className="text-sm text-text-tertiary">All rules passed.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((r) => (
            <li
              key={`${r.ruleId}-${r.message}`}
              className="flex items-start gap-3 rounded-card border border-[var(--border)] bg-bg-primary p-3"
            >
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                  SEVERITY_BADGE[r.severity] ?? SEVERITY_BADGE.info,
                )}
              >
                {r.severity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">{r.ruleName}</p>
                <p className="mt-0.5 text-xs text-text-secondary">{r.message}</p>
                {r.affectedSkus.length > 0 && (
                  <p className="mt-1 font-mono text-xs text-text-tertiary">
                    {r.affectedSkus.join(", ")}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}

export function AnomaliesSection({ data }: { data: Anomalies | null }) {
  const [open, setOpen] = useState(true);
  const list = data?.anomalies ?? [];
  return (
    <CollapsibleCard
      open={open}
      onToggle={() => setOpen((o) => !o)}
      title="Anomalies"
      summary={
        <span className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 font-medium uppercase",
              RISK_TONE[data?.riskLevel ?? "low"] ?? RISK_TONE.low,
            )}
          >
            {data?.riskLevel ?? "low"} risk
          </span>
          <span className="text-text-tertiary">{list.length} flagged</span>
        </span>
      }
    >
      {list.length === 0 ? (
        <p className="text-sm text-text-tertiary">{data?.summary ?? "No anomalies detected."}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => (
            <li key={a.id} className="rounded-card border border-[var(--border)] bg-bg-primary p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    SEVERITY_BADGE[a.severity] ?? SEVERITY_BADGE.warning,
                  )}
                >
                  {a.type.replace(/_/g, " ")}
                </span>
                {a.affectedSkus.length > 0 && (
                  <span className="font-mono text-xs text-text-tertiary">
                    {a.affectedSkus.join(", ")}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-text-secondary">{a.description}</p>
              {a.suggestion && (
                <p className="mt-1.5 text-xs italic text-text-tertiary">→ {a.suggestion}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}

export function SimilarDealsCard({ deals }: { deals: SimilarDealView[] }) {
  const [open, setOpen] = useState(false);
  if (deals.length === 0) return null;
  return (
    <CollapsibleCard
      open={open}
      onToggle={() => setOpen((o) => !o)}
      title="Similar Deals"
      summary={<span className="text-xs text-text-tertiary">{deals.length} matched</span>}
    >
      <ul className="space-y-2">
        {deals.map((d) => (
          <li
            key={d.opportunityId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-[var(--border)] bg-bg-primary p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">{d.customerName}</p>
              <p className="mt-0.5 font-mono text-xs text-text-tertiary">
                {d.opportunityId} · {d.matchFactors.join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-bg-elevated px-2 py-0.5 font-mono text-text-secondary">
                score {(d.similarityScore * 100).toFixed(0)}%
              </span>
              <span className="font-mono text-text-secondary">{fmtSAR(d.dealValue)}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium uppercase",
                  d.outcome === "won"
                    ? "bg-success-muted text-success"
                    : d.outcome === "lost"
                      ? "bg-destructive-muted text-destructive"
                      : "bg-bg-elevated text-text-tertiary",
                )}
              >
                {d.outcome}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </CollapsibleCard>
  );
}
