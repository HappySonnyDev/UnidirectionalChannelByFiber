"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  Wallet,
  ArrowDownRight,
  Radio,
  CheckCircle2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/components/auth-context";
import { shannonToCkbDisplay } from "@/lib/client/chunk-payment-integration";

/** Convert shannon string to CKB decimal string (without unit suffix) */
function shannonToCkb(shannon: string | bigint): string {
  const value = BigInt(shannon);
  const ckb = Number(value) / 1e8;
  return ckb.toFixed(2);
}

/** Map raw channel state to a friendly label + Tailwind color classes */
function getStateBadge(stateName: string): {
  label: string;
  className: string;
} {
  const normalized = stateName.toLowerCase();
  if (normalized.includes("ready")) {
    return {
      label: "Ready",
      className:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
    };
  }
  if (
    normalized.includes("pending") ||
    normalized.includes("awaiting") ||
    normalized.includes("negotiating")
  ) {
    return {
      label: "Pending",
      className:
        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
    };
  }
  if (normalized.includes("closing") || normalized.includes("closed")) {
    return {
      label: "Closing",
      className:
        "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
    };
  }
  return {
    label: stateName,
    className:
      "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  };
}

export const UsageSettings: React.FC = () => {
  const { fiberNode } = useAuth();
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");

  // Filter active channels (CHANNEL_READY state) from WASM Fiber node
  const activeChannels = useMemo(() => {
    if (!fiberNode.channels) return [];
    return fiberNode.channels.filter((ch) =>
      ch.state.state_name.toLowerCase().includes("ready")
    );
  }, [fiberNode.channels]);

  // Auto-select first active channel or sync with global activeChannel
  useEffect(() => {
    if (activeChannels.length > 0 && !selectedChannelId) {
      const initialId = fiberNode.activeChannel?.channel_id || activeChannels[0].channel_id;
      setSelectedChannelId(initialId);
      // Only sync global active channel if there is none set yet
      if (!fiberNode.activeChannel?.channel_id && activeChannels.length > 0) {
        fiberNode.setActiveChannelById(activeChannels[0].channel_id);
      }
    }
  }, [activeChannels, selectedChannelId, fiberNode]);

  // Keep local selection in sync when global activeChannel changes externally
  useEffect(() => {
    if (fiberNode.activeChannel?.channel_id) {
      setSelectedChannelId(fiberNode.activeChannel.channel_id);
    }
  }, [fiberNode.activeChannel?.channel_id]);

  const isSelectedActive = selectedChannelId === fiberNode.activeChannel?.channel_id;

  const selectedChannel = activeChannels.find(
    (ch) => ch.channel_id === selectedChannelId
  );

  // Not connected to WASM node
  if (!fiberNode.isConnected) {
    return (
      <div className="w-full max-w-none h-[600px] overflow-y-auto p-6">
        <h3 className="mb-6 text-lg font-semibold text-slate-800 dark:text-slate-200">
          Usage Statistics
        </h3>
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
              <Activity className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              请先连接钱包
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              连接钱包后才能查看通道使用统计。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (activeChannels.length === 0) {
    return (
      <div className="w-full max-w-none h-[600px] overflow-y-auto p-6">
        <h3 className="mb-6 text-lg font-semibold text-slate-800 dark:text-slate-200">
          Usage Statistics
        </h3>
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
              <Activity className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              No active payment channels found.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create and activate a payment channel to view usage statistics.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none h-[600px] overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Usage Statistics
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeChannels.length} active channel
            {activeChannels.length > 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select a channel">
                {selectedChannelId &&
                  (() => {
                    const ch = activeChannels.find(
                      (c) => c.channel_id === selectedChannelId
                    );
                    return ch ? (
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span>...{ch.channel_id.slice(-6)}</span>
                        <span className="text-slate-400">·</span>
                        <span>{shannonToCkb(ch.local_balance)} CKB</span>
                      </span>
                    ) : (
                      "Select a channel"
                    );
                  })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {activeChannels.map((ch) => (
                <SelectItem key={ch.channel_id} value={ch.channel_id}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>...{ch.channel_id.slice(-6)}</span>
                    <span className="text-slate-400">·</span>
                    <span>{shannonToCkb(ch.local_balance)} CKB</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Set as Active button */}
          {isSelectedActive ? (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="h-8 gap-1.5 text-xs text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-900/20"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Active
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                if (selectedChannelId) {
                  fiberNode.setActiveChannelById(selectedChannelId);
                }
              }}
            >
              Use for Payment
            </Button>
          )}
        </div>
      </div>

      {selectedChannel && (
        <div className="space-y-6">
          {/* Channel Overview Card */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
            {/* Card Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                  <Radio className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Channel Overview
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {selectedChannel.channel_id}
                  </p>
                </div>
              </div>

              {/* Node Status */}
              <div className="flex items-center gap-2">
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Node Connected
                </span>
              </div>
            </div>

            <div className="p-6">
              {/* Status Row */}
              <div className="flex items-center gap-3 mb-6">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Channel Status
                </span>
                {(() => {
                  const badge = getStateBadge(
                    selectedChannel.state.state_name
                  );
                  return (
                    <Badge variant="outline" className={badge.className}>
                      {badge.label}
                    </Badge>
                  );
                })()}
              </div>

              {/* Balance Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Local Balance */}
                <div className="group rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-4 transition-all hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-sm">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Local
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {shannonToCkbDisplay(selectedChannel.local_balance)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 font-medium">
                    CKB
                  </p>
                </div>

                {/* Remote Balance */}
                <div className="group rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-4 transition-all hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-sm">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
                      <ArrowDownRight className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Remote
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {shannonToCkbDisplay(selectedChannel.remote_balance)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 font-medium">
                    CKB
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
