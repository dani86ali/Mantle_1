"use client";

import { cn } from "@/lib/utils";
import type { ProfitMode, WizardState } from "../types";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}

export default function PricingDefaults({ state, update }: Props) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary">
        Pricing defaults
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        These can be adjusted later on the Pricing page.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label="FX rate (USD → local)"
          value={state.fxRate}
          step={0.01}
          min={0}
          onChange={(v) => update({ fxRate: v })}
        />
        <NumberField
          label="Partner discount"
          value={state.partnerDiscountPct}
          step={0.5}
          min={0}
          max={100}
          suffix="%"
          onChange={(v) => update({ partnerDiscountPct: v })}
        />
        <NumberField
          label="Deal-reg discount"
          value={state.dealRegDiscountPct}
          step={0.5}
          min={0}
          max={100}
          suffix="%"
          onChange={(v) => update({ dealRegDiscountPct: v })}
        />
        <NumberField
          label="VAT"
          value={state.vatRate}
          step={0.5}
          min={0}
          max={100}
          suffix="%"
          onChange={(v) => update({ vatRate: v })}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Profit mode
          </label>
          <div className="flex rounded-button border border-[var(--border)] bg-bg-primary p-0.5">
            {(["margin", "markup"] as ProfitMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => update({ profitMode: m })}
                className={cn(
                  "flex-1 rounded-[4px] px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                  state.profitMode === m
                    ? "bg-accent-muted text-accent"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <NumberField
          label={state.profitMode === "margin" ? "Profit margin" : "Markup"}
          value={state.profitPct}
          step={0.5}
          min={0}
          max={100}
          suffix="%"
          onChange={(v) => update({ profitPct: v })}
        />
      </div>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  suffix?: string;
  onChange: (v: number) => void;
}

function NumberField({
  label,
  value,
  step,
  min,
  max,
  suffix,
  onChange,
}: NumberFieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-text-secondary">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className="form-input pr-10"
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-text-tertiary">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
