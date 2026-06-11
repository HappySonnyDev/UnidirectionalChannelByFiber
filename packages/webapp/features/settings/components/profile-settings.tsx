"use client";

import React, { useState } from "react";
import { useAuth } from "@/features/auth/components/auth-context";
import { InfoCard } from "@/components/shared/info-card";
import { RefreshCw } from "lucide-react";

export const ProfileSettings: React.FC = () => {
  const { user, ckbAddress, fiberNode } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshBalance = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fiberNode.refreshOnChainBalance();
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  };

  return (
    <div className="w-full max-w-none h-[600px] overflow-y-scroll p-8">
      {user && (
        <div className="space-y-6">
          {/* User Info Box */}
          <InfoCard
            title="User Info"
            items={[
              {
                label: "Username",
                value: user.username
              },
              {
                label: "Account Created",
                value: new Date(user.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  timeZone: "Asia/Shanghai"
                })
              },
              {
                label: "Account Status",
                value: (
                  <div className="flex items-center space-x-2">
                    <div
                      className={`h-2.5 w-2.5 rounded-full shadow-sm ${
                        user.is_active
                          ? "bg-emerald-500 shadow-emerald-500/30"
                          : "bg-red-500 shadow-red-500/30"
                      }`}
                    ></div>
                    <span>{user.is_active ? "Active" : "Inactive"}</span>
                  </div>
                )
              },
              {
                label: "CKB Address",
                value: user.ckbAddress || "N/A",
                className: "font-mono break-all max-w-xs text-right"
              }
            ]}
          />

          {/* CKB Address Section */}
          <InfoCard
            title="CKB Address"
            items={[
              {
                label: "Address",
                value: ckbAddress || "No address available",
                className: "font-medium break-all max-w-xs text-right"
              },
              {
                label: "Balance",
                value: (
                  <span className="inline-flex items-center gap-1.5">
                    {fiberNode.onChainBalance || "0"}
                    <button
                      type="button"
                      onClick={handleRefreshBalance}
                      title="Test tokens may take 3-5 minutes to arrive"
                      className="cursor-pointer inline-flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                  </span>
                ),
                className: "font-semibold"
              }
            ]}
          />

          {/* Node Information Section */}
          <InfoCard
            title="Node Information"
            items={[
              {
                label: "Fiber Node",
                value: fiberNode.isConnected ? "Connected" : "Disconnected",
              },
              {
                label: "Channels",
                value: `${fiberNode.channels.length} channel(s)`,
              },
              {
                label: "Available Balance",
                value: fiberNode.availableBalance,
              }
            ]}
          />
        </div>
      )}
    </div>
  );
};