"use client";

import Link from "next/link";
import { ChevronLeft, AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntakeMode } from "@/coordinator/types";
import type {
  StageState, StageView, CheckpointView, SummaryView, NavItem,
} from "./hub-mappers";

const SAR = new Intl.NumberFormat("en-US", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });
const STAGE_CIRCLE: Record<StageState, string> = {
  not_started: "border-[var(--border)] bg-bg-primary text-text-tertiary",
  processing: "border-accent bg-accent-muted text-accent animate-pulse",
  needs_review: "border-warning bg-warning-muted text-warning",
  approved: "border-success bg-success-muted text-success",
};
const STATUS_DOT: Record<StageState, string> = {
  not_started: "bg-[var(--border-hover)]",
  processing: "bg-accent animate-pulse",
  needs_review: "bg-warning",
  approved: "bg-success",
};
const CHECKPOINT_BADGE: Record<CheckpointView["status"], string> = {
  not_started: "bg-[var(--border)] text-text-tertiary",
  pending: "bg-[var(--border)] text-text-tertiary",
  approved: "bg-success-muted text-success",
  revision_requested: "bg-warning-muted text-warning",
  rejected: "bg-destructive-muted text-destructive",
};
const ESTIMATE_STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-[var(--border)] text-text-tertiary",
  READY_FOR_REVIEW: "bg-blue-muted text-blue",
  APPROVED: "bg-success-muted text-success",
  PENDING: "bg-warning-muted text-warning",
  PROCESSING: "bg-accent-muted text-accent",
  AGENT_FAILED: "bg-destructive-muted text-destructive",
};
const MODE_LABELS: Record<IntakeMode, string> = { rfp: "RFP", rfi: "RFI", quick_bom: "Quick BoM" };

function stageIcon(state: StageState, index: number) {
  if (state === "approved") return <CheckCircle2 size={18} />;
  if (state === "processing") return <Loader2 size={18} className="animate-spin" />;
  if (state === "needs_review") return <AlertCircle size={18} />;
  return index;
}

export function PipelineStepper({ stages }: { stages: StageView[] }) {
  return (
    <div className="flex items-start rounded-card border border-[var(--border)] bg-bg-card p-5">
      {stages.map((s, i) => (
        <div key={s.engine} className="flex flex-1 items-start">
          <div className="flex flex-1 flex-col items-center">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold",
              STAGE_CIRCLE[s.state],
            )}>{stageIcon(s.state, i + 1)}</div>
            <p className="mt-2 text-sm font-medium text-text-primary">{s.label}</p>
            <p className="mt-0.5 text-xs text-text-tertiary">{s.detail}</p>
          </div>
          {i < stages.length - 1 && (
            <div className={cn(
              "mt-4 h-0.5 flex-1",
              s.state === "approved" ? "bg-success" : "bg-[var(--border)]",
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

export function CheckpointCards({ checkpoints }: { checkpoints: CheckpointView[] }) {
  return (
    <div className="space-y-2">
      {checkpoints.map((c) => (
        <Link
          key={c.id}
          href={c.href}
          className="flex items-center justify-between rounded-card border border-[var(--border)] bg-bg-card p-4 hover:border-[var(--border-hover)]"
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-text-tertiary">{c.id}</span>
            <span className="text-sm font-medium text-text-primary">{c.label}</span>
            {c.revisionsUsed > 0 && (
              <span className="rounded-full bg-blue-muted px-2 py-0.5 text-xs text-blue">
                Revision {c.revisionsUsed}
              </span>
            )}
          </div>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", CHECKPOINT_BADGE[c.status])}>
            {c.status.replace(/_/g, " ")}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function SummaryCards({ summary }: { summary: SummaryView }) {
  const cards: Array<[string, string]> = [
    ["Requirements", summary.requirementsCount?.toString() ?? "--"],
    ["Risk Flags", summary.riskFlagsCritical?.toString() ?? "--"],
    ["BoM Lines", summary.bomLines?.toString() ?? "--"],
    ["Grand Total", summary.grandTotalIncVat != null ? SAR.format(summary.grandTotalIncVat) : "--"],
    ["Margin", summary.marginPct != null ? `${(summary.marginPct * 100).toFixed(1)}%` : "--"],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-card border border-[var(--border)] bg-bg-card p-4">
          <p className="text-xs text-text-tertiary">{label}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-text-primary">{value}</p>
        </div>
      ))}
    </div>
  );
}

export function EstimateSubNav({ items, activeHref }: { items: NavItem[]; activeHref: string }) {
  return (
    <aside className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card p-3 md:block">
      <Link href="/estimates" className="mb-3 flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary">
        <ChevronLeft size={14} /> Back to estimates
      </Link>
      <nav className="space-y-0.5">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center justify-between rounded-button px-3 py-2 text-sm transition-colors",
              item.href === activeHref
                ? "bg-accent-muted text-accent"
                : "text-text-secondary hover:bg-[var(--bg-elevated)] hover:text-text-primary",
            )}
          >
            <span>{item.label}</span>
            <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[item.state])} />
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function HubHeader(props: {
  estimateId: string; customerName: string; status: string; createdAt: string;
  mode: IntakeMode; onDelete: () => void; deleting: boolean;
}) {
  const { estimateId, customerName, status, createdAt, mode, onDelete, deleting } = props;
  const date = new Date(createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-bg-card px-6 py-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-lg font-semibold text-text-primary">{estimateId}</h1>
          <span className="rounded-full bg-blue-muted px-2.5 py-0.5 text-xs font-medium text-blue">{MODE_LABELS[mode]}</span>
          <span className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            ESTIMATE_STATUS_BADGE[status] ?? "bg-[var(--border)] text-text-tertiary",
          )}>{status.replace(/_/g, " ")}</span>
        </div>
        <p className="mt-1 text-sm text-text-secondary">{customerName} — created {date}</p>
      </div>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="flex items-center gap-1.5 rounded-button px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive-muted disabled:opacity-50"
      >
        <Trash2 size={14} />
        {deleting ? "Deleting…" : "Delete estimate"}
      </button>
    </header>
  );
}

export function HubSkeleton() {
  return (
    <div className="flex h-full">
      <div className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card md:block" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
          <div className="skeleton h-6 w-48" />
          <div className="skeleton mt-2 h-4 w-72" />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl space-y-6">
            <div className="skeleton h-28 w-full rounded-card" />
            <div className="skeleton h-48 w-full rounded-card" />
          </div>
        </main>
      </div>
    </div>
  );
}
