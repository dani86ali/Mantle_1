"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  MapPin,
  FileText,
  DollarSign,
  Clock,
  ChevronDown,
  ChevronUp,
  Plus,
  ExternalLink,
  Building2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Estimate {
  id: string;
  name: string;
  date: string;
  amount: number;
  status: "Draft" | "Submitted" | "Approved" | "Expired";
}

interface Customer {
  id: string;
  company: string;
  city: string;
  country: string;
  countryCode: string;
  estimateCount: number;
  totalVolume: number;
  lastActivity: string;
  contactName: string;
  contactEmail: string;
  industry: string;
  recentEstimates: Estimate[];
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const CUSTOMERS: Customer[] = [
  {
    id: "cust-001",
    company: "NTT DATA Services",
    city: "Riyadh",
    country: "Saudi Arabia",
    countryCode: "SA",
    estimateCount: 8,
    totalVolume: 245000,
    lastActivity: "2026-04-25",
    contactName: "Ahmed Al-Rashid",
    contactEmail: "a.alrashid@nttdata.com",
    industry: "IT Services",
    recentEstimates: [
      { id: "EST-2026-041", name: "Campus Network Refresh — Phase 2", date: "2026-04-25", amount: 67200, status: "Draft" },
      { id: "EST-2026-033", name: "Data Center Switching Upgrade", date: "2026-04-18", amount: 42800, status: "Submitted" },
      { id: "EST-2026-028", name: "Wireless Deployment — HQ", date: "2026-04-10", amount: 31500, status: "Approved" },
      { id: "EST-2026-019", name: "Branch Office Access Layer", date: "2026-03-28", amount: 18900, status: "Approved" },
    ],
  },
  {
    id: "cust-002",
    company: "Dimension Data Saudi Arabia",
    city: "Riyadh",
    country: "Saudi Arabia",
    countryCode: "SA",
    estimateCount: 5,
    totalVolume: 178000,
    lastActivity: "2026-04-22",
    contactName: "Faisal Al-Otaibi",
    contactEmail: "f.otaibi@dimensiondata.com",
    industry: "IT Services",
    recentEstimates: [
      { id: "EST-2026-038", name: "Enterprise Campus Switching", date: "2026-04-22", amount: 54300, status: "Draft" },
      { id: "EST-2026-030", name: "Wireless Controller Migration", date: "2026-04-14", amount: 28700, status: "Submitted" },
      { id: "EST-2026-022", name: "Access Layer Standardization", date: "2026-04-02", amount: 36100, status: "Approved" },
    ],
  },
  {
    id: "cust-003",
    company: "CDW Corporation",
    city: "Vernon Hills",
    country: "United States",
    countryCode: "US",
    estimateCount: 12,
    totalVolume: 892000,
    lastActivity: "2026-04-28",
    contactName: "Sarah Mitchell",
    contactEmail: "s.mitchell@cdw.com",
    industry: "IT Distribution",
    recentEstimates: [
      { id: "EST-2026-044", name: "Multi-Site Campus Deployment", date: "2026-04-28", amount: 142500, status: "Draft" },
      { id: "EST-2026-040", name: "Data Center Fabric Expansion", date: "2026-04-24", amount: 98200, status: "Submitted" },
      { id: "EST-2026-035", name: "Wireless 6E Rollout — Corporate", date: "2026-04-20", amount: 67800, status: "Approved" },
      { id: "EST-2026-029", name: "Branch Switching Refresh", date: "2026-04-12", amount: 45600, status: "Approved" },
    ],
  },
  {
    id: "cust-004",
    company: "Presidio Networked Solutions",
    city: "New York",
    country: "United States",
    countryCode: "US",
    estimateCount: 3,
    totalVolume: 67000,
    lastActivity: "2026-04-15",
    contactName: "James Chen",
    contactEmail: "j.chen@presidio.com",
    industry: "IT Solutions",
    recentEstimates: [
      { id: "EST-2026-026", name: "Office Network Upgrade", date: "2026-04-15", amount: 32400, status: "Submitted" },
      { id: "EST-2026-018", name: "Wireless Access Points — Floor 3-5", date: "2026-03-30", amount: 19800, status: "Approved" },
      { id: "EST-2026-012", name: "Switch Stack Replacement", date: "2026-03-18", amount: 14800, status: "Approved" },
    ],
  },
  {
    id: "cust-005",
    company: "Gulf Business Machines",
    city: "Manama",
    country: "Bahrain",
    countryCode: "BH",
    estimateCount: 4,
    totalVolume: 134000,
    lastActivity: "2026-04-20",
    contactName: "Youssef Al-Khalifa",
    contactEmail: "y.alkhalifa@gbm.me",
    industry: "IT Services",
    recentEstimates: [
      { id: "EST-2026-036", name: "Campus Core & Distribution", date: "2026-04-20", amount: 48700, status: "Draft" },
      { id: "EST-2026-027", name: "Wireless Infrastructure — Phase 1", date: "2026-04-08", amount: 35200, status: "Submitted" },
      { id: "EST-2026-020", name: "Edge Switching Deployment", date: "2026-03-29", amount: 27600, status: "Approved" },
    ],
  },
  {
    id: "cust-006",
    company: "e& enterprise",
    city: "Abu Dhabi",
    country: "United Arab Emirates",
    countryCode: "AE",
    estimateCount: 2,
    totalVolume: 45000,
    lastActivity: "2026-04-10",
    contactName: "Layla Hassan",
    contactEmail: "l.hassan@eand.com",
    industry: "Telecommunications",
    recentEstimates: [
      { id: "EST-2026-024", name: "SMB Switching Solution", date: "2026-04-10", amount: 26300, status: "Draft" },
      { id: "EST-2026-015", name: "Wireless Pilot — Building A", date: "2026-03-22", amount: 18700, status: "Approved" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusColor(status: Estimate["status"]): string {
  switch (status) {
    case "Draft":
      return "text-yellow-400 bg-yellow-400/10";
    case "Submitted":
      return "text-blue-400 bg-blue-400/10";
    case "Approved":
      return "text-emerald-400 bg-emerald-400/10";
    case "Expired":
      return "text-red-400 bg-red-400/10";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return CUSTOMERS;
    const q = search.toLowerCase();
    return CUSTOMERS.filter(
      (c) =>
        c.company.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q) ||
        c.countryCode.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q)
    );
  }, [search]);

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
              {filtered.length} customer{filtered.length !== 1 ? "s" : ""} in directory
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
              placeholder="Search by company, country, city..."
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
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total Customers", value: CUSTOMERS.length.toString() },
            {
              label: "Total Estimates",
              value: CUSTOMERS.reduce((s, c) => s + c.estimateCount, 0).toString(),
            },
            {
              label: "Total Volume",
              value: formatCurrency(CUSTOMERS.reduce((s, c) => s + c.totalVolume, 0)),
            },
            {
              label: "Countries",
              value: new Set(CUSTOMERS.map((c) => c.countryCode)).size.toString(),
            },
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

        {/* ---- Customer Cards ---- */}
        {filtered.length === 0 ? (
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
              const isExpanded = expandedId === customer.id;
              return (
                <div
                  key={customer.id}
                  className="rounded-xl border border-[var(--border)] bg-bg-card transition-colors hover:border-[var(--border-hover)]"
                >
                  {/* Card Header — clickable */}
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : customer.id)
                    }
                    className="flex w-full items-center gap-4 px-5 py-4 text-left"
                  >
                    {/* Company icon */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <Building2 size={20} />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {customer.company}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-text-secondary">
                        <MapPin size={12} className="shrink-0" />
                        <span>
                          {customer.city}, {customer.countryCode}
                        </span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="hidden items-center gap-6 sm:flex">
                      <div className="text-right">
                        <p className="text-xs text-text-tertiary">Estimates</p>
                        <p className="text-sm font-medium text-text-primary">
                          {customer.estimateCount}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-text-tertiary">Volume</p>
                        <p className="text-sm font-medium text-accent">
                          {formatCurrency(customer.totalVolume)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-text-tertiary">Last Active</p>
                        <p className="text-sm font-medium text-text-secondary">
                          {formatDate(customer.lastActivity)}
                        </p>
                      </div>
                    </div>

                    {/* Expand chevron */}
                    <div className="ml-2 shrink-0 text-text-tertiary">
                      {isExpanded ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </div>
                  </button>

                  {/* Mobile stats (shown below company on small screens) */}
                  <div className="flex items-center gap-4 border-t border-[var(--border)] px-5 py-2 sm:hidden">
                    <span className="flex items-center gap-1 text-xs text-text-secondary">
                      <FileText size={12} />
                      {customer.estimateCount} estimates
                    </span>
                    <span className="flex items-center gap-1 text-xs text-accent">
                      <DollarSign size={12} />
                      {formatCurrency(customer.totalVolume)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-text-tertiary">
                      <Clock size={12} />
                      {formatDate(customer.lastActivity)}
                    </span>
                  </div>

                  {/* ---- Expanded Detail Panel ---- */}
                  {isExpanded && (
                    <div className="border-t border-[var(--border)] px-5 py-5">
                      <div className="grid gap-6 lg:grid-cols-3">
                        {/* Company Info */}
                        <div className="lg:col-span-1">
                          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                            Company Info
                          </h3>
                          <div className="space-y-2.5">
                            <div>
                              <p className="text-xs text-text-tertiary">
                                Location
                              </p>
                              <p className="text-sm text-text-primary">
                                {customer.city}, {customer.country}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-tertiary">
                                Industry
                              </p>
                              <p className="text-sm text-text-primary">
                                {customer.industry}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-tertiary">
                                Primary Contact
                              </p>
                              <p className="text-sm text-text-primary">
                                {customer.contactName}
                              </p>
                              <p className="text-xs text-text-secondary">
                                {customer.contactEmail}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-tertiary">
                                Total Volume
                              </p>
                              <p className="text-sm font-semibold text-accent">
                                {formatCurrency(customer.totalVolume)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Recent Estimates */}
                        <div className="lg:col-span-2">
                          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                            Recent Estimates
                          </h3>
                          <div className="space-y-2">
                            {customer.recentEstimates.map((est) => (
                              <Link
                                key={est.id}
                                href={`/estimates`}
                                className="group flex items-center justify-between rounded-lg border border-[var(--border)] bg-bg-primary px-4 py-3 transition-colors hover:border-[var(--border-hover)]"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-text-tertiary">
                                      {est.id}
                                    </span>
                                    <span
                                      className={cn(
                                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                        statusColor(est.status)
                                      )}
                                    >
                                      {est.status}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 truncate text-sm text-text-primary group-hover:text-accent">
                                    {est.name}
                                  </p>
                                </div>
                                <div className="ml-4 flex shrink-0 items-center gap-4">
                                  <div className="text-right">
                                    <p className="text-xs text-text-tertiary">
                                      {formatDate(est.date)}
                                    </p>
                                    <p className="text-sm font-medium text-text-primary">
                                      {formatCurrency(est.amount)}
                                    </p>
                                  </div>
                                  <ExternalLink
                                    size={14}
                                    className="text-text-tertiary group-hover:text-accent"
                                  />
                                </div>
                              </Link>
                            ))}
                          </div>

                          {/* Create Estimate Button */}
                          <Link
                            href="/estimate/new"
                            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-text-primary transition-opacity hover:opacity-90"
                          >
                            <Plus size={16} />
                            Create Estimate for {customer.company}
                          </Link>
                        </div>
                      </div>
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
