"use client";

import { cn } from "@/lib/utils";

export type Status =
  | "Compliant"
  | "Partially Compliant"
  | "Non-Compliant"
  | "Alternative Proposed";

export const STATUS_OPTIONS: Status[] = [
  "Compliant",
  "Partially Compliant",
  "Non-Compliant",
  "Alternative Proposed",
];

export interface EditableRow {
  key: string;
  requirementId: string;
  requirementText: string;
  classification: string;
  frameworkId: string;
  controlId: string;
  controlName: string;
  status: Status;
  notes: string;
  tpSection: string;
}

export interface CoverageGapView {
  frameworkId: string;
  controlId: string;
  controlName: string;
  message: string;
}

export interface OrphanView {
  requirementId: string;
  requirementText: string;
  reason: string;
}

export interface Stats {
  total: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  alternative: number;
  coveragePct: number;
}

export const STATUS_TONE: Record<Status, string> = {
  Compliant: "bg-success-muted text-success border-success/30",
  "Partially Compliant": "bg-warning-muted text-warning border-warning/30",
  "Non-Compliant": "bg-destructive-muted text-destructive border-destructive/30",
  "Alternative Proposed": "bg-blue-muted text-blue border-blue/30",
};

export interface Filters {
  framework: string;
  status: Status | "all";
  search: string;
}

export const DEFAULT_FILTERS: Filters = {
  framework: "all",
  status: "all",
  search: "",
};

export function filterRows(rows: EditableRow[], f: Filters): EditableRow[] {
  const s = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.framework !== "all" && r.frameworkId !== f.framework) return false;
    if (f.status !== "all" && r.status !== f.status) return false;
    if (
      s &&
      !r.requirementText.toLowerCase().includes(s) &&
      !r.requirementId.toLowerCase().includes(s)
    )
      return false;
    return true;
  });
}

export function StatsBar({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <StatCard label="Compliant" value={stats.compliant} tone={STATUS_TONE.Compliant} />
      <StatCard
        label="Partially Compliant"
        value={stats.partial}
        tone={STATUS_TONE["Partially Compliant"]}
      />
      <StatCard
        label="Non-Compliant"
        value={stats.nonCompliant}
        tone={STATUS_TONE["Non-Compliant"]}
      />
      <StatCard
        label="Alternative Proposed"
        value={stats.alternative}
        tone={STATUS_TONE["Alternative Proposed"]}
      />
      <div className="rounded-card border border-[var(--border)] bg-bg-card p-4">
        <p className="text-xs text-text-tertiary">Coverage</p>
        <p className="mt-1 font-mono text-lg font-semibold text-text-primary">
          {stats.coveragePct.toFixed(0)}%
        </p>
        <p className="text-[10px] text-text-tertiary">{stats.total} total pairs</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card p-4">
      <p className="text-xs text-text-tertiary">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="font-mono text-lg font-semibold text-text-primary">{value}</p>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", tone)}>
          {label.toLowerCase()}
        </span>
      </div>
    </div>
  );
}

export function FilterBar({
  filters,
  onChange,
  frameworkIds,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  frameworkIds: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-[var(--border)] bg-bg-card p-3">
      <select
        value={filters.framework}
        onChange={(e) => onChange({ ...filters, framework: e.target.value })}
        className="form-input w-auto"
      >
        <option value="all">All frameworks</option>
        {frameworkIds.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value as Filters["status"] })}
        className="form-input w-auto"
      >
        <option value="all">All statuses</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Search requirement text or ID…"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="form-input min-w-[200px] flex-1"
      />
    </div>
  );
}

export { MatrixTable } from "./matrix-table";
export { CollapsibleCard, CoverageGapsList, OrphanList } from "./gap-cards";
