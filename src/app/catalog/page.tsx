"use client";

import { useEffect, useState } from "react";
import { Info, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import CiscoTab from "./cisco-tab";
import FortinetTab from "./fortinet-tab";

type Vendor = "cisco" | "fortinet";

const TABS: { id: Vendor; label: string }[] = [
  { id: "cisco", label: "Cisco" },
  { id: "fortinet", label: "Fortinet" },
];

export default function CatalogPage() {
  const [vendor, setVendor] = useState<Vendor>("cisco");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  // Debounce keystrokes by 300ms
  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 300);
    return () => clearTimeout(t);
  }, [input]);

  // Reset search when switching tabs
  useEffect(() => {
    setInput("");
    setQuery("");
  }, [vendor]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] px-6 py-5">
        <h1 className="text-2xl font-semibold text-text-primary">Catalog</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
          <Info size={14} className="text-text-tertiary" />
          Reference catalog for SKU lookup. Use the BoM Review page to edit estimate
          line items.
        </p>
      </div>

      <div className="border-b border-[var(--border)] px-6">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setVendor(t.id)}
              className={cn(
                "border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                vendor === t.id
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

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
            placeholder={
              vendor === "cisco"
                ? "Search Cisco by model or description..."
                : "Search Fortinet by SKU or description..."
            }
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

      <div className="flex flex-1 flex-col overflow-hidden">
        {vendor === "cisco" ? (
          <CiscoTab query={query} />
        ) : (
          <FortinetTab query={query} />
        )}
      </div>
    </div>
  );
}
