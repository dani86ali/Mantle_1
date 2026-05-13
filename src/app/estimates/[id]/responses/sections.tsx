"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ClientResponse, ResponseSource } from "@/engines/e4/types";
import type { EnhancedGapAnalysis } from "@/engines/e4/gap-detector-ai";

export type ResponseStatus = "pending" | "processed" | "validated";

const STATUS_BADGE: Record<ResponseStatus, string> = {
  pending: "bg-[var(--border)] text-text-tertiary",
  processed: "bg-blue-muted text-blue",
  validated: "bg-success-muted text-success",
};

const SOURCE_BADGE: Record<ResponseSource, string> = {
  structured: "bg-success-muted text-success",
  free_text: "bg-blue-muted text-blue",
  ai_interpreted: "bg-warning-muted text-warning",
};

export function StatusBadge({ status }: { status: ResponseStatus }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_BADGE[status])}>
      {status}
    </span>
  );
}

function formatAnswer(answer: ClientResponse["answer"]): string {
  if (answer === null || answer === undefined) return "—";
  if (Array.isArray(answer)) return answer.join(", ");
  return String(answer);
}

export function ResponsesTable({
  responses,
  questionText,
}: {
  responses: ClientResponse[];
  questionText: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (responses.length === 0) {
    return <p className="text-sm text-text-tertiary">No responses parsed yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-card border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead className="bg-bg-card">
          <tr className="text-left text-xs text-text-tertiary">
            <th className="px-3 py-2 font-medium">Q ID</th>
            <th className="px-3 py-2 font-medium">Question</th>
            <th className="px-3 py-2 font-medium">Answer</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {responses.map((r, i) => {
            const isExpanded = expanded === r.questionId;
            const answer = formatAnswer(r.answer);
            const truncated = !isExpanded && answer.length > 80
              ? `${answer.slice(0, 80)}…` : answer;
            const qText = questionText[r.questionId] ?? "—";
            const qTrunc = qText.length > 60 ? `${qText.slice(0, 60)}…` : qText;
            return (
              <tr
                key={r.questionId}
                onClick={() => setExpanded(isExpanded ? null : r.questionId)}
                className={cn(
                  "cursor-pointer border-t border-[var(--border)]",
                  i % 2 === 0 ? "bg-bg-primary" : "bg-bg-card",
                )}
              >
                <td className="px-3 py-2 align-top font-mono text-xs text-text-tertiary">{r.questionId}</td>
                <td className="px-3 py-2 align-top text-text-secondary">{qTrunc}</td>
                <td className="px-3 py-2 align-top text-text-primary">{truncated}</td>
                <td className="px-3 py-2 align-top">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", SOURCE_BADGE[r.source])}>
                    {r.source.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-3 py-2 align-top">
                  <ConfidenceBar value={r.confidence} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConfidenceBar({ value }: { value?: number }) {
  if (value === undefined) return <span className="text-xs text-text-tertiary">—</span>;
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-[var(--border)]">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-text-tertiary">{pct.toFixed(0)}%</span>
    </div>
  );
}

export function GapsList({
  gaps,
  questionText,
}: {
  gaps: EnhancedGapAnalysis;
  questionText: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      <GapGroup title="Incomplete (required, unanswered)" count={gaps.incompleteQuestions.length}>
        {gaps.incompleteQuestions.map((qid) => (
          <li key={qid} className="rounded-button border border-[var(--border)] bg-bg-primary p-2 text-sm">
            <span className="font-mono text-xs text-text-tertiary">{qid}</span>{" "}
            <span className="text-text-primary">{questionText[qid] ?? "—"}</span>
          </li>
        ))}
      </GapGroup>
      <GapGroup title="Vague answers" count={gaps.vagueAnswers.length}>
        {gaps.vagueAnswers.map((v) => (
          <li key={v.questionId} className="rounded-button border border-[var(--border)] bg-bg-primary p-2 text-sm">
            <span className="font-mono text-xs text-text-tertiary">{v.questionId}</span>{" "}
            <span className="text-text-primary">{v.answer}</span>
            <p className="mt-1 text-xs text-warning">{v.reason}</p>
          </li>
        ))}
      </GapGroup>
      <GapGroup title="Contradictions" count={gaps.contradictions.length}>
        {gaps.contradictions.map((c, i) => (
          <li key={i} className="rounded-button border border-[var(--border)] bg-bg-primary p-2 text-sm">
            <p className="text-text-primary">{c.description}</p>
            <p className="mt-1 font-mono text-xs text-text-tertiary">{c.questionIds.join(", ")}</p>
          </li>
        ))}
      </GapGroup>
      <GapGroup title="Unstated assumptions" count={gaps.unstatedAssumptions.length}>
        {gaps.unstatedAssumptions.map((u, i) => (
          <li key={i} className="rounded-button border border-[var(--border)] bg-bg-primary p-2 text-sm text-text-primary">
            {u}
          </li>
        ))}
      </GapGroup>
    </div>
  );
}

function GapGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <span className="text-xs text-text-tertiary">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-xs text-text-tertiary">None.</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </div>
  );
}
