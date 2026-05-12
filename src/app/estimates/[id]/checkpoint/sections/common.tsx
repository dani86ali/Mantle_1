"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Classification,
  RiskCategory,
  RiskSeverity,
  DocSeverity,
  VendorStatus,
  EvalMethodology,
} from "./types";

export function Card({
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown size={16} className="text-text-tertiary" />
          ) : (
            <ChevronRight size={16} className="text-text-tertiary" />
          )}
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {subtitle && <span className="text-xs text-text-tertiary">{subtitle}</span>}
        </div>
      </button>
      {open && <div className="border-t border-[var(--border)] p-5">{children}</div>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tone)}>
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn("text-base font-semibold", tone ?? "text-text-primary")}>
        {value}
      </span>
      <span className="text-text-tertiary">{label}</span>
    </div>
  );
}

export const CLASS_BADGE: Record<Classification, string> = {
  mandatory: "bg-accent-muted text-accent",
  optional: "bg-blue-muted text-blue",
  conditional: "bg-warning-muted text-warning",
};

export const RISK_CAT_BADGE: Record<RiskCategory, string> = {
  disqualification: "bg-destructive-muted text-destructive",
  discretionary: "bg-warning-muted text-warning",
  breach: "bg-blue-muted text-blue",
};

export const RISK_SEV_BADGE: Record<RiskSeverity, string> = {
  critical: "bg-destructive-muted text-destructive",
  high: "bg-warning-muted text-warning",
  medium: "bg-blue-muted text-blue",
};

export const DOC_SEV_BADGE: Record<DocSeverity, string> = {
  critical: "bg-destructive-muted text-destructive",
  high: "bg-warning-muted text-warning",
  medium: "bg-blue-muted text-blue",
  low: "bg-[var(--border)] text-text-tertiary",
};

export const VENDOR_BADGE: Record<VendorStatus, string> = {
  required: "bg-destructive-muted text-destructive",
  preferred: "bg-accent-muted text-accent",
  or_equivalent: "bg-blue-muted text-blue",
};

export const METHOD_BADGE: Record<EvalMethodology, string> = {
  sequential_envelope: "bg-accent-muted text-accent",
  weighted_score: "bg-blue-muted text-blue",
  pass_fail: "bg-warning-muted text-warning",
  best_value: "bg-success-muted text-success",
  unknown: "bg-[var(--border)] text-text-tertiary",
};
