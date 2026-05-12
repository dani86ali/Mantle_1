"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROPOSAL_SECTIONS, type GenerationMethod } from "@/engines/e3/types";

export type ReviewState = "unreviewed" | "reviewed" | "edited";

const METHOD_BADGE: Record<GenerationMethod, string> = {
  deterministic: "bg-[var(--border)] text-text-tertiary",
  ai: "bg-accent-muted text-accent",
  semi: "bg-blue-muted text-blue",
};

const METHOD_LABEL: Record<GenerationMethod, string> = {
  deterministic: "Auto",
  ai: "AI",
  semi: "Semi",
};

const STATE_DOT: Record<ReviewState, string> = {
  unreviewed: "bg-[var(--border-hover)]",
  reviewed: "bg-success",
  edited: "bg-warning",
};

const STATE_LABEL: Record<ReviewState, string> = {
  unreviewed: "Not yet reviewed",
  reviewed: "Reviewed",
  edited: "Edited",
};

export interface ProposalSidebarProps {
  selectedSection: number;
  onSelect: (id: number) => void;
  reviewedSections: Set<number>;
  editedSections: Set<number>;
}

export function ProposalSidebar({
  selectedSection,
  onSelect,
  reviewedSections,
  editedSections,
}: ProposalSidebarProps) {
  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-r border-[var(--border)] bg-bg-card">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Sections</h2>
        <p className="mt-0.5 text-xs text-text-tertiary">
          {reviewedSections.size} of {PROPOSAL_SECTIONS.length} reviewed
        </p>
      </div>
      <nav className="p-2">
        {PROPOSAL_SECTIONS.map((s) => {
          const state: ReviewState = editedSections.has(s.id)
            ? "edited"
            : reviewedSections.has(s.id)
              ? "reviewed"
              : "unreviewed";
          const isActive = s.id === selectedSection;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={cn(
                "group flex w-full items-start gap-2 rounded-button border-l-2 px-3 py-2 text-left text-sm transition-colors",
                isActive
                  ? "border-accent bg-accent-muted text-text-primary"
                  : "border-transparent text-text-secondary hover:bg-[var(--bg-elevated)] hover:text-text-primary",
              )}
            >
              <span className="mt-0.5 w-5 shrink-0 font-mono text-xs text-text-tertiary">
                {s.id}.
              </span>
              <span className="flex-1 leading-snug">{s.title}</span>
              <span className="flex shrink-0 flex-col items-end gap-1.5">
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    METHOD_BADGE[s.generationMethod],
                  )}
                >
                  {s.generationMethod === "ai" && <Sparkles size={9} />}
                  {METHOD_LABEL[s.generationMethod]}
                </span>
                <span
                  title={STATE_LABEL[state]}
                  className={cn("h-2 w-2 rounded-full", STATE_DOT[state])}
                />
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
