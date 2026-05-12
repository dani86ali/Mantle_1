"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes, parseBomText, type WizardState } from "../types";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}

export default function BomUpload({ state, update }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const parsed = parseBomText(state.bomText);

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary">
        Provide your BoM
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Upload a single XLSX/CSV file, or paste lines as{" "}
        <span className="font-mono text-text-primary">SKU, qty</span>.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-text-secondary">
            File upload
          </label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) update({ bomFile: f });
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex h-40 cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed text-center transition-colors",
              dragOver
                ? "border-accent bg-accent-muted"
                : "border-[var(--border)] bg-bg-card hover:border-[var(--border-hover)]"
            )}
          >
            <Upload size={22} className="text-accent" />
            <p className="mt-2 text-sm font-medium text-text-primary">
              Drop XLSX or CSV
            </p>
            <p className="mt-1 text-xs text-text-tertiary">Single file</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) update({ bomFile: f });
                e.target.value = "";
              }}
            />
          </div>
          {state.bomFile && (
            <div className="mt-3 flex items-center gap-2 rounded-input bg-bg-card px-3 py-2">
              <FileSpreadsheet size={16} className="text-success" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-primary">
                  {state.bomFile.name}
                </p>
                <p className="text-xs text-text-tertiary">
                  {formatBytes(state.bomFile.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => update({ bomFile: null })}
                className="text-text-tertiary hover:text-destructive"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-text-secondary">
            Or paste lines
          </label>
          <textarea
            value={state.bomText}
            onChange={(e) => update({ bomText: e.target.value })}
            placeholder={"C9300L-24UXG-4X-A, 2\nC9300L-DNA-A-24-3Y, 2"}
            className="form-input h-40 resize-none font-mono text-xs"
          />
        </div>
      </div>

      {parsed.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-card border border-[var(--border)] bg-bg-primary">
          <div className="border-b border-[var(--border)] px-4 py-2.5 text-sm font-medium text-text-primary">
            Preview — {parsed.length} {parsed.length === 1 ? "line" : "lines"}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-text-tertiary">
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {parsed.map((l, i) => (
                  <tr key={i}>
                    <td className="px-4 py-1.5 font-mono text-text-primary">
                      {l.sku}
                    </td>
                    <td className="px-4 py-1.5 text-right text-text-secondary">
                      {l.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
