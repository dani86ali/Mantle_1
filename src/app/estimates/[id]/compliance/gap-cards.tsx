"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CoverageGapView, OrphanView } from "./sections";

export function CollapsibleCard({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <span className="rounded-full bg-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
            {count}
          </span>
        </div>
      </button>
      {open && <div className="border-t border-[var(--border)] p-5">{children}</div>}
    </div>
  );
}

export function CoverageGapsList({ items }: { items: CoverageGapView[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-tertiary">No framework controls without matches.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((g) => (
        <li
          key={`${g.frameworkId}#${g.controlId}`}
          className="rounded-card border border-warning/30 bg-warning-muted p-3"
        >
          <div className="flex flex-wrap items-baseline gap-2 text-xs">
            <span className="font-mono font-semibold text-warning">{g.frameworkId}</span>
            <span className="font-mono text-text-secondary">{g.controlId}</span>
            <span className="text-text-secondary">— {g.controlName}</span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{g.message}</p>
        </li>
      ))}
    </ul>
  );
}

export function OrphanList({ items }: { items: OrphanView[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-tertiary">All requirements matched a control.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((o) => (
        <li
          key={o.requirementId}
          className="rounded-card border border-blue/30 bg-blue-muted p-3"
        >
          <div className="font-mono text-xs font-semibold text-blue">{o.requirementId}</div>
          <p className="mt-1 line-clamp-3 text-sm text-text-secondary" title={o.requirementText}>
            {o.requirementText}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">{o.reason}</p>
        </li>
      ))}
    </ul>
  );
}
