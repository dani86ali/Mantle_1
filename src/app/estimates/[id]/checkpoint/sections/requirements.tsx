"use client";

import { useState } from "react";
import { Badge, Stat, CLASS_BADGE } from "./common";
import type { Classification, RequirementRow, RequirementStats } from "./types";

const CLASS_OPTIONS: Classification[] = ["mandatory", "optional", "conditional"];

export function RequirementsSection({
  requirements,
  stats,
  overrides,
  onOverride,
}: {
  requirements: RequirementRow[];
  stats: RequirementStats;
  overrides: Record<string, Classification>;
  onOverride: (id: string, value: Classification) => void;
}) {
  const [sortByClass, setSortByClass] = useState(false);
  const order: Record<Classification, number> = {
    mandatory: 0,
    conditional: 1,
    optional: 2,
  };
  const rows = sortByClass
    ? [...requirements].sort(
        (a, b) =>
          order[overrides[a.id] ?? a.classification] -
          order[overrides[b.id] ?? b.classification],
      )
    : requirements;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <Stat label="Total" value={stats.total} />
        <Stat label="Mandatory" value={stats.mandatory} tone="text-accent" />
        <Stat label="Optional" value={stats.optional} tone="text-blue" />
        <Stat label="Conditional" value={stats.conditional} tone="text-warning" />
        <button
          onClick={() => setSortByClass(!sortByClass)}
          className="ml-auto rounded-button border border-[var(--border)] px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
        >
          {sortByClass ? "Reset order" : "Sort by classification"}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-tertiary">No requirements extracted.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-text-tertiary">
                <th className="py-2 pr-3 font-medium">ID</th>
                <th className="py-2 pr-3 font-medium">Text</th>
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Classification</th>
                <th className="py-2 pr-3 font-medium">Conf.</th>
                <th className="py-2 pr-3 font-medium">Override</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const current = overrides[r.id] ?? r.classification;
                return (
                  <tr key={r.id} className="border-b border-[var(--border)] align-top">
                    <td className="py-2 pr-3 font-mono text-xs text-text-tertiary">
                      {r.id}
                    </td>
                    <td className="max-w-md py-2 pr-3 text-text-secondary">
                      <p className="line-clamp-2" title={r.text}>
                        {r.text}
                      </p>
                      {r.indicators.length > 0 && (
                        <p className="mt-1 font-mono text-xs text-text-tertiary">
                          {r.indicators.slice(0, 3).join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-text-tertiary">
                      {r.sourceFile}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={CLASS_BADGE[current]}>{current}</Badge>
                    </td>
                    <td className="py-2 pr-3 font-mono text-text-secondary">
                      {(r.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={current}
                        onChange={(e) =>
                          onOverride(r.id, e.target.value as Classification)
                        }
                        className="rounded-button border border-[var(--border)] bg-bg-primary px-2 py-1 text-xs text-text-secondary hover:border-[var(--border-hover)]"
                      >
                        {CLASS_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
