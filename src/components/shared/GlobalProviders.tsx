"use client";

import { CommandPalette, useCommandPalette } from "./CommandPalette";
import { KeyboardShortcuts, useKeyboardShortcutsModal } from "./KeyboardShortcuts";

export function GlobalProviders({ children }: { children: React.ReactNode }) {
  const cmdPalette = useCommandPalette();
  const kbdShortcuts = useKeyboardShortcutsModal();

  return (
    <>
      {children}
      <CommandPalette open={cmdPalette.open} onClose={cmdPalette.onClose} />
      <KeyboardShortcuts open={kbdShortcuts.open} onClose={kbdShortcuts.onClose} />
    </>
  );
}
