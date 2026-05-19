"use client";

import { AlertTriangle } from "lucide-react";
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
        Drop any number of files, then tag each one. A <strong>BoQ</strong> and{" "}
        <strong>RFP</strong> are recommended but not required.
      </p>

      <div className="mt-6">
        <PileUpload
          value={state.pileFiles}
          onChange={(pileFiles) => update({ pileFiles })}
        />
      </div>

      {state.pileFiles.length > 0 && status.blockingReason && (
        <p className="mt-3 text-xs text-warning">{status.blockingReason}</p>
      )}

      {status.warnings.length > 0 && (
        <ul
          data-testid="pile-warnings"
          className="mt-3 space-y-1 rounded-card border border-destructive/40 bg-destructive-muted px-3 py-2"
        >
          {status.warnings.map((w) => (
            <li
              key={w}
              className="flex items-center gap-1.5 text-[11px] text-destructive"
            >
              <AlertTriangle size={11} />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
