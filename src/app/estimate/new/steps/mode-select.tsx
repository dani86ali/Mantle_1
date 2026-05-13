"use client";

import { FileStack, MessageSquare, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardMode } from "../types";

interface ModeCard {
  id: WizardMode;
  title: string;
  icon: LucideIcon;
  description: string;
  disabled?: boolean;
}

const MODES: ModeCard[] = [
  {
    id: "rfp",
    title: "RFP Response",
    icon: FileStack,
    description:
      "Upload an RFP package for full analysis — requirements, compliance, BoM, proposal",
  },
  {
    id: "quick_bom",
    title: "Quick BoM",
    icon: Zap,
    description: "Upload or paste an existing BoM for pricing and validation",
  },
  {
    id: "rfi",
    title: "RFI / Proactive",
    icon: MessageSquare,
    description: "Build from discovery questionnaire",
  },
];

interface Props {
  onSelect: (mode: WizardMode) => void;
}

export default function ModeSelect({ onSelect }: Props) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary">
        How are you starting?
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Pick the workflow that matches your input.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              disabled={m.disabled}
              onClick={() => !m.disabled && onSelect(m.id)}
              className={cn(
                "relative flex flex-col items-start rounded-card border border-[var(--border)] bg-bg-card p-5 text-left transition-colors",
                m.disabled
                  ? "cursor-not-allowed opacity-60"
                  : "hover:border-accent hover:bg-bg-primary"
              )}
            >
              {m.disabled && (
                <span className="absolute right-3 top-3 rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
                  Coming soon
                </span>
              )}
              <div className="flex h-10 w-10 items-center justify-center rounded-card bg-accent-muted text-accent">
                <Icon size={20} />
              </div>
              <h3 className="mt-4 font-semibold text-text-primary">
                {m.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                {m.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
