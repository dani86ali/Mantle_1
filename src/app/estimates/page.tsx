"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  SearchX,
  Calendar,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EstimateStatus =
  | "Pending"
  | "Processing"
  | "Ready for Review"
  | "Approved"
  | "Failed"
  | "Draft";

type Domain = "Access Switching" | "Wireless" | "Both";

interface Estimate {
  id: string;
  customer: string;
  domain: Domain;
  status: EstimateStatus;
  engineer: string;
  created: string; // ISO date
  totalPrice: number;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_ESTIMATES: Estimate[] = [
  {
    id: "OG164161387AE",
    customer: "NTT Data",
    domain: "Access Switching",
    status: "Approved",
    engineer: "Sarah Chen",
    created: "2026-04-28",
    totalPrice: 148_250.0,
  },
  {
    id: "OG164161492BF",
    customer: "CDW",
    domain: "Wireless",
    status: "Processing",
    engineer: "James Rivera",
    created: "2026-04-27",
    totalPrice: 67_430.0,
  },
  {
    id: "OG164161538CG",
    customer: "Presidio",
    domain: "Both",
    status: "Ready for Review",
    engineer: "Sarah Chen",
    created: "2026-04-26",
    totalPrice: 95_120.0,
  },
  {
    id: "OG164161604DH",
    customer: "Gulf Business Machines",
    domain: "Access Switching",
    status: "Pending",
    engineer: "Amit Patel",
    created: "2026-04-25",
    totalPrice: 33_780.0,
  },
  {
    id: "OG164161715EI",
    customer: "Logicalis",
    domain: "Wireless",
    status: "Failed",
    engineer: "James Rivera",
    created: "2026-04-24",
    totalPrice: 21_560.0,
  },
  {
    id: "OG164161829FJ",
    customer: "Dimension Data",
    domain: "Access Switching",
    status: "Approved",
    engineer: "Sarah Chen",
    created: "2026-04-23",
    totalPrice: 112_900.0,
  },
  {
    id: "OG164161934GK",
    customer: "Insight Enterprises",
    domain: "Both",
    status: "Draft",
    engineer: "Amit Patel",
    created: "2026-04-22",
    totalPrice: 15_340.0,
  },
  {
    id: "OG164162048HL",
    customer: "SHI International",
    domain: "Access Switching",
    status: "Processing",
    engineer: "James Rivera",
    created: "2026-04-21",
    totalPrice: 87_650.0,
  },
  {
    id: "OG164162157IM",
    customer: "World Wide Technology",
    domain: "Wireless",
    status: "Approved",
    engineer: "Sarah Chen",
    created: "2026-04-20",
    totalPrice: 54_890.0,
  },
  {
    id: "OG164162263JN",
    customer: "Computacenter",
    domain: "Both",
    status: "Pending",
    engineer: "Amit Patel",
    created: "2026-04-19",
    totalPrice: 129_470.0,
  },
];

const ALL_STATUSES: EstimateStatus[] = [
  "Pending",
  "Processing",
  "Ready for Review",
  "Approved",
  "Failed",
];

const ALL_DOMAINS: Domain[] = ["Access Switching", "Wireless", "Both"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function statusColor(status: EstimateStatus) {
  switch (status) {
    case "Approved":
      return "bg-accent-muted text-accent";
    case "Pending":
      return "bg-warning-muted text-warning";
    case "Processing":
      return "bg-blue-muted text-blue";
    case "Ready for Review":
      return "bg-blue-muted text-blue";
    case "Failed":
      return "bg-destructive-muted text-destructive";
    case "Draft":
      return "bg-[#1e1e2a] text-text-tertiary";
  }
}

function domainColor(domain: Domain) {
  switch (domain) {
    case "Access Switching":
      return "bg-accent-muted text-accent";
    case "Wireless":
      return "bg-blue-muted text-blue";
    case "Both":
      return "bg-[#1a1a2e] text-text-secondary";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TOTAL_COUNT = 24;
const PAGE_SIZE = 10;

export default function EstimatesPage() {
  // Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | EstimateStatus>(
    "All"
  );
  const [domainFilter, setDomainFilter] = useState<"All" | Domain>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Pagination
  const [page, setPage] = useState(1);

  // Derived data
  const filtered = useMemo(() => {
    let rows = MOCK_ESTIMATES;

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.customer.toLowerCase().includes(q) ||
          r.engineer.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "All") {
      rows = rows.filter((r) => r.status === statusFilter);
    }

    if (domainFilter !== "All") {
      rows = rows.filter((r) => r.domain === domainFilter);
    }

    if (dateFrom) {
      rows = rows.filter((r) => r.created >= dateFrom);
    }
    if (dateTo) {
      rows = rows.filter((r) => r.created <= dateTo);
    }

    return rows;
  }, [search, statusFilter, domainFilter, dateFrom, dateTo]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );
  const showingFrom = totalFiltered === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, totalFiltered);

  const isFiltering =
    search.trim() ||
    statusFilter !== "All" ||
    domainFilter !== "All" ||
    dateFrom ||
    dateTo;

  return (
    <div className="min-h-screen bg-bg-primary px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                           */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">Estimates</h1>
            <span className="rounded-full bg-accent-muted px-2.5 py-0.5 text-xs font-medium text-accent">
              {isFiltering ? totalFiltered : TOTAL_COUNT}
            </span>
          </div>
          <Link
            href="/estimate/new"
            className="inline-flex items-center gap-2 rounded-button bg-accent px-4 py-2 text-sm font-medium text-bg-primary transition hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            New Estimate
          </Link>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Filter bar                                                       */}
        {/* ---------------------------------------------------------------- */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search by ID, customer, or engineer..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-input border border-[#1e1e2a] bg-bg-card py-2 pl-10 pr-3 text-sm text-text-primary placeholder-text-tertiary outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Status dropdown */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "All" | EstimateStatus);
                setPage(1);
              }}
              className="appearance-none rounded-input border border-[#1e1e2a] bg-bg-card py-2 pl-3 pr-9 text-sm text-text-primary outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="All">All Statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="rounded-input border border-[#1e1e2a] bg-bg-card py-2 pl-9 pr-3 text-sm text-text-primary outline-none transition focus:border-accent focus:ring-1 focus:ring-accent [color-scheme:dark]"
              />
            </div>
            <span className="text-text-tertiary text-xs">to</span>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="rounded-input border border-[#1e1e2a] bg-bg-card py-2 pl-9 pr-3 text-sm text-text-primary outline-none transition focus:border-accent focus:ring-1 focus:ring-accent [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Domain filter */}
          <div className="relative">
            <select
              value={domainFilter}
              onChange={(e) => {
                setDomainFilter(e.target.value as "All" | Domain);
                setPage(1);
              }}
              className="appearance-none rounded-input border border-[#1e1e2a] bg-bg-card py-2 pl-3 pr-9 text-sm text-text-primary outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="All">All Domains</option>
              {ALL_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Data table                                                       */}
        {/* ---------------------------------------------------------------- */}
        <div className="mt-6 overflow-hidden rounded-card border border-[#1e1e2a] bg-bg-card">
          {pageRows.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20 text-text-secondary">
              <SearchX className="mb-4 h-10 w-10 text-text-tertiary" />
              <p className="text-lg font-medium text-text-primary">
                No estimates found
              </p>
              <p className="mt-1 text-sm">
                Try adjusting your search or filter criteria.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-[#1e1e2a] bg-bg-card">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                      Estimate ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                      Domain
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                      Engineer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                      Created
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-secondary">
                      Total Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e2a]">
                  {pageRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "transition-colors hover:bg-[#1a1a22]",
                        idx % 2 === 1 && "bg-[#13131a]"
                      )}
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/estimates/${row.id}`}
                          className="font-mono text-sm font-medium text-accent hover:underline"
                        >
                          {row.id}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-text-primary">
                        {row.customer}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                            domainColor(row.domain)
                          )}
                        >
                          {row.domain}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                            statusColor(row.status)
                          )}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                        {row.engineer}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                        {new Date(row.created).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-medium text-text-primary">
                        {currencyFmt.format(row.totalPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalFiltered > 0 && (
            <div className="flex items-center justify-between border-t border-[#1e1e2a] px-4 py-3">
              <p className="text-sm text-text-secondary">
                Showing{" "}
                <span className="font-medium text-text-primary">
                  {showingFrom}-{showingTo}
                </span>{" "}
                of{" "}
                <span className="font-medium text-text-primary">
                  {isFiltering ? totalFiltered : TOTAL_COUNT}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-button border border-[#1e1e2a] bg-bg-card px-3 py-1.5 text-sm text-text-secondary transition hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                <button
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-button border border-[#1e1e2a] bg-bg-card px-3 py-1.5 text-sm text-text-secondary transition hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
