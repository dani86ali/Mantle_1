"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PricedLine {
  id: string;
  lineNumber: number;
  sku: string;
  description: string;
  qty: number;
  category: string;
  unitListSar: number;
  unitSellPrice: number;
  extendedSell: number;
  vatAmount: number;
  totalWithVat: number;
}

export interface ValidationRow {
  ruleId: string;
  ruleName: string;
  severity: "error" | "warning" | "info";
  passed: boolean;
  message: string;
}

export interface AnomalyRow {
  id: string;
  type: string;
  description: string;
  severity: "error" | "warning";
  affectedSkus: string[];
  suggestion: string;
}

export interface Anomalies {
  anomalies: AnomalyRow[];
  riskLevel: "low" | "medium" | "high";
  summary: string;
}

export interface Totals {
  hardwareTotal: number;
  softwareTotal: number;
  serviceTotal: number;
  subscriptionTotal: number;
  grandTotalExVat: number;
  vatAmount: number;
  grandTotalIncVat: number;
}

export function fmtSAR(v: number): string {
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(v);
}

export function categoryClass(c: string): string {
  if (c === "hardware") return "bg-accent-muted text-accent";
  if (c === "accessory") return "bg-blue-muted text-blue";
  if (c === "license") return "bg-success-muted text-success";
  if (c === "support" || c === "service") return "bg-warning-muted text-warning";
  return "bg-[rgba(117,9,253,0.1)] text-brand-secondary";
}

export function TotalsCards({ totals }: { totals: Totals }) {
  const cards = [
    { label: "Hardware", value: totals.hardwareTotal },
    { label: "Software", value: totals.softwareTotal },
    { label: "Service", value: totals.serviceTotal },
    { label: "Subscription", value: totals.subscriptionTotal },
    { label: "Subtotal ex-VAT", value: totals.grandTotalExVat },
    { label: "VAT", value: totals.vatAmount },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-card border border-[var(--border)] bg-bg-card p-3"
        >
          <p className="text-xs font-medium text-text-tertiary">{c.label}</p>
          <p className="mt-1 truncate font-mono text-sm font-semibold text-text-primary">
            {fmtSAR(c.value)}
          </p>
        </div>
      ))}
      <div className="rounded-card border border-accent/40 bg-accent-muted p-3">
        <p className="text-xs font-medium text-accent">Grand Total inc-VAT</p>
        <p className="mt-1 truncate font-mono text-sm font-semibold text-text-primary">
          {fmtSAR(totals.grandTotalIncVat)}
        </p>
      </div>
    </div>
  );
}

interface DeviceGroup {
  model: string;
  lines: PricedLine[];
  subtotal: number;
}

export function groupByDevice(lines: PricedLine[]): DeviceGroup[] {
  const groups: DeviceGroup[] = [];
  let current: DeviceGroup | null = null;
  for (const l of lines) {
    if (l.category === "hardware" || !current) {
      current = { model: l.category === "hardware" ? l.sku : "Other", lines: [], subtotal: 0 };
      groups.push(current);
    }
    current.lines.push(l);
    current.subtotal += l.extendedSell;
  }
  return groups;
}

