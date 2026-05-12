"use client";

import Link from "next/link";
import { ChevronLeft, Download, Save } from "lucide-react";
import { cn } from "@/lib/utils";

export function ComplianceHeader({
  estimateId,
  customerName,
}: {
  estimateId: string;
  customerName: string;
}) {
  return (
    <header className="border-b border-[var(--border)] bg-bg-card px-4 py-4 sm:px-6">
      <Link
        href={`/estimates/${estimateId}`}
        className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
      >
        <ChevronLeft size={14} /> Back to estimate
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-lg font-semibold text-text-primary">Compliance Matrix Review</h1>
        <p className="text-sm text-text-secondary">— {customerName}</p>
      </div>
    </header>
  );
}

export function ComplianceActionBar({
  saving,
  approving,
  dirty,
  canApprove,
  onSave,
  onExport,
  onApprove,
}: {
  saving: boolean;
  approving: boolean;
  dirty: boolean;
  canApprove: boolean;
  onSave: () => void;
  onExport: () => void;
  onApprove: () => void;
}) {
  return (
    <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-52 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
        <button
          onClick={onSave}
          disabled={saving || !dirty}
          className="relative flex items-center gap-1.5 rounded-button border border-[var(--border)] px-4 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save Changes"}
          {dirty && (
            <span className="absolute -top-1 -right-1 inline-block h-2.5 w-2.5 rounded-full bg-warning" />
          )}
        </button>
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-button border border-[var(--border)] px-4 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary"
        >
          <Download size={14} />
          Export to Excel
        </button>
        <button
          onClick={onApprove}
          disabled={approving || !canApprove}
          className={cn(
            "rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50",
          )}
        >
          {approving ? "Approving…" : "Approve & Continue"}
        </button>
      </div>
    </div>
  );
}

export function ComplianceSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full">
      <div className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card md:block" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
          <Link
            href={`/estimates/${id}`}
            className="flex items-center gap-1 text-xs text-text-tertiary"
          >
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="skeleton mt-2 h-6 w-64" />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl space-y-4">
            <div className="skeleton h-20 w-full rounded-card" />
            <div className="skeleton h-12 w-full rounded-card" />
            <div className="skeleton h-96 w-full rounded-card" />
          </div>
        </main>
      </div>
    </div>
  );
}
