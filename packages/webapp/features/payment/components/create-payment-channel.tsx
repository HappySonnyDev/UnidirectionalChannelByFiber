"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/components/auth-context";
import { Loader2, AlertCircle, CheckCircle2, Copy, ExternalLink, RefreshCw } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHANNON_PER_CKB = 100_000_000;

/** Convert CKB (number) → shannon hex string (0x-prefixed) */
function ckbToShannonHex(ckb: number): string {
  return "0x" + (BigInt(ckb) * BigInt(SHANNON_PER_CKB)).toString(16);
}

/** Convert shannon string → CKB display string (2 decimal places) */
function shannonToCkbDisplay(shannon: string): string {
  const num = Number(shannon) / SHANNON_PER_CKB;
  return num.toFixed(2);
}

// ---------------------------------------------------------------------------
// Preset amounts
// ---------------------------------------------------------------------------

const PRESET_AMOUNTS = [
  { value: 200, label: "200 CKB" },
  { value: 500, label: "500 CKB" },
  { value: 1000, label: "1000 CKB" },
];

// Fiber protocol reserves ~99 CKB at channel open (not configurable)
const CHANNEL_RESERVE_CKB = 99; // 99 CKB

// Minimum channel funding amount
const MIN_FUNDING_CKB = 200; // 200 CKB minimum

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CreatePaymentChannelProps {
  /** Called when a channel is successfully opened */
  onSuccess?: () => void;
}

export const CreatePaymentChannel: React.FC<CreatePaymentChannelProps> = ({
  onSuccess,
}) => {
  const { fiberNode } = useAuth();
  const [selectedAmount, setSelectedAmount] = useState<number>(200);

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fundingAmount = selectedAmount;
  const availableCkb = fundingAmount - CHANNEL_RESERVE_CKB;

  // Parse on-chain balance for insufficient-funds check
  const onChainCkb = parseFloat(fiberNode.onChainBalance) || 0;
  const isInsufficientBalance = onChainCkb < selectedAmount;

  const handleRefreshBalance = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fiberNode.refreshOnChainBalance();
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  };

  const copyAddress = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChannel = async () => {
    if (!fiberNode.isConnected) {
      setError("Node not connected, please log in first");
      return;
    }

    if (fundingAmount < MIN_FUNDING_CKB) {
      setError(`Minimum funding amount is ${MIN_FUNDING_CKB} CKB`);
      return;
    }

    try {
      setIsCreating(true);
      setError(null);
      setSuccess(false);

      const hexAmount = ckbToShannonHex(fundingAmount);
      await fiberNode.openChannel(hexAmount);

      setSuccess(true);
      // Notify parent if callback provided
      onSuccess?.();
      // Reset after brief display
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Error opening channel:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      // Translate common errors
      if (msg.includes("insufficient") || msg.toLowerCase().includes("balance")) {
        setError("Insufficient on-chain balance, please deposit to the node address first");
      } else if (msg.includes("peer")) {
        setError("Unable to connect to merchant node, please try again later");
      } else {
        setError(`Failed to open channel: ${msg}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handlePresetSelect = (value: number) => {
    setSelectedAmount(value);
    setError(null);
  };



  // Determine button state
  const isButtonDisabled =
    isCreating ||
    !fiberNode.isConnected ||
    fundingAmount < MIN_FUNDING_CKB ||
    isInsufficientBalance ||
    isNaN(fundingAmount);

  return (
    <div className="w-full max-w-none p-8">
      <h3 className="mb-6 text-lg font-semibold">Open Payment Channel</h3>

      {/* Preset amount buttons */}
      <div className="mb-6">
        {/* <h4 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          Select funding amount
        </h4> */}
        <div className="flex flex-wrap gap-3">
          {PRESET_AMOUNTS.map((preset) => (
            <Button
              key={preset.value}
              variant={selectedAmount === preset.value ? "default" : "outline"}
              className="min-w-[100px]"
              onClick={() => handlePresetSelect(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>


      {/* Balance hint */}
      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Channel reserves <span className="font-semibold text-slate-900 dark:text-slate-100">{CHANNEL_RESERVE_CKB} CKB</span>,
          available for payments{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {availableCkb > 0 ? availableCkb.toFixed(2) : "0.00"} CKB
          </span>
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-500">
          <span>Current on-chain balance: {fiberNode.onChainBalance}</span>
          <button
            type="button"
            onClick={handleRefreshBalance}
            title="Test tokens may take 3-5 minutes to arrive"
            className="cursor-pointer inline-flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </p>
      </div>

      {/* Address & Faucet - hidden when insufficient balance (shown in warning instead) */}
      {!isInsufficientBalance && (
      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Your CKB deposit address:
        </p>
        {fiberNode.ckbAddress && (
          <div className="flex items-center gap-2 mt-1">
            <code className="max-w-[320px] truncate rounded bg-slate-100 px-2 py-1 text-xs text-slate-900 dark:bg-slate-800 dark:text-slate-300">
              {fiberNode.ckbAddress}
            </code>
            <button
              type="button"
              onClick={() => copyAddress(fiberNode.ckbAddress!)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
            >
              {copied ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
        <a
          href="https://faucet.nervos.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-slate-600 underline decoration-slate-400 hover:text-slate-900 dark:text-slate-400 dark:decoration-slate-600 dark:hover:text-slate-300"
        >
          Testnet: Get test tokens via Nervos Faucet
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      )}

      {/* Insufficient balance warning */}
      {isInsufficientBalance && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <p className="font-medium">
                Insufficient on-chain balance to open a {selectedAmount} CKB channel
              </p>
              <p className="mt-1">
                Current balance: {fiberNode.onChainBalance}. Please{' '}
                <a
                  href="https://faucet.nervos.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline hover:text-amber-900 dark:hover:text-amber-200"
                >
                  get test tokens via Nervos Faucet
                </a>
                {' '}to continue.
              </p>
              {fiberNode.ckbAddress && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-amber-700 dark:text-amber-400">Deposit to:</span>
                  <code className="max-w-[260px] truncate rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                    {fiberNode.ckbAddress}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyAddress(fiberNode.ckbAddress!)}
                    className="inline-flex items-center rounded px-1 py-0.5 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40 cursor-pointer"
                  >
                    {copied ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status indicators */}
      {!fiberNode.isConnected && (
        <div className="mb-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-4 w-4" />
          <span>Node not connected, please log in first</span>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span>Channel opening request submitted, awaiting on-chain confirmation...</span>
        </div>
      )}

      {/* Open channel button */}
      <Button
        onClick={handleOpenChannel}
        disabled={isButtonDisabled}
        className="w-full bg-slate-900 px-8 py-6 text-xl font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
        size="lg"
      >
        {isCreating ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Opening...
          </span>
        ) : (
          `Open Channel — ${fundingAmount || "—"} CKB`
        )}
      </Button>
    </div>
  );
};
