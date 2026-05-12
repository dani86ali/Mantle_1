"use client";

import { Calendar } from "lucide-react";
import type { DeadlineRow } from "./types";

export function DeadlinesSection({ deadlines }: { deadlines: DeadlineRow[] }) {
  if (deadlines.length === 0) {
    return <p className="text-sm text-text-tertiary">No deadlines detected.</p>;
  }
  return (
    <ol className="relative space-y-3 border-l border-[var(--border)] pl-5">
      {deadlines.map((d, i) => (
        <li key={`${d.event}-${i}`} className="relative">
          <span className="absolute -left-[1.6rem] mt-1 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border)] bg-bg-primary text-accent">
            <Calendar size={10} />
          </span>
          <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
            <span className="font-mono text-xs text-accent">{d.deadline}</span>
            <span className="font-medium text-text-primary">{d.event}</span>
            <span className="ml-auto font-mono text-xs text-text-tertiary">{d.source}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
