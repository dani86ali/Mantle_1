"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  PlusCircle,
  FileStack,
  Search,
  Handshake,
  Package,
  RefreshCw,
  Building2,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/estimate/new", label: "New Estimate", icon: PlusCircle },
  { href: "/estimates", label: "Estimates", icon: FileStack },
  { href: "/catalog", label: "Catalog", icon: Search },
  { href: "/deals", label: "Deals & Quotes", icon: Handshake, badge: "Phase 3" },
  { href: "/orders", label: "Orders", icon: Package, badge: "Phase 4" },
  { href: "/services", label: "Services", icon: RefreshCw, badge: "Phase 4" },
  { href: "/distributor", label: "Distributor", icon: Building2, badge: "Phase 3" },
  { href: "/admin", label: "Admin", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-[#1e1e2a] bg-bg-card transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b border-[#1e1e2a] px-3">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-bg-primary">
            B
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold tracking-tight text-text-primary">
              BOMatic
            </span>
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:text-text-secondary"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(item.href + "/") ||
            (item.href === "/estimates" && pathname.startsWith("/estimate/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-button px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent-muted text-accent"
                  : "text-text-secondary hover:bg-[#1a1a22] hover:text-text-primary"
              )}
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="rounded-full bg-[#1e1e2a] px-1.5 py-0.5 text-[10px] text-text-tertiary">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="border-t border-[#1e1e2a] px-4 py-3">
          <p className="text-[11px] text-text-tertiary">
            Cisco Presales Automation
          </p>
        </div>
      )}
    </aside>
  );
}
