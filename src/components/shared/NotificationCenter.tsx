"use client";

import { useState } from "react";
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  ShieldAlert,
  BarChart3,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NotificationType = "estimate" | "system";
type TabValue = "all" | "estimate" | "system";

interface Notification {
  id: string;
  message: string;
  timeAgo: string;
  type: NotificationType;
  read: boolean;
}

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

const notifications: Notification[] = [
  {
    id: "1",
    message: "Estimate OG164161387AE is ready for review",
    timeAgo: "2 hours ago",
    type: "estimate",
    read: false,
  },
  {
    id: "2",
    message: "Validation passed on PQ164161394TX",
    timeAgo: "3 hours ago",
    type: "estimate",
    read: false,
  },
  {
    id: "3",
    message: "New estimate submitted by CDW",
    timeAgo: "5 hours ago",
    type: "estimate",
    read: false,
  },
  {
    id: "4",
    message: "Cisco API rate limit approaching (80%)",
    timeAgo: "1 day ago",
    type: "system",
    read: true,
  },
  {
    id: "5",
    message: "Estimate VZ164162237UR approved",
    timeAgo: "1 day ago",
    type: "estimate",
    read: true,
  },
  {
    id: "6",
    message: "Credentials expire in 7 days",
    timeAgo: "2 days ago",
    type: "system",
    read: true,
  },
  {
    id: "7",
    message: "Monthly usage report available",
    timeAgo: "3 days ago",
    type: "system",
    read: true,
  },
  {
    id: "8",
    message: "New product family added to catalog",
    timeAgo: "5 days ago",
    type: "system",
    read: true,
  },
];

function getNotificationIcon(notification: Notification) {
  const { message, type } = notification;

  if (type === "estimate") {
    if (message.includes("ready for review")) {
      return <FileText size={14} className="text-accent" />;
    }
    if (message.includes("Validation passed")) {
      return <CheckCircle2 size={14} className="text-status-success" />;
    }
    if (message.includes("submitted")) {
      return <FileText size={14} className="text-blue-400" />;
    }
    if (message.includes("approved")) {
      return <CheckCircle2 size={14} className="text-status-success" />;
    }
    return <FileText size={14} className="text-accent" />;
  }

  // system
  if (message.includes("rate limit")) {
    return <AlertTriangle size={14} className="text-status-warning" />;
  }
  if (message.includes("Credentials expire")) {
    return <ShieldAlert size={14} className="text-status-warning" />;
  }
  if (message.includes("usage report")) {
    return <BarChart3 size={14} className="text-blue-400" />;
  }
  if (message.includes("product family")) {
    return <Package size={14} className="text-status-info" />;
  }
  return <Info size={14} className="text-text-tertiary" />;
}

export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [items, setItems] = useState(notifications);

  if (!open) return null;

  const filtered =
    activeTab === "all" ? items : items.filter((n) => n.type === activeTab);

  const unreadCount = items.filter((n) => !n.read).length;

  const handleMarkAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const tabs: { label: string; value: TabValue }[] = [
    { label: "All", value: "all" },
    { label: "Estimates", value: "estimate" },
    { label: "System", value: "system" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Dropdown panel */}
      <div className="absolute right-0 top-full z-50 mt-1 w-80 max-h-96 flex flex-col rounded-card border border-[#1e1e2a] bg-bg-card shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e1e2a] px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/15 px-1.5 text-[10px] font-bold text-accent">
                {unreadCount}
              </span>
            )}
          </h3>
          <button
            onClick={handleMarkAllRead}
            className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors"
          >
            Mark all read
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1e1e2a] px-4">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "relative px-3 py-2 text-xs font-medium transition-colors",
                activeTab === tab.value
                  ? "text-accent"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              {tab.label}
              {activeTab === tab.value && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs text-text-tertiary">No notifications</p>
            </div>
          ) : (
            filtered.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 border-b border-[#1e1e2a] last:border-b-0 transition-colors cursor-pointer hover:bg-[#1a1a22]",
                  !notification.read && "bg-accent/[0.03]"
                )}
              >
                {/* Icon */}
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1a1a24]">
                  {getNotificationIcon(notification)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-xs leading-relaxed",
                      notification.read
                        ? "text-text-secondary"
                        : "text-text-primary font-medium"
                    )}
                  >
                    {notification.message}
                  </p>
                  <div className="mt-1 flex items-center gap-1">
                    <Clock size={10} className="text-text-tertiary" />
                    <span className="text-[10px] text-text-tertiary">
                      {notification.timeAgo}
                    </span>
                  </div>
                </div>

                {/* Unread dot */}
                {!notification.read && (
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
