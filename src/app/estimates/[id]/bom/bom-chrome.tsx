"use client";

import Link from "next/link";
import { ChevronLeft, Download, Lock, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtSAR, type Totals } from "./sections";
import type { PhaseStatus } from "./mappers";
import type { Phase } from "./bom-table";

export function BomHeader({
  estimateId,
  customerName,
}: {
  estimateId: string;
  customerName: string;
}) {
  return (
    <header className="border-b border-[var(--border)] bg-bg-card px-4 py-4 sm:px-6">
      <Link
        href={`/estimates/${estimateId}`}
        className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
      >
        <ChevronLeft size={14} /> Back to estimate
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-lg font-semibold text-text-primary">BoM Review</h1>
        <p className="text-sm text-text-secondary">— {customerName}</p>
      </div>
    </header>
  );
}

const PHASE_BADGE: Record<PhaseStatus, string> = {
  not_started: "bg-[var(--border)] text-text-tertiary",
  pending: "bg-warning-muted text-warning",
  approved: "bg-success-muted text-success",
  revision_requested: "bg-warning-muted text-warning",
  rejected: "bg-destructive-muted text-destructive",
};

const TAB_BASE =
  "flex flex-1 items-center justify-center gap-2 rounded-button px-4 py-2 text-sm font-medium transition-colors";

function PhaseTab({
  num, label, active, locked, status, onClick,
}: {
  num: number; label: string; active: boolean; locked?: boolean;
  status: PhaseStatus; onClick: () => void;
}) {
  return (
    <button
      onClick={() => !locked && onClick()}
      disabled={locked}
      className={cn(
        TAB_BASE,
        active ? "bg-bg-primary text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary",
        locked && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="font-mono text-xs text-text-tertiary">{num}</span>
      {label}
      {locked ? (
        <Lock size={12} className="text-text-tertiary" />
      ) : (
        <span className={cn("rounded-full px-2 py-0.5 text-xs", PHASE_BADGE[status])}>
          {status.replace(/_/g, " ")}
        </span>
      )}
    </button>
  );
}

export function PhaseTabs({
  phase, onChange, skuStatus, pricingStatus, pricingLocked,
}: {
  phase: Phase; onChange: (p: Phase) => void;
  skuStatus: PhaseStatus; pricingStatus: PhaseStatus; pricingLocked: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-card border border-[var(--border)] bg-bg-card p-1">
      <PhaseTab num={1} label="SKU Confirmation" active={phase === "sku"}
        status={skuStatus} onClick={() => onChange("sku")} />
      <PhaseTab num={2} label="Pricing Review" active={phase === "pricing"}
        status={pricingStatus} locked={pricingLocked} onClick={() => onChange("pricing")} />
    </div>
  );
}

export function ComparisonBanner({
  previous,
  current,
}: {
  previous: Totals;
  current: Totals;
}) {
  const prev = previous.grandTotalIncVat;
  const curr = current.grandTotalIncVat;
  if (prev <= 0) return null;
  const delta = curr - prev;
  const deltaPct = (delta / prev) * 100;
  const isDecrease = delta < 0;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-card border p-3 text-sm",
        isDecrease
          ? "border-success/30 bg-success-muted text-success"
          : "border-destructive/30 bg-destructive-muted text-destructive",
      )}
    >
      <span className="font-medium">Re-run comparison:</span>
      <span className="font-mono text-text-secondary">Previous {fmtSAR(prev)}</span>
      <span className="text-text-tertiary">→</span>
      <span className="font-mono font-semibold text-text-primary">Current {fmtSAR(curr)}</span>
      <span className="ml-auto font-mono font-semibold">
        {isDecrease ? "" : "+"}
        {fmtSAR(delta)} ({deltaPct.toFixed(1)}%)
      </span>
    </div>
  );
}

interface ActionBarProps {
  phase: Phase;
  dirty: boolean;
  saving: boolean;
  submitting: "approve" | "revise" | null;
  canApprove: boolean;
  onSave: () => void;
  onExport: () => void;
  onRevise: () => void;
  onApprove: () => void;
}

const BTN_GHOST =
  "flex items-center gap-1.5 rounded-button border border-[var(--border)] px-4 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50";

export function BomActionBar(props: ActionBarProps) {
  const { phase, dirty, saving, submitting, canApprove, onSave, onExport, onRevise, onApprove } = props;
  const approveLabel = phase === "sku" ? "Confirm SKUs" : "Approve BoM";
  return (
    <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-52 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
        {phase === "sku" && (
          <button onClick={onSave} disabled={saving || !dirty} className={cn(BTN_GHOST, "relative")}>
            <Save size={14} />
            {saving ? "Saving…" : "Save Changes"}
            {dirty && (
              <span className="absolute -top-1 -right-1 inline-block h-2.5 w-2.5 rounded-full bg-warning" />
            )}
          </button>
        )}
        <button onClick={onExport} className={BTN_GHOST}>
          <Download size={14} />
          Export BoM Excel
        </button>
        <button onClick={onRevise} disabled={submitting !== null} className={BTN_GHOST}>
          {submitting === "revise" ? "Submitting…" : "Request Changes"}
        </button>
        <button
          onClick={onApprove}
          disabled={submitting !== null || !canApprove}
          className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting === "approve" ? "Submitting…" : approveLabel}
        </button>
      </div>
    </div>
  );
}

export function BomSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full">
      <div className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card md:block" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
          <Link
            href={`/estimates/${id}`}
            className="flex items-center gap-1 text-xs text-text-tertiary"
          >
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="skeleton mt-2 h-6 w-48" />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl space-y-4">
            <div className="skeleton h-12 w-full rounded-card" />
            <div className="skeleton h-20 w-full rounded-card" />
            <div className="skeleton h-96 w-full rounded-card" />
          </div>
        </main>
      </div>
    </div>
  );
}
