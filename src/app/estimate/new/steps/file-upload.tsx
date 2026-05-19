"use client";

import PileUpload, { pileIsValid } from "@/components/intake/pile-upload";
import type { WizardState } from "../types";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}

export default function FileUpload({ state, update }: Props) {
  const status = pileIsValid(state.pileFiles);

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary">
        Upload RFP package
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Drop any number of files, then tag each one. At least one{" "}
        <strong>BoQ</strong> and one <strong>RFP</strong> file are required.
      </p>

      <div className="mt-6">
        <PileUpload
          value={state.pileFiles}
          onChange={(pileFiles) => update({ pileFiles })}
        />
      </div>

      {state.pileFiles.length > 0 && !status.valid && (
        <p className="mt-3 text-xs text-warning">{status.reason}</p>
      )}
    </div>
  );
}
