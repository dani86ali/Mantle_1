import { MessageSquare } from "lucide-react";

const STARTERS = [
  "2x C9300L-24UXG switches, DNA Advantage, stacking, Saudi Arabia",
  "8x C9120AX external antenna APs, no DNA",
  "Look up SKU C9300-48P-A",
  "Validate my BoM (I'll upload a CSV)",
];

export function EmptyState({ onSelect }: { onSelect: (p: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-muted">
        <MessageSquare size={20} className="text-accent" />
      </div>
      <p className="mt-3 text-sm font-medium text-text-primary">How can I help?</p>
      <p className="mt-1 text-xs text-text-tertiary">
        Describe requirements, upload a BoM, or ask about any Cisco SKU
      </p>
      <div className="mt-5 w-full space-y-1.5">
        {STARTERS.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            className="w-full rounded-lg border border-[var(--border)] bg-bg-card px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:border-[var(--border-hover)] hover:text-text-primary"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
