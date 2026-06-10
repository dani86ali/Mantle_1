"use client";

/**
 * Shared presentational + controlled-string helpers for the Quick BoM workspace page
 * and its extracted line-review panels (SKU resolution, configuration expansion).
 *
 * Pure UI and string helpers only - no fetching, no workflow logic, no artifact
 * payload dependence. Extracted so the page and the panels share one definition of the
 * button classes, the status badge, the humanize helper, the controlled-error reader,
 * and the optional-note prompt instead of duplicating them across files.
 */

import type { ReactNode } from "react";

export const APPROVE_BTN =
  "rounded-button bg-accent px-3 py-1 text-xs font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50";
export const REJECT_BTN =
  "rounded-button border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive-muted disabled:opacity-50";

const STATUS_BADGE: Record<string, string> = {
  approved: "bg-success-muted text-success",
  needs_review: "bg-accent-muted text-accent",
  generated: "bg-blue-muted text-blue",
  available: "bg-blue-muted text-blue",
  rejected: "bg-destructive-muted text-destructive",
  stale: "bg-warning-muted text-warning",
  failed: "bg-destructive-muted text-destructive",
};

export function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

/** Controlled error/code string from a parsed API body, else null. No stacks. */
export function bodyMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string" && record.error !== "") return record.error;
  if (typeof record.code === "string" && record.code !== "") return record.code;
  return null;
}

export function promptNote(): string | undefined {
  const entered = window.prompt("Add an optional note for this rejection:");
  const trimmed = entered === null ? "" : entered.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? "bg-[var(--border)] text-text-tertiary";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {humanize(status)}
    </span>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-[var(--border)] bg-bg-card p-5">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}
