"use client";

import { useState } from "react";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { cn } from "@/lib/utils";

const tabs = ["Reconciliation", "DD-Direct", "Multi-Distributor"] as const;

export default function DistributorPage() {
  const [activeTab, setActiveTab] = useState<string>(tabs[0]);

  return (
    <div>
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-button px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab
                ? "bg-[#1a1a22] text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <ComingSoon
        phase="Coming in Phase 3"
        title="Distributor"
        description="Distributor quote reconciliation, direct ordering, and multi-distributor price comparison."
        features={[
          {
            name: "Reconciliation",
            description:
              "Side-by-side 'stare and compare' of CCW estimate vs distributor quote with automatic mismatch detection",
          },
          {
            name: "DD-Direct",
            description:
              "Direct integration with Dimension Data / NTT distribution systems",
          },
          {
            name: "Multi-Distributor",
            description:
              "Compare pricing and availability across Ingram Micro, TD SYNNEX, Westcon, and others",
          },
        ]}
      />
    </div>
  );
}
