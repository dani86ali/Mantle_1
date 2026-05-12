"use client";

import { cn } from "@/lib/utils";
import type { ClassifiedFile, FileType } from "./types";

const TYPE_OPTIONS: FileType[] = [
  "technical",
  "commercial",
  "legal",
  "administrative",
  "compliance",
  "unknown",
];

export function FileClassificationsSection({
  files,
  overrides,
  onOverride,
}: {
  files: ClassifiedFile[];
  overrides: Record<string, FileType>;
  onOverride: (path: string, value: FileType) => void;
}) {
  if (files.length === 0) {
    return <p className="text-sm text-text-tertiary">No files classified.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-text-tertiary">
            <th className="py-2 pr-3 font-medium">Filename</th>
            <th className="py-2 pr-3 font-medium">Type / Subtype</th>
            <th className="py-2 pr-3 font-medium">Confidence</th>
            <th className="py-2 pr-3 font-medium">Format</th>
            <th className="py-2 pr-3 font-medium">Override</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f, i) => {
            const lowConf = f.confidence < 0.7;
            const current = overrides[f.path] ?? f.type;
            return (
              <tr
                key={`${f.path}-${i}`}
                className={cn(
                  "border-b border-[var(--border)]",
                  lowConf && "bg-warning-muted/40",
                )}
              >
                <td className="py-2 pr-3 font-mono text-xs text-text-primary">
                  {f.filename}
                </td>
                <td className="py-2 pr-3 text-text-secondary">
                  {f.type}
                  <span className="text-text-tertiary"> / {f.subtype}</span>
                </td>
                <td
                  className={cn(
                    "py-2 pr-3 font-mono",
                    lowConf ? "text-warning" : "text-text-secondary",
                  )}
                >
                  {(f.confidence * 100).toFixed(0)}%
                </td>
                <td className="py-2 pr-3 text-text-tertiary">{f.format}</td>
                <td className="py-2 pr-3">
                  <select
                    value={current}
                    onChange={(e) => onOverride(f.path, e.target.value as FileType)}
                    className="rounded-button border border-[var(--border)] bg-bg-primary px-2 py-1 text-xs text-text-secondary hover:border-[var(--border-hover)]"
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
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
  );
}
