"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import type { LLDSection } from "@/engines/e5/types";

export function LLDDocumentTab({ sections, lldDocxPath, onDownload }: {
  sections: LLDSection[] | null;
  lldDocxPath: string | null;
  onDownload: (t: "lld") => void;
}) {
  if (!sections || sections.length === 0) {
    return <p className="text-sm text-text-tertiary">LLD not generated yet.</p>;
  }
  return (
    <div className="space-y-3">
      <button onClick={() => onDownload("lld")} disabled={!lldDocxPath}
        className="flex items-center gap-1.5 rounded-button border border-[var(--border)] px-3 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50">
        <FileText size={14} /> Download LLD
      </button>
      <div className="space-y-2">
        {sections.map((s) => <SectionCard key={s.sectionNumber} section={s} />)}
      </div>
    </div>
  );
}

function SectionCard({ section }: { section: LLDSection }) {
  const [open, setOpen] = useState(false);
  const preview = section.content.length > 120 ? `${section.content.slice(0, 120)}…` : section.content;
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3 text-left">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={16} className="text-text-tertiary" /> : <ChevronRight size={16} className="text-text-tertiary" />}
          <span className="font-mono text-xs text-text-tertiary">§{section.sectionNumber}</span>
          <h3 className="text-sm font-semibold text-text-primary">{section.title}</h3>
        </div>
      </button>
      {open ? (
        <div className="whitespace-pre-wrap border-t border-[var(--border)] p-5 text-sm text-text-secondary">
          {section.content}
        </div>
      ) : (
        <p className="px-5 pb-3 text-xs text-text-tertiary">{preview}</p>
      )}
    </div>
  );
}
