"use client";

import { Lock } from "lucide-react";

interface ComingSoonProps {
  phase: string;
  title: string;
  description: string;
  features?: { name: string; description: string }[];
}

export function ComingSoon({ phase, title, description, features }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1a1a22] text-text-tertiary">
        <Lock size={28} />
      </div>
      <span className="mt-4 rounded-full bg-accent-muted px-3 py-1 text-xs font-medium text-accent">
        {phase}
      </span>
      <h2 className="mt-3 text-xl font-semibold text-text-primary">{title}</h2>
      <p className="mt-2 max-w-md text-center text-sm text-text-secondary">
        {description}
      </p>
      {features && features.length > 0 && (
        <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.name}
              className="rounded-card border border-[#1e1e2a] bg-bg-card p-4"
            >
              <h3 className="text-sm font-medium text-text-primary">{f.name}</h3>
              <p className="mt-1 text-xs text-text-tertiary">{f.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
