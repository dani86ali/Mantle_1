"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { EstimateSubNav } from "../hub-components";
import type { NavItem } from "../hub-mappers";

export type DesignPhase = "idle" | "hld_in_progress" | "hld_complete" | "complete";

export type Tab = "approach" | "sizing" | "hld";

export const TAB_LABELS: Record<Tab, string> = {
  approach: "Design Approach", sizing: "Sizing & Compatibility", hld: "HLD",
};

const PHASE_BADGE: Record<DesignPhase, string> = {
  idle: "bg-[var(--border)] text-text-tertiary",
  hld_in_progress: "bg-accent-muted text-accent",
  hld_complete: "bg-blue-muted text-blue",
  complete: "bg-success-muted text-success",
};

export function PhaseBadge({ phase }: { phase: DesignPhase }) {
  return (
    <span data-testid="phase-badge" className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PHASE_BADGE[phase])}>
      {phase.replace(/_/g, " ")}
    </span>
  );
}

export function Shell({ id, navItems, headerExtras, children }: {
  id: string; navItems: NavItem[]; headerExtras?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="flex h-full">
      <EstimateSubNav items={navItems} activeHref={`/estimates/${id}/design`} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-4 py-4 sm:px-6">
          <Link href={`/estimates/${id}`} className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary">
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-lg font-semibold text-text-primary">{id.slice(0, 12).toUpperCase()}</h1>
            <span className="text-sm text-text-secondary">— Network Design</span>
            {headerExtras}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function DesignSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full">
      <div className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card md:block" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
          <Link href={`/estimates/${id}`} className="flex items-center gap-1 text-xs text-text-tertiary">
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="skeleton mt-2 h-6 w-64" />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl space-y-3">
            <div className="skeleton h-10 w-72 rounded-card" />
            <div className="skeleton h-48 w-full rounded-card" />
          </div>
        </main>
      </div>
    </div>
  );
}

export function Tabs({ active, onChange, tabs }: { active: Tab; onChange: (t: Tab) => void; tabs: Tab[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-card border border-[var(--border)] bg-bg-card p-1">
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t)} className={cn(
          "rounded-button px-3 py-1.5 text-sm font-medium",
          active === t ? "bg-accent-muted text-accent" : "text-text-secondary hover:text-text-primary",
        )}>{TAB_LABELS[t]}</button>
      ))}
    </div>
  );
}

export interface DesignInputValues {
  vendor: "cisco" | "fortinet";
  customerName: string; projectName: string; projectType: string;
  portCount: number; userCount: number; siteCount: number; buildingCount: number; bandwidthGbps: number;
  hasOT: boolean; hasWireless: boolean; hasVoice: boolean; hasDC: boolean; hasGuest: boolean;
  hasHPC: boolean; hasGPON: boolean; isGreenfield: boolean; vrfEnabled: boolean;
}

const INITIAL: DesignInputValues = {
  vendor: "cisco", customerName: "", projectName: "", projectType: "campus_refresh",
  portCount: 0, userCount: 0, siteCount: 1, buildingCount: 1, bandwidthGbps: 10,
  hasOT: false, hasWireless: false, hasVoice: false, hasDC: false, hasGuest: false,
  hasHPC: false, hasGPON: false, isGreenfield: false, vrfEnabled: false,
};

const FLAGS = ["hasOT","hasWireless","hasVoice","hasDC","hasGuest","hasHPC","hasGPON","isGreenfield","vrfEnabled"] as const;
const NUMS: Array<[keyof DesignInputValues, string]> = [
  ["portCount","Port Count"],["userCount","User Count"],["siteCount","Site Count"],
  ["buildingCount","Building Count"],["bandwidthGbps","Bandwidth (Gbps)"],
];

export function DesignInputForm({ busy, onSubmit, error }: {
  busy: boolean; onSubmit: (v: DesignInputValues) => void; error: string | null;
}) {
  const [v, setV] = useState<DesignInputValues>(INITIAL);
  const valid = v.customerName.trim() && v.projectName.trim() && v.portCount > 0;
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
      <h2 className="text-sm font-semibold text-text-primary">Start Network Design</h2>
      <p className="mt-1 text-xs text-text-secondary">Enter inputs to generate the HLD.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Vendor">
          <select className="form-input" value={v.vendor} onChange={(e) => setV({ ...v, vendor: e.target.value as "cisco" | "fortinet" })}>
            <option value="cisco">Cisco</option><option value="fortinet">Fortinet</option>
          </select>
        </Field>
        <Field label="Project Type"><input className="form-input" value={v.projectType} onChange={(e) => setV({ ...v, projectType: e.target.value })} /></Field>
        <Field label="Customer Name"><input className="form-input" value={v.customerName} onChange={(e) => setV({ ...v, customerName: e.target.value })} /></Field>
        <Field label="Project Name"><input className="form-input" value={v.projectName} onChange={(e) => setV({ ...v, projectName: e.target.value })} /></Field>
        {NUMS.map(([k, label]) => (
          <Field key={k} label={label}>
            <input className="form-input" type="number" value={v[k] as number}
              onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
          </Field>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {FLAGS.map((k) => (
          <label key={k} className="flex items-center gap-1.5 text-sm text-text-secondary">
            <input type="checkbox" checked={v[k] as boolean} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />{k}
          </label>
        ))}
      </div>
      <button onClick={() => onSubmit(v)} disabled={busy || !valid}
        className="mt-4 rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50">
        {busy ? "Generating…" : "Start Design"}
      </button>
      {error && <div className="mt-3 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">{error}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs text-text-secondary"><span>{label}</span>{children}</label>;
}

export function ApproveReviseBar({ approveLabel, reviseLabel, busyApprove, busyRevise, busy, onApprove, onRevise }: {
  approveLabel: string; reviseLabel: string; busyApprove: boolean; busyRevise: boolean;
  busy: boolean; onApprove: () => void; onRevise: (notes: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  return (
    <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-56 sm:px-6">
      <div className="mx-auto max-w-6xl">
        {open ? (
          <div className="flex flex-col gap-2">
            <textarea aria-label="Revision notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Revision notes…" className="form-input h-20 resize-y" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setOpen(false); setNotes(""); }} className="rounded-button border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-text-secondary">Cancel</button>
              <button onClick={() => { if (notes.trim()) { onRevise(notes.trim()); setOpen(false); setNotes(""); } }}
                disabled={busy || !notes.trim()}
                className="rounded-button bg-warning px-3 py-1.5 text-sm font-medium text-text-primary disabled:opacity-50">
                {busyRevise ? "Submitting…" : "Submit Revision"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button onClick={() => setOpen(true)} disabled={busy}
              className="rounded-button border border-[var(--border)] px-3 py-2 text-sm font-medium text-warning hover:bg-warning-muted disabled:opacity-50">{reviseLabel}</button>
            <button onClick={onApprove} disabled={busy}
              className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50">
              {busyApprove ? "Approving…" : approveLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
