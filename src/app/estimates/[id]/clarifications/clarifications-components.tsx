"use client";

import { cn } from "@/lib/utils";
import type {
  ClarificationPriority,
  ClarificationCategory,
  ClarificationQuestion,
} from "@/engines/e1/clarification-generator";

export const PRIORITY_BADGE: Record<ClarificationPriority, string> = {
  critical: "bg-destructive-muted text-destructive",
  important: "bg-warning-muted text-warning",
  nice_to_have: "bg-[var(--border)] text-text-tertiary",
};

export const PRIORITY_LABEL: Record<ClarificationPriority, string> = {
  critical: "Critical",
  important: "Important",
  nice_to_have: "Nice to have",
};

export const CATEGORY_LABEL: Record<ClarificationCategory, string> = {
  missing_document: "Missing doc",
  ambiguous_requirement: "Ambiguous",
  missing_scope: "Missing scope",
  commercial: "Commercial",
  compliance: "Compliance",
};

export interface Filters {
  priority: ClarificationPriority | "all";
  category: ClarificationCategory | "all";
  search: string;
}

export const DEFAULT_FILTERS: Filters = { priority: "all", category: "all", search: "" };

export function filterQuestions(qs: ClarificationQuestion[], f: Filters): ClarificationQuestion[] {
  const s = f.search.trim().toLowerCase();
  return qs.filter((q) => {
    if (f.priority !== "all" && q.priority !== f.priority) return false;
    if (f.category !== "all" && q.category !== f.category) return false;
    if (s && !q.question.toLowerCase().includes(s) && !q.id.toLowerCase().includes(s)) return false;
    return true;
  });
}

export function StatsBar({ qs }: { qs: ClarificationQuestion[] }) {
  const stats: Array<[string, number, string]> = [
    ["Total questions", qs.length, "bg-[var(--border)] text-text-secondary"],
    ["Critical", qs.filter((q) => q.priority === "critical").length, PRIORITY_BADGE.critical],
    ["Important", qs.filter((q) => q.priority === "important").length, PRIORITY_BADGE.important],
    ["Nice to have", qs.filter((q) => q.priority === "nice_to_have").length, PRIORITY_BADGE.nice_to_have],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(([label, value, badge]) => (
        <div key={label} className="rounded-card border border-[var(--border)] bg-bg-card p-4">
          <p className="text-xs text-text-tertiary">{label}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="font-mono text-lg font-semibold text-text-primary">{value}</p>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", badge)}>
              {label === "Total questions" ? "all" : label.toLowerCase()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-[var(--border)] bg-bg-card p-3">
      <select
        value={filters.priority}
        onChange={(e) => onChange({ ...filters, priority: e.target.value as Filters["priority"] })}
        className="form-input w-auto"
      >
        <option value="all">All priorities</option>
        <option value="critical">Critical</option>
        <option value="important">Important</option>
        <option value="nice_to_have">Nice to have</option>
      </select>
      <select
        value={filters.category}
        onChange={(e) => onChange({ ...filters, category: e.target.value as Filters["category"] })}
        className="form-input w-auto"
      >
        <option value="all">All categories</option>
        {(Object.keys(CATEGORY_LABEL) as ClarificationCategory[]).map((c) => (
          <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Search questions…"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="form-input min-w-[200px] flex-1"
      />
    </div>
  );
}

export function SelectionActions({
  selectedCount,
  totalCount,
  onCopy,
  onSelectCritical,
  onDeselectAll,
  onBackToOverview,
}: {
  selectedCount: number;
  totalCount: number;
  onCopy: () => void;
  onSelectCritical: () => void;
  onDeselectAll: () => void;
  onBackToOverview: () => void;
}) {
  return (
    <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-56 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-text-tertiary">
          {selectedCount} of {totalCount} selected
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onSelectCritical}
            className="rounded-button border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary"
          >
            Select all critical
          </button>
          <button
            onClick={onDeselectAll}
            disabled={selectedCount === 0}
            className="rounded-button border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
          >
            Deselect all
          </button>
          <button
            onClick={onCopy}
            disabled={selectedCount === 0}
            className="rounded-button border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
          >
            Copy to clipboard
          </button>
          <button
            onClick={onBackToOverview}
            className="rounded-button bg-accent px-4 py-1.5 text-sm font-medium text-text-primary hover:bg-accent-hover"
          >
            Back to overview
          </button>
        </div>
      </div>
    </div>
  );
}
