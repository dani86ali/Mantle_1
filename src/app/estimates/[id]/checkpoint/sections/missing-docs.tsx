"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, DOC_SEV_BADGE } from "./common";
import type { MissingDocRow } from "./types";

export function MissingDocsSection({
  docs,
  estimateId,
}: {
  docs: MissingDocRow[];
  estimateId: string;
}) {
  if (docs.length === 0) {
    return <p className="text-sm text-text-tertiary">No missing documents detected.</p>;
  }
  return (
    <ul className="space-y-2">
      {docs.map((d, i) => (
        <li
          key={`${d.referencedDoc}-${i}`}
          className="rounded-card border border-[var(--border)] bg-bg-primary p-3"
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone={DOC_SEV_BADGE[d.severity]}>{d.severity}</Badge>
            <span className="text-sm font-medium text-text-primary">{d.referencedDoc}</span>
            <Link
              href={`/estimates/${estimateId}/clarifications`}
              className="ml-auto flex items-center gap-1 text-xs text-accent hover:underline"
            >
              Ask in clarifications <ArrowRight size={12} />
            </Link>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-text-tertiary">
            <span>
              Referenced in:{" "}
              <span className="font-mono text-text-secondary">{d.referencedIn}</span>
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
