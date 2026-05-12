"use client";

import { useState } from "react";
import { Badge, RISK_CAT_BADGE } from "./common";
import type { RiskFlagRow } from "./types";

const TRUNCATE_AT = 140;

export function RiskFlagsSection({ flags }: { flags: RiskFlagRow[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (flags.length === 0) {
    return <p className="text-sm text-text-tertiary">No risk flags detected.</p>;
  }

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {flags.map((f, i) => {
        const isLong = f.matchedText.length > TRUNCATE_AT;
        const isOpen = expanded.has(i);
        const display = !isLong || isOpen
          ? f.matchedText
          : f.matchedText.slice(0, TRUNCATE_AT) + "…";
        return (
          <div
            key={`${f.pattern}-${i}`}
            className="rounded-card border border-[var(--border)] bg-bg-primary p-3"
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge tone={RISK_CAT_BADGE[f.category]}>{f.category}</Badge>
              <span className="font-mono text-xs text-text-tertiary">{f.pattern}</span>
              <span className="ml-auto font-mono text-xs text-text-tertiary">{f.source}</span>
            </div>
            <p className="text-sm text-text-secondary">&ldquo;{display}&rdquo;</p>
            {isLong && (
              <button
                onClick={() => toggle(i)}
                className="mt-1 text-xs text-accent hover:underline"
              >
                {isOpen ? "Collapse" : "Show full"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
