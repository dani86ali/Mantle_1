"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { FortinetCategory, FortinetProduct } from "@/engines/e2/fortinet-catalog";

const PAGE_SIZE = 50;

const CATEGORIES: { value: FortinetCategory | ""; label: string }[] = [
  { value: "", label: "All categories" },
  { value: "firewall", label: "Firewall" },
  { value: "switch", label: "Switch" },
  { value: "ap", label: "AP" },
  { value: "manager", label: "Manager" },
  { value: "analyzer", label: "Analyzer" },
  { value: "guard_bundle", label: "Guard bundle" },
  { value: "care", label: "Care" },
  { value: "other", label: "Other" },
];

const CATEGORY_STYLES: Record<FortinetCategory, string> = {
  firewall: "bg-destructive-muted text-destructive",
  switch: "bg-blue-muted text-blue",
  ap: "bg-accent-muted text-accent",
  manager: "bg-warning-muted text-warning",
  analyzer: "bg-[rgba(139,92,246,0.12)] text-[#a78bfa]",
  guard_bundle: "bg-success-muted text-success",
  care: "bg-[rgba(136,136,160,0.12)] text-text-secondary",
  other: "bg-[rgba(136,136,160,0.08)] text-text-tertiary",
};

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

interface ApiResponse {
  items: FortinetProduct[];
  total: number;
  offset: number;
  limit: number;
}

export default function FortinetTab({ query }: { query: string }) {
  const [category, setCategory] = useState<FortinetCategory | "">("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset pagination whenever query or category changes
  useEffect(() => {
    setOffset(0);
  }, [query, category]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      search: query,
      category,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    fetch(`/api/catalog/fortinet?${params.toString()}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Failed to load");
        return json as ApiResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, category, offset]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-6 py-3">
        <div className="flex items-center gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as FortinetCategory | "")}
            className="rounded-input border border-[var(--border)] bg-bg-card px-3 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-text-secondary">
            {loading ? (
              "Loading…"
            ) : (
              <>
                <span className="font-medium text-text-primary">{pageStart}</span>–
                <span className="font-medium text-text-primary">{pageEnd}</span> of{" "}
                <span className="font-medium text-text-primary">{total}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={!canPrev || loading}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            className="rounded-button border border-[var(--border)] bg-bg-card px-3 py-1.5 text-xs text-text-primary disabled:opacity-40 hover:enabled:border-accent"
          >
            Prev
          </button>
          <button
            disabled={!canNext || loading}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            className="rounded-button border border-[var(--border)] bg-bg-card px-3 py-1.5 text-xs text-text-primary disabled:opacity-40 hover:enabled:border-accent"
          >
            Next
          </button>
        </div>
      </div>

      {error && (
        <div className="m-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-card">
            <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
              <th className="px-6 py-2">SKU</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">List USD</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Family</th>
              <th className="px-4 py-2 text-center">EoL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.sku} className="border-b border-[var(--border)] hover:bg-[var(--bg-elevated)]">
                <td className="px-6 py-2 font-mono text-text-primary">{p.sku}</td>
                <td className="max-w-md truncate px-4 py-2 text-text-secondary">{p.description}</td>
                <td className="px-4 py-2 text-right font-mono text-text-secondary">
                  {p.listPriceUsd > 0 ? formatUsd(p.listPriceUsd) : "—"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                      CATEGORY_STYLES[p.category]
                    )}
                  >
                    {p.category.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-2 text-text-secondary">{p.family}</td>
                <td className="px-4 py-2 text-center">
                  {p.eol ? (
                    <span className="inline-block rounded bg-destructive-muted px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                      EoL
                    </span>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-20 text-sm text-text-tertiary">
            No Fortinet products match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
