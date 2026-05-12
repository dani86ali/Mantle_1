"use client";

import { cn } from "@/lib/utils";
import {
  convertCurrency,
  calculateSellingPrice,
} from "@/engines/e2/pricing-engine";

export interface PricingConfig {
  fxRate: number;
  partnerDiscountPct: number;
  dealRegDiscountPct: number;
  profitMode: "margin" | "markup";
  profitPct: number;
  vatRate: number;
  country: string;
}

export interface BomLineLite {
  sku: string;
  qty: number;
  unitListUsd: number;
  category: string;
}

const SAR = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

export const DEFAULT_CONFIG: PricingConfig = {
  fxRate: 3.75,
  partnerDiscountPct: 0.35,
  dealRegDiscountPct: 0.08,
  profitMode: "margin",
  profitPct: 0.18,
  vatRate: 0.15,
  country: "SA",
};

export interface FormErrors {
  fxRate?: string;
  partnerDiscountPct?: string;
  dealRegDiscountPct?: string;
  profitPct?: string;
  vatRate?: string;
  country?: string;
}

export function validate(cfg: PricingConfig): FormErrors {
  const e: FormErrors = {};
  if (!(cfg.fxRate > 0)) e.fxRate = "Must be greater than 0";
  if (cfg.partnerDiscountPct < 0 || cfg.partnerDiscountPct > 1)
    e.partnerDiscountPct = "Must be between 0 and 100%";
  if (cfg.dealRegDiscountPct < 0 || cfg.dealRegDiscountPct > 1)
    e.dealRegDiscountPct = "Must be between 0 and 100%";
  if (cfg.profitMode === "margin"
    ? cfg.profitPct < 0 || cfg.profitPct >= 1
    : cfg.profitPct < 0 || cfg.profitPct > 1)
    e.profitPct = cfg.profitMode === "margin"
      ? "Margin must be 0–99%"
      : "Must be between 0 and 100%";
  if (cfg.vatRate < 0 || cfg.vatRate > 1)
    e.vatRate = "Must be between 0 and 100%";
  if (!cfg.country.trim()) e.country = "Required";
  return e;
}

function PctField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  const display = Number.isFinite(props.value)
    ? (props.value * 100).toFixed(2).replace(/\.?0+$/, "")
    : "";
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-text-secondary">{props.label}</span>
      <div className="relative">
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={display}
          onChange={(e) => props.onChange(Number(e.target.value) / 100)}
          className="form-input pr-7"
        />
        <span className="pointer-events-none absolute right-3 top-2 text-sm text-text-tertiary">%</span>
      </div>
      {props.error && <p className="mt-1 text-xs text-destructive">{props.error}</p>}
    </label>
  );
}

