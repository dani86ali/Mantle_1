"use client";

import { cn } from "@/lib/utils";

export type Status =
  | "Compliant"
  | "Partially Compliant"
  | "Non-Compliant"
  | "Alternative Proposed";

export const STATUS_OPTIONS: Status[] = [
  "Compliant",
  "Partially Compliant",
  "Non-Compliant",
  "Alternative Proposed",
];

export interface EditableRow {
  key: string;
  requirementId: string;
  requirementText: string;
  frameworkId: string;
  controlId: string;
  controlName: string;
  status: Status;
  notes: string;
  tpSection: string;
}

export interface CoverageGap {
  frameworkId: string;
  controlId: string;
  controlName: string;
}

export interface OrphanRequirement {
  requirementId: string;
  requirementText: string;
}

export interface Stats {
  compliant: number;
  partial: number;
  nonCompliant: number;
  alternative: number;
}

export const STATUS_TONE: Record<Status, string> = {
  Compliant: "bg-success-muted text-success border-success/30",
  "Partially Compliant": "bg-warning-muted text-warning border-warning/30",
  "Non-Compliant": "bg-destructive-muted text-destructive border-destructive/30",
  "Alternative Proposed": "bg-blue-muted text-blue border-blue/30",
};

export function StatsBar({ stats }: { stats: Stats }) {
  const total =
    stats.compliant + stats.partial + stats.nonCompliant + stats.alternative;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatBadge label="Compliant" value={stats.compliant} tone={STATUS_TONE.Compliant} />
      <StatBadge label="Partially Compliant" value={stats.partial} tone={STATUS_TONE["Partially Compliant"]} />
      <StatBadge label="Non-Compliant" value={stats.nonCompliant} tone={STATUS_TONE["Non-Compliant"]} />
      <StatBadge label="Alternative Proposed" value={stats.alternative} tone={STATUS_TONE["Alternative Proposed"]} />
      <span className="ml-auto text-xs text-text-tertiary">
        {total} pair{total === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function StatBadge({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={cn("rounded-full border px-3 py-1 text-xs font-medium", tone)}>
      <span className="font-semibold">{value}</span>
      <span className="ml-1.5 opacity-80">{label}</span>
    </div>
  );
}

export { MatrixTable } from "./matrix-table";

export function GapAnalysis({
  coverageGaps,
  orphans,
}: {
  coverageGaps: CoverageGap[];
  orphans: OrphanRequirement[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">
          Coverage Gaps ({coverageGaps.length})
        </h4>
        {coverageGaps.length === 0 ? (
          <p className="text-sm text-text-tertiary">No framework controls without matches.</p>
        ) : (
          <ul className="space-y-2">
            {coverageGaps.map((g) => (
              <li
                key={`${g.frameworkId}#${g.controlId}`}
                className="rounded-card border border-warning/30 bg-warning-muted p-3"
              >
                <div className="flex flex-wrap items-baseline gap-2 text-xs">
                  <span className="font-mono font-semibold text-warning">{g.frameworkId}</span>
                  <span className="font-mono text-text-secondary">{g.controlId}</span>
                </div>
                <p className="mt-1 text-sm text-text-secondary">{g.controlName}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">
          Orphan Requirements ({orphans.length})
        </h4>
        {orphans.length === 0 ? (
          <p className="text-sm text-text-tertiary">All requirements matched a control.</p>
        ) : (
          <ul className="space-y-2">
            {orphans.map((o) => (
              <li
                key={o.requirementId}
                className="rounded-card border border-blue/30 bg-blue-muted p-3"
              >
                <div className="font-mono text-xs font-semibold text-blue">
                  {o.requirementId}
                </div>
                <p className="mt-1 line-clamp-3 text-sm text-text-secondary" title={o.requirementText}>
                  {o.requirementText}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
