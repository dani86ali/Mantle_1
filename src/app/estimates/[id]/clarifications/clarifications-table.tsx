"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClarificationQuestion } from "@/engines/e1/clarification-generator";
import { PRIORITY_BADGE, PRIORITY_LABEL, CATEGORY_LABEL } from "./clarifications-components";

export interface QuestionTableProps {
  questions: ClarificationQuestion[];
  estimateId: string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  editingId: string | null;
  onEditStart: (id: string) => void;
  onEditEnd: () => void;
  edits: Record<string, string>;
  onEditChange: (id: string, text: string) => void;
}

export function QuestionTable(p: QuestionTableProps) {
  if (p.questions.length === 0) {
    return (
      <div className="rounded-card border border-[var(--border)] bg-bg-card p-8 text-center text-sm text-text-tertiary">
        No questions match the current filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card border border-[var(--border)] bg-bg-card">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-bg-card text-left text-xs text-text-tertiary">
          <tr>
            <th className="w-10 px-3 py-2"></th>
            <th className="w-10 px-3 py-2"></th>
            <th className="px-3 py-2 font-medium">ID</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Question</th>
            <th className="px-3 py-2 font-medium">Related</th>
          </tr>
        </thead>
        <tbody>
          {p.questions.map((q, i) => (
            <QuestionRow key={q.id} q={q} idx={i} {...p} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuestionRow({ q, idx, ...p }: { q: ClarificationQuestion; idx: number } & QuestionTableProps) {
  const expanded = p.expandedId === q.id;
  const editing = p.editingId === q.id;
  const edited = q.id in p.edits;
  const text = edited ? p.edits[q.id] : q.question;
  const rowBg = idx % 2 === 0 ? "bg-bg-card" : "bg-bg-primary";
  return (
    <>
      <tr className={cn("border-t border-[var(--border)]", rowBg)}>
        <td className="px-3 py-2 align-top">
          <input
            type="checkbox"
            checked={p.selectedIds.has(q.id)}
            onChange={() => p.onToggle(q.id)}
            className="h-4 w-4 cursor-pointer"
          />
        </td>
        <td className="px-3 py-2 align-top">
          <button
            onClick={() => p.onExpand(expanded ? null : q.id)}
            className="text-text-tertiary hover:text-text-primary"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="px-3 py-2 align-top font-mono text-xs text-text-tertiary">{q.id}</td>
        <td className="px-3 py-2 align-top">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PRIORITY_BADGE[q.priority])}>
            {PRIORITY_LABEL[q.priority]}
          </span>
        </td>
        <td className="px-3 py-2 align-top">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-muted px-2.5 py-0.5 text-xs font-medium text-blue">
            {CATEGORY_LABEL[q.category]}
            {q.category === "missing_document" && (
              <Link
                href={`/estimates/${p.estimateId}/checkpoint#missing-docs`}
                className="hover:text-text-primary"
                title="View missing documents"
              >
                <FileWarning size={12} />
              </Link>
            )}
          </span>
        </td>
        <td className="px-3 py-2 align-top text-text-primary">
          {editing ? (
            <textarea
              autoFocus
              value={text}
              onChange={(e) => p.onEditChange(q.id, e.target.value)}
              onBlur={p.onEditEnd}
              rows={Math.max(2, Math.ceil(text.length / 80))}
              className="form-input min-h-[60px] w-full"
            />
          ) : (
            <button onClick={() => p.onEditStart(q.id)} className="block w-full text-left hover:text-accent">
              {text}
              {edited && (
                <span className="ml-2 rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-medium text-accent">
                  edited
                </span>
              )}
            </button>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          <div className="flex flex-wrap gap-1">
            {q.relatedRequirementIds.map((rid) => (
              <Link
                key={rid}
                href={`/estimates/${p.estimateId}/checkpoint#${rid}`}
                className="font-mono text-xs text-blue hover:underline"
              >
                {rid}
              </Link>
            ))}
            {q.relatedRequirementIds.length === 0 && <span className="text-xs text-text-tertiary">—</span>}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className={rowBg}>
          <td colSpan={7} className="border-t border-[var(--border)] px-3 py-3">
            <p className="text-xs text-text-tertiary">Reasoning</p>
            <p className="mt-1 text-sm text-text-secondary">{q.reasoning}</p>
          </td>
        </tr>
      )}
    </>
  );
}
