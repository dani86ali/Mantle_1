"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { initialState, parseBomText, type WizardState } from "./types";
import { ActionBar, STEPS, StepIndicator } from "./chrome";
import ModeSelect from "./steps/mode-select";
import FileUpload from "./steps/file-upload";
import BomUpload from "./steps/bom-upload";
import ProjectDetails from "./steps/project-details";
import PricingDefaults from "./steps/pricing-defaults";

export default function NewEstimatePage() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(initialState);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<WizardState>) =>
    setState((s) => ({ ...s, ...patch }));

  function goNext() {
    setError(null);
    setStep((s) => {
      const next = Math.min(s + 1, STEPS.length);
      return state.mode === "rfi" && next === 2 ? 3 : next;
    });
  }
  function goBack() {
    setError(null);
    setStep((s) => {
      const prev = Math.max(s - 1, 1);
      return state.mode === "rfi" && prev === 2 ? 1 : prev;
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      let uploadedFiles: { filename: string; path: string }[] | undefined;
      if (state.mode === "rfp" && state.files.length > 0) {
        const fd = new FormData();
        for (const f of state.files) fd.append("files", f);
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        const upData = await up.json();
        if (!up.ok) throw new Error(upData.error ?? "File upload failed");
        uploadedFiles = (upData.files as { filename: string; path: string }[]).map(
          (f) => ({ filename: f.filename, path: f.path }),
        );
      }
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildIntakeBody(state, uploadedFiles)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create estimate");
      router.push(`/estimates/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] bg-bg-card px-6 py-3">
        <h1 className="text-lg font-semibold text-text-primary">New Estimate</h1>
        <p className="text-xs text-text-tertiary">
          Build your presales estimate in {STEPS.length} steps
        </p>
      </div>

      <StepIndicator current={step} />

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-3xl">
          {step === 1 && (
            <ModeSelect
              onSelect={(mode) => {
                update({ mode });
                setStep(mode === "rfi" ? 3 : 2);
              }}
            />
          )}
          {step === 2 && state.mode === "rfp" && (
            <FileUpload state={state} update={update} />
          )}
          {step === 2 && state.mode === "quick_bom" && (
            <BomUpload state={state} update={update} />
          )}
          {step === 3 && <ProjectDetails state={state} update={update} />}
          {step === 4 && <PricingDefaults state={state} update={update} />}
        </div>
      </div>

      {step > 1 && (
        <ActionBar
          isFinal={step === STEPS.length}
          submitting={submitting}
          error={error}
          canProceed={canProceed(state, step)}
          onBack={goBack}
          onNext={step === STEPS.length ? handleSubmit : goNext}
        />
      )}
    </div>
  );
}

function canProceed(s: WizardState, step: number): boolean {
  if (step === 2) {
    if (s.mode === "rfp") return s.files.length >= 1;
    if (s.mode === "quick_bom")
      return s.bomFile !== null || parseBomText(s.bomText).length >= 1;
    if (s.mode === "rfi") return true;
    return false;
  }
  if (step === 3)
    return s.customerName.trim().length > 0 && s.country.trim().length > 0;
  return true;
}

function buildIntakeBody(
  s: WizardState,
  uploadedFiles?: { filename: string; path: string }[],
) {
  const pricingConfig = {
    fxRate: s.fxRate,
    partnerDiscountPct: s.partnerDiscountPct / 100,
    dealRegDiscountPct: s.dealRegDiscountPct / 100,
    profitMode: s.profitMode,
    profitPct: s.profitPct / 100,
    vatRate: s.vatRate / 100,
  };
  const base = {
    mode: s.mode ?? "rfp",
    customerName: s.customerName,
    region: s.region,
    country: s.country,
    domain: s.domain,
    poeRequired: s.poeRequired,
    redundancyRequired: s.redundantPSU,
    stackingRequired: s.stacking,
    licenseTier: s.licenseTier,
    dnaTier: s.dnaTier,
    supportTerm: s.supportTerm,
    vendorPreferences: s.vendorPreferences || undefined,
    pricingConfig,
  };
  if (s.mode === "quick_bom") {
    return {
      ...base,
      path: "path_a" as const,
      uploadedBomLines: parseBomText(s.bomText).map((l) => ({
        sku: l.sku,
        quantity: l.quantity,
      })),
    };
  }
  if (s.mode === "rfi") {
    return {
      ...base,
      path: "path_b" as const,
      keyNeeds: s.keyNeeds,
      constraints: s.constraints,
    };
  }
  return {
    ...base,
    path: "path_b" as const,
    keyNeeds: s.keyNeeds,
    constraints: s.constraints,
    uploadedFiles,
  };
}
