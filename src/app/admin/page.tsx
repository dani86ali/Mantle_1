"use client";

import { useState } from "react";
import { Building2, FileText, DollarSign } from "lucide-react";
import { DEFAULT_BOILERPLATE, type BoilerplateEntry } from "@/engines/e3/boilerplate-kb";
import {
  Card,
  CompanyProfileForm,
  BoilerplateForm,
  PricingForm,
  type CompanyProfile,
  type PricingDefaults,
} from "./sections";

// TODO: wire to tenant config API — GET /api/tenant, PUT /api/tenant/{section}
const DEFAULT_PROFILE: CompanyProfile = {
  tenantName: "MantelTech", legalEntity: "MantelTech Solutions LLC",
  city: "Riyadh", country: "Saudi Arabia",
  address: "King Fahd Road, Olaya District", phone: "+966 11 000 0000",
};
const DEFAULT_PRICING: PricingDefaults = {
  fxRate: 3.75, partnerDiscountPct: 35, dealRegDiscountPct: 5,
  profitMode: "margin", profitPct: 18, vatRate: 15,
};

export default function SettingsPage() {
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_PROFILE);
  const [boilerplate, setBoilerplate] = useState<Record<string, BoilerplateEntry>>(
    () => structuredClone(DEFAULT_BOILERPLATE),
  );
  const [pricing, setPricing] = useState<PricingDefaults>(DEFAULT_PRICING);
  const [toast, setToast] = useState<string | null>(null);

  const save = (label: string) => {
    setToast(`${label} saved`);
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Tenant configuration for proposals, boilerplate, and pricing defaults.
        </p>
      </div>
      {toast && (
        <div className="rounded-card border border-success/30 bg-success-muted p-3 text-sm text-success">
          {toast}
        </div>
      )}

      <Card title="Company Profile" subtitle="Used on proposal cover page and headers" icon={Building2} defaultOpen>
        <CompanyProfileForm value={profile} onChange={setProfile} onSave={() => save("Company profile")} />
      </Card>

      <Card title="Proposal Boilerplate" subtitle={`${Object.keys(boilerplate).length} sections`} icon={FileText}>
        <BoilerplateForm value={boilerplate} onChange={setBoilerplate} onSave={() => save("Boilerplate")} />
      </Card>

      <Card title="Pricing Defaults" subtitle="Pre-fills the intake wizard Step 4" icon={DollarSign}>
        <PricingForm value={pricing} onChange={setPricing} onSave={() => save("Pricing defaults")} />
      </Card>
    </div>
  );
}
