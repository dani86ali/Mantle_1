"use client";

import { useState, useMemo } from "react";
import { Search, X, ChevronDown, ChevronUp, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-require-imports */
const catalogData: Record<string, CatalogItem> =
  require("../../../tests/mocks/catalog-responses.json").items;
/* eslint-enable @typescript-eslint/no-require-imports */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatalogItem {
  sku: string;
  description: string;
  listPrice: number;
  productFamily: string;
  productCategory: string;
  eoxInfo: { isEox: boolean };
  leadTimeDays: number;
  specs?: Record<string, unknown>;
  regionAvailability: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOMAINS: { label: string; families: string[] }[] = [
  {
    label: "Access Switching",
    families: [
      "Catalyst 9200 Series",
      "Catalyst 9200L Series",
      "Catalyst 9200CX Series",
      "Catalyst 9300 Series",
      "Catalyst 9300L Series",
      "Catalyst 9300X Series",
    ],
  },
  {
    label: "Wireless",
    families: [
      "Catalyst 9120AX Series",
      "Catalyst 9130AX Series",
      "Catalyst 9136AX Series",
      "Catalyst 9162AX Series",
      "Catalyst 9164AX Series",
      "Catalyst 9166AX Series",
    ],
  },
  {
    label: "Controllers",
    families: ["Catalyst 9800 Series"],
  },
];

const PRODUCT_FAMILIES = [
  "Catalyst 9200",
  "Catalyst 9300",
  "Catalyst 9300L",
  "Catalyst 9300X",
  "Catalyst 9800",
  "Catalyst 9120AX",
  "Catalyst 9130AX",
];

const CATEGORIES = [
  "Hardware",
  "License",
  "Subscription",
  "Service",
  "Accessory",
  "Software",
];

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesFamily(item: CatalogItem, family: string): boolean {
  return item.productFamily
    .toLowerCase()
    .startsWith(family.toLowerCase());
}

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

const SPEC_LABELS: Record<string, string> = {
  portCount: "Ports",
  poeBudgetWatts: "PoE Budget (W)",
  poePortCount: "PoE Ports",
  sfpSlots: "SFP Slots",
  qsfpSlots: "QSFP Slots",
  psuSlots: "PSU Slots",
  psuWatts: "PSU Watts",
  stackable: "Stackable",
  maxStackSize: "Max Stack Size",
  stackModulesPerSwitch: "Stack Modules / Switch",
  fanModulesRequired: "Fan Modules",
};

const CATEGORY_COLORS: Record<string, string> = {
  hardware: "bg-blue-muted text-blue",
  license: "bg-accent-muted text-accent",
  subscription: "bg-warning-muted text-warning",
  service: "bg-success-muted text-success",
  accessory: "bg-[rgba(136,136,160,0.12)] text-text-secondary",
  software: "bg-[rgba(139,92,246,0.12)] text-[#a78bfa]",
  other: "bg-[rgba(136,136,160,0.08)] text-text-tertiary",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CatalogPage() {
  const allItems = useMemo(() => Object.values(catalogData), []);

  // Search & filter state
  const [query, setQuery] = useState("");
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(
    new Set()
  );
  const [selectedFamilies, setSelectedFamilies] = useState<Set<string>>(
    new Set()
  );
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set()
  );
  const [hideEox, setHideEox] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  // Derived: domain-based family set for quick lookup
  const domainFamilies = useMemo(() => {
    const s = new Set<string>();
    for (const d of DOMAINS) {
      if (selectedDomains.has(d.label)) {
        for (const f of d.families) s.add(f);
      }
    }
    return s;
  }, [selectedDomains]);

  // Filtered items
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return allItems.filter((item) => {
      // Text search
      if (
        q &&
        !item.sku.toLowerCase().includes(q) &&
        !item.description.toLowerCase().includes(q)
      ) {
        return false;
      }

      // Domain filter
      if (domainFamilies.size > 0 && !domainFamilies.has(item.productFamily)) {
        return false;
      }

      // Family filter
      if (
        selectedFamilies.size > 0 &&
        !Array.from(selectedFamilies).some((f) => matchesFamily(item, f))
      ) {
        return false;
      }

      // Category filter
      if (
        selectedCategories.size > 0 &&
        !selectedCategories.has(item.productCategory.toLowerCase())
      ) {
        return false;
      }

      // EoX filter
      if (hideEox && item.eoxInfo?.isEox) {
        return false;
      }

      return true;
    });
  }, [allItems, query, domainFamilies, selectedFamilies, selectedCategories, hideEox]);

  const displayed = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const hasActiveFilters =
    selectedDomains.size > 0 ||
    selectedFamilies.size > 0 ||
    selectedCategories.size > 0 ||
    hideEox;

  function clearFilters() {
    setSelectedDomains(new Set());
    setSelectedFamilies(new Set());
    setSelectedCategories(new Set());
    setHideEox(false);
  }

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[#1e1e2a] px-6 py-5">
        <h1 className="text-2xl font-semibold text-text-primary">Catalog</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Browse Cisco product catalog{" "}
          <span className="text-text-tertiary">
            &middot; {allItems.length} products
          </span>
        </p>
      </div>

      {/* Search bar */}
      <div className="border-b border-[#1e1e2a] px-6 py-4">
        <div className="relative max-w-2xl">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Search by SKU or description..."
            className="w-full rounded-input border border-[#1e1e2a] bg-bg-card py-2.5 pl-10 pr-10 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setVisibleCount(PAGE_SIZE);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Body: sidebar + results */}
      <div className="flex flex-1 overflow-hidden">
        {/* Filter sidebar */}
        <aside className="w-[200px] shrink-0 overflow-y-auto border-r border-[#1e1e2a] px-4 py-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              <Filter size={12} />
              Filters
            </span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[11px] text-accent hover:text-accent-hover"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Domain */}
          <FilterSection title="Domain">
            {DOMAINS.map((d) => (
              <Checkbox
                key={d.label}
                label={d.label}
                checked={selectedDomains.has(d.label)}
                onChange={() =>
                  setSelectedDomains(toggleSet(selectedDomains, d.label))
                }
              />
            ))}
          </FilterSection>

          {/* Product Family */}
          <FilterSection title="Product Family">
            {PRODUCT_FAMILIES.map((f) => (
              <Checkbox
                key={f}
                label={f}
                checked={selectedFamilies.has(f)}
                onChange={() =>
                  setSelectedFamilies(toggleSet(selectedFamilies, f))
                }
              />
            ))}
          </FilterSection>

          {/* Category */}
          <FilterSection title="Category">
            {CATEGORIES.map((c) => (
              <Checkbox
                key={c}
                label={c}
                checked={selectedCategories.has(c.toLowerCase())}
                onChange={() =>
                  setSelectedCategories(
                    toggleSet(selectedCategories, c.toLowerCase())
                  )
                }
              />
            ))}
          </FilterSection>

          {/* EoX */}
          <FilterSection title="EoX Status">
            <Checkbox
              label="Hide EoX items"
              checked={hideEox}
              onChange={() => setHideEox(!hideEox)}
            />
          </FilterSection>
        </aside>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {/* Result count */}
          <div className="border-b border-[#1e1e2a] px-6 py-3">
            <p className="text-xs text-text-secondary">
              Showing{" "}
              <span className="font-medium text-text-primary">
                {displayed.length}
              </span>{" "}
              of{" "}
              <span className="font-medium text-text-primary">
                {filtered.length}
              </span>{" "}
              products
            </p>
          </div>

          {/* Table */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2a] text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                <th className="px-6 py-3">SKU</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">List Price</th>
                <th className="px-4 py-3 text-right">Lead Time</th>
                <th className="px-4 py-3 text-center">EoX</th>
                <th className="w-8 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {displayed.map((item) => {
                const isExpanded = expandedSku === item.sku;
                return (
                  <ItemRow
                    key={item.sku}
                    item={item}
                    isExpanded={isExpanded}
                    onToggle={() =>
                      setExpandedSku(isExpanded ? null : item.sku)
                    }
                  />
                );
              })}
            </tbody>
          </table>

          {displayed.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-text-tertiary">
              <Search size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No products match your filters.</p>
            </div>
          )}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center border-t border-[#1e1e2a] py-4">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="rounded-button border border-[#1e1e2a] bg-bg-card px-5 py-2 text-sm font-medium text-text-primary hover:border-accent hover:text-accent"
              >
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary hover:text-text-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 rounded-sm border-[#1e1e2a] bg-bg-card accent-accent"
      />
      {label}
    </label>
  );
}

