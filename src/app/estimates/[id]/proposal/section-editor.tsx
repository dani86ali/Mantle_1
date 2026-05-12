"use client";

import { Info, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROPOSAL_SECTIONS,
  type GenerationMethod,
  type ProposalSection,
} from "@/engines/e3/types";

const METHOD_BADGE: Record<GenerationMethod, string> = {
  deterministic: "bg-[var(--border)] text-text-tertiary",
  ai: "bg-accent-muted text-accent",
  semi: "bg-blue-muted text-blue",
};

const METHOD_LABEL: Record<GenerationMethod, string> = {
  deterministic: "Deterministic",
  ai: "AI-Generated",
  semi: "Semi-Generated",
};

const READ_ONLY_HINT: Record<number, string> = {
  0: "Cover page is generated from your customer and project metadata.",
  3: "Generated from extracted requirements. Edit on the Requirements page.",
  5: "Generated from the BoM. Edit specs on the BoM Review page.",
  7: "Generated from your service catalog and selected support tier.",
  8: "Generated from BoM pricing. Adjust on the Pricing page.",
  10: "Generated from the compliance matrix. Edit on the Compliance page.",
  11: "Generated from your reference library.",
  12: "Generated from your tenant profile.",
  13: "Auto-assembled from supporting artifacts (BoM, datasheets, financial workbook).",
  14: "Generated from your tenant profile.",
};

export interface SectionEditorProps {
  section: ProposalSection | null;
  selectedId: number;
  edited: string | null;
  reviewed: boolean;
  onChange: (id: number, content: string) => void;
  onRevert: (id: number) => void;
  onToggleReviewed: (id: number, next: boolean) => void;
  onRegenerate: (id: number) => void;
}

export function SectionEditor({
  section,
  selectedId,
  edited,
  reviewed,
  onChange,
  onRevert,
  onToggleReviewed,
  onRegenerate,
}: SectionEditorProps) {
  const spec = PROPOSAL_SECTIONS.find((s) => s.id === selectedId);
  if (!spec) return null;

  const method = spec.generationMethod;
  const isEditable = method !== "deterministic";
  const baseContent = section?.content ?? "";
  const displayedContent = edited ?? baseContent;
  const isModified = edited !== null && edited !== baseContent;
  const hint = READ_ONLY_HINT[selectedId];

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] bg-bg-primary px-6 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-text-tertiary">
              Section {spec.id}
            </span>
            <h2 className="text-base font-semibold text-text-primary">
              {spec.title}
            </h2>
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                METHOD_BADGE[method],
              )}
            >
              {method === "ai" && <Sparkles size={10} />}
              {METHOD_LABEL[method]}
            </span>
            {isModified && (
              <span className="rounded-full bg-warning-muted px-2 py-0.5 text-xs font-medium text-warning">
                Modified
              </span>
            )}
            {isModified && (
              <button
                type="button"
                onClick={() => onRevert(selectedId)}
                className="flex items-center gap-1 text-xs text-text-tertiary hover:text-accent"
              >
                <RotateCcw size={11} /> Revert to original
              </button>
            )}
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => onToggleReviewed(selectedId, e.target.checked)}
            className="h-4 w-4 rounded border-[var(--border)] text-accent focus:ring-accent"
          />
          Mark as reviewed
        </label>
      </header>

      <div className="flex-1 overflow-y-auto bg-bg-primary p-6">
        {(method === "ai" || method === "semi") && (
          <div className="mb-4 flex items-start gap-2 rounded-card border border-accent/20 bg-accent-muted p-3 text-sm text-text-secondary">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-accent" />
            <p>
              AI-generated content — review carefully and edit as needed.
              Final formatting (diagrams, tables, branding) happens in Word.
            </p>
          </div>
        )}

        {!isEditable && hint && (
          <div className="mb-4 flex items-start gap-2 rounded-card border border-[var(--border)] bg-bg-card p-3 text-sm text-text-secondary">
            <Info size={16} className="mt-0.5 shrink-0 text-text-tertiary" />
            <p>{hint}</p>
          </div>
        )}

        {section ? (
          isEditable ? (
            <textarea
              value={displayedContent}
              onChange={(e) => onChange(selectedId, e.target.value)}
              spellCheck
              className="min-h-[400px] w-full rounded-card border border-[var(--border)] bg-bg-primary p-4 font-mono text-sm leading-relaxed text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          ) : (
            <pre className="whitespace-pre-wrap rounded-card border border-[var(--border)] bg-bg-card p-4 font-mono text-sm leading-relaxed text-text-secondary">
              {displayedContent || "(empty)"}
            </pre>
          )
        ) : (
          <div className="rounded-card border border-dashed border-[var(--border)] bg-bg-card p-6 text-center text-sm text-text-tertiary">
            This section has not been generated yet.
          </div>
        )}

        {isEditable && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => onRegenerate(selectedId)}
              className="flex items-center gap-1.5 rounded-button border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary"
            >
              <Wand2 size={14} /> Regenerate this section
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
