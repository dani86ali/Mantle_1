"use client";

import { cn } from "@/lib/utils";
import type {
  BaselineEntry,
  BaselinePriority,
  RequirementsBaseline,
} from "@/engines/e4/types";

const PRIORITY_BADGE: Record<BaselinePriority, string> = {
  critical: "bg-destructive-muted text-destructive",
  high: "bg-warning-muted text-warning",
  medium: "bg-blue-muted text-blue",
  low: "bg-[var(--border)] text-text-tertiary",
};

const CATS: Array<{ key: keyof RequirementsBaseline; label: string }> = [
  { key: "business", label: "Business" },
  { key: "functional", label: "Functional" },
  { key: "nonFunctional", label: "Non-Functional" },
  { key: "constraints", label: "Constraints" },
  { key: "assumptions", label: "Assumptions" },
];

export function BaselineView({ baseline }: { baseline: RequirementsBaseline }) {
  return (
    <div className="space-y-3">
      {CATS.map(({ key, label }) => (
        <Category key={key} label={label} entries={baseline[key]} />
      ))}
    </div>
  );
}

function Category({ label, entries }: { label: string; entries: BaselineEntry[] }) {
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
        <span className="text-xs text-text-tertiary">{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-text-tertiary">None.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="rounded-button border border-[var(--border)] bg-bg-primary p-3">
              <div className="flex items-start gap-2">
                <span className="font-mono text-xs text-text-tertiary">{e.id}</span>
                <p className="flex-1 text-sm text-text-primary">{e.text}</p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    PRIORITY_BADGE[e.priority],
                  )}
                >
                  {e.priority}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-text-tertiary">source: {e.source}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