export function PricingForm({
  config,
  errors,
  onChange,
}: {
  config: PricingConfig;
  errors: FormErrors;
  onChange: (cfg: PricingConfig) => void;
}) {
  const set = <K extends keyof PricingConfig>(k: K, v: PricingConfig[K]) =>
    onChange({ ...config, [k]: v });

  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-text-primary">Parameters</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-text-secondary">FX Rate SAR/USD</span>
          <input
            type="number"
            step="0.0001"
            min="0"
            value={Number.isFinite(config.fxRate) ? config.fxRate : ""}
            onChange={(e) => set("fxRate", Number(e.target.value))}
            className="form-input"
          />
          {errors.fxRate && <p className="mt-1 text-xs text-destructive">{errors.fxRate}</p>}
        </label>
        <PctField
          label="Partner Discount"
          value={config.partnerDiscountPct}
          onChange={(v) => set("partnerDiscountPct", v)}
          error={errors.partnerDiscountPct}
        />
        <PctField
          label="Deal Reg Discount"
          value={config.dealRegDiscountPct}
          onChange={(v) => set("dealRegDiscountPct", v)}
          error={errors.dealRegDiscountPct}
        />
        <div className="block">
          <span className="mb-1 block text-xs text-text-secondary">Profit Mode</span>
          <div className="inline-flex overflow-hidden rounded-button border border-[var(--border)]">
            {(["margin", "markup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set("profitMode", m)}
                className={cn(
                  "px-4 py-2 text-sm capitalize transition-colors",
                  config.profitMode === m
                    ? "bg-accent text-text-primary"
                    : "bg-bg-primary text-text-secondary hover:text-text-primary",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <PctField
          label="Profit"
          value={config.profitPct}
          onChange={(v) => set("profitPct", v)}
          error={errors.profitPct}
        />
        <PctField
          label="VAT Rate"
          value={config.vatRate}
          onChange={(v) => set("vatRate", v)}
          error={errors.vatRate}
        />
        <label className="block">
          <span className="mb-1 block text-xs text-text-secondary">Country</span>
          <input
            type="text"
            value={config.country}
            onChange={(e) => set("country", e.target.value)}
            className="form-input uppercase"
          />
          {errors.country && <p className="mt-1 text-xs text-destructive">{errors.country}</p>}
        </label>
      </div>
    </div>
  );
}

const HARDWARE_CATS = new Set(["hardware", "accessory"]);
const SOFTWARE_CATS = new Set(["software", "license", "network_license"]);
const SERVICE_CATS = new Set(["service", "support", "subscription", "dna_subscription", "addon"]);

export interface PreviewTotals {
  hardware: number;
  software: number;
  service: number;
  grandExVat: number;
  vat: number;
  grandIncVat: number;
}

export function previewTotals(lines: BomLineLite[], cfg: PricingConfig): PreviewTotals {
  let hardware = 0, software = 0, service = 0;
  const safeProfit = cfg.profitMode === "margin"
    ? Math.min(Math.max(cfg.profitPct, 0), 0.999)
    : Math.min(Math.max(cfg.profitPct, 0), 1);
  for (const l of lines) {
    const sar = convertCurrency(l.unitListUsd, cfg.fxRate);
    const unitSell = calculateSellingPrice({
      mode: cfg.profitMode,
      costWithOverhead: sar,
      profitPct: safeProfit,
    });
    const ext = unitSell * l.qty;
    if (HARDWARE_CATS.has(l.category)) hardware += ext;
    else if (SOFTWARE_CATS.has(l.category)) software += ext;
    else if (SERVICE_CATS.has(l.category)) service += ext;
    else hardware += ext;
  }
  const grandExVat = hardware + software + service;
  const vat = grandExVat * Math.max(cfg.vatRate, 0);
  return { hardware, software, service, grandExVat, vat, grandIncVat: grandExVat + vat };
}

export function ImpactPreview({
  currentTotal,
  lines,
  config,
  dirty,
}: {
  currentTotal: number | null;
  lines: BomLineLite[];
  config: PricingConfig;
  dirty: boolean;
}) {
  if (lines.length === 0 || currentTotal == null) {
    return (
      <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Impact Preview</h2>
        <p className="text-sm text-text-tertiary">
          Pricing will be applied when the BoM engine runs.
        </p>
      </div>
    );
  }
  const preview = previewTotals(lines, config);
  const delta = preview.grandIncVat - currentTotal;
  const deltaPct = currentTotal > 0 ? (delta / currentTotal) * 100 : 0;
  const deltaColor = !dirty
    ? "text-text-tertiary"
    : delta < 0
      ? "text-success"
      : delta > 0
        ? "text-destructive"
        : "text-text-secondary";

  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Impact Preview</h2>
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="text-text-secondary">Current total:</span>
        <span className="font-mono font-semibold text-text-primary">{SAR.format(currentTotal)}</span>
        <span className="text-text-tertiary">→</span>
        <span className="text-text-secondary">Preview:</span>
        <span className="font-mono font-semibold text-text-primary">{SAR.format(preview.grandIncVat)}</span>
        <span className={cn("font-mono text-sm font-medium", deltaColor)}>
          ({delta >= 0 ? "+" : "−"}{Math.abs(deltaPct).toFixed(1)}%)
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {([
          ["Hardware", preview.hardware],
          ["Software", preview.software],
          ["Services", preview.service],
        ] as const).map(([label, val]) => (
          <div key={label} className="rounded-card border border-[var(--border)] bg-bg-primary p-3">
            <p className="text-xs text-text-tertiary">{label}</p>
            <p className="mt-1 font-mono text-sm font-semibold text-text-primary">{SAR.format(val)}</p>
          </div>
        ))}
      </div>
      {!dirty && (
        <p className="mt-3 text-xs text-text-tertiary">
          Edit any parameter above to see the projected impact.
        </p>
      )}
    </div>
  );
}

export function ActionBar({
  onRerun,
  onReset,
  rerunning,
  rerunDisabled,
  lastRunAt,
}: {
  onRerun: () => void;
  onReset: () => void;
  rerunning: boolean;
  rerunDisabled: boolean;
  lastRunAt: string | null;
}) {
  const lastRun = lastRunAt
    ? new Date(lastRunAt).toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      })
    : null;
  return (
    <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-56 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-text-tertiary">
          {lastRun ? `Last run: ${lastRun}` : "Not yet run"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onReset}
            className="rounded-button border border-[var(--border)] px-4 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary"
          >
            Reset to defaults
          </button>
          <button
            onClick={onRerun}
            disabled={rerunDisabled || rerunning}
            className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
          >
            {rerunning ? "Submitting…" : "Re-run BoM with these settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
