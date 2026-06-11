"use client";

import Link from "next/link";
import { Archive, ArchiveRestore } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ProjectRow,
  modeLabel,
  projectLink,
  projectProgress,
  statusLabel,
} from "@/app/dashboard/helpers";
import type { ProjectListStatus } from "@/lib/db/project-store";

/** Project list view: active surfaces hide archived Projects (QBM-LOG-006). */
export type ProjectsView = "active" | "archived";

function statusTone(status: ProjectListStatus): string {
  if (status === "approved") return "bg-success-muted text-success";
  if (status === "needs_review") return "bg-warning-muted text-warning";
  if (status === "blocked" || status === "rejected") return "bg-destructive-muted text-destructive";
  if (status === "not_started") return "bg-[var(--border)] text-text-tertiary";
  return "bg-blue-muted text-blue";
}

/**
 * Projects table. The Actions column renders Archive on the active view and
 * Restore on the archived view; both are disabled while their row is in flight.
 */
export function ProjectTable({
  rows,
  view,
  busyId,
  onAction,
}: {
  rows: ProjectRow[];
  view: ProjectsView;
  busyId: string | null;
  onAction: (id: string, action: "archive" | "restore") => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-bg-card">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Project</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Customer</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Mode</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Stages</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Updated</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-secondary">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => {
            const progress = projectProgress(row);
            const pct =
              progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
            return (
              <tr key={row.id} className="transition-colors hover:bg-[var(--bg-elevated)]">
                <td className="whitespace-nowrap px-4 py-3">
                  <Link href={projectLink(row)} className="font-medium text-accent hover:underline">
                    {row.name}
                  </Link>
                  <p className="font-mono text-[11px] text-text-tertiary">{row.id}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-primary">
                  {row.customerName ?? "No customer"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                  {modeLabel(row.mode)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", statusTone(row.status))}>
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td className="min-w-[170px] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-bg-elevated">
                      <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-xs text-text-tertiary">
                      {progress.completed}/{progress.total}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                  {new Date(row.updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {view === "active" ? (
                    <button
                      type="button"
                      data-testid={`archive-${row.id}`}
                      disabled={busyId === row.id}
                      onClick={() => onAction(row.id, "archive")}
                      className="inline-flex items-center gap-1.5 rounded-button border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:bg-bg-elevated disabled:opacity-40"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid={`restore-${row.id}`}
                      disabled={busyId === row.id}
                      onClick={() => onAction(row.id, "restore")}
                      className="inline-flex items-center gap-1.5 rounded-button border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:bg-bg-elevated disabled:opacity-40"
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
