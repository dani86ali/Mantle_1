"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { initialState, parseBomText, type WizardState } from "./types";
import { pileIsValid, submittablePile } from "@/components/intake/pile-upload";
import type { DocumentType } from "@/types/document-type";
import type { UploadedFileMeta } from "@/app/api/upload/route";
import { ActionBar, STEPS, StepIndicator } from "./chrome";
import ModeSelect from "./steps/mode-select";
import FileUpload from "./steps/file-upload";
import BomUpload from "./steps/bom-upload";
import RfiSizing from "./steps/rfi-sizing";
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
    setStep((s) => Math.min(s + 1, STEPS.length));
  }
  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      let uploadedFiles:
        | { filename: string; path: string; documentType: DocumentType }[]
        | undefined;
      const filesToUpload: { file: File; type: DocumentType }[] = [];
      if (state.mode === "rfp") {
        for (const { file, documentType } of submittablePile(state.pileFiles)) {
          filesToUpload.push({ file, type: documentType });
        }
      } else if (state.mode === "quick_bom" && state.bomFile) {
        filesToUpload.push({ file: state.bomFile, type: "boq" });
      }
      if (filesToUpload.length > 0) {
        const fd = new FormData();
        for (const { file } of filesToUpload) fd.append("files", file);
        fd.append(
          "types",
          JSON.stringify(filesToUpload.map(({ type }) => type)),
        );
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        const upData = await up.json();
        if (!up.ok) throw new Error(upData.error ?? "File upload failed");
        uploadedFiles = (upData.files as UploadedFileMeta[]).map((f) => ({
          filename: f.filename,
          path: f.path,
          documentType: f.documentType,
        }));
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
                // Quick BoM is owned by the canonical Project spine, not the
                // legacy estimate/intake pipeline. Divert before the wizard
                // can upload a BoQ to /api/intake and route to /estimates/[id].
                if (mode === "quick_bom") {
                  router.push("/projects/quick-bom/new");
                  return;
                }
                update({ mode });
                setStep(2);
              }}
            />
          )}
          {step === 2 && state.mode === "rfp" && (
            <FileUpload state={state} update={update} />
          )}
          {step === 2 && state.mode === "quick_bom" && (
            <BomUpload state={state} update={update} />
          )}
          {step === 2 && state.mode === "rfi" && (
            <RfiSizing state={state} update={update} />
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
    if (s.mode === "rfp") return pileIsValid(s.pileFiles).canSubmit;
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
  uploadedFiles?: { filename: string; path: string; documentType: DocumentType }[],
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
      uploadedFiles,
    };
  }
  if (s.mode === "rfi") {
    return {
      ...base,
      path: "path_b" as const,
      keyNeeds: s.keyNeeds,
      constraints: s.constraints,
      vendor: s.vendor,
      projectType: s.projectType || undefined,
      siteCount: s.siteCount,
      buildingCount: s.buildingCount,
      portCount: s.portCount,
      userCount: s.userCount,
      bandwidthGbps: s.bandwidthGbps,
      isGreenfield: s.isGreenfield,
      hasOT: s.hasOT,
      hasHPC: s.hasHPC,
      hasGPON: s.hasGPON,
      hasWireless: s.hasWireless,
      hasVoice: s.hasVoice,
      hasDC: s.hasDC,
      vrfEnabled: s.vrfEnabled,
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
