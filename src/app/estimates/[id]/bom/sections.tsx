"use client";

import { ChevronDown, ChevronRight } from "lucide-react";

export interface PricedLine {
  id: string;
  lineNumber: number;
  sku: string;
  description: string;
  qty: number;
  category: string;
  unitListUsd: number;
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
  affectedSkus: string[];
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

export interface SimilarDealView {
  opportunityId: string;
  customerName: string;
  similarityScore: number;
  matchFactors: string[];
  dealValue: number;
  outcome: string;
  margin?: number;
}

export function fmtSAR(v: number): string {
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(v);
}

export function fmtUSD(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v);
}

export function categoryClass(c: string): string {
  if (c === "hardware") return "bg-accent-muted text-accent";
  if (c === "accessory") return "bg-blue-muted text-blue";
  if (c === "software" || c === "license" || c === "network_license")
    return "bg-[rgba(117,9,253,0.1)] text-brand-secondary";
  if (c === "support" || c === "service") return "bg-warning-muted text-warning";
  if (c === "subscription" || c === "dna_subscription" || c === "addon")
    return "bg-success-muted text-success";
  return "bg-bg-elevated text-text-tertiary";
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

export function CollapsibleCard({
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
