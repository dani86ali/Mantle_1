"use client";

import type { DesignApproach } from "@/engines/e5/types";

export function DesignApproachTab({ approach, topology }: {
  approach: DesignApproach | null;
  topology: string | null;
}) {
  if (!approach) return <p className="text-sm text-text-tertiary">No design approach yet.</p>;
  const pattern = (approach.topologyPattern ?? topology ?? "—").replace(/_/g, " ");
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
      <h3 className="text-sm font-semibold text-text-primary">Design Approach</h3>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Row k="Methodology" v={approach.methodology} />
        <Row k="Approach" v={approach.approach.replace(/_/g, " ")} />
        <Row k="Vendor" v={approach.vendor} />
        <Row k="Project Type" v={approach.projectType} />
        <Row k="Topology Pattern" v={pattern} />
      </dl>
      <div className="mt-3">
        <p className="text-xs text-text-tertiary">Frameworks</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {approach.frameworks.map((f) => (
            <span key={f} className="rounded-full bg-blue-muted px-2 py-0.5 text-xs text-blue">
              {f.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-text-tertiary">{k}</dt>
      <dd className="text-text-primary">{v}</dd>
    </div>
  );
}