export function BomTable({ lines }: { lines: PricedLine[] }) {
  const groups = groupByDevice(lines);
  return (
    <div className="overflow-x-auto rounded-card border border-[var(--border)]">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-bg-card text-left text-xs text-text-tertiary">
            <th className="px-3 py-2.5 font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">SKU</th>
            <th className="px-3 py-2.5 font-medium">Description</th>
            <th className="px-3 py-2.5 font-medium">Category</th>
            <th className="px-3 py-2.5 text-right font-medium">Qty</th>
            <th className="px-3 py-2.5 text-right font-medium">Unit List</th>
            <th className="px-3 py-2.5 text-right font-medium">Unit Sell</th>
            <th className="px-3 py-2.5 text-right font-medium">Extended Sell</th>
            <th className="px-3 py-2.5 text-right font-medium">VAT</th>
            <th className="px-3 py-2.5 text-right font-medium">Total inc VAT</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <DeviceBlock key={`${g.model}-${gi}`} group={g} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeviceBlock({ group }: { group: DeviceGroup }) {
  return (
    <>
      <tr className="sticky top-0 z-10 bg-bg-elevated">
        <td colSpan={7} className="px-3 py-2 font-mono text-xs font-semibold text-text-primary">
          {group.model}
        </td>
        <td colSpan={3} className="px-3 py-2 text-right font-mono text-xs font-semibold text-text-primary">
          {fmtSAR(group.subtotal)}
        </td>
      </tr>
      {group.lines.map((l, i) => (
        <tr
          key={l.id}
          className={cn(
            "border-b border-[var(--border)] hover:bg-bg-elevated",
            i % 2 === 1 ? "bg-bg-card" : "bg-bg-primary"
          )}
        >
          <td className="px-3 py-2 text-text-tertiary">{l.lineNumber}</td>
          <td className="px-3 py-2 font-mono font-medium text-text-primary">{l.sku}</td>
          <td className="max-w-xs truncate px-3 py-2 text-text-secondary" title={l.description}>
            {l.description}
          </td>
          <td className="px-3 py-2">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", categoryClass(l.category))}>
              {l.category}
            </span>
          </td>
          <td className="px-3 py-2 text-right text-text-primary">{l.qty}</td>
          <td className="px-3 py-2 text-right font-mono text-text-secondary">{fmtSAR(l.unitListSar)}</td>
          <td className="px-3 py-2 text-right font-mono text-text-secondary">{fmtSAR(l.unitSellPrice)}</td>
          <td className="px-3 py-2 text-right font-mono font-medium text-text-primary">{fmtSAR(l.extendedSell)}</td>
          <td className="px-3 py-2 text-right font-mono text-text-secondary">{fmtSAR(l.vatAmount)}</td>
          <td className="px-3 py-2 text-right font-mono font-medium text-text-primary">{fmtSAR(l.totalWithVat)}</td>
        </tr>
      ))}
    </>
  );
}

const SEVERITY_BADGE: Record<string, string> = {
  error: "bg-destructive-muted text-destructive border-destructive/30",
  warning: "bg-warning-muted text-warning border-warning/30",
  info: "bg-blue-muted text-blue border-blue/30",
};

export function ValidationSection({ results }: { results: ValidationRow[] }) {
  const [open, setOpen] = useState(true);
  const passed = results.filter((r) => r.passed).length;
  const errors = results.filter((r) => !r.passed && r.severity === "error");
  const warnings = results.filter((r) => !r.passed && r.severity === "warning");
  const sorted = [...errors, ...warnings, ...results.filter((r) => !r.passed && r.severity === "info")];
  return (
    <CollapsibleCard
      open={open}
      onToggle={() => setOpen((o) => !o)}
      title="Validation Results"
      summary={
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-success-muted px-2 py-0.5 font-medium text-success">
            {passed} passed
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
                  SEVERITY_BADGE[r.severity] ?? SEVERITY_BADGE.info
                )}
              >
                {r.severity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">{r.ruleName}</p>
                <p className="mt-0.5 text-xs text-text-secondary">{r.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}

const RISK_TONE: Record<string, string> = {
  low: "bg-success-muted text-success border-success/30",
  medium: "bg-warning-muted text-warning border-warning/30",
  high: "bg-destructive-muted text-destructive border-destructive/30",
};

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
              RISK_TONE[data?.riskLevel ?? "low"] ?? RISK_TONE.low
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
                    SEVERITY_BADGE[a.severity] ?? SEVERITY_BADGE.warning
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

function CollapsibleCard({
  open,
  onToggle,
  title,
  summary,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        {open ? (
          <ChevronDown size={16} className="text-text-tertiary" />
        ) : (
          <ChevronRight size={16} className="text-text-tertiary" />
        )}
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <div className="ml-auto">{summary}</div>
      </button>
      {open && <div className="border-t border-[var(--border)] p-5">{children}</div>}
    </div>
  );
}
