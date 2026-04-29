"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface TenantConfig {
  id: string;
  name: string;
  slug: string;
  region: string;
  priceListId: string;
  onboardingState: string;
  locale: string;
  timezone: string;
  brandingConfig: Record<string, string>;
  standardsConfig: Record<string, unknown>;
}

export default function AdminPage() {
  const [tenant, setTenant] = useState<TenantConfig | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "standards" | "onboarding">("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Editable fields
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [locale, setLocale] = useState("");
  const [timezone, setTimezone] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0d6efd");
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    fetchTenant();
  }, []);

  async function fetchTenant() {
    try {
      const res = await fetch("/api/admin");
      const data = await res.json();
      if (data.tenant) {
        setTenant(data.tenant);
        setName(data.tenant.name);
        setRegion(data.tenant.region);
        setLocale(data.tenant.locale);
        setTimezone(data.tenant.timezone);
        setPrimaryColor(data.tenant.brandingConfig?.primaryColor ?? "#0d6efd");
        setCompanyName(data.tenant.brandingConfig?.companyName ?? "");
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          region,
          locale,
          timezone,
          brandingConfig: { primaryColor, companyName },
        }),
      });
      if (res.ok) {
        setMessage("Settings saved successfully.");
        fetchTenant();
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">Tenant Administration</h1>
      {tenant && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-gray-500">{tenant.slug}</span>
          <StatusBadge status={tenant.onboardingState} />
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {(["general", "standards", "onboarding"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 pb-3 text-sm font-medium capitalize ${
                activeTab === tab
                  ? "border-brand-primary text-brand-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* General settings */}
      {activeTab === "general" && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Organization Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Region
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="EMEAR">EMEAR</option>
                <option value="AMER">AMER</option>
                <option value="APJC">APJC</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Locale
              </label>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="en-US">en-US</option>
                <option value="en-GB">en-GB</option>
                <option value="ar-SA">ar-SA</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Timezone
              </label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Asia/Riyadh"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <h3 className="mt-4 font-medium">Branding</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Primary Color
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded border"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-28 rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {message && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
              {message}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-brand-primary px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {/* Standards tab */}
      {activeTab === "standards" && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-gray-600">
            Configure default engineering standards for your organization.
            These defaults are applied when no per-request override is specified.
          </p>
          <div className="rounded-lg border border-gray-200 p-4">
            <pre className="text-xs text-gray-600">
              {JSON.stringify(tenant?.standardsConfig ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Onboarding tab */}
      {activeTab === "onboarding" && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-gray-600">
            Track your Cisco API onboarding progress.
          </p>
          <OnboardingTracker currentState={tenant?.onboardingState ?? "LEAD"} />
        </div>
      )}
    </div>
  );
}

const ONBOARDING_STEPS = [
  { state: "LEAD", label: "Lead" },
  { state: "CISCO_ADMIN_IDENTIFIED", label: "Cisco Admin Identified" },
  { state: "CCO_ID_VERIFIED", label: "CCO ID Verified" },
  { state: "SAMT_ENTITLEMENT_GRANTED", label: "SAMT Entitlement" },
  { state: "APP_REGISTERED", label: "App Registered" },
  { state: "HELLO_API_PASSED", label: "Hello API Passed" },
  { state: "API_ACCESS_REQUESTED", label: "API Access Requested" },
  { state: "API_ACCESS_GRANTED", label: "API Access Granted" },
  { state: "CREDS_LOADED", label: "Credentials Loaded" },
  { state: "STAGING_VALIDATED", label: "Staging Validated" },
  { state: "LIVE", label: "Live" },
];

function OnboardingTracker({ currentState }: { currentState: string }) {
  const currentIdx = ONBOARDING_STEPS.findIndex(
    (s) => s.state === currentState
  );

  return (
    <div className="space-y-2">
      {ONBOARDING_STEPS.map((step, idx) => {
        const isComplete = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div
            key={step.state}
            className={`flex items-center gap-3 rounded-md border p-3 ${
              isComplete
                ? "border-green-200 bg-green-50"
                : isCurrent
                  ? "border-blue-200 bg-blue-50"
                  : "border-gray-200 bg-gray-50"
            }`}
          >
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                isComplete
                  ? "bg-green-500 text-white"
                  : isCurrent
                    ? "bg-blue-500 text-white"
                    : "bg-gray-300 text-white"
              }`}
            >
              {isComplete ? "v" : idx + 1}
            </div>
            <span
              className={`text-sm ${
                isCurrent ? "font-medium" : ""
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
