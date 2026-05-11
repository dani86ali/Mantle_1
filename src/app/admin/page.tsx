"use client";

import { useState } from "react";
import {
  Settings, Users, Shield, GitBranch, Sliders, Plug, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ComingSoon } from "@/components/shared/ComingSoon";

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "users", label: "Users", icon: Users },
  { id: "credentials", label: "Cisco Credentials", icon: Shield },
  { id: "onboarding", label: "Onboarding", icon: GitBranch },
  { id: "standards", label: "Standards", icon: Sliders },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "usage", label: "API Usage", icon: BarChart3 },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPage() {
  const [tab, setTab] = useState<TabId>("general");

  return (
    <div className="flex h-full">
      {/* Tab sidebar */}
      <div className="w-48 border-r border-[var(--border)] bg-bg-card py-4">
        <h2 className="mb-3 px-4 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Administration
        </h2>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors",
              tab === t.id
                ? "border-r-2 border-accent bg-accent-muted text-accent"
                : "text-text-secondary hover:bg-[var(--bg-elevated)] hover:text-text-primary"
            )}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "general" && <GeneralTab />}
        {tab === "users" && <UsersTab />}
        {tab === "credentials" && <CredentialsTab />}
        {tab === "onboarding" && <OnboardingTab />}
        {tab === "standards" && <StandardsTab />}
        {tab === "integrations" && (
          <ComingSoon phase="Coming in Phase 2-3" title="Integrations" description="CRM/CPQ connections and email mailbox setup." features={[
            { name: "CRM Write-back", description: "Push BoMs to ConnectWise, Salesforce, QuoteWerks" },
            { name: "Email Intake", description: "Monitored mailbox for automatic intake from customer emails" },
          ]} />
        )}
        {tab === "usage" && <UsageTab />}
      </div>
    </div>
  );
}

function GeneralTab() {
  return (
    <div className="max-w-2xl space-y-6">
      <h3 className="text-lg font-semibold text-text-primary">General Settings</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Organization Name" value="Dimension Data Saudi Arabia" />
        <Field label="Slug" value="dimension-data-sa" disabled />
        <Field label="Region" value="EMEAR" type="select" options={["EMEAR", "AMER", "APJC"]} />
        <Field label="Price List" value="Global Price List Emerging (USD)" disabled />
        <Field label="Locale" value="en-US" type="select" options={["en-US", "en-GB", "ar-SA"]} />
        <Field label="Timezone" value="Asia/Riyadh" />
      </div>
      <div className="border-t border-[var(--border)] pt-4">
        <h4 className="mb-3 text-sm font-medium text-text-secondary">Branding</h4>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company Name" value="Dimension Data" />
          <div>
            <label className="mb-1.5 block text-sm text-text-secondary">Primary Color</label>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded border border-[var(--border)]" style={{ backgroundColor: "#01BFFD" }} />
              <span className="font-mono text-sm text-text-secondary">#01BFFD</span>
            </div>
          </div>
        </div>
      </div>
      <button className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover">
        Save Changes
      </button>
    </div>
  );
}

