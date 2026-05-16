import { ExternalLink } from "lucide-react";
import { fmtUSD } from "./extractors";
import type { BomLineData } from "./types";

/** Inline BoM table rendered inside an assistant chat bubble. Includes
 *  download-to-CSV and open-in-Review-Console actions. */
export function InlineBom({ lines, bomDraftId }: { lines: BomLineData[]; bomDraftId?: string }) {
  const total = lines.reduce((s, l) => s + l.unitListPrice * l.quantity, 0);

  function downloadCsv() {
    const header = "Part Number,Description,Qty,Unit List Price,Extended Price,Category\n";
    const rows = lines
      .map((l) =>
        `${l.sku},"${(l.description ?? "").replace(/"/g, '""')}",${l.quantity},${l.unitListPrice.toFixed(2)},${(l.unitListPrice * l.quantity).toFixed(2)},${l.category}`,
      )
      .join("\n");
    const csv = "﻿" + header + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `BOMatic_Estimate_${bomDraftId ?? Date.now()}.csv`);
  }

  function downloadXlsx() {
    if (bomDraftId) {
      window.open(`/api/export?bomDraftId=${bomDraftId}&format=xlsx`, "_blank");
      return;
    }
    downloadCsv();
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-bg-card">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
        <span className="text-[11px] font-medium text-text-secondary">
          BoM — {lines.length} items
        </span>
        {bomDraftId && (
          <span className="rounded bg-success-muted px-1.5 py-0.5 text-[10px] text-success">
            Saved
          </span>
        )}
      </div>

      <div className="max-h-48 overflow-y-auto">
        <table className="min-w-full text-[11px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-text-tertiary">
              <th className="px-2 py-1.5 text-left font-medium">SKU</th>
              <th className="px-2 py-1.5 text-right font-medium">Qty</th>
              <th className="px-2 py-1.5 text-right font-medium">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/50">
            {lines.map((l, i) => (
              <tr key={i} className="hover:bg-bg-elevated">
                <td className="px-2 py-1 font-mono text-text-primary">{l.sku}</td>
                <td className="px-2 py-1 text-right text-text-secondary">{l.quantity}</td>
                <td className="px-2 py-1 text-right font-mono text-text-secondary">
                  {l.unitListPrice > 0 ? fmtUSD(l.unitListPrice) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-1.5">
        <span className="text-[11px] text-text-tertiary">Total</span>
        <span className="font-mono text-xs font-medium text-accent">{fmtUSD(total)}</span>
      </div>

      <div className="flex items-center gap-1.5 border-t border-[var(--border)] px-3 py-2">
        {bomDraftId && (
          <a
            href={`/estimates/${bomDraftId}`}
            className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-text-primary hover:bg-accent-hover"
          >
            <ExternalLink size={10} /> Review Console
          </a>
        )}
        <button
          onClick={downloadCsv}
          className="rounded border border-[var(--border)] px-2.5 py-1 text-[11px] text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary"
        >
          CSV
        </button>
        <button
          onClick={downloadXlsx}
          className="rounded border border-[var(--border)] px-2.5 py-1 text-[11px] text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary"
        >
          XLSX
        </button>
      </div>
    </div>
  );
}
