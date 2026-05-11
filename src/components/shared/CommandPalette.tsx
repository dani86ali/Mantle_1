"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  FileStack,
  Package,
  Settings,
  PlusCircle,
  Download,
  FileText,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CommandItem {
  id: string;
  label: string;
  category: "Navigation" | "Actions" | "Recent Estimates";
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

// ─── Hook: global Ctrl+K listener ───────────────────────────────────────────

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { open, setOpen, onClose: () => setOpen(false) };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Build the full list of commands
  const allItems: CommandItem[] = useMemo(
    () => [
      // Navigation
      {
        id: "nav-dashboard",
        label: "Dashboard",
        category: "Navigation",
        icon: LayoutDashboard,
        shortcut: "G D",
        action: () => router.push("/dashboard"),
      },
      {
        id: "nav-estimates",
        label: "Estimates",
        category: "Navigation",
        icon: FileStack,
        shortcut: "G E",
        action: () => router.push("/estimates"),
      },
      {
        id: "nav-catalog",
        label: "Catalog",
        category: "Navigation",
        icon: Package,
        shortcut: "G C",
        action: () => router.push("/catalog"),
      },
      {
        id: "nav-admin",
        label: "Admin",
        category: "Navigation",
        icon: Settings,
        shortcut: "G A",
        action: () => router.push("/admin"),
      },
      {
        id: "nav-new-estimate",
        label: "New Estimate",
        category: "Navigation",
        icon: PlusCircle,
        shortcut: "G N",
        action: () => router.push("/estimate/new"),
      },

      // Actions
      {
        id: "action-create-estimate",
        label: "Create New Estimate",
        category: "Actions",
        icon: PlusCircle,
        shortcut: "Ctrl+N",
        action: () => router.push("/estimate/new"),
      },
      {
        id: "action-search-catalog",
        label: "Search Catalog",
        category: "Actions",
        icon: Search,
        action: () => router.push("/catalog"),
      },
      {
        id: "action-export",
        label: "Export Current View",
        category: "Actions",
        icon: Download,
        action: () => {
          /* placeholder — wire to export logic */
        },
      },

      // Recent Estimates
      {
        id: "recent-1",
        label: "OG164161387AE \u2014 NTT Data",
        category: "Recent Estimates",
        icon: FileText,
        action: () => router.push("/estimates"),
      },
      {
        id: "recent-2",
        label: "PQ164161394TX \u2014 CDW",
        category: "Recent Estimates",
        icon: FileText,
        action: () => router.push("/estimates"),
      },
      {
        id: "recent-3",
        label: "RZ164161402JM \u2014 Insight Direct",
        category: "Recent Estimates",
        icon: FileText,
        action: () => router.push("/estimates"),
      },
    ],
    [router]
  );

  // Filter items by query
  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [allItems, query]);

  // Group filtered items by category (preserving order)
  const grouped = useMemo(() => {
    const categories: Array<{ name: string; items: CommandItem[] }> = [];
    const seen = new Set<string>();
    for (const item of filtered) {
      if (!seen.has(item.category)) {
        seen.add(item.category);
        categories.push({
          name: item.category,
          items: filtered.filter((i) => i.category === item.category),
        });
      }
    }
    return categories;
  }, [filtered]);

  // Reset state when opened / closed
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Autofocus after a tick so the modal is rendered
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Clamp active index when list changes
  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, activeIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const select = useCallback(
    (item: CommandItem) => {
      onClose();
      item.action();
    },
    [onClose]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[activeIndex]) {
          select(filtered[activeIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, activeIndex, select, onClose]
  );

  if (!open) return null;

  // Build a flat index counter for data-index mapping
  let flatIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-card border border-[var(--border)] bg-bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search size={16} className="shrink-0 text-text-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          <kbd className="rounded border border-[var(--border)] bg-bg-primary px-1.5 py-0.5 text-[10px] text-text-tertiary">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-text-tertiary">
              No results found.
            </p>
          )}

          {grouped.map((group) => (
            <div key={group.name}>
              <p className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                {group.name}
              </p>
              {group.items.map((item) => {
                flatIndex++;
                const idx = flatIndex;
                const isActive = idx === activeIndex;
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    data-index={idx}
                    onClick={() => select(item)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-accent-muted text-accent"
                        : "text-text-secondary hover:bg-[var(--bg-elevated)] hover:text-text-primary"
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="flex-1 truncate text-left">
                      {item.label}
                    </span>
                    {item.shortcut && (
                      <kbd className="ml-auto rounded border border-[var(--border)] bg-bg-primary px-1.5 py-0.5 text-[10px] text-text-tertiary">
                        {item.shortcut}
                      </kbd>
                    )}
                    {isActive && (
                      <ArrowRight size={12} className="shrink-0 text-accent" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-[var(--border)] px-4 py-2">
          <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
            <kbd className="rounded border border-[var(--border)] bg-bg-primary px-1 py-0.5 text-[9px]">
              &uarr;&darr;
            </kbd>
            navigate
          </span>
          <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
            <kbd className="rounded border border-[var(--border)] bg-bg-primary px-1 py-0.5 text-[9px]">
              &crarr;
            </kbd>
            select
          </span>
          <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
            <kbd className="rounded border border-[var(--border)] bg-bg-primary px-1 py-0.5 text-[9px]">
              esc
            </kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
