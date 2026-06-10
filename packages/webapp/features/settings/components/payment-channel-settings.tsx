"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/features/auth/components/auth-context";
import {
  Loader2,
  Copy,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Wallet,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHANNON_PER_CKB = 100_000_000;
const CHANNEL_RESERVE_CKB = 99; // Fiber protocol reserve

/** Convert shannon string → CKB display string (2 decimal places) */
function shannonToCkb(shannon: string): string {
  const num = Number(shannon) / SHANNON_PER_CKB;
  return num.toFixed(2);
}

/** Calculate available balance for a single channel */
function channelAvailableCkb(ch: Channel): string {
  const local = BigInt(ch.local_balance);
  const offered = BigInt(ch.offered_tlc_balance);
  const available = local - offered; // reserve already deducted by Fiber protocol
  return available > BigInt(0)
    ? (Number(available) / SHANNON_PER_CKB).toFixed(2)
    : "0.00";
}

/** Truncate channel ID: first 8 chars … last 8 chars */
function truncateId(id: string): string {
  if (id.length <= 20) return id;
  return `${id.slice(0, 10)}...${id.slice(-10)}`;
}

/** Get state name from channel */
function getStateName(ch: Channel): string {
  return ch.state.state_name;
}

/** Map state name to display config */
function getStateConfig(stateName: string): {
  label: string;
  dotClass: string;
  badgeClass: string;
} {
  const name = stateName.toUpperCase();

  if (name === ChannelState.ChannelReady) {
    return {
      label: "Ready",
      dotClass: "bg-green-500",
      badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    };
  }
  if (
    name === ChannelState.AwaitingChannelReady ||
    name === ChannelState.AwaitingTxSignatures ||
    name === ChannelState.NegotiatingFunding ||
    name === ChannelState.CollaboratingFundingTx ||
    name === ChannelState.SigningCommitment
  ) {
    return {
      label: "Awaiting Confirmation",
      dotClass: "bg-amber-400",
      badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    };
  }
  if (name === ChannelState.ShuttingDown) {
    return {
      label: "Closing",
      dotClass: "bg-red-500",
      badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    };
  }
  if (name === ChannelState.Closed) {
    return {
      label: "Closed",
      dotClass: "bg-slate-400",
      badgeClass: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
    };
  }
  return {
    label: stateName,
    dotClass: "bg-slate-400",
    badgeClass: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  };
}

import {
  Channel,
  ChannelState,
} from '@fiber-pay/sdk/browser';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PaymentChannelSettings: React.FC = () => {
  const { fiberNode } = useAuth();
  const {
    channels,
    availableBalance,
    ckbAddress,
    onChainBalance,
    isConnected,
    refreshChannels,
    closeChannel,
  } = fiberNode;

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial loading: avoid flashing "No channels" before WASM data arrives
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Mount: refresh channels and resolve initial loading once done
  useEffect(() => {
    if (!isConnected) {
      setIsInitialLoading(false);
      return;
    }
    // If channels already populated (e.g. cached), skip loading
    if (channels.length > 0) {
      setIsInitialLoading(false);
      return;
    }
    // Wait for refreshChannels to complete before showing content
    refreshChannels()
      .catch(() => {})
      .finally(() => setIsInitialLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Also clear loading as soon as channels arrive
  useEffect(() => {
    if (channels.length > 0) {
      setIsInitialLoading(false);
    }
  }, [channels]);

  // Auto-refresh channels: 10s when there are pending channels, 30s otherwise
  useEffect(() => {
    if (!isConnected) return;

    const hasPendingChannel = channels.some(
      (ch) =>
        ch.state?.state_name === ChannelState.AwaitingChannelReady ||
        ch.state?.state_name === ChannelState.AwaitingTxSignatures ||
        ch.state?.state_name === ChannelState.NegotiatingFunding ||
        ch.state?.state_name === ChannelState.CollaboratingFundingTx ||
        ch.state?.state_name === ChannelState.SigningCommitment,
    );

    const intervalMs = hasPendingChannel ? 10_000 : 30_000;

    const interval = setInterval(() => {
      refreshChannels().catch(() => {});
    }, intervalMs);
    return () => clearInterval(interval);
  }, [isConnected, refreshChannels, channels]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshChannels();
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCloseChannel = async (channelId: string) => {
    if (!confirm("After closing the channel, the remaining balance will be returned to your on-chain address. Confirm close?")) return;

    try {
      setActionLoading(channelId);
      setError(null);
      await closeChannel(channelId);
      await refreshChannels();
    } catch (err) {
      console.error("Close channel error:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to close channel: ${msg}`);
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for insecure contexts
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Not connected state
  if (!isConnected && channels.length === 0) {
    return (
      <div className="h-[600px] w-full max-w-none p-8">
        <h3 className="mb-6 text-lg font-semibold">Payment Channel</h3>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800">
          <Wallet className="mx-auto mb-3 h-10 w-10 text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Please log in and connect to the node to view payment channel information
          </p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-[600px] w-full max-w-none overflow-y-scroll p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Payment Channel</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Total available balance */}
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Total Available Channel Balance
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {availableBalance}
            </span>
          </div>
        </div>

        {/* Deposit / Node address section */}
        {ckbAddress && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Node CKB Address (for on-chain deposit)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-xs text-slate-600 dark:text-slate-400">
                {ckbAddress}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(ckbAddress)}
                className="h-7 px-2"
              >
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
              On-chain Balance: {onChainBalance}
            </p>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Channel list */}
        {isInitialLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 py-12 dark:border-slate-700 dark:bg-slate-800">
            <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
            <span className="ml-2 text-sm text-slate-500">Loading channel data...</span>
          </div>
        ) : channels.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No payment channels yet. Please go to the "Recharge" page to open your first channel.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((ch) => {
              const stateName = getStateName(ch);
              const stateConfig = getStateConfig(stateName);
              const isClosing = actionLoading === ch.channel_id;

              return (
                <div
                  key={ch.channel_id}
                  className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      {/* Left: channel info */}
                      <div className="flex items-center gap-4">
                        {/* Status badge */}
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${stateConfig.badgeClass}`}
                        >
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${stateConfig.dotClass}`} />
                          {stateConfig.label}
                        </span>

                        {/* Channel ID (truncated) */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default font-mono text-xs text-slate-500 dark:text-slate-400">
                              {truncateId(ch.channel_id)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs break-all font-mono text-xs">
                              {ch.channel_id}
                            </p>
                          </TooltipContent>
                        </Tooltip>

                        {/* Channel capacity (local + remote balance) */}
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {shannonToCkb(
                            (BigInt(ch.local_balance) + BigInt(ch.remote_balance)).toString(),
                          )}{" "}
                          CKB
                        </span>

                        {/* Available balance */}
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          Available: {channelAvailableCkb(ch)} CKB
                        </span>
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-2">
                        {/* Only show close for ready or pending channels */}
                        {(
                          stateName === ChannelState.ChannelReady ||
                          stateName === ChannelState.AwaitingChannelReady ||
                          stateName === ChannelState.AwaitingTxSignatures
                        ) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCloseChannel(ch.channel_id)}
                            disabled={isClosing}
                            className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                          >
                            {isClosing ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Close Channel
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Extra info row for awaiting channels */}
                    {stateName !== ChannelState.ChannelReady &&
                      stateName !== ChannelState.Closed &&
                      stateName !== ChannelState.ShuttingDown && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Channel is awaiting on-chain confirmation, please wait...</span>
                        </div>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer info */}
        <div className="mt-6 text-xs text-slate-500 dark:text-slate-500">
          <p>Each channel reserves {CHANNEL_RESERVE_CKB} CKB as channel reserve, which cannot be used for payments.</p>
          <p className="mt-1">Channel data refreshes automatically every 10–30 seconds (faster when awaiting confirmation), or click the refresh button manually.</p>
        </div>

        {/* Channel states guide */}
        <div className="mt-4 space-y-1 text-xs text-slate-500 dark:text-slate-500">
          <p>Channel status guide:</p>
          <p className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            Awaiting Confirmation (AWAITING_LOCKIN) — Channel is being confirmed on-chain
          </p>
          <p className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            Ready (CHANNEL_READY) — Channel is open and ready for payments
          </p>
          <p className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            Closing (SHUTTING_DOWN) — Channel is closing
          </p>
          <p className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
            Closed (CLOSED) — Channel is closed, balance has been returned
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
};
