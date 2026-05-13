"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  QuestionnaireSection,
  Question,
  QuestionPriority,
} from "@/engines/e4/types";

const PRIORITY_BADGE: Record<QuestionPriority, string> = {
  required: "bg-destructive-muted text-destructive",
  recommended: "bg-accent-muted text-accent",
  optional: "bg-[var(--border)] text-text-tertiary",
};

export type QuestionnaireStatus = "draft" | "approved" | "sent" | "revision";

const STATUS_BADGE: Record<QuestionnaireStatus, string> = {
  draft: "bg-[var(--border)] text-text-tertiary",
  approved: "bg-success-muted text-success",
  sent: "bg-blue-muted text-blue",
  revision: "bg-warning-muted text-warning",
};

export function StatusBadge({ status }: { status: QuestionnaireStatus }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_BADGE[status])}>
      {status}
    </span>
  );
}

export function SectionCard({ section }: { section: QuestionnaireSection }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown size={16} className="text-text-tertiary" />
          ) : (
            <ChevronRight size={16} className="text-text-tertiary" />
          )}
          <span className="font-mono text-xs text-text-tertiary">{section.id}</span>
          <h3 className="text-sm font-semibold text-text-primary">{section.title}</h3>
          <span className="text-xs text-text-tertiary">
            {section.questions.length} question{section.questions.length === 1 ? "" : "s"}
          </span>
        </div>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-5">
          <p className="mb-3 text-xs text-text-secondary">{section.description}</p>
          <ul className="space-y-2">
            {section.questions.map((q) => (
              <QuestionRow key={q.id} q={q} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function QuestionRow({ q }: { q: Question }) {
  return (
    <li className="flex items-start gap-3 rounded-button border border-[var(--border)] bg-bg-primary p-3">
      <span className="font-mono text-xs text-text-tertiary">{q.id}</span>
      <div className="flex-1">
        <p className="text-sm text-text-primary">{q.text}</p>
        {q.helpText && (
          <p className="mt-1 text-xs text-text-tertiary">{q.helpText}</p>
        )}
      </div>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-medium",
          PRIORITY_BADGE[q.priority],
        )}
      >
        {q.priority}
      </span>
    </li>
  );
}

export function QuestionnaireActionBar({
  status,
  busy,
  onApprove,
  onRequestRevision,
  onRegenerate,
  onCopyMarkdown,
  onExport,
}: {
  status: QuestionnaireStatus;
  busy: string | null;
  onApprove: () => void;
  onRequestRevision: () => void;
  onRegenerate: () => void;
  onCopyMarkdown: () => void;
  onExport: () => void;
}) {
  const disabled = busy !== null;
  return (
    <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-56 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2">
        <button
          onClick={onCopyMarkdown}
          disabled={disabled}
          className="rounded-button border border-[var(--border)] px-3 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
        >
          Copy as Markdown
        </button>
        <button
          onClick={onExport}
          disabled
          title="Export coming soon"
          className="rounded-button border border-[var(--border)] px-3 py-2 text-sm font-medium text-text-tertiary opacity-60"
        >
          Export
        </button>
        <button
          onClick={onRegenerate}
          disabled={disabled}
          className="rounded-button border border-[var(--border)] px-3 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
        >
          {busy === "regenerate" ? "Regenerating…" : "Regenerate"}
        </button>
        <button
          onClick={onRequestRevision}
          disabled={disabled}
          className="rounded-button border border-[var(--border)] px-3 py-2 text-sm font-medium text-warning hover:bg-warning-muted disabled:opacity-50"
        >
          {busy === "revision" ? "Submitting…" : "Request Revision"}
        </button>
        <button
          onClick={onApprove}
          disabled={disabled || status !== "draft"}
          className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
        >
          {busy === "approve" ? "Approving…" : "Approve & Send"}
        </button>
      </div>
    </div>
  );
}
