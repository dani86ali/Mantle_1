"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  MapPin,
  FileText,
  Clock,
  ChevronDown,
  ChevronUp,
  Plus,
  Building2,
  X,
  Loader2,
} from "lucide-react";
import type { CustomerSummary } from "@/app/api/customers/route";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedName, setExpandedName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/customers")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        return res.json();
      })
      .then((data: { customers: CustomerSummary[] }) => {
        if (cancelled) return;
        setCustomers(data.customers ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.country?.toLowerCase().includes(q) ?? false) ||
        c.region.toLowerCase().includes(q) ||
        c.domain.toLowerCase().includes(q)
    );
  }, [search, customers]);

  const totalEstimates = useMemo(
    () => customers.reduce((s, c) => s + c.estimateCount, 0),
    [customers]
  );
  const countryCount = useMemo(
    () =>
      new Set(customers.map((c) => c.country).filter(Boolean)).size,
    [customers]
  );

  return (
    <div className="flex-1 overflow-y-auto bg-bg-primary">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* ---- Header ---- */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Customers
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              {loading
                ? "Loading…"
                : `${filtered.length} customer${filtered.length !== 1 ? "s" : ""} in directory`}
            </p>
          </div>

          {/* Search */}
          <div className="relative w-full max-w-sm">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company, country, region, domain..."
              className="w-full rounded-lg border border-[var(--border)] bg-bg-card py-2 pl-9 pr-9 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ---- Summary Stats ---- */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          {[
            { label: "Total Customers", value: customers.length.toString() },
            { label: "Total Estimates", value: totalEstimates.toString() },
            { label: "Countries", value: countryCount.toString() },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-[var(--border)] bg-bg-card px-4 py-3"
            >
              <p className="text-xs text-text-tertiary">{stat.label}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* ---- States: loading / error / empty / list ---- */}
        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-bg-card py-16">
            <Loader2 size={20} className="animate-spin text-text-tertiary" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-400">
            {error}
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-bg-card py-16 text-center">
            <Building2 size={32} className="mb-3 text-text-tertiary" />
            <p className="text-sm text-text-secondary">No customers yet</p>
            <p className="mt-1 text-xs text-text-tertiary">
              Customers appear here once you create an estimate intake.
            </p>
            <Link
              href="/estimate/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-text-primary transition-opacity hover:opacity-90"
            >
              <Plus size={14} />
              New Estimate
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-bg-card py-16 text-center">
            <Search size={32} className="mb-3 text-text-tertiary" />
            <p className="text-sm text-text-secondary">
              No customers match &ldquo;{search}&rdquo;
            </p>
            <button
              onClick={() => setSearch("")}
              className="mt-3 text-sm text-accent hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((customer) => {
              const isExpanded = expandedName === customer.name;
              return (
                <div
                  key={customer.name}
                  className="rounded-xl border border-[var(--border)] bg-bg-card transition-colors hover:border-[var(--border-hover)]"
                >
                  <button
                    onClick={() =>
                      setExpandedName(isExpanded ? null : customer.name)
                    }
                    className="flex w-full items-center gap-4 px-5 py-4 text-left"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <Building2 size={20} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {customer.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-text-secondary">
                        <MapPin size={12} className="shrink-0" />
                        <span>
                          {customer.country ?? customer.region}
                        </span>
                      </div>
                    </div>

                    <div className="hidden items-center gap-6 sm:flex">
                      <div className="text-right">
                        <p className="text-xs text-text-tertiary">Estimates</p>
                        <p className="text-sm font-medium text-text-primary">
                          {customer.estimateCount}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-text-tertiary">Domain</p>
                        <p className="text-sm font-medium text-accent">
                          {customer.domain}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-text-tertiary">Last Active</p>
                        <p className="text-sm font-medium text-text-secondary">
                          {formatDate(customer.lastActivity)}
                        </p>
                      </div>
                    </div>

                    <div className="ml-2 shrink-0 text-text-tertiary">
                      {isExpanded ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </div>
                  </button>

                  {/* Mobile stats */}
                  <div className="flex items-center gap-4 border-t border-[var(--border)] px-5 py-2 sm:hidden">
                    <span className="flex items-center gap-1 text-xs text-text-secondary">
                      <FileText size={12} />
                      {customer.estimateCount} estimates
                    </span>
                    <span className="flex items-center gap-1 text-xs text-accent">
                      {customer.domain}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-text-tertiary">
                      <Clock size={12} />
                      {formatDate(customer.lastActivity)}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[var(--border)] px-5 py-5">
                      <div className="grid gap-6 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-text-tertiary">Region</p>
                          <p className="text-sm text-text-primary">
                            {customer.region}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-tertiary">Country</p>
                          <p className="text-sm text-text-primary">
                            {customer.country ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-tertiary">Domain</p>
                          <p className="text-sm text-text-primary">
                            {customer.domain}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-tertiary">
                            Last Activity
                          </p>
                          <p className="text-sm text-text-primary">
                            {formatDate(customer.lastActivity)}
                          </p>
                        </div>
                      </div>

                      <Link
                        href="/estimate/new"
                        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-text-primary transition-opacity hover:opacity-90"
                      >
                        <Plus size={16} />
                        Create Estimate for {customer.name}
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
