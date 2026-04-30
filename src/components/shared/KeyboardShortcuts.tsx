"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

// ─── Data ───────────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { keys: "Ctrl+K", description: "Command palette" },
  { keys: "Ctrl+N", description: "New estimate" },
  { keys: "Ctrl+E", description: "Estimates list" },
  { keys: "?", description: "This help" },
  { keys: "Esc", description: "Close panel / modal" },
  { keys: "Enter", description: "Send message (in chat)" },
  { keys: "Shift+Enter", description: "New line (in chat)" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-card border border-[#1e1e2a] bg-bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e1e2a] px-5 py-4">
          <h2 className="text-sm font-semibold text-text-primary">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="rounded-button px-2 py-0.5 text-xs text-text-tertiary hover:bg-[#1a1a22] hover:text-text-secondary transition-colors"
          >
            Esc
          </button>
        </div>

        {/* Shortcuts grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-5">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.keys}
              className="flex items-center justify-between gap-3"
            >
              <Kbd keys={shortcut.keys} />
              <span className="flex-1 text-sm text-text-secondary">
                {shortcut.description}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-[#1e1e2a] px-5 py-3">
          <p className="text-[11px] text-text-tertiary">
            Press{" "}
            <kbd className="rounded border border-[#1e1e2a] bg-bg-primary px-1 py-0.5 text-[10px] font-mono text-text-tertiary">
              ?
            </kbd>{" "}
            anywhere to toggle this panel.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Kbd helper ─────────────────────────────────────────────────────────────

function Kbd({ keys }: { keys: string }) {
  const parts = keys.split("+");

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && (
            <span className="text-[10px] text-text-tertiary">+</span>
          )}
          <kbd
            className={cn(
              "inline-flex items-center justify-center rounded border border-[#1e1e2a] bg-bg-primary font-mono text-[11px] text-text-tertiary",
              part.length === 1 ? "h-6 w-6" : "h-6 px-1.5"
            )}
          >
            {part}
          </kbd>
        </span>
      ))}
    </span>
  );
}

// ─── Hook: global ? key listener ────────────────────────────────────────────

export function useKeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only trigger on "?" when not typing in an input/textarea
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.key === "?" && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { open, setOpen, onClose: () => setOpen(false) };
}
