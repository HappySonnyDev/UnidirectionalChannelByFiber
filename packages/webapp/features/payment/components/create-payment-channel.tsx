"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/components/auth-context";
import { FIBER_CONFIG } from "@/lib/config";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

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

const CHANNEL_RESERVE_CKB = Number(FIBER_CONFIG.PAYMENT.CHANNEL_RESERVE_SHANNON) / SHANNON_PER_CKB; // 99 CKB
const MIN_FUNDING_CKB = Number(FIBER_CONFIG.PAYMENT.MIN_FUNDING_SHANNON) / SHANNON_PER_CKB; // 200 CKB

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CreatePaymentChannel: React.FC = () => {
  const { fiberNode } = useAuth();
  const [selectedAmount, setSelectedAmount] = useState<number>(200);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isCustom, setIsCustom] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fundingAmount = isCustom ? parseInt(customAmount, 10) || 0 : selectedAmount;
  const availableCkb = fundingAmount - CHANNEL_RESERVE_CKB;

  const handleOpenChannel = async () => {
    if (!fiberNode.isConnected) {
      setError("节点未连接，请先登录");
      return;
    }

    if (fundingAmount < MIN_FUNDING_CKB) {
      setError(`最低融资金额为 ${MIN_FUNDING_CKB} CKB`);
      return;
    }

    try {
      setIsCreating(true);
      setError(null);
      setSuccess(false);

      const hexAmount = ckbToShannonHex(fundingAmount);
      await fiberNode.openChannel(hexAmount);

      setSuccess(true);
      // Reset after brief display
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Error opening channel:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      // Translate common errors
      if (msg.includes("insufficient") || msg.toLowerCase().includes("balance")) {
        setError("链上余额不足，请先充值到节点地址");
      } else if (msg.includes("peer")) {
        setError("无法连接到商户节点，请稍后重试");
      } else {
        setError(`开通通道失败: ${msg}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handlePresetSelect = (value: number) => {
    setSelectedAmount(value);
    setIsCustom(false);
    setCustomAmount("");
    setError(null);
  };

  const handleCustomToggle = () => {
    setIsCustom(true);
    setSelectedAmount(0);
    setError(null);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, "");
    setCustomAmount(val);
    setError(null);
  };

  // Determine button state
  const isButtonDisabled =
    isCreating ||
    !fiberNode.isConnected ||
    fundingAmount < MIN_FUNDING_CKB ||
    isNaN(fundingAmount);

  return (
    <div className="w-full max-w-none p-8">
      <h3 className="mb-6 text-lg font-semibold">开通支付通道</h3>

      {/* Preset amount buttons */}
      <div className="mb-6">
        <h4 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          选择融资金额
        </h4>
        <div className="flex flex-wrap gap-3">
          {PRESET_AMOUNTS.map((preset) => (
            <Button
              key={preset.value}
              variant={!isCustom && selectedAmount === preset.value ? "default" : "outline"}
              className="min-w-[100px]"
              onClick={() => handlePresetSelect(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
          <Button
            variant={isCustom ? "default" : "outline"}
            className="min-w-[100px]"
            onClick={handleCustomToggle}
          >
            自定义
          </Button>
        </div>
      </div>

      {/* Custom amount input */}
      {isCustom && (
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder={`最低 ${MIN_FUNDING_CKB} CKB`}
              value={customAmount}
              onChange={handleCustomChange}
              className="w-48 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm
                placeholder:text-slate-400 focus:border-slate-500 focus:outline-none
                dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <span className="text-sm text-slate-600 dark:text-slate-400">CKB</span>
          </div>
        </div>
      )}

      {/* Balance hint */}
      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          通道预留 <span className="font-semibold text-slate-900 dark:text-slate-100">{CHANNEL_RESERVE_CKB} CKB</span>，
          实际可用{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {availableCkb > 0 ? availableCkb.toFixed(2) : "0.00"} CKB
          </span>
        </p>
        {fiberNode.onChainBalance && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            当前链上余额: {fiberNode.onChainBalance}
          </p>
        )}
      </div>

      {/* Status indicators */}
      {!fiberNode.isConnected && (
        <div className="mb-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-4 w-4" />
          <span>节点未连接，请先登录</span>
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
          <span>通道开通请求已提交，等待链上确认...</span>
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
            开通中...
          </span>
        ) : (
          `开通通道 — ${fundingAmount || "—"} CKB`
        )}
      </Button>

      {/* Channel states guide */}
      <div className="mt-6 space-y-1 text-xs text-slate-500 dark:text-slate-500">
        <p>通道状态说明：</p>
        <p className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          等待确认 (AWAITING_LOCKIN) — 通道正在链上确认中
        </p>
        <p className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          就绪 (CHANNEL_READY) — 通道已开通，可进行支付
        </p>
      </div>
    </div>
  );
};
