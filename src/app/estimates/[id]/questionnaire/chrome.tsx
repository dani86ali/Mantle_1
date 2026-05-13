"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EstimateSubNav } from "../hub-components";
import type { NavItem } from "../hub-mappers";

export function Shell({
  id,
  navItems,
  title,
  headerExtras,
  children,
}: {
  id: string;
  navItems: NavItem[];
  title: string;
  headerExtras?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full">
      <EstimateSubNav items={navItems} activeHref={`/estimates/${id}/questionnaire`} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-4 py-4 sm:px-6">
          <Link
            href={`/estimates/${id}`}
            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
          >
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-lg font-semibold text-text-primary">
              {id.slice(0, 12).toUpperCase()}
            </h1>
            <span className="text-sm text-text-secondary">— {title}</span>
            {headerExtras}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function QuestionnaireSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full">
      <div className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card md:block" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
          <Link href={`/estimates/${id}`} className="flex items-center gap-1 text-xs text-text-tertiary">
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="skeleton mt-2 h-6 w-64" />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24 w-full rounded-card" />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

export function EmptyState({
  message,
  description,
  ctaLabel,
  busy,
  onCta,
  error,
}: {
  message: string;
  description: string;
  ctaLabel: string;
  busy: boolean;
  onCta: () => void;
  error?: string | null;
}) {
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card p-8 text-center">
      <h2 className="text-base font-semibold text-text-primary">{message}</h2>
      <p className="mt-2 text-sm text-text-secondary">{description}</p>
      <button
        onClick={onCta}
        disabled={busy}
        className="mt-4 rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? "Working…" : ctaLabel}
      </button>
      {error && (
        <div className="mt-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
