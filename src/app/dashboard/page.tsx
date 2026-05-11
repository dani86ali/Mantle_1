"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Loader2,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  ArrowRight,
  AlertTriangle,
  XCircle,
  Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EstimateRow,
  ActivityEntry,
  buildActivityFeed,
  lifecycleStage,
  pipelineProgress,
  relativeTime,
  statusLabel,
  PipelineProgress,
} from "./helpers";

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

interface ApiEstimate {
  id: string;
  estimateId?: string;
  customer?: string | null;
  domain?: string | null;
  status: string;
  created: string;
  totalPrice?: number;
}

function useEstimates(): { rows: EstimateRow[]; loading: boolean; error: boolean } {
  const [rows, setRows] = useState<EstimateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/estimates");
        const json = (await res.json()) as { estimates?: ApiEstimate[] };
        if (cancelled) return;
        const list = (json.estimates ?? []).map((e) => ({
          id: e.id,
          estimateId: e.estimateId ?? e.id.slice(0, 12).toUpperCase(),
          customer: e.customer ?? "Unknown",
          domain: e.domain ?? "",
          status: e.status,
          created:
            typeof e.created === "string"
              ? e.created
              : new Date(e.created).toISOString(),
          totalPrice: e.totalPrice ?? 0,
        }));
        setRows(list);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, loading, error };
}

