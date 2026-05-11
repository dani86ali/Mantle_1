"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Plus,
  BookOpen,
  Layers,
  TrendingUp,
  Timer,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const metrics = [
  {
    label: "Estimates This Week",
    value: "12",
    trend: "+3 from last week",
    trendDirection: "up" as "up" | "down" | "neutral",
    icon: FileText,
  },
  {
    label: "Avg Processing Time",
    value: "4.2 min",
    trend: "-18% improvement",
    trendDirection: "up" as "up" | "down" | "neutral",
    icon: Timer,
  },
  {
    label: "Time Saved",
    value: "8.5 hrs",
    trend: "this week",
    trendDirection: "neutral" as "up" | "down" | "neutral",
    icon: Clock,
  },
  {
    label: "Validation Pass Rate",
    value: "94%",
    trend: "+2% from last week",
    trendDirection: "up" as "up" | "down" | "neutral",
    icon: ShieldCheck,
  },
];

type ActivityStatus = "completed" | "pending" | "failed";

interface ActivityItem {
  id: number;
  message: string;
  timestamp: string;
  status: ActivityStatus;
}

const recentActivity: ActivityItem[] = [
  {
    id: 1,
    message: "Estimate OG164161387AE approved",
    timestamp: "2 hours ago",
    status: "completed",
  },
  {
    id: 2,
    message: "New intake from NTT Data submitted",
    timestamp: "3 hours ago",
    status: "pending",
  },
  {
    id: 3,
    message: "Validation failed on EST-2024-089",
    timestamp: "4 hours ago",
    status: "failed",
  },
  {
    id: 4,
    message: "Estimate EST-2024-091 exported to XLSX",
    timestamp: "5 hours ago",
    status: "completed",
  },
  {
    id: 5,
    message: "Draft saved for Acme Corp campus refresh",
    timestamp: "6 hours ago",
    status: "pending",
  },
  {
    id: 6,
    message: "Estimate EST-2024-088 approved by reviewer",
    timestamp: "8 hours ago",
    status: "completed",
  },
  {
    id: 7,
    message: "New intake from BT Group submitted",
    timestamp: "1 day ago",
    status: "completed",
  },
  {
    id: 8,
    message: "Validation passed on EST-2024-087",
    timestamp: "1 day ago",
    status: "completed",
  },
];

