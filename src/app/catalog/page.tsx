"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Info, Search, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  QuickBomCatalogAuthorityEntry,
  QuickBomCatalogAuthoritySurface,
} from "@/lib/projects/quick-bom-catalog-authority-surface";

export default function CatalogPage() {
  const [catalog, setCatalog] = useState<QuickBomCatalogAuthoritySurface | null>(null);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/catalog/quick-bom");
        if (!res.ok) throw new Error("catalog authority failed");
        const json = (await res.json()) as { catalog?: QuickBomCatalogAuthoritySurface };
        if (cancelled) return;
        setCatalog(json.catalog ?? null);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setQuery(input), 250);
    return () => clearTimeout(timeout);
  }, [input]);

  const entries = useMemo(() => {
    const rows = catalog?.entries ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.sku.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q)
    );
  }, [catalog, query]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] px-6 py-5">
        <h1 className="text-2xl font-semibold text-text-primary">Catalog</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
          <Info size={14} className="text-text-tertiary" />
          Active/default Quick BoM authority coverage for SKU recognition,
          pricing, and configuration rules.
        </p>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
          Unable to load Catalog authority coverage.
        </div>
      )}

      <div className="border-b border-[var(--border)] px-6 py-4">
        <div className="relative max-w-2xl">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search active Quick BoM authority coverage..."
            className="w-full rounded-input border border-[var(--border)] bg-bg-card py-2.5 pl-10 pr-10 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {input && (
            <button
              onClick={() => setInput("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 skeleton" />
            ))}
          </div>
        ) : catalog ? (
          <div className="space-y-6">
            <CoverageSummary catalog={catalog} />
            <AuthorityBoundaries catalog={catalog} />
            <CatalogEntries entries={entries} total={catalog.entries.length} />
          </div>
        ) : (
          <div className="rounded-card border border-[var(--border)] bg-bg-card p-8 text-center text-sm text-text-tertiary">
            No Catalog authority coverage available.
          </div>
        )}
      </div>
    </div>
  );
}

function CoverageSummary({ catalog }: { catalog: QuickBomCatalogAuthoritySurface }) {
  const cards = [
    {
      label: "SKU Recognition",
      value: catalog.catalog.entryCount,
      detail: "default catalog entries",
    },
    {
      label: "Pricing Coverage",
      value: catalog.pricing.coveredSkuCount,
      detail: `${catalog.pricing.currency} active authority`,
    },
    {
      label: "Config Parent Rules",
      value: catalog.configurationRules.parentRuleCount,
      detail: `${catalog.configurationRules.childRuleCount} child lines`,
    },
    {
      label: "Rule Sources",
      value: catalog.configurationRules.sourcePackCount,
      detail: `${catalog.configurationRules.status} packs`,
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-card border border-[var(--border)] bg-bg-card p-4"
        >
          <p className="text-xs uppercase tracking-wide text-text-tertiary">{card.label}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-text-primary">
            {card.value}
          </p>
          <p className="mt-1 text-xs text-text-secondary">{card.detail}</p>
        </div>
      ))}
    </section>
  );
}

function AuthorityBoundaries({ catalog }: { catalog: QuickBomCatalogAuthoritySurface }) {
  const rows = [
    ["Runtime AI decisions", catalog.boundaries.runtimeAiDecisions ? "On" : "Off"],
    ["Live catalog lookup", catalog.boundaries.liveCatalogLookup ? "On" : "Off"],
    ["Broad production catalog authority", catalog.boundaries.broadProductionCatalogAuthority ? "Yes" : "No"],
    ["Broad production pricing authority", catalog.boundaries.broadProductionPricingAuthority ? "Yes" : "No"],
    ["Replacement authority", catalog.boundaries.replacementAuthority ? "Yes" : "No"],
    ["Silent SKU substitution", catalog.boundaries.silentSkuSubstitution ? "Yes" : "No"],
    ["Pricing and configuration authority", catalog.boundaries.configurationAuthoritySeparateFromPricing ? "Separate" : "Combined"],
    ["Missing data", catalog.boundaries.missingDataDeferred ? "Deferred/report-only" : "Allowed"],
  ];

  return (
    <section className="rounded-card border border-[var(--border)] bg-bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Authority Boundaries</h2>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-button border border-[var(--border)] px-3 py-2 text-sm"
          >
            <span className="text-text-secondary">{label}</span>
            <span className="font-medium text-text-primary">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CatalogEntries({
  entries,
  total,
}: {
  entries: QuickBomCatalogAuthorityEntry[];
  total: number;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-[var(--border)] bg-bg-card">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-sm font-semibold text-text-primary">Coverage Entries</h2>
        <span className="text-xs text-text-tertiary">
          {entries.length} of {total}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-text-tertiary">
              <th className="px-5 py-3 font-medium">SKU</th>
              <th className="px-5 py-3 font-medium">Description</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">Pricing</th>
              <th className="px-5 py-3 font-medium">Config Rule</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {entries.map((entry) => (
              <tr key={entry.sku} className="hover:bg-bg-elevated">
                <td className="whitespace-nowrap px-5 py-3 font-mono text-text-primary">
                  {entry.sku}
                </td>
                <td className="max-w-xl px-5 py-3 text-text-secondary">
                  {entry.description}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-text-secondary">
                  {entry.category}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <CoveragePill
                    ok={entry.pricingCoverage === "priced_by_active_authority"}
                    label={
                      entry.pricingCoverage === "priced_by_active_authority"
                        ? "Covered"
                        : "Deferred"
                    }
                  />
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <CoveragePill
                    ok={entry.configRuleCoverage === "parent_rule_available"}
                    label={
                      entry.configRuleCoverage === "parent_rule_available"
                        ? "Parent rule"
                        : "No parent rule"
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CoveragePill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        ok ? "bg-success-muted text-success" : "bg-warning-muted text-warning"
      )}
    >
      {ok && <CheckCircle2 className="h-3 w-3" />}
      {label}
    </span>
  );
}
