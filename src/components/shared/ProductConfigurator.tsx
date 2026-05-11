"use client";

import { useState } from "react";
import { X, ChevronRight, Check, AlertTriangle, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfigOption {
  id: string;
  label: string;
  type: "select" | "toggle" | "quantity";
  options?: { value: string; label: string; sku?: string; price?: number }[];
  default?: string;
  required?: boolean;
}

interface BundleSuggestion {
  label: string;
  items: { sku: string; description: string; price: number }[];
}

interface ProductConfiguratorProps {
  sku: string;
  description: string;
  productFamily: string;
  open: boolean;
  onClose: () => void;
  onAdd: (items: { sku: string; qty: number }[]) => void;
}

const SWITCH_CONFIG: ConfigOption[] = [
  {
    id: "license",
    label: "License Tier",
    type: "select",
    required: true,
    options: [
      { value: "advantage", label: "Network Advantage", sku: "-NW-A" },
      { value: "essentials", label: "Network Essentials", sku: "-NW-E" },
    ],
    default: "advantage",
  },
  {
    id: "dna",
    label: "DNA Subscription",
    type: "select",
    required: true,
    options: [
      { value: "dna-a-3y", label: "DNA Advantage — 3 Year", price: 2371 },
      { value: "dna-a-5y", label: "DNA Advantage — 5 Year", price: 3952 },
      { value: "dna-e-3y", label: "DNA Essentials — 3 Year", price: 1185 },
      { value: "dna-e-5y", label: "DNA Essentials — 5 Year", price: 1975 },
    ],
    default: "dna-a-3y",
  },
  {
    id: "support",
    label: "Support Term",
    type: "select",
    required: true,
    options: [
      { value: "8x5xnbd", label: "SmartNet 8×5×NBD", price: 2584 },
      { value: "24x7x4", label: "SmartNet 24×7×4HR", price: 4100 },
      { value: "none", label: "No Support" },
    ],
    default: "8x5xnbd",
  },
  {
    id: "power_cable",
    label: "Power Cable Type",
    type: "select",
    options: [
      { value: "CAB-TA-NA", label: "North America (NEMA 5-15P)" },
      { value: "CAB-TA-UK", label: "United Kingdom (BS 1363)" },
      { value: "CAB-TA-EU", label: "Europe (CEE 7/7)" },
      { value: "CAB-TA-AP", label: "Australia/NZ (AS 3112)" },
      { value: "CAB-TA-JP", label: "Japan (JIS 8303)" },
    ],
    default: "CAB-TA-UK",
  },
  {
    id: "stacking",
    label: "Stacking",
    type: "toggle",
    default: "yes",
  },
  {
    id: "redundant_psu",
    label: "Redundant Power Supply",
    type: "toggle",
    default: "yes",
  },
  {
    id: "quantity",
    label: "Quantity",
    type: "quantity",
    default: "1",
  },
];

const BUNDLE_SUGGESTION: BundleSuggestion = {
  label: "Engineers who configured this switch also added",
  items: [
    { sku: "PWR-C1-1100WAC-P/2", description: "Redundant PSU", price: 2317 },
    { sku: "C9300L-STACK-KIT", description: "Stacking Kit", price: 1592 },
    { sku: "C9300L-DNA-A-24-3Y", description: "DNA Advantage 3Y", price: 2371 },
  ],
};

export function ProductConfigurator({
  sku,
  description,
  productFamily,
  open,
  onClose,
  onAdd,
}: ProductConfiguratorProps) {
  const [selections, setSelections] = useState<Record<string, string>>({
    license: "advantage",
    dna: "dna-a-3y",
    support: "8x5xnbd",
    power_cable: "CAB-TA-UK",
    stacking: "yes",
    redundant_psu: "yes",
    quantity: "1",
  });

  const [step, setStep] = useState(0);
  const config = SWITCH_CONFIG;
  const currentOption = config[step];

  function handleSelect(id: string, value: string) {
    setSelections((prev) => ({ ...prev, [id]: value }));
  }

  function handleNext() {
    if (step < config.length - 1) {
      setStep(step + 1);
    } else {
      // Build the item list and call onAdd
      onAdd([{ sku, qty: parseInt(selections.quantity) || 1 }]);
      onClose();
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-[var(--border)] bg-bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Configure {sku}
            </h3>
            <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:bg-[var(--bg-elevated)] hover:text-text-secondary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Progress */}
        <div className="flex gap-1 px-5 pt-4">
          {config.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= step ? "bg-accent" : "bg-[var(--border)]"
              )}
            />
          ))}
        </div>

        {/* Current option */}
        <div className="px-5 py-5">
          {currentOption && (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Step {step + 1} of {config.length}
                </span>
                {currentOption.required && (
                  <span className="text-xs text-accent">Required</span>
                )}
              </div>
              <h4 className="mt-2 text-base font-medium text-text-primary">
                {currentOption.label}
              </h4>

              {currentOption.type === "select" && currentOption.options && (
                <div className="mt-3 space-y-1.5">
                  {currentOption.options.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleSelect(currentOption.id, opt.value)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-button border px-4 py-2.5 text-left text-sm transition-colors",
                        selections[currentOption.id] === opt.value
                          ? "border-accent bg-accent-muted text-accent"
                          : "border-[var(--border)] text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary"
                      )}
                    >
                      <span>{opt.label}</span>
                      <div className="flex items-center gap-2">
                        {opt.price && (
                          <span className="font-mono text-xs text-text-tertiary">
                            ${opt.price.toLocaleString()}
                          </span>
                        )}
                        {selections[currentOption.id] === opt.value && (
                          <Check size={14} className="text-accent" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {currentOption.type === "toggle" && (
                <div className="mt-3 flex gap-2">
                  {["yes", "no"].map((v) => (
                    <button
                      key={v}
                      onClick={() => handleSelect(currentOption.id, v)}
                      className={cn(
                        "flex-1 rounded-button border px-4 py-2.5 text-sm font-medium transition-colors",
                        selections[currentOption.id] === v
                          ? "border-accent bg-accent-muted text-accent"
                          : "border-[var(--border)] text-text-secondary hover:border-[var(--border-hover)]"
                      )}
                    >
                      {v === "yes" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              )}

              {currentOption.type === "quantity" && (
                <div className="mt-3">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={selections.quantity}
                    onChange={(e) => handleSelect("quantity", e.target.value)}
                    className="form-input w-24 text-center font-mono"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bundle suggestion */}
        {step === config.length - 1 && (
          <div className="mx-5 mb-4 rounded-card border border-accent/20 bg-accent-muted p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
              <Lightbulb size={12} />
              {BUNDLE_SUGGESTION.label}
            </div>
            <div className="mt-2 space-y-1">
              {BUNDLE_SUGGESTION.items.map((item) => (
                <div
                  key={item.sku}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-text-secondary">{item.description}</span>
                  <span className="font-mono text-text-tertiary">
                    ${item.price.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
          <button
            onClick={() => step > 0 && setStep(step - 1)}
            disabled={step === 0}
            className="text-sm text-text-secondary hover:text-text-primary disabled:opacity-30"
          >
            Back
          </button>
          <button
            onClick={handleNext}
            className="flex items-center gap-1.5 rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover"
          >
            {step === config.length - 1 ? "Add to Estimate" : "Next"}
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
