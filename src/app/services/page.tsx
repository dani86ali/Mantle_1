"use client";

import { useState } from "react";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { cn } from "@/lib/utils";

const tabs = ["Contracts", "Renewals", "Subscriptions", "EA Management"] as const;

export default function ServicesPage() {
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
        phase="Coming in Phase 4"
        title="Services & Subscriptions"
        description="Contract lifecycle management, renewal automation, and subscription tracking."
        features={[
          {
            name: "Contracts",
            description:
              "View and manage all active SmartNet and service contracts",
          },
          {
            name: "Renewals",
            description:
              "Automated renewal reminders with CCW-R integration for seamless processing",
          },
          {
            name: "Subscriptions",
            description:
              "Track DNA, ThousandEyes, and other subscription entitlements",
          },
          {
            name: "EA Management",
            description:
              "Enterprise Agreement tracking with true-forward and true-up management",
          },
        ]}
      />
    </div>
  );
}