const queueStatus = {
  pending: 3,
  processing: 1,
  failed: 0,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const statusDotColor: Record<ActivityStatus, string> = {
  completed: "bg-success",
  pending: "bg-warning",
  failed: "bg-destructive",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* ---- Header ---- */}
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Overview of your presales activity
        </p>
      </header>

      {/* ---- Metric Cards ---- */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className="rounded-card border border-[var(--border)] bg-bg-card p-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">{m.label}</span>
                <Icon className="h-4 w-4 text-text-tertiary" />
              </div>

              <p className="mt-3 text-3xl font-semibold text-text-primary">
                {m.value}
              </p>

              <div className="mt-2 flex items-center gap-1 text-xs">
                {m.trendDirection === "up" && (
                  <ArrowUpRight className="h-3.5 w-3.5 text-success" />
                )}
                {m.trendDirection === "down" && (
                  <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
                )}
                <span
                  className={cn(
                    m.trendDirection === "up" && "text-success",
                    m.trendDirection === "down" && "text-destructive",
                    m.trendDirection === "neutral" && "text-text-secondary"
                  )}
                >
                  {m.trend}
                </span>
              </div>
            </div>
          );
        })}
      </section>

      {/* ---- Two-column layout ---- */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Recent Activity (spans 2 cols) */}
        <div className="lg:col-span-2 rounded-card border border-[var(--border)] bg-bg-card p-5">
          <h2 className="mb-4 text-base font-semibold text-text-primary">
            Recent Activity
          </h2>

          <ul className="divide-y divide-[var(--border)]">
            {recentActivity.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
              >
                {/* Status dot */}
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    statusDotColor[item.status]
                  )}
                />

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">{item.message}</p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {item.timestamp}
                  </p>
                </div>

                {/* Status icon */}
                {item.status === "completed" && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                )}
                {item.status === "pending" && (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                )}
                {item.status === "failed" && (
                  <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Quick Actions */}
          <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
            <h2 className="mb-4 text-base font-semibold text-text-primary">
              Quick Actions
            </h2>

            <div className="flex flex-col gap-3">
              <Link
                href="/estimate/new"
                className="flex items-center justify-center gap-2 rounded-button bg-accent px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-accent-hover"
              >
                <Plus className="h-4 w-4" />
                New Estimate
              </Link>

              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-button border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm font-medium text-text-primary transition hover:border-border-hover hover:bg-bg-elevated"
              >
                <Layers className="h-4 w-4" />
                Resume Draft
              </button>

              <Link
                href="/catalog"
                className="flex items-center justify-center gap-2 rounded-button border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm font-medium text-text-primary transition hover:border-border-hover hover:bg-bg-elevated"
              >
                <BookOpen className="h-4 w-4" />
                Browse Catalog
              </Link>
            </div>
          </div>

          {/* Queue Status */}
          <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
            <h2 className="mb-4 text-base font-semibold text-text-primary">
              Queue Status
            </h2>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-warning" />
                <span className="text-sm text-text-secondary">
                  <span className="font-medium text-text-primary">
                    {queueStatus.pending}
                  </span>{" "}
                  pending
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-blue" />
                <span className="text-sm text-text-secondary">
                  <span className="font-medium text-text-primary">
                    {queueStatus.processing}
                  </span>{" "}
                  processing
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                <span className="text-sm text-text-secondary">
                  <span className="font-medium text-text-primary">
                    {queueStatus.failed}
                  </span>{" "}
                  failed
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Charts row ---- */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Cost breakdown donut */}
        <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">
            Cost Breakdown
          </h2>
          <CostDonut product={68} service={18} subscription={14} />
          <div className="mt-4 space-y-2">
            <LegendRow color="bg-accent" label="Product" value="$186,400" pct="68%" />
            <LegendRow color="bg-blue" label="Service" value="$49,300" pct="18%" />
            <LegendRow color="bg-warning" label="Subscription" value="$38,400" pct="14%" />
          </div>
        </div>

        {/* Estimates by status */}
        <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">
            Estimates by Status
          </h2>
          <div className="space-y-3">
            <StatusBar label="Approved" count={14} total={24} color="bg-success" />
            <StatusBar label="In Review" count={5} total={24} color="bg-blue" />
            <StatusBar label="Pending" count={3} total={24} color="bg-warning" />
            <StatusBar label="Failed" count={2} total={24} color="bg-destructive" />
          </div>
        </div>

        {/* Domain distribution */}
        <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">
            Domain Distribution
          </h2>
          <div className="space-y-3">
            <StatusBar label="Access Switching" count={16} total={24} color="bg-accent" />
            <StatusBar label="Wireless" count={6} total={24} color="bg-blue" />
            <StatusBar label="Mixed" count={2} total={24} color="bg-warning" />
          </div>
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <h3 className="text-xs font-medium text-text-tertiary">Top Validation Flags</h3>
            <div className="mt-2 space-y-1.5">
              <FlagRow label="Missing SmartNet" count={8} />
              <FlagRow label="PoE Budget Warning" count={5} />
              <FlagRow label="Stacking Incomplete" count={3} />
              <FlagRow label="EoX Detected" count={2} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart sub-components                                               */
/* ------------------------------------------------------------------ */

function CostDonut({ product, service, subscription }: { product: number; service: number; subscription: number }) {
  // SVG donut chart
  const total = product + service + subscription;
  const r = 50;
  const c = 2 * Math.PI * r;
  const pPct = product / total;
  const sPct = service / total;

  return (
    <div className="flex justify-center">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#E2E4EB" strokeWidth="14" />
        {/* Product segment */}
        <circle cx="70" cy="70" r={r} fill="none" stroke="#01BFFD" strokeWidth="14"
          strokeDasharray={`${c * pPct} ${c * (1 - pPct)}`}
          strokeDashoffset={c * 0.25} strokeLinecap="round" />
        {/* Service segment */}
        <circle cx="70" cy="70" r={r} fill="none" stroke="#2980F9" strokeWidth="14"
          strokeDasharray={`${c * sPct} ${c * (1 - sPct)}`}
          strokeDashoffset={c * 0.25 - c * pPct} strokeLinecap="round" />
        {/* Center text */}
        <text x="70" y="66" textAnchor="middle" className="fill-text-primary text-lg font-semibold" fontSize="18">
          $274K
        </text>
        <text x="70" y="82" textAnchor="middle" className="fill-text-tertiary" fontSize="10">
          This month
        </text>
      </svg>
    </div>
  );
}

function LegendRow({ color, label, value, pct }: { color: string; label: string; value: string; pct: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
        <span className="text-text-secondary">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-text-primary">{value}</span>
        <span className="text-text-tertiary">{pct}</span>
      </div>
    </div>
  );
}

function StatusBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = Math.round((count / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-primary font-medium">{count}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-[var(--border)]">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FlagRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-secondary">{label}</span>
      <span className="rounded-full bg-[var(--border)] px-2 py-0.5 font-mono text-text-tertiary">{count}</span>
    </div>
  );
}