function ItemRow({
  item,
  isExpanded,
  onToggle,
}: {
  item: CatalogItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const catKey = item.productCategory.toLowerCase();
  const colorClass = CATEGORY_COLORS[catKey] ?? CATEGORY_COLORS.other;

  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          "cursor-pointer border-b border-[#1e1e2a] transition-colors",
          isExpanded ? "bg-[#1a1a22]" : "hover:bg-[#1a1a22]"
        )}
      >
        <td className="px-6 py-3 font-mono text-sm font-medium text-text-primary">
          {item.sku}
        </td>
        <td className="max-w-xs truncate px-4 py-3 text-text-secondary">
          {item.description}
        </td>
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
              colorClass
            )}
          >
            {item.productCategory}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-text-secondary">
          {item.listPrice > 0 ? formatPrice(item.listPrice) : "--"}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right text-text-secondary">
          {item.leadTimeDays > 0 ? `${item.leadTimeDays}d` : "--"}
        </td>
        <td className="px-4 py-3 text-center">
          {item.eoxInfo?.isEox ? (
            <span className="inline-block rounded bg-destructive-muted px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
              EoX
            </span>
          ) : (
            <span className="inline-block h-2 w-2 rounded-full bg-success" />
          )}
        </td>
        <td className="px-2 py-3 text-text-tertiary">
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>

      {/* Expanded detail panel */}
      {isExpanded && (
        <tr className="border-b border-[#1e1e2a] bg-[#12121a]">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-3 gap-6">
              {/* Specs */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Specifications
                </p>
                {item.specs && Object.keys(item.specs).length > 0 ? (
                  <dl className="space-y-1">
                    {Object.entries(item.specs).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-xs">
                        <dt className="text-text-secondary">
                          {SPEC_LABELS[key] ?? key}
                        </dt>
                        <dd className="font-mono text-text-primary">
                          {typeof value === "boolean"
                            ? value
                              ? "Yes"
                              : "No"
                            : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-xs text-text-tertiary">
                    No specs available
                  </p>
                )}
              </div>

              {/* Region availability */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Region Availability
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {item.regionAvailability.map((region) => (
                    <span
                      key={region}
                      className="rounded bg-accent-muted px-2 py-0.5 text-[11px] font-medium text-accent"
                    >
                      {region}
                    </span>
                  ))}
                </div>
              </div>

              {/* Product family */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Product Family
                </p>
                <p className="text-sm text-text-primary">
                  {item.productFamily}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
