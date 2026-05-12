"use client";

import { AlertTriangle, CheckCircle2, Info, ShieldAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApprovalLevel, MarginFlag, MarginFlagSeverity } from "@/engines/e3/types";

export { TierComparison } from "./margin-tier-table";

const APPROVAL_COPY: Record<ApprovalLevel, { title: string; body: string; tone: "success" | "warning" | "destructive" }> = {
  account_manager: {
    title: "Account Manager can approve",
    body: "Gross margin is at or above the 25% benchmark — the account manager has standing authority to approve.",
    tone: "success",
  },
  presales_lead: {
    title: "Pre-sales Lead + Delivery Manager required",
    body: "Gross margin is between 15% and 25% — requires joint sign-off from the pre-sales lead and delivery manager.",
    tone: "warning",
  },
  country_manager: {
    title: "Country Manager approval required",
    body: "Gross margin is between 10% and 15% — escalate to the country manager with the margin sheet attached.",
    tone: "warning",
  },
  regional_md: {
    title: "Regional MD / Board approval required — strategic justification needed",
    body: "Gross margin is below the 10% floor — written strategic justification (follow-on revenue, market entry, reference customer) must accompany the request.",
    tone: "destructive",
  },
};

const TONE_CLASSES = {
  success: "border-success/30 bg-success-muted text-success",
  warning: "border-warning/30 bg-warning-muted text-warning",
  destructive: "border-destructive/30 bg-destructive-muted text-destructive",
} as const;

export function ApprovalBanner({ level }: { level: ApprovalLevel }) {
  const c = APPROVAL_COPY[level];
  const Icon = c.tone === "success" ? CheckCircle2 : c.tone === "warning" ? AlertTriangle : ShieldAlert;
  return (
    <div className={cn("flex items-start gap-3 rounded-card border p-4", TONE_CLASSES[c.tone])}>
      <Icon size={20} className="mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold">{c.title}</p>
        <p className="mt-1 text-sm text-text-secondary">{c.body}</p>
      </div>
    </div>
  );
}

const SEVERITY_RANK: Record<MarginFlagSeverity, number> = { error: 0, warning: 1, info: 2 };

const FLAG_TYPE_LABEL: Record<string, string> = {
  low_margin: "Low Gross Margin",
  low_attach: "Low Services Attach Rate",
  fx_risk: "FX Risk",
  discount_threshold: "Discount Threshold",
};

function FlagIcon({ severity }: { severity: MarginFlagSeverity }) {
  if (severity === "error") return <XCircle size={18} className="text-destructive" />;
  if (severity === "warning") return <AlertTriangle size={18} className="text-warning" />;
  return <Info size={18} className="text-blue" />;
}

function formatThreshold(flag: MarginFlag): string {
  if (flag.type === "fx_risk") {
    return `Threshold: ${flag.threshold}-day validity · Actual: ${flag.actual}-day validity`;
  }
  return `Threshold: ${(flag.threshold * 100).toFixed(1)}% · Actual: ${(flag.actual * 100).toFixed(1)}%`;
}

export function FlagsList({ flags }: { flags: MarginFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="rounded-card border border-success/30 bg-success-muted p-4 text-sm text-success">
        No margin flags. All benchmarks met.
      </div>
    );
  }
  const sorted = [...flags].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-text-primary">Margin Flags</h2>
      {sorted.map((f, i) => (
        <div
          key={`${f.type}-${i}`}
          className="flex items-start gap-3 rounded-card border border-[var(--border)] bg-bg-card p-3"
        >
          <FlagIcon severity={f.severity} />
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">{FLAG_TYPE_LABEL[f.type] ?? f.type}</p>
            <p className="mt-0.5 text-sm text-text-secondary">{f.message}</p>
            <p className="mt-1 font-mono text-xs text-text-tertiary">{formatThreshold(f)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StrategicJustification({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-card border border-destructive/30 bg-destructive-muted/40 p-4">
      <label className="text-sm font-semibold text-text-primary">
        Strategic Justification <span className="text-destructive">*</span>
      </label>
      <p className="mt-1 text-xs text-text-secondary">
        Margin is below the 10% floor. A written justification is required before this deal can be escalated.
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        placeholder="Explain the strategic value of this deal (follow-on revenue, market entry, reference customer, etc.)"
        className="mt-2 w-full rounded-input border border-[var(--border)] bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
      />
    </div>
  );
}

export function ActionBar({
  approving,
  approved,
  justificationRequired,
  hasJustification,
  onApprove,
  onReject,
}: {
  approving: boolean;
  approved: boolean;
  justificationRequired: boolean;
  hasJustification: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const blockedByJustification = justificationRequired && !hasJustification;
  const disabled = approving || approved || blockedByJustification;
  return (
    <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-56 sm:px-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onReject}
          disabled={approving}
          className="rounded-button border border-[var(--border)] px-4 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
        >
          Reject — Adjust Pricing
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={disabled}
          title={blockedByJustification ? "Strategic justification required" : undefined}
          className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
        >
          {approved ? "Approved" : approving ? "Approving…" : "Approve Deal"}
        </button>
      </div>
    </div>
  );
}
