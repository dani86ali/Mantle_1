"use client";

import { useState } from "react";
import type { SizingResult, CompatibilityResult, ValidationIssue } from "@/engines/e5/types";

export function SizingTab({ sizing, compatibility }: {
  sizing: SizingResult | null;
  compatibility: CompatibilityResult | null;
}) {
  const rows = sizing ? [
    ...sizing.coreDevices, ...sizing.distributionDevices, ...sizing.accessDevices,
    ...sizing.firewalls, ...sizing.wirelessControllers, ...sizing.accessPoints,
  ] : [];
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-card border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-card">
            <tr className="text-left text-xs text-text-tertiary">
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-text-tertiary">No sizing data.</td></tr>
            ) : rows.map((d, i) => (
              <tr key={`${d.role}-${d.model}-${i}`} className={i % 2 === 0 ? "bg-bg-primary" : "bg-bg-card"}>
                <td className="border-t border-[var(--border)] px-3 py-2 align-top text-text-primary">{d.role}</td>
                <td className="border-t border-[var(--border)] px-3 py-2 align-top font-mono text-xs text-text-primary">{d.model}</td>
                <td className="border-t border-[var(--border)] px-3 py-2 align-top text-text-secondary">{d.vendor}</td>
                <td className="border-t border-[var(--border)] px-3 py-2 align-top font-mono text-text-primary">{d.quantity}</td>
                <td className="border-t border-[var(--border)] px-3 py-2 align-top text-text-secondary">{d.reasoning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {compatibility && (
        <>
          <IssueGroup title="Errors" items={compatibility.errors} kind="error" />
          <IssueGroup title="Warnings" items={compatibility.warnings} kind="warning" />
        </>
      )}
    </div>
  );
}

function IssueGroup({ title, items, kind }: { title: string; items: ValidationIssue[]; kind: "error" | "warning" }) {
  if (items.length === 0) return null;
  const cls = kind === "error"
    ? "border-destructive/30 bg-destructive-muted text-destructive"
    : "border-warning/30 bg-warning-muted text-warning";
  return (
    <div className={`rounded-card border ${cls} p-4`} data-testid={`issues-${kind}`}>
      <h3 className="text-sm font-semibold">{title} ({items.length})</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((issue, idx) => <IssueRow key={idx} issue={issue} />)}
      </ul>
    </div>
  );
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left text-xs">
        <span className="font-mono">{issue.rule}</span> — {issue.device}: {issue.message}
      </button>
      {open && <p className="mt-1 text-xs opacity-80">Severity: {issue.severity}</p>}
    </li>
  );
}
