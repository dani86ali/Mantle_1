"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileStack,
  Hourglass,
  Loader2,
  Plus,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ActivityEntry,
  type ProjectProgress,
  type ProjectRow,
  buildActivityFeed,
  lifecycleStage,
  modeLabel,
  projectLink,
  projectProgress,
  relativeTime,
  statusLabel,
} from "./helpers";

function useProjects(): { rows: ProjectRow[]; loading: boolean; error: boolean } {
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) throw new Error("project list failed");
        const json = (await res.json()) as { projects?: ProjectRow[] };
        if (cancelled) return;
        setRows(json.projects ?? []);
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
  const { rows, loading, error } = useProjects();

  const stats = useMemo(() => {
    const total = rows.length;
    let inProgress = 0;
    let review = 0;
    let approved = 0;
    for (const row of rows) {
      const stage = lifecycleStage(row.status);
      if (stage === "in_progress") inProgress++;
      else if (stage === "ready_for_review") review++;
      else if (stage === "approved") approved++;
    }
    return { total, inProgress, review, approved };
  }, [rows]);

  const recent = useMemo(
    () => [...rows].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 5),
    [rows]
  );
  const activity = useMemo(() => buildActivityFeed(rows), [rows]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Project activity across Quick BoM and RFP workspaces
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
          Unable to load projects.
        </div>
      )}

      <StatsRow loading={loading} stats={stats} />

      {!loading && rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <RecentProjects loading={loading} rows={recent} />
          <ActivityFeed loading={loading} entries={activity} rows={rows} />
        </>
      )}
    </div>
  );
}

function StatsRow({
  loading,
  stats,
}: {
  loading: boolean;
  stats: { total: number; inProgress: number; review: number; approved: number };
}) {
  const cards = [
    { label: "Total Projects", value: stats.total, icon: FileStack, borderClass: "border-l-accent", iconClass: "text-accent" },
    { label: "In Progress", value: stats.inProgress, icon: Loader2, borderClass: "border-l-blue", iconClass: "text-blue" },
    { label: "Needs Review", value: stats.review, icon: ClipboardCheck, borderClass: "border-l-warning", iconClass: "text-warning" },
    { label: "Approved", value: stats.approved, icon: CheckCircle2, borderClass: "border-l-success", iconClass: "text-success" },
  ];

  return (
    <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={cn(
              "rounded-card border border-[var(--border)] border-l-4 bg-bg-card p-5",
              card.borderClass
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{card.label}</span>
              <Icon className={cn("h-4 w-4", card.iconClass)} />
            </div>
            {loading ? (
              <div className="mt-3 h-9 w-16 skeleton" />
            ) : (
              <p className="mt-3 font-mono text-3xl font-semibold text-text-primary">
                {card.value}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

function RecentProjects({ loading, rows }: { loading: boolean; rows: ProjectRow[] }) {
  return (
    <section className="mb-8 rounded-card border border-[var(--border)] bg-bg-card">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-base font-semibold text-text-primary">Recent Projects</h2>
        <Link
          href="/projects"
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
                <th className="px-5 py-3 font-medium">Project</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Mode</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Stages</th>
                <th className="px-5 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-bg-elevated">
                  <td className="whitespace-nowrap px-5 py-3">
                    <Link
                      href={projectLink(row)}
                      className="font-medium text-accent hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="font-mono text-[11px] text-text-tertiary">{row.id}</div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-text-primary">
                    {row.customerName ?? "No customer"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-text-secondary">
                    {modeLabel(row.mode)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-5 py-3">
                    <ProgressIndicator progress={projectProgress(row)} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-text-secondary">
                    {new Date(row.updatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
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

function StatusBadge({ status }: { status: ProjectRow["status"] }) {
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
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", cls)}>
      {statusLabel(status)}
    </span>
  );
}

function ProgressIndicator({ progress }: { progress: ProjectProgress }) {
  const pct = progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
  const color =
    progress.state === "done"
      ? "bg-success"
      : progress.state === "failed"
      ? "bg-destructive"
      : progress.state === "running"
      ? "bg-accent"
      : "bg-[var(--text-tertiary)]";
  return (
    <div className="flex min-w-[140px] items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-bg-elevated">
        <div className={cn("h-2 rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right font-mono text-xs text-text-tertiary">
        {progress.completed}/{progress.total}
      </span>
    </div>
  );
}

function ActivityFeed({
  loading,
  entries,
  rows,
}: {
  loading: boolean;
  entries: ActivityEntry[];
  rows: ProjectRow[];
}) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (
    <section className="rounded-card border border-[var(--border)] bg-bg-card">
      <header className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-base font-semibold text-text-primary">Project Activity</h2>
      </header>

      {loading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 skeleton" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-text-tertiary">
          No project activity yet.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {entries.map((entry) => {
            const row = byId.get(entry.projectId);
            return (
              <li
                key={entry.id}
                className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-bg-elevated"
              >
                <ActivityIcon state={entry.state} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">
                    <span className="font-medium">{entry.stageLabel}</span>{" "}
                    <span className="text-text-secondary">{labelForState(entry.state)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    <Link
                      href={row ? projectLink(row) : `/projects/${entry.projectId}`}
                      className="text-accent hover:underline"
                    >
                      {entry.projectName}
                    </Link>{" "}
                    / {entry.customerName}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-text-tertiary">
                  {relativeTime(entry.timestamp)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ActivityIcon({ state }: { state: ActivityEntry["state"] }) {
  if (state === "completed") return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
  if (state === "running") return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />;
  if (state === "awaiting_review") return <Hourglass className="h-4 w-4 shrink-0 text-warning" />;
  if (state === "failed") return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
  return <AlertTriangle className="h-4 w-4 shrink-0 text-text-tertiary" />;
}

function labelForState(state: ActivityEntry["state"]): string {
  switch (state) {
    case "completed":
      return "completed";
    case "running":
      return "running";
    case "awaiting_review":
      return "needs review";
    case "failed":
      return "needs attention";
  }
}

function EmptyState() {
  return (
    <section className="rounded-card border border-dashed border-[var(--border)] bg-bg-card px-6 py-16 text-center">
      <FileStack className="mx-auto h-10 w-10 text-text-tertiary" />
      <h2 className="mt-4 text-base font-semibold text-text-primary">No projects yet</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Create a Quick BoM Project to start from the canonical Project spine.
      </p>
      <Link
        href="/projects/quick-bom/new"
        className="mt-5 inline-flex items-center gap-2 rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-accent-hover"
      >
        <Plus className="h-4 w-4" />
        New Quick BoM Project
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
