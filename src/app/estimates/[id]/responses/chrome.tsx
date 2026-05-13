"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { EstimateSubNav } from "../hub-components";
import type { NavItem } from "../hub-mappers";
import type { ResponseStatus } from "./sections";

export type Tab = "responses" | "gaps" | "baseline";

export function Shell({
  id,
  navItems,
  headerExtras,
  children,
}: {
  id: string;
  navItems: NavItem[];
  headerExtras?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full">
      <EstimateSubNav items={navItems} activeHref={`/estimates/${id}/responses`} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-4 py-4 sm:px-6">
          <Link
            href={`/estimates/${id}`}
            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
          >
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-lg font-semibold text-text-primary">
              {id.slice(0, 12).toUpperCase()}
            </h1>
            <span className="text-sm text-text-secondary">— Client Responses &amp; Requirements</span>
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

export function ResponsesSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full">
      <div className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card md:block" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
          <Link href={`/estimates/${id}`} className="flex items-center gap-1 text-xs text-text-tertiary">
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="skeleton mt-2 h-6 w-72" />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl space-y-3">
            <div className="skeleton h-10 w-64 rounded-card" />
            <div className="skeleton h-72 w-full rounded-card" />
          </div>
        </main>
      </div>
    </div>
  );
}

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "responses", label: "Responses" },
  { key: "gaps", label: "Gaps" },
  { key: "baseline", label: "Requirements Baseline" },
];

export function Tabs({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 rounded-card border border-[var(--border)] bg-bg-card p-1">
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "rounded-button px-3 py-1.5 text-sm font-medium",
            active === t.key
              ? "bg-accent-muted text-accent"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function UploadPanel({
  busy,
  onSubmitText,
  onSubmitFile,
  error,
}: {
  busy: boolean;
  onSubmitText: (text: string) => void;
  onSubmitFile: (file: File) => void;
  error: string | null;
}) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
      <h2 className="text-sm font-semibold text-text-primary">Upload responses</h2>
      <p className="mt-1 text-xs text-text-secondary">
        Paste the client's free-text response below, or upload the completed questionnaire (.xlsx).
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste client response text…"
        className="form-input mt-3 h-32 resize-y"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => onSubmitText(text)}
          disabled={busy || text.trim().length === 0}
          className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Processing…" : "Process Text"}
        </button>
        <label className="flex items-center gap-1.5 rounded-button border border-[var(--border)] px-3 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary">
          <Upload size={14} />
          Upload .xlsx
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSubmitFile(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
        </label>
      </div>
      {error && (
        <div className="mt-3 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

export function ResponsesActionBar({
  status,
  busy,
  onValidate,
  onRequestRevision,
  onReprocess,
}: {
  status: ResponseStatus;
  busy: string | null;
  onValidate: () => void;
  onRequestRevision: () => void;
  onReprocess: () => void;
}) {
  const disabled = busy !== null;
  return (
    <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-56 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2">
        <button
          onClick={onReprocess}
          disabled={disabled}
          className="rounded-button border border-[var(--border)] px-3 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
        >
          {busy === "reprocess" ? "Re-processing…" : "Re-process"}
        </button>
        <button
          onClick={onRequestRevision}
          disabled={disabled}
          className="rounded-button border border-[var(--border)] px-3 py-2 text-sm font-medium text-warning hover:bg-warning-muted disabled:opacity-50"
        >
          {busy === "revision" ? "Submitting…" : "Request Revision"}
        </button>
        <button
          onClick={onValidate}
          disabled={disabled || status === "validated"}
          className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
        >
          {busy === "validate" ? "Validating…" : "Validate & Approve"}
        </button>
      </div>
    </div>
  );
}
