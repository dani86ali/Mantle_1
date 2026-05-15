"use client";

import { useEffect, useState } from "react";

export function MockModeBanner() {
  const [isMock, setIsMock] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.ciscoApiMode === "mock") {
          setIsMock(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isMock || dismissed) return null;

  return (
    <div
      role="status"
      aria-label="Mock mode notice"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: 32,
        maxHeight: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "0 12px",
        fontSize: 12,
        fontWeight: 500,
        color: "var(--warning)",
        background: "var(--warning-muted)",
        borderBottom: "1px solid var(--warning)",
      }}
    >
      <span>
        DEMO MODE - Cisco catalog prices are simulated. Set CISCO_API_MODE=live
        for production pricing.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss demo mode notice"
        style={{
          marginLeft: 8,
          background: "transparent",
          border: "none",
          color: "var(--warning)",
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
          padding: "2px 6px",
        }}
      >
        ×
      </button>
    </div>
  );
}
