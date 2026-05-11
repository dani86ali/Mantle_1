"use client";

import { useState } from "react";
import { Search, Bell, ChevronDown, User, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationCenter } from "./NotificationCenter";

export function TopBar() {
  const [searchFocused, setSearchFocused] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-bg-card px-4">
      {/* Search */}
      <div className="flex flex-1 items-center">
        <div
          className={cn(
            "flex max-w-md flex-1 items-center gap-2 rounded-input border px-3 py-1.5 transition-colors",
            searchFocused
              ? "border-accent bg-bg-primary"
              : "border-[var(--border)] bg-bg-primary"
          )}
        >
          <Search size={14} className="text-text-tertiary" />
          <input
            type="text"
            placeholder="Search estimates, customers, SKUs... (Ctrl+K)"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <kbd className="hidden rounded border border-[var(--border)] bg-bg-card px-1.5 py-0.5 text-[10px] text-text-tertiary sm:inline">
            Ctrl+K
          </kbd>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3 ml-4">
        {/* Price list selector */}
        <button className="flex items-center gap-1.5 rounded-button border border-[var(--border)] bg-bg-primary px-3 py-1.5 text-xs text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary transition-colors">
          <span className="hidden sm:inline">Global Price List Emerging (USD)</span>
          <span className="sm:hidden">GPL (USD)</span>
          <ChevronDown size={12} />
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative flex h-8 w-8 items-center justify-center rounded-button text-text-secondary hover:bg-[var(--bg-elevated)] hover:text-text-primary transition-colors"
          >
            <Bell size={16} />
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-text-primary">
              3
            </span>
          </button>
          <NotificationCenter
            open={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
          />
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-button px-2 py-1.5 text-text-secondary hover:bg-[var(--bg-elevated)] hover:text-text-primary transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-xs font-medium text-accent">
              DA
            </div>
            <ChevronDown size={12} />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-card border border-[var(--border)] bg-bg-card py-1 shadow-lg">
                <div className="border-b border-[var(--border)] px-3 py-2">
                  <p className="text-sm font-medium text-text-primary">Danish</p>
                  <p className="text-xs text-text-tertiary">danish@nexusglobal...</p>
                </div>
                <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-[var(--bg-elevated)] hover:text-text-primary">
                  <User size={14} /> Profile
                </button>
                <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-[var(--bg-elevated)] hover:text-text-primary">
                  <Settings size={14} /> Preferences
                </button>
                <div className="border-t border-[var(--border)]">
                  <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-[var(--bg-elevated)] hover:text-text-primary">
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
