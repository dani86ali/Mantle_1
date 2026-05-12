"use client";

import { Badge } from "./common";
import type { SectorView } from "./types";

export function SectorDetectionSection({ data }: { data: SectorView }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-text-tertiary">Sector:</span>
        <Badge tone="bg-accent-muted text-accent">{data.sector.replace(/_/g, " ")}</Badge>
        <span className="text-text-tertiary">Confidence:</span>
        <span className="font-mono text-text-primary">
          {(data.confidence * 100).toFixed(0)}%
        </span>
        <span className="text-text-tertiary">Method:</span>
        <span className="font-mono text-xs text-text-secondary">
          {data.method.replace(/_/g, " ")}
        </span>
      </div>
      {data.evidence && (
        <p className="rounded-card border border-[var(--border)] bg-bg-primary p-3 text-xs text-text-secondary">
          {data.evidence}
        </p>
      )}
    </div>
  );
}
