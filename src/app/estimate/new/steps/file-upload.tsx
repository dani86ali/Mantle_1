"use client";

import TypedSlotUpload from "@/components/intake/typed-slot-upload";
import { DOCUMENT_SLOTS } from "@/components/intake/document-slots";
import type { WizardState } from "../types";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}

export default function FileUpload({ state, update }: Props) {
  const requiredLabels = DOCUMENT_SLOTS.filter((s) => s.required)
    .map((s) => s.label)
    .join(" and ");

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary">
        Upload RFP package
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Drop each document into its labeled slot. {requiredLabels} are required;
        the rest are optional.
      </p>

      <div className="mt-6">
        <TypedSlotUpload
          value={state.rfpSlots}
          onChange={(rfpSlots) => update({ rfpSlots })}
          onValidityChange={(rfpSlotsValid) => update({ rfpSlotsValid })}
        />
      </div>
    </div>
  );
}
