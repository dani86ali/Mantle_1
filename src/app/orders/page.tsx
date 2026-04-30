"use client";

import { useState } from "react";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { cn } from "@/lib/utils";

const tabs = ["Order Status", "Order History", "Serial Numbers"] as const;

export default function OrdersPage() {
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
        title="Orders"
        description="Order tracking, serial number management, and fulfillment status monitoring."
        features={[
          {
            name: "Order Status",
            description:
              "Real-time order tracking via Cisco Order Status API with delivery ETAs",
          },
          {
            name: "Order History",
            description:
              "Complete order archive with search, filtering, and re-order capabilities",
          },
          {
            name: "Serial Numbers",
            description:
              "Serial number lookup and asset registration via Cisco SN API",
          },
        ]}
      />
    </div>
  );
}
