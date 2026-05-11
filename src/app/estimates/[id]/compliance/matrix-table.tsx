"use client";

import { useState, Fragment } from "react";
import { cn } from "@/lib/utils";
import {
  STATUS_OPTIONS,
  STATUS_TONE,
  type EditableRow,
  type Status,
} from "./sections";

export function MatrixTable({
  rows,
  onChange,
  dirtyKeys,
}: {
  rows: EditableRow[];
  onChange: (key: string, patch: Partial<{ status: Status; notes: string }>) => void;
  dirtyKeys: Set<string>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-tertiary">No compliance pairs generated.</p>;
  }
  const groups = groupByFramework(rows);
  return (
    <div className="overflow-x-auto rounded-card border border-[var(--border)] bg-bg-card">
      <table className="min-w-[1000px] w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-bg-elevated text-left text-xs text-text-tertiary">
            <th className="px-3 py-2 font-medium">Req ID</th>
            <th className="px-3 py-2 font-medium">Requirement</th>
            <th className="px-3 py-2 font-medium">Framework</th>
            <th className="px-3 py-2 font-medium">Control</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Notes</th>
            <th className="px-3 py-2 font-medium">TP Section</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([fw, fwRows]) => (
            <Fragment key={fw}>
              <tr className="sticky top-0 z-10 bg-bg-elevated">
                <td
                  colSpan={7}
                  className="border-y border-[var(--border)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary"
                >
                  {fw}{" "}
                  <span className="text-text-tertiary normal-case">
                    · {fwRows.length} requirement{fwRows.length === 1 ? "" : "s"}
                  </span>
                </td>
              </tr>
              {fwRows.map((r) => (
                <Row
                  key={r.key}
                  row={r}
                  dirty={dirtyKeys.has(r.key)}
                  onChange={(patch) => onChange(r.key, patch)}
                />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  row,
  dirty,
  onChange,
}: {
  row: EditableRow;
  dirty: boolean;
  onChange: (patch: Partial<{ status: Status; notes: string }>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <tr
      className={cn(
        "border-b border-[var(--border)] align-top hover:bg-bg-elevated/50",
        dirty && "bg-warning-muted/40"
      )}
    >
      <td className="px-3 py-2 font-mono text-xs text-text-tertiary whitespace-nowrap">
        {row.requirementId}
      </td>
      <td className="px-3 py-2 text-text-secondary max-w-md">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn("text-left w-full", !expanded && "line-clamp-2")}
          title={row.requirementText}
        >
          {row.requirementText}
        </button>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-text-secondary whitespace-nowrap">
        {row.frameworkId}
      </td>
      <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">
        <span className="font-mono">{row.controlId}</span>
        <div className="text-text-tertiary">{row.controlName}</div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <select
          value={row.status}
          onChange={(e) => onChange({ status: e.target.value as Status })}
          className={cn(
            "rounded-input border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-accent",
            STATUS_TONE[row.status]
          )}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s} className="bg-bg-primary text-text-primary">
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={row.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Add notes…"
          className="form-input min-w-[200px] py-1 text-xs"
        />
      </td>
      <td className="px-3 py-2 font-mono text-xs text-text-tertiary whitespace-nowrap">
        {row.tpSection || "—"}
      </td>
    </tr>
  );
}

function groupByFramework(rows: EditableRow[]): Array<[string, EditableRow[]]> {
  const map = new Map<string, EditableRow[]>();
  for (const r of rows) {
    if (!map.has(r.frameworkId)) map.set(r.frameworkId, []);
    map.get(r.frameworkId)!.push(r);
  }
  return Array.from(map.entries());
}
