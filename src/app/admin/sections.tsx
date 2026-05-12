"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_BOILERPLATE, type BoilerplateEntry } from "@/engines/e3/boilerplate-kb";

export interface CompanyProfile {
  tenantName: string; legalEntity: string; city: string;
  country: string; address: string; phone: string;
}
export interface PricingDefaults {
  fxRate: number; partnerDiscountPct: number; dealRegDiscountPct: number;
  profitMode: "margin" | "markup"; profitPct: number; vatRate: number;
}

interface CardProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  children: React.ReactNode;
}
export function Card({ title, subtitle, icon: Icon, defaultOpen, children }: CardProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <Icon size={18} className="text-text-secondary" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-text-primary">{title}</div>
          {subtitle && <div className="text-xs text-text-tertiary">{subtitle}</div>}
        </div>
        {open ? <ChevronDown size={16} className="text-text-tertiary" /> : <ChevronRight size={16} className="text-text-tertiary" />}
      </button>
      {open && <div className="border-t border-[var(--border)] px-5 py-5">{children}</div>}
    </div>
  );
}

export function CompanyProfileForm({
  value, onChange, onSave,
}: { value: CompanyProfile; onChange: (v: CompanyProfile) => void; onSave: () => void }) {
  const set = <K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Tenant name" value={value.tenantName} onChange={(v) => set("tenantName", v)} />
        <TextField label="Legal entity" value={value.legalEntity} onChange={(v) => set("legalEntity", v)} />
        <TextField label="City" value={value.city} onChange={(v) => set("city", v)} />
        <TextField label="Country" value={value.country} onChange={(v) => set("country", v)} />
        <TextField label="Address" value={value.address} onChange={(v) => set("address", v)} />
        <TextField label="Phone" value={value.phone} onChange={(v) => set("phone", v)} />
      </div>
      <SaveButton onClick={onSave} />
    </div>
  );
}

export function BoilerplateForm({
  value, onChange, onSave,
}: {
  value: Record<string, BoilerplateEntry>;
  onChange: (v: Record<string, BoilerplateEntry>) => void;
  onSave: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const update = (key: string, content: string) =>
    onChange({ ...value, [key]: { ...value[key], content } });
  const reset = (key: string) =>
    onChange({ ...value, [key]: structuredClone(DEFAULT_BOILERPLATE[key]) });

  return (
    <div className="space-y-3">
      {Object.values(value).map((entry) => {
        const open = expanded === entry.key;
        const isDirty = entry.content !== DEFAULT_BOILERPLATE[entry.key].content;
        return (
          <div key={entry.key} className="rounded-card border border-[var(--border)] bg-bg-primary">
            <button
              onClick={() => setExpanded(open ? null : entry.key)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
            >
              {open ? <ChevronDown size={14} className="text-text-tertiary" /> : <ChevronRight size={14} className="text-text-tertiary" />}
              <span className="font-mono text-xs text-text-tertiary">{entry.key}</span>
              <span className="text-sm text-text-primary">{entry.title}</span>
              {isDirty && <span className="ml-auto rounded-full bg-warning-muted px-2 py-0.5 text-[10px] text-warning">customized</span>}
            </button>
            {open && (
              <div className="space-y-2 border-t border-[var(--border)] px-4 py-3">
                <textarea
                  value={entry.content}
                  onChange={(e) => update(entry.key, e.target.value)}
                  rows={Math.min(20, entry.content.split("\n").length + 1)}
                  className="form-input font-mono text-xs"
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-tertiary">
                    Variables: {entry.variables.length ? entry.variables.join(", ") : "none"}
                  </span>
                  {isDirty && (
                    <button onClick={() => reset(entry.key)} className="text-accent hover:underline">
                      Reset to default
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <SaveButton onClick={onSave} />
    </div>
  );
}

export function PricingForm({
  value, onChange, onSave,
}: { value: PricingDefaults; onChange: (v: PricingDefaults) => void; onSave: () => void }) {
  const set = <K extends keyof PricingDefaults>(k: K, v: PricingDefaults[K]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumField label="FX rate (USD → local)" value={value.fxRate} step={0.01} onChange={(v) => set("fxRate", v)} />
        <NumField label="Partner discount" value={value.partnerDiscountPct} step={0.5} suffix="%" onChange={(v) => set("partnerDiscountPct", v)} />
        <NumField label="Deal-reg discount" value={value.dealRegDiscountPct} step={0.5} suffix="%" onChange={(v) => set("dealRegDiscountPct", v)} />
        <NumField label="VAT" value={value.vatRate} step={0.5} suffix="%" onChange={(v) => set("vatRate", v)} />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">Profit mode</label>
          <div className="flex rounded-button border border-[var(--border)] bg-bg-primary p-0.5">
            {(["margin", "markup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => set("profitMode", m)}
                className={cn(
                  "flex-1 rounded-[4px] px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                  value.profitMode === m ? "bg-accent-muted text-accent" : "text-text-secondary hover:text-text-primary",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <NumField
          label={value.profitMode === "margin" ? "Profit margin" : "Markup"}
          value={value.profitPct} step={0.5} suffix="%" onChange={(v) => set("profitPct", v)}
        />
      </div>
      <SaveButton onClick={onSave} />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-text-secondary">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="form-input" />
    </div>
  );
}

function NumField({
  label, value, step, suffix, onChange,
}: { label: string; value: number; step: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-text-secondary">{label}</label>
      <div className="relative">
        <input
          type="number" value={value} step={step}
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

function SaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover">
      Save
    </button>
  );
}
