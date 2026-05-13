"use client";

import { useEffect, useState } from "react";
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

const DEFAULT_PROFILE: CompanyProfile = {
  tenantName: "MantelTech", legalEntity: "MantelTech Solutions LLC",
  city: "Riyadh", country: "Saudi Arabia",
  address: "King Fahd Road, Olaya District", phone: "+966 11 000 0000",
};
const DEFAULT_PRICING: PricingDefaults = {
  fxRate: 3.75, partnerDiscountPct: 35, dealRegDiscountPct: 5,
  profitMode: "margin", profitPct: 18, vatRate: 15,
};

function mergeBoilerplate(
  overrides: Record<string, string> | undefined,
): Record<string, BoilerplateEntry> {
  const merged = structuredClone(DEFAULT_BOILERPLATE);
  if (!overrides) return merged;
  for (const [key, content] of Object.entries(overrides)) {
    if (merged[key]) merged[key] = { ...merged[key], content };
  }
  return merged;
}

function diffBoilerplate(
  value: Record<string, BoilerplateEntry>,
): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const entry of Object.values(value)) {
    const def = DEFAULT_BOILERPLATE[entry.key];
    if (def && entry.content !== def.content) overrides[entry.key] = entry.content;
  }
  return overrides;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_PROFILE);
  const [boilerplate, setBoilerplate] = useState<Record<string, BoilerplateEntry>>(
    () => structuredClone(DEFAULT_BOILERPLATE),
  );
  const [pricing, setPricing] = useState<PricingDefaults>(DEFAULT_PRICING);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const { config } = (await res.json()) as {
          config: {
            companyProfile?: CompanyProfile;
            pricingDefaults?: PricingDefaults;
            boilerplateOverrides?: Record<string, string>;
          };
        };
        if (cancelled) return;
        if (config.companyProfile) setProfile(config.companyProfile);
        if (config.pricingDefaults) setPricing(config.pricingDefaults);
        setBoilerplate(mergeBoilerplate(config.boilerplateOverrides));
      } catch {
        // keep defaults on failure
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (label: string, ok: boolean) => {
    setToast(ok ? `${label} saved` : `${label} failed to save`);
    setTimeout(() => setToast(null), 2500);
  };

  const patch = async (label: string, body: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      showToast(label, res.ok);
    } catch {
      showToast(label, false);
    }
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
        <CompanyProfileForm
          value={profile}
          onChange={setProfile}
          onSave={() => patch("Company profile", { companyProfile: profile })}
        />
      </Card>

      <Card title="Proposal Boilerplate" subtitle={`${Object.keys(boilerplate).length} sections`} icon={FileText}>
        <BoilerplateForm
          value={boilerplate}
          onChange={setBoilerplate}
          onSave={() => patch("Boilerplate", { boilerplateOverrides: diffBoilerplate(boilerplate) })}
        />
      </Card>

      <Card title="Pricing Defaults" subtitle="Pre-fills the intake wizard Step 4" icon={DollarSign}>
        <PricingForm
          value={pricing}
          onChange={setPricing}
          onSave={() => patch("Pricing defaults", { pricingDefaults: pricing })}
        />
      </Card>
    </div>
  );
}
