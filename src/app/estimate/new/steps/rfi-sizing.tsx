"use client";

import type { WizardState } from "../types";
import { Field, Toggle } from "./_fields";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}

export default function RfiSizing({ state, update }: Props) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary">RFI sizing</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Tell us about the environment so we can size the solution.
      </p>

      <div className="mt-6 space-y-5">
        <Field label="Vendor">
          <div className="flex gap-6">
            <VendorRadio
              value="cisco"
              label="Cisco"
              current={state.vendor}
              onChange={(v) => update({ vendor: v })}
            />
            <VendorRadio
              value="fortinet"
              label="Fortinet"
              current={state.vendor}
              onChange={(v) => update({ vendor: v })}
            />
          </div>
        </Field>

        <Field label="Project type">
          <input
            value={state.projectType}
            onChange={(e) => update({ projectType: e.target.value })}
            placeholder="e.g. campus refresh, datacenter buildout"
            className="form-input"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Sites">
            <NumberInput
              value={state.siteCount}
              onChange={(v) => update({ siteCount: v })}
            />
          </Field>
          <Field label="Buildings">
            <NumberInput
              value={state.buildingCount}
              onChange={(v) => update({ buildingCount: v })}
            />
          </Field>
          <Field label="Ports">
            <NumberInput
              value={state.portCount}
              onChange={(v) => update({ portCount: v })}
            />
          </Field>
          <Field label="Users">
            <NumberInput
              value={state.userCount}
              onChange={(v) => update({ userCount: v })}
            />
          </Field>
          <Field label="Bandwidth (Gbps)">
            <NumberInput
              value={state.bandwidthGbps}
              onChange={(v) => update({ bandwidthGbps: v })}
              step={0.1}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Toggle
            checked={state.isGreenfield}
            onChange={(v) => update({ isGreenfield: v })}
            label="Greenfield"
          />
          <Toggle
            checked={state.hasWireless}
            onChange={(v) => update({ hasWireless: v })}
            label="Wireless"
          />
          <Toggle
            checked={state.hasVoice}
            onChange={(v) => update({ hasVoice: v })}
            label="Voice"
          />
          <Toggle
            checked={state.hasDC}
            onChange={(v) => update({ hasDC: v })}
            label="Datacenter"
          />
          <Toggle
            checked={state.hasOT}
            onChange={(v) => update({ hasOT: v })}
            label="OT"
          />
          <Toggle
            checked={state.hasGPON}
            onChange={(v) => update({ hasGPON: v })}
            label="GPON"
          />
          <Toggle
            checked={state.hasHPC}
            onChange={(v) => update({ hasHPC: v })}
            label="HPC"
          />
          <Toggle
            checked={state.vrfEnabled}
            onChange={(v) => update({ vrfEnabled: v })}
            label="VRF enabled"
          />
        </div>
      </div>
    </div>
  );
}

function VendorRadio({
  value,
  label,
  current,
  onChange,
}: {
  value: WizardState["vendor"];
  label: string;
  current: WizardState["vendor"];
  onChange: (v: WizardState["vendor"]) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-text-secondary">
      <input
        type="radio"
        name="vendor"
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
        className="h-4 w-4 accent-accent"
      />
      {label}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  step,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      min={0}
      step={step ?? 1}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value);
        onChange(Number.isFinite(n) && n >= 0 ? n : 0);
      }}
      className="form-input"
    />
  );
}