function UsersTab() {
  const users = [
    { name: "Danish Ali", email: "danish@nexusglobal...", role: "Admin", status: "Active" },
    { name: "Shahid Khan", email: "shahid.khan@nttdata...", role: "Engineer", status: "Active" },
    { name: "Mohammad R.", email: "mohammad@nexusglobal...", role: "Admin", status: "Active" },
  ];
  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Users</h3>
        <button className="rounded-button bg-accent px-3 py-1.5 text-sm font-medium text-text-primary">
          Invite User
        </button>
      </div>
      <div className="mt-4 rounded-card border border-[var(--border)]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-text-tertiary">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {users.map((u) => (
              <tr key={u.email} className="hover:bg-bg-elevated">
                <td className="px-4 py-3 text-text-primary">{u.name}</td>
                <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", u.role === "Admin" ? "bg-accent-muted text-accent" : "bg-blue-muted text-blue")}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-success-muted px-2 py-0.5 text-xs text-success">{u.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CredentialsTab() {
  return (
    <div className="max-w-2xl space-y-6">
      <h3 className="text-lg font-semibold text-text-primary">Cisco Credentials</h3>
      <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Connection Status</p>
            <p className="mt-1 text-xs text-text-tertiary">Last validated: Never (mock mode)</p>
          </div>
          <span className="rounded-full bg-warning-muted px-3 py-1 text-xs font-medium text-warning">
            Mock Mode
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="CCO Username" value="" placeholder="cisco-cco-username" />
        <Field label="CCO Password" value="" placeholder="********" type="password" />
        <Field label="Client ID" value="" placeholder="app-client-id" />
        <Field label="Client Secret" value="" placeholder="********" type="password" />
      </div>
      <div className="flex gap-3">
        <button className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary">
          Save Credentials
        </button>
        <button className="rounded-button border border-[var(--border)] px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
          Test Connection
        </button>
      </div>
    </div>
  );
}

function OnboardingTab() {
  const STEPS = [
    { state: "LEAD", label: "Lead", done: true },
    { state: "CISCO_ADMIN_IDENTIFIED", label: "Cisco Admin Identified", done: true },
    { state: "CCO_ID_VERIFIED", label: "CCO ID Verified", done: false, current: true },
    { state: "SAMT_ENTITLEMENT_GRANTED", label: "SAMT Entitlement", done: false },
    { state: "APP_REGISTERED", label: "App Registered", done: false },
    { state: "HELLO_API_PASSED", label: "Hello API Passed", done: false },
    { state: "API_ACCESS_REQUESTED", label: "API Access Requested", done: false },
    { state: "API_ACCESS_GRANTED", label: "API Access Granted", done: false },
    { state: "CREDS_LOADED", label: "Credentials Loaded", done: false },
    { state: "STAGING_VALIDATED", label: "Staging Validated", done: false },
    { state: "LIVE", label: "Live", done: false },
  ];

  return (
    <div className="max-w-2xl">
      <h3 className="text-lg font-semibold text-text-primary">Onboarding Progress</h3>
      <p className="mt-1 text-sm text-text-secondary">Track your Cisco API access setup</p>
      <div className="mt-6 space-y-1">
        {STEPS.map((step, i) => (
          <div
            key={step.state}
            className={cn(
              "flex items-center gap-3 rounded-card border px-4 py-3",
              step.done ? "border-success/20 bg-success-muted" :
              step.current ? "border-accent/30 bg-accent-muted" :
              "border-[var(--border)] bg-bg-card"
            )}
          >
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
              step.done ? "bg-success text-white" :
              step.current ? "bg-accent text-text-primary" :
              "bg-[var(--border-hover)] text-text-tertiary"
            )}>
              {step.done ? "✓" : i + 1}
            </div>
            <span className={cn("text-sm", step.current ? "font-medium text-accent" : step.done ? "text-success" : "text-text-secondary")}>
              {step.label}
            </span>
            {step.current && (
              <span className="ml-auto text-xs text-accent">Current step</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StandardsTab() {
  return (
    <div className="max-w-2xl space-y-6">
      <h3 className="text-lg font-semibold text-text-primary">Engineering Standards</h3>
      <div className="space-y-4">
        <Field label="Default License Tier" value="advantage" type="select" options={["advantage", "essentials"]} />
        <Field label="Default DNA Tier" value="advantage" type="select" options={["advantage", "essentials"]} />
        <Field label="Default Support Level" value="8x5xNBD" type="select" options={["8x5xNBD", "24x7x4", "24x7x2"]} />
        <Field label="Default Power Cable" value="CAB-TA-UK" />
        <div>
          <label className="mb-1.5 block text-sm text-text-secondary">Redundant PSU Required</label>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" defaultChecked className="accent-accent" /> Yes, by default
          </label>
        </div>
      </div>
      <button className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary">
        Save Standards
      </button>
    </div>
  );
}

function UsageTab() {
  return (
    <div className="max-w-3xl space-y-6">
      <h3 className="text-lg font-semibold text-text-primary">API Usage</h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-card border border-[var(--border)] bg-bg-card p-4">
          <p className="text-xs text-text-tertiary">Cisco API Calls (Today)</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">47</p>
          <p className="mt-1 text-xs text-text-tertiary">of ~100 est. limit</p>
        </div>
        <div className="rounded-card border border-[var(--border)] bg-bg-card p-4">
          <p className="text-xs text-text-tertiary">Anthropic Tokens (Today)</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">23,450</p>
          <p className="mt-1 text-xs text-text-tertiary">of 500K daily budget</p>
        </div>
        <div className="rounded-card border border-[var(--border)] bg-bg-card p-4">
          <p className="text-xs text-text-tertiary">Rate Limit Events</p>
          <p className="mt-1 text-2xl font-semibold text-success">0</p>
          <p className="mt-1 text-xs text-text-tertiary">No 429s today</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, placeholder, type, options, disabled }: {
  label: string; value: string; placeholder?: string; type?: string; options?: string[]; disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm text-text-secondary">{label}</label>
      {type === "select" && options ? (
        <select defaultValue={value} disabled={disabled} className="form-input">
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type === "password" ? "password" : "text"} defaultValue={value} placeholder={placeholder} disabled={disabled} className="form-input" />
      )}
    </div>
  );
}
