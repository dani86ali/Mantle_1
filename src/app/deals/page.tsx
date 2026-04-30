"use client";

import { useState } from "react";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { cn } from "@/lib/utils";

const tabs = ["Active Deals", "Deal Registration", "Promotions", "Quote Management"] as const;

export default function DealsPage() {
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
        title="Deals & Quotes"
        description="Deal registration, OIP automation, quick quotes, and promotional pricing management."
        features={[
          {
            name: "Deal Registration",
            description:
              "Automated OIP questionnaire with intelligent field population from intake data",
          },
          {
            name: "Quick Quotes",
            description:
              "Import estimates directly into CCW quick quotes with pre-filled deal details",
          },
          {
            name: "Promotions",
            description:
              "Track active Cisco promotions and automatically apply eligible discounts",
          },
          {
            name: "Quote Management",
            description:
              "Centralized view of all quotes with status tracking and approval workflows",
          },
        ]}
      />
    </div>
  );
}
