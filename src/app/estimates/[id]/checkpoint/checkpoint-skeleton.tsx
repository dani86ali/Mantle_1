"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function CheckpointSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full">
      <div className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card md:block" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
          <Link
            href={`/estimates/${id}`}
            className="flex items-center gap-1 text-xs text-text-tertiary"
          >
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <div className="skeleton h-6 w-32" />
            <div className="skeleton h-5 w-20 rounded-full" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-5xl space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-card border border-[var(--border)] bg-bg-card p-5"
              >
                <div className="skeleton mb-3 h-4 w-40" />
                <div className="skeleton h-24 w-full" />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
