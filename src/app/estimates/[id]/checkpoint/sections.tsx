"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Severity = "critical" | "high" | "medium" | "low";
type Classification = "mandatory" | "optional" | "conditional";

export interface ClassifiedFile {
  filename: string;
  path: string;
  type: string;
  subtype: string;
  confidence: number;
  format: string;
}

export interface RequirementRow {
  id: string;
  text: string;
  classification: Classification;
  confidence: number;
}

export interface RiskFlagRow {
  category: string;
  matchedText: string;
  severity: "critical" | "high" | "medium";
  source: string;
  pattern: string;
}

export interface DeadlineRow {
  event: string;
  deadline: string;
  source: string;
}

export interface MissingDocRow {
  referencedDoc: string;
  referencedIn: string;
  pattern: string;
  severity: Severity;
}

export function Card({
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={16} className="text-text-tertiary" /> : <ChevronRight size={16} className="text-text-tertiary" />}
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {subtitle && <span className="text-xs text-text-tertiary">{subtitle}</span>}
        </div>
      </button>
      {open && <div className="border-t border-[var(--border)] p-5">{children}</div>}
    </div>
  );
}

const SEV_BADGE: Record<Severity, string> = {
  critical: "bg-destructive-muted text-destructive",
  high: "bg-warning-muted text-warning",
  medium: "bg-blue-muted text-blue",
  low: "bg-[var(--border)] text-text-tertiary",
};

const CLASS_BADGE: Record<Classification, string> = {
  mandatory: "bg-accent-muted text-accent",
  optional: "bg-blue-muted text-blue",
  conditional: "bg-warning-muted text-warning",
};

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tone)}>{children}</span>
  );
}

export function FileClassificationsSection({ files }: { files: ClassifiedFile[] }) {
  if (files.length === 0) {
    return <p className="text-sm text-text-tertiary">No files classified.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-text-tertiary">
            <th className="py-2 pr-3 font-medium">Filename</th>
            <th className="py-2 pr-3 font-medium">Type</th>
            <th className="py-2 pr-3 font-medium">Confidence</th>
            <th className="py-2 pr-3 font-medium">Format</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f, i) => (
            <tr
              key={`${f.path}-${i}`}
              className={cn(
                "border-b border-[var(--border)]",
                f.confidence < 0.7 && "bg-[var(--warning-muted)]"
              )}
            >
              <td className="py-2 pr-3 font-mono text-xs text-text-primary">{f.filename}</td>
              <td className="py-2 pr-3 text-text-secondary">
                {f.type}
                <span className="text-text-tertiary"> / {f.subtype}</span>
              </td>
              <td className="py-2 pr-3 font-mono text-text-secondary">
                {(f.confidence * 100).toFixed(0)}%
              </td>
              <td className="py-2 pr-3 text-text-tertiary">{f.format}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RequirementsSection({ requirements }: { requirements: RequirementRow[] }) {
  const [sortByClass, setSortByClass] = useState(false);
  const stats = {
    total: requirements.length,
    mandatory: requirements.filter((r) => r.classification === "mandatory").length,
    optional: requirements.filter((r) => r.classification === "optional").length,
    conditional: requirements.filter((r) => r.classification === "conditional").length,
  };
  const order: Record<Classification, number> = { mandatory: 0, conditional: 1, optional: 2 };
  const rows = sortByClass
    ? [...requirements].sort((a, b) => order[a.classification] - order[b.classification])
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
                <th className="py-2 pr-3 font-medium">Classification</th>
                <th className="py-2 pr-3 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] align-top">
                  <td className="py-2 pr-3 font-mono text-xs text-text-tertiary">{r.id}</td>
                  <td className="max-w-md truncate py-2 pr-3 text-text-secondary" title={r.text}>
                    {r.text}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={CLASS_BADGE[r.classification]}>{r.classification}</Badge>
                  </td>
                  <td className="py-2 pr-3 font-mono text-text-secondary">
                    {(r.confidence * 100).toFixed(0)}%
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

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn("text-base font-semibold", tone ?? "text-text-primary")}>{value}</span>
      <span className="text-text-tertiary">{label}</span>
    </div>
  );
}

export function RiskFlagsSection({
  flags,
  deadlines,
}: {
  flags: RiskFlagRow[];
  deadlines: DeadlineRow[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">
          Risk Flags ({flags.length})
        </h4>
        {flags.length === 0 ? (
          <p className="text-sm text-text-tertiary">No risk flags detected.</p>
        ) : (
          <div className="space-y-2">
            {flags.map((f, i) => (
              <div
                key={`${f.pattern}-${i}`}
                className="rounded-card border border-[var(--border)] bg-bg-primary p-3"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone={SEV_BADGE[f.severity]}>{f.severity}</Badge>
                  <span className="text-xs text-text-tertiary">{f.category}</span>
                  <span className="ml-auto font-mono text-xs text-text-tertiary">{f.source}</span>
                </div>
                <p className="text-sm text-text-secondary">&ldquo;{f.matchedText}&rdquo;</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">
          Deadlines ({deadlines.length})
        </h4>
        {deadlines.length === 0 ? (
          <p className="text-sm text-text-tertiary">No deadlines detected.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {deadlines.map((d, i) => (
              <li
                key={`${d.event}-${i}`}
                className="flex flex-wrap items-baseline gap-x-3 text-text-secondary"
              >
                <span className="font-medium text-text-primary">{d.event}</span>
                <span className="font-mono text-xs text-accent">{d.deadline}</span>
                <span className="ml-auto font-mono text-xs text-text-tertiary">{d.source}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function MissingDocsSection({ docs }: { docs: MissingDocRow[] }) {
  if (docs.length === 0) {
    return <p className="text-sm text-text-tertiary">No missing documents detected.</p>;
  }
  return (
    <ul className="space-y-2">
      {docs.map((d, i) => (
        <li
          key={`${d.referencedDoc}-${i}`}
          className={cn(
            "rounded-card border border-[var(--border)] bg-bg-primary p-3",
            d.severity === "critical" && "bg-destructive-muted"
          )}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone={SEV_BADGE[d.severity]}>{d.severity}</Badge>
            <span className="text-sm font-medium text-text-primary">{d.referencedDoc}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-text-tertiary">
            <span>
              Referenced in: <span className="font-mono text-text-secondary">{d.referencedIn}</span>
            </span>
            <span>
              Pattern: <span className="font-mono text-text-secondary">{d.pattern}</span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
