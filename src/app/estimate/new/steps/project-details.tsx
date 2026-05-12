"use client";

import type { WizardState } from "../types";
import { Field, Toggle } from "./_fields";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}

export default function ProjectDetails({ state, update }: Props) {
  const isRfp = state.mode === "rfp";
  const isBom = state.mode === "quick_bom";

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary">
        Project details
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Tell us about the customer and scope.
      </p>

      <div className="mt-6 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer name" required>
            <input
              value={state.customerName}
              onChange={(e) => update({ customerName: e.target.value })}
              className="form-input"
              required
            />
          </Field>
          <Field label="Country" required>
            <input
              value={state.country}
              onChange={(e) => update({ country: e.target.value })}
              className="form-input"
              required
            />
          </Field>
          <Field label="Region">
            <select
              value={state.region}
              onChange={(e) => update({ region: e.target.value })}
              className="form-input"
            >
              <option value="EMEAR">EMEAR</option>
              <option value="AMER">AMER</option>
              <option value="APJC">APJC</option>
            </select>
          </Field>
          {isRfp && (
            <Field label="Domain">
              <select
                value={state.domain}
                onChange={(e) =>
                  update({ domain: e.target.value as WizardState["domain"] })
                }
                className="form-input"
              >
                <option value="access_switching">Access switching</option>
                <option value="wireless">Wireless</option>
                <option value="access_switching_wireless">Both</option>
              </select>
            </Field>
          )}
        </div>

        {isRfp && <RfpFields state={state} update={update} />}
        {isBom && <BomFields state={state} update={update} />}
      </div>
    </div>
  );
}

function RfpFields({ state, update }: Props) {
  return (
    <>
      <Field label="Key needs">
        <textarea
          value={state.keyNeeds}
          onChange={(e) => update({ keyNeeds: e.target.value })}
          placeholder="Summarise what the customer is asking for"
          className="form-input h-24 resize-none"
        />
      </Field>
      <Field label="Vendor preferences">
        <input
          value={state.vendorPreferences}
          onChange={(e) => update({ vendorPreferences: e.target.value })}
          placeholder="e.g. Cisco preferred, Juniper acceptable"
          className="form-input"
        />
      </Field>
      <Field label="Constraints">
        <textarea
          value={state.constraints}
          onChange={(e) => update({ constraints: e.target.value })}
          placeholder="Budget caps, timing, mandatory certifications"
          className="form-input h-20 resize-none"
        />
      </Field>
    </>
  );
}

function BomFields({ state, update }: Props) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="License tier">
          <select
            value={state.licenseTier}
            onChange={(e) =>
              update({
                licenseTier: e.target.value as WizardState["licenseTier"],
              })
            }
            className="form-input"
          >
            <option value="essentials">Essentials</option>
            <option value="advantage">Advantage</option>
          </select>
        </Field>
        <Field label="DNA tier">
          <select
            value={state.dnaTier}
            onChange={(e) =>
              update({ dnaTier: e.target.value as WizardState["dnaTier"] })
            }
            className="form-input"
          >
            <option value="essentials">Essentials</option>
            <option value="advantage">Advantage</option>
            <option value="opt_out">Opt out</option>
          </select>
        </Field>
        <Field label="Support term">
          <select
            value={state.supportTerm}
            onChange={(e) =>
              update({
                supportTerm: e.target.value as WizardState["supportTerm"],
              })
            }
            className="form-input"
          >
            <option value="3yr">3 years</option>
            <option value="5yr">5 years</option>
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-6">
        <Toggle
          checked={state.poeRequired}
          onChange={(v) => update({ poeRequired: v })}
          label="PoE"
        />
        <Toggle
          checked={state.redundantPSU}
          onChange={(v) => update({ redundantPSU: v })}
          label="Redundant PSU"
        />
        <Toggle
          checked={state.stacking}
          onChange={(v) => update({ stacking: v })}
          label="Stacking"
        />
      </div>
    </>
  );
}