export default function DashboardPage() {
  const { rows, loading } = useEstimates();

  const stats = useMemo(() => {
    const total = rows.length;
    let inProgress = 0;
    let review = 0;
    let approved = 0;
    for (const r of rows) {
      const s = lifecycleStage(r.status);
      if (s === "in_progress") inProgress++;
      else if (s === "ready_for_review") review++;
      else if (s === "approved") approved++;
    }
    return { total, inProgress, review, approved };
  }, [rows]);

  const recent = useMemo(
    () =>
      [...rows]
        .sort((a, b) => (a.created < b.created ? 1 : -1))
        .slice(0, 5),
    [rows]
  );

  const activity = useMemo(() => buildActivityFeed(rows), [rows]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Pipeline activity across all estimates
        </p>
      </header>

      <StatsRow loading={loading} stats={stats} />

      {!loading && rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <RecentEstimates loading={loading} rows={recent} />
          <ActivityFeed loading={loading} entries={activity} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats row                                                          */
/* ------------------------------------------------------------------ */

interface StatsRowProps {
  loading: boolean;
  stats: { total: number; inProgress: number; review: number; approved: number };
}

function StatsRow({ loading, stats }: StatsRowProps) {
  const cards = [
    {
      label: "Total Estimates",
      value: stats.total,
      icon: FileText,
      borderClass: "border-l-accent",
      iconClass: "text-accent",
    },
    {
      label: "In Progress",
      value: stats.inProgress,
      icon: Loader2,
      borderClass: "border-l-blue",
      iconClass: "text-blue",
    },
    {
      label: "Ready for Review",
      value: stats.review,
      icon: ClipboardCheck,
      borderClass: "border-l-warning",
      iconClass: "text-warning",
    },
    {
      label: "Approved",
      value: stats.approved,
      icon: CheckCircle2,
      borderClass: "border-l-success",
      iconClass: "text-success",
    },
  ];

  return (
    <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className={cn(
              "rounded-card border border-[var(--border)] border-l-4 bg-bg-card p-5",
              c.borderClass
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{c.label}</span>
              <Icon className={cn("h-4 w-4", c.iconClass)} />
            </div>
            {loading ? (
              <div className="mt-3 h-9 w-16 skeleton" />
            ) : (
              <p className="mt-3 font-mono text-3xl font-semibold text-text-primary">
                {c.value}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent estimates table                                             */
/* ------------------------------------------------------------------ */

function RecentEstimates({
  loading,
  rows,
}: {
  loading: boolean;
  rows: EstimateRow[];
}) {
  return (
    <section className="mb-8 rounded-card border border-[var(--border)] bg-bg-card">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-base font-semibold text-text-primary">
          Recent Estimates
        </h2>
        <Link
          href="/estimates"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-text-secondary">
                <th className="px-5 py-3 font-medium">Estimate</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Pipeline</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-bg-elevated">
                  <td className="whitespace-nowrap px-5 py-3">
                    <Link
                      href={`/estimates/${r.id}`}
                      className="font-mono text-sm font-medium text-accent hover:underline"
                    >
                      {r.estimateId}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-text-primary">
                    {r.customer}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-5 py-3">
                    <PipelineIndicator progress={pipelineProgress(r.status)} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-text-secondary">
                    {new Date(r.created).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-mono text-text-primary">
                    {currencyFmt.format(r.totalPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const stage = lifecycleStage(status);
  const cls =
    stage === "approved"
      ? "bg-success-muted text-success"
      : stage === "ready_for_review"
      ? "bg-warning-muted text-warning"
      : stage === "failed"
      ? "bg-destructive-muted text-destructive"
      : "bg-blue-muted text-blue";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        cls
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function PipelineIndicator({ progress }: { progress: PipelineProgress }) {
  const steps: Array<{ key: "E1" | "E2" | "E3"; state: PipelineProgress["e1"] }> = [
    { key: "E1", state: progress.e1 },
    { key: "E2", state: progress.e2 },
    { key: "E3", state: progress.e3 },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, idx) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <Dot state={s.state} label={s.key} />
          {idx < steps.length - 1 && (
            <span
              className={cn(
                "h-px w-4",
                s.state === "done" ? "bg-success" : "bg-[var(--border)]"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function Dot({
  state,
  label,
}: {
  state: PipelineProgress["e1"];
  label: string;
}) {
  const cls =
    state === "done"
      ? "bg-success text-white"
      : state === "running"
      ? "bg-accent text-white animate-pulse"
      : state === "failed"
      ? "bg-destructive text-white"
      : "bg-[var(--bg-elevated)] text-text-tertiary border border-[var(--border)]";
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-medium",
        cls
      )}
      title={`${label}: ${state}`}
    >
      {label.slice(1)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Activity feed                                                      */
/* ------------------------------------------------------------------ */

function ActivityFeed({
  loading,
  entries,
}: {
  loading: boolean;
  entries: ActivityEntry[];
}) {
  return (
    <section className="rounded-card border border-[var(--border)] bg-bg-card">
      <header className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-base font-semibold text-text-primary">
          Pipeline Activity
        </h2>
      </header>

      {loading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 skeleton" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-text-tertiary">
          No pipeline activity yet.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-bg-elevated"
            >
              <ActivityIcon state={e.state} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary">
                  <span className="font-mono text-xs text-text-secondary">
                    {e.engine}
                  </span>{" "}
                  <span className="text-text-secondary">·</span>{" "}
                  <span className="font-medium">{e.engineLabel}</span>{" "}
                  <span className="text-text-secondary">
                    {labelForState(e.state)}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-text-tertiary">
                  <Link
                    href={`/estimates/${e.estimateLinkId}`}
                    className="font-mono text-accent hover:underline"
                  >
                    {e.estimateId}
                  </Link>{" "}
                  · {e.customer}
                </p>
              </div>
              <span className="shrink-0 text-xs text-text-tertiary">
                {relativeTime(e.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityIcon({ state }: { state: ActivityEntry["state"] }) {
  if (state === "completed")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
  if (state === "running")
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />;
  if (state === "awaiting_review")
    return <Hourglass className="h-4 w-4 shrink-0 text-warning" />;
  if (state === "failed")
    return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
  return <AlertTriangle className="h-4 w-4 shrink-0 text-text-tertiary" />;
}

function labelForState(state: ActivityEntry["state"]): string {
  switch (state) {
    case "completed":
      return "completed";
    case "running":
      return "running";
    case "awaiting_review":
      return "awaiting review";
    case "failed":
      return "failed";
  }
}

/* ------------------------------------------------------------------ */
/*  Empty + skeleton                                                   */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <section className="rounded-card border border-dashed border-[var(--border)] bg-bg-card px-6 py-16 text-center">
      <FileText className="mx-auto h-10 w-10 text-text-tertiary" />
      <h2 className="mt-4 text-base font-semibold text-text-primary">
        No estimates yet
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Kick off the pipeline by uploading an RFP or RFI.
      </p>
      <Link
        href="/estimate/new"
        className="mt-5 inline-flex items-center gap-2 rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-accent-hover"
      >
        <Plus className="h-4 w-4" />
        Create your first estimate
      </Link>
    </section>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 skeleton" />
      ))}
    </div>
  );
}
