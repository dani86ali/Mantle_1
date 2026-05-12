"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import specsJson from "../../../docs/BOMATIC_Device_Specs.json";

interface SwitchSpec {
  model: string;
  ports?: number;
  port_type?: string;
  poe_budget_default_w?: number;
  fans?: number;
  stack_max?: number;
}

interface ApSpec {
  model: string;
  wifi?: string;
  antenna?: string;
  mimo?: string;
  poe_draw_w?: number;
  max_poe_w?: number;
}

export interface CiscoProduct {
  model: string;
  description: string;
  category: "switch" | "ap";
  family: string;
  poeBudget: number;
  portCount: number;
  fanCount: number;
  stackSupport: boolean;
}

function switchDescription(s: SwitchSpec): string {
  const ports = s.ports ?? 0;
  const portType = s.port_type ?? "";
  return `${ports}-port ${portType}`.trim();
}

function apDescription(a: ApSpec): string {
  const parts = [a.wifi, a.antenna ? `${a.antenna} antenna` : "", a.mimo].filter(Boolean);
  return parts.join(" · ");
}

const FAMILY_ORDER = ["Catalyst 9300", "Catalyst 9300L", "Catalyst 9300X", "Wireless APs"];

function buildCiscoProducts(): CiscoProduct[] {
  const out: CiscoProduct[] = [];
  const sw = specsJson.cisco_switches as Record<string, SwitchSpec[]>;
  const familyMap: Record<string, string> = {
    catalyst_9300: "Catalyst 9300",
    catalyst_9300L: "Catalyst 9300L",
    catalyst_9300X: "Catalyst 9300X",
  };
  for (const [key, family] of Object.entries(familyMap)) {
    for (const s of sw[key] ?? []) {
      out.push({
        model: s.model,
        description: switchDescription(s),
        category: "switch",
        family,
        poeBudget: s.poe_budget_default_w ?? 0,
        portCount: s.ports ?? 0,
        fanCount: s.fans ?? 0,
        stackSupport: (s.stack_max ?? 0) > 1,
      });
    }
  }
  for (const a of (specsJson.cisco_wireless_aps as ApSpec[]) ?? []) {
    out.push({
      model: a.model,
      description: apDescription(a),
      category: "ap",
      family: "Wireless APs",
      poeBudget: a.poe_draw_w ?? 0,
      portCount: 1,
      fanCount: 0,
      stackSupport: false,
    });
  }
  return out;
}

const ALL_CISCO = buildCiscoProducts();

const CATEGORY_STYLES: Record<CiscoProduct["category"], string> = {
  switch: "bg-blue-muted text-blue",
  ap: "bg-accent-muted text-accent",
};

export default function CiscoTab({ query }: { query: string }) {
  const grouped = useMemo(() => {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? ALL_CISCO.filter(
          (p) =>
            p.model.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q)
        )
      : ALL_CISCO;
    const byFamily = new Map<string, CiscoProduct[]>();
    for (const p of filtered) {
      const arr = byFamily.get(p.family) ?? [];
      arr.push(p);
      byFamily.set(p.family, arr);
    }
    return FAMILY_ORDER.filter((f) => byFamily.has(f)).map((f) => ({
      family: f,
      products: byFamily.get(f)!,
    }));
  }, [query]);

  const total = grouped.reduce((n, g) => n + g.products.length, 0);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-[var(--border)] px-6 py-3">
        <p className="text-xs text-text-secondary">
          <span className="font-medium text-text-primary">{total}</span> Cisco products
        </p>
      </div>
      {grouped.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-sm text-text-tertiary">
          No Cisco products match your search.
        </div>
      )}
      {grouped.map((g) => (
        <div key={g.family}>
          <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-bg-card px-6 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {g.family} <span className="ml-2 text-text-tertiary">{g.products.length}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                <th className="px-6 py-2">Model</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2 text-right">PoE (W)</th>
                <th className="px-4 py-2 text-right">Ports</th>
                <th className="px-4 py-2 text-right">Fans</th>
                <th className="px-4 py-2 text-center">Stack</th>
              </tr>
            </thead>
            <tbody>
              {g.products.map((p) => (
                <tr key={p.model} className="border-b border-[var(--border)] hover:bg-[var(--bg-elevated)]">
                  <td className="px-6 py-2.5 font-mono text-text-primary">{p.model}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{p.description}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                        CATEGORY_STYLES[p.category]
                      )}
                    >
                      {p.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                    {p.poeBudget > 0 ? p.poeBudget : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{p.portCount}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{p.fanCount}</td>
                  <td className="px-4 py-2.5 text-center text-text-secondary">
                    {p.stackSupport ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
