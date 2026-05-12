"use client";

import { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  FileType,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ArtifactFormat = "xlsx" | "docx" | "pdf";

export interface ArtifactRow {
  artifact: string;
  name: string;
  format: ArtifactFormat;
  ready: boolean;
  comingSoon: boolean;
}

const FORMAT_ICON: Record<ArtifactFormat, typeof FileSpreadsheet> = {
  xlsx: FileSpreadsheet,
  docx: FileText,
  pdf: FileType,
};

const FORMAT_BADGE: Record<ArtifactFormat, string> = {
  xlsx: "bg-success-muted text-success",
  docx: "bg-blue-muted text-blue",
  pdf: "bg-destructive-muted text-destructive",
};

function ArtifactRowView({
  row,
  href,
  disabled,
  onRegenerate,
}: {
  row: ArtifactRow;
  href: string;
  disabled: boolean;
  onRegenerate: () => void;
}) {
  const Icon = FORMAT_ICON[row.format];
  const blocked = row.comingSoon || disabled || !row.ready;
  const statusDot = row.comingSoon
    ? "bg-[var(--border-hover)]"
    : row.ready
    ? "bg-success"
    : "bg-warning animate-pulse";
  return (
    <div className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-3 first:border-t-0">
      <Icon size={20} className="shrink-0 text-text-tertiary" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{row.name}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
              FORMAT_BADGE[row.format]
            )}
          >
            .{row.format}
          </span>
          {row.comingSoon && (
            <span className="rounded-full bg-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase text-text-tertiary">
              Coming soon
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">
          <span className={cn("h-1.5 w-1.5 rounded-full", statusDot)} />
          <span>
            {row.comingSoon ? "Not yet available" : row.ready ? "Ready" : "Generating…"}
          </span>
          {row.ready && !row.comingSoon && (
            <>
              <span>·</span>
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 text-text-tertiary hover:text-text-secondary"
              >
                <RefreshCw size={11} /> Regenerate
              </button>
            </>
          )}
        </div>
      </div>
      {blocked ? (
        <button
          disabled
          className="flex shrink-0 items-center gap-1.5 rounded-button border border-[var(--border)] bg-bg-card px-3 py-1.5 text-xs text-text-tertiary opacity-60"
        >
          <Download size={13} /> {row.comingSoon ? "Coming soon" : "Locked"}
        </button>
      ) : (
        <a
          href={href}
          className="flex shrink-0 items-center gap-1.5 rounded-button bg-accent px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-accent-hover"
        >
          <Download size={13} /> Download
        </a>
      )}
    </div>
  );
}

export function ArtifactGroup({
  title,
  rows,
  disabled,
  hrefFor,
}: {
  title: string;
  rows: ArtifactRow[];
  disabled: boolean;
  hrefFor: (artifact: string) => string;
}) {
  const [toast, setToast] = useState<string | null>(null);
  function regenerate() {
    setToast("Regeneration coming soon");
    setTimeout(() => setToast(null), 2500);
  }
  return (
    <section className="rounded-card border border-[var(--border)] bg-bg-card">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <span className="text-xs text-text-tertiary">{rows.length} artifacts</span>
      </header>
      {toast && (
        <div className="border-b border-[var(--border)] bg-blue-muted px-4 py-2 text-xs text-blue">
          {toast}
        </div>
      )}
      <div>
        {rows.map((r) => (
          <ArtifactRowView
            key={r.artifact}
            row={r}
            href={hrefFor(r.artifact)}
            disabled={disabled}
            onRegenerate={regenerate}
          />
        ))}
      </div>
    </section>
  );
}

export function DownloadAllBar({
  ready,
  total,
  disabled,
  rows,
  hrefFor,
}: {
  ready: number;
  total: number;
  disabled: boolean;
  rows: ArtifactRow[];
  hrefFor: (artifact: string) => string;
}) {
  // TODO: replace per-artifact sequential downloads with a server-side ZIP
  // bundle once the export bundler endpoint exists.
  function downloadAll() {
    const available = rows.filter((r) => r.ready && !r.comingSoon);
    for (let i = 0; i < available.length; i++) {
      const r = available[i];
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = hrefFor(r.artifact);
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 400);
    }
  }
  const blocked = disabled || ready === 0;
  return (
    <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-56 sm:px-6">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
        <span className="text-sm text-text-secondary">
          <span className="font-mono font-semibold text-text-primary">{ready}</span>{" "}
          of {total} artifacts ready
        </span>
        <button
          onClick={downloadAll}
          disabled={blocked}
          className="flex items-center gap-1.5 rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={14} /> Download All
        </button>
      </div>
    </div>
  );
}
