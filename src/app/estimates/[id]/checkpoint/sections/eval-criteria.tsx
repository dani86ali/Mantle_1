"use client";

import { Badge, METHOD_BADGE } from "./common";
import type { EvalCriteriaView } from "./types";

export function EvalCriteriaSection({ data }: { data: EvalCriteriaView }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-text-tertiary">Methodology:</span>
        <Badge tone={METHOD_BADGE[data.methodology]}>
          {data.methodology.replace(/_/g, " ")}
        </Badge>
        {data.passingThreshold != null && (
          <>
            <span className="text-text-tertiary">Passing threshold:</span>
            <span className="font-mono text-text-primary">{data.passingThreshold}%</span>
          </>
        )}
        <span className="text-text-tertiary">IKTVA:</span>
        <Badge
          tone={
            data.iktvaRequired
              ? "bg-warning-muted text-warning"
              : "bg-[var(--border)] text-text-tertiary"
          }
        >
          {data.iktvaRequired ? "required" : "not required"}
        </Badge>
        {data.source && (
          <span className="ml-auto font-mono text-xs text-text-tertiary">{data.source}</span>
        )}
      </div>

      {data.envelopes.length === 0 ? (
        <p className="text-sm text-text-tertiary">No envelopes detected.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-text-tertiary">
                <th className="py-2 pr-3 font-medium">Envelope</th>
                <th className="py-2 pr-3 font-medium">Weight</th>
                <th className="py-2 pr-3 font-medium">Pass threshold</th>
              </tr>
            </thead>
            <tbody>
              {data.envelopes.map((e, i) => (
                <tr key={`${e.name}-${i}`} className="border-b border-[var(--border)]">
                  <td className="py-2 pr-3 text-text-primary">{e.name}</td>
                  <td className="py-2 pr-3 font-mono text-text-secondary">{e.weight}%</td>
                  <td className="py-2 pr-3 font-mono text-text-secondary">
                    {e.passThreshold}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
