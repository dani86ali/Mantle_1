"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileStack,
  Plus,
  Search,
  SearchX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ProjectRow,
  modeLabel,
  projectLink,
  projectProgress,
  statusLabel,
} from "@/app/dashboard/helpers";
import type { ProjectListStatus } from "@/lib/db/project-store";
import type { ProjectMode } from "@/types/project";

const PAGE_SIZE = 10;
const ALL_STATUSES: Array<"All" | ProjectListStatus> = [
  "All",
  "not_started",
  "in_progress",
  "needs_review",
  "approved",
  "blocked",
  "rejected",
];
const ALL_MODES: Array<"All" | ProjectMode> = ["All", "quick_bom", "rfp"];

function useProjects() {
  const [data, setData] = useState<ProjectRow[]>([]);
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
        setData(json.projects ?? []);
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

  return { data, loading, error };
}

export default function ProjectsPage() {
  const { data: projects, loading, error } = useProjects();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ProjectListStatus>("All");
  const [modeFilter, setModeFilter] = useState<"All" | ProjectMode>("All");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let rows = projects;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (row) =>
          row.id.toLowerCase().includes(q) ||
          row.name.toLowerCase().includes(q) ||
          (row.customerName ?? "").toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "All") rows = rows.filter((row) => row.status === statusFilter);
    if (modeFilter !== "All") rows = rows.filter((row) => row.mode === modeFilter);
    return rows;
  }, [projects, search, statusFilter, modeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const showingFrom = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, filtered.length);

  return (
    <div className="min-h-screen bg-bg-primary px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">Projects</h1>
            <span className="rounded-full bg-accent-muted px-2.5 py-0.5 text-xs font-medium text-accent">
              {filtered.length}
            </span>
          </div>
          <Link
            href="/projects/quick-bom/new"
            className="inline-flex items-center gap-2 rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            New Quick BoM Project
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search projects by name, customer, or ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-input border border-[var(--border)] bg-bg-card py-2 pl-10 pr-3 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value as "All" | ProjectListStatus);
              setPage(1);
            }}
            options={ALL_STATUSES.map((value) => ({
              value,
              label: value === "All" ? "All Statuses" : statusLabel(value as ProjectListStatus),
            }))}
          />
          <FilterSelect
            label="Mode"
            value={modeFilter}
            onChange={(value) => {
              setModeFilter(value as "All" | ProjectMode);
              setPage(1);
            }}
            options={ALL_MODES.map((value) => ({
              value,
              label: value === "All" ? "All Modes" : modeLabel(value as ProjectMode),
            }))}
          />
        </div>

        {error && (
          <div className="mt-6 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
            Unable to load projects.
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-card border border-[var(--border)] bg-bg-card">
          {loading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 skeleton" />
              ))}
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-secondary">
              <SearchX className="mb-4 h-10 w-10 text-text-tertiary" />
              <p className="text-lg font-medium text-text-primary">No projects found</p>
              <p className="mt-1 text-sm">Try a different search or filter.</p>
            </div>
          ) : (
            <ProjectTable rows={pageRows} />
          )}

          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
              <p className="text-sm text-text-secondary">
                Showing <span className="font-medium text-text-primary">{showingFrom}-{showingTo}</span>{" "}
                of <span className="font-medium text-text-primary">{filtered.length}</span>
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="rounded-button border border-[var(--border)] p-1.5 text-text-secondary hover:bg-bg-elevated disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 text-sm text-text-secondary">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="rounded-button border border-[var(--border)] p-1.5 text-text-secondary hover:bg-bg-elevated disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectTable({ rows }: { rows: ProjectRow[] }) {
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-input border border-[var(--border)] bg-bg-card py-2 pl-3 pr-9 text-sm text-text-primary outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
    </label>
  );
}

function statusTone(status: ProjectListStatus): string {
  if (status === "approved") return "bg-success-muted text-success";
  if (status === "needs_review") return "bg-warning-muted text-warning";
  if (status === "blocked" || status === "rejected") return "bg-destructive-muted text-destructive";
  if (status === "not_started") return "bg-[var(--border)] text-text-tertiary";
  return "bg-blue-muted text-blue";
}
