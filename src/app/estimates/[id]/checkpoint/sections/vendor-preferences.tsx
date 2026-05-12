"use client";

import { Badge, VENDOR_BADGE } from "./common";
import type { VendorRow } from "./types";

export function VendorPreferencesSection({ vendors }: { vendors: VendorRow[] }) {
  if (vendors.length === 0) {
    return <p className="text-sm text-text-tertiary">No vendor preferences detected.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-text-tertiary">
            <th className="py-2 pr-3 font-medium">Vendor</th>
            <th className="py-2 pr-3 font-medium">Category</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Specific models</th>
            <th className="py-2 pr-3 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((v, i) => (
            <tr key={`${v.vendor}-${i}`} className="border-b border-[var(--border)] align-top">
              <td className="py-2 pr-3 font-medium text-text-primary">{v.vendor}</td>
              <td className="py-2 pr-3 text-text-secondary">{v.category}</td>
              <td className="py-2 pr-3">
                <Badge tone={VENDOR_BADGE[v.status]}>{v.status.replace(/_/g, " ")}</Badge>
              </td>
              <td className="py-2 pr-3 font-mono text-xs text-text-secondary">
                {v.specificModels.length === 0 ? (
                  <span className="text-text-tertiary">—</span>
                ) : (
                  v.specificModels.join(", ")
                )}
              </td>
              <td className="py-2 pr-3 font-mono text-xs text-text-tertiary">{v.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
