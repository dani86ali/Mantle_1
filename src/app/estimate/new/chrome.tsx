"use client";

import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export const STEPS = ["Mode", "Input", "Details", "Pricing"] as const;

export function StepIndicator({ current }: { current: number }) {
  return (
    <div className="border-b border-[var(--border)] bg-bg-primary px-6 py-4">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const status: "done" | "current" | "future" =
            n < current ? "done" : n === current ? "current" : "future";
          return (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                    status === "done" && "bg-success text-white",
                    status === "current" && "bg-accent text-white",
                    status === "future" && "bg-bg-elevated text-text-tertiary"
                  )}
                >
                  {n}
                </div>
                <span
                  className={cn(
                    "hidden text-xs font-medium sm:inline",
                    status === "current"
                      ? "text-text-primary"
                      : "text-text-secondary"
                  )}
                >
                  {label}
                </span>
              </div>
              {n < STEPS.length && (
                <div
                  className={cn(
                    "mx-3 h-px flex-1",
                    status === "done" ? "bg-success" : "bg-[var(--border)]"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ActionBarProps {
  isFinal: boolean;
  submitting: boolean;
  error: string | null;
  canProceed: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function ActionBar({
  isFinal,
  submitting,
  error,
  canProceed,
  onBack,
  onNext,
}: ActionBarProps) {
  return (
    <div className="border-t border-[var(--border)] bg-bg-primary px-6 py-3">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex items-center gap-1 rounded-button border border-[var(--border)] px-4 py-2 text-sm text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
        >
          <ChevronLeft size={14} /> Back
        </button>
        {error && (
          <div className="flex-1 rounded-card border border-destructive/30 bg-destructive-muted px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed || submitting}
          className="rounded-button bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40"
        >
          {isFinal
            ? submitting
              ? "Submitting..."
              : "Create Estimate"
            : "Continue"}
        </button>
      </div>
    </div>
  );
}
