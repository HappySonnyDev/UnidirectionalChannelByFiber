import React from "react";
import { Coins, Check, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentChannelInfo, PaymentRecord } from "./payment-types";
import { shannonToCkbDisplay } from "@/lib/client/chunk-payment-integration";

interface PaymentStatusPanelProps {
  paymentChannelInfo: PaymentChannelInfo;
  paymentRecords: PaymentRecord[];
  isStreamingActive: boolean;
  onRetryPayment: (record: PaymentRecord) => void;
  onShowDetails: (record: PaymentRecord) => void;
  onOpenUsage?: () => void;
  balanceError: string | null;
}

export const PaymentStatusPanel: React.FC<PaymentStatusPanelProps> = ({
  paymentChannelInfo,
  paymentRecords,
  isStreamingActive,
  onRetryPayment,
  onShowDetails,
  onOpenUsage,
  balanceError,
}) => {
  const totalPaidCkb = shannonToCkbDisplay(paymentChannelInfo.totalPaidShannon);
  const confirmedCount = paymentChannelInfo.confirmedCount;
  const failedCount = paymentChannelInfo.failedCount;
  const activeChannelId = paymentChannelInfo.activeChannelId;
  const activeChannelBalance = paymentChannelInfo.activeChannelBalance;

  return (
    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <Coins className="h-4 w-4" />
          <span className="text-sm font-medium">Payment Status</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Balance & stats */}
          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
            {/* Active channel balance — clickable to open Usage dialog */}
            {activeChannelId ? (
              <span
                className="flex items-center gap-1.5 cursor-pointer hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                onClick={onOpenUsage}
                title="Click to view channel details"
              >
                <span>Balance: {activeChannelBalance || '0 CKB'}</span>
              </span>
            ) : (
              <span className="text-gray-400 dark:text-gray-500 italic">
                No active channel
              </span>
            )}
            <span>Paid: {totalPaidCkb} ({confirmedCount} invoices)</span>
            {failedCount > 0 && (
              <span className="text-red-500">{failedCount} failed</span>
            )}
          </div>
        </div>
      </div>

      {/* Balance error */}
      {balanceError && (
        <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {balanceError}
        </div>
      )}

      {/* Payment Records List */}
      {paymentRecords.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Invoice Payments:</div>
          {[...paymentRecords]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .map((record, index) => {
              const seqNumber = paymentRecords.length - index;
              return (
            <div
              key={record.payment_hash}
              className="flex items-center justify-between bg-white dark:bg-gray-800 rounded px-3 py-2 text-xs border border-gray-200 dark:border-gray-600"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-gray-600 dark:text-gray-400">
                  #{seqNumber}
                </span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">
                  {shannonToCkbDisplay(record.amount)}
                </span>
                <span className="text-gray-500 dark:text-gray-500 font-mono text-[10px]">
                  {record.payment_hash.slice(0, 16)}...
                </span>

                {/* Status badge */}
                {record.status === 'pending' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    Pending
                  </span>
                )}
                {record.status === 'paying' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Paying...
                  </span>
                )}
                {record.status === 'confirmed' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    <Check className="h-3 w-3 mr-1" />
                    Paid
                  </span>
                )}
                {record.status === 'failed' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Failed
                  </span>
                )}

                {/* Error message */}
                {record.error && record.status === 'failed' && (
                  <span className="text-red-500 dark:text-red-400 text-[10px] max-w-48 truncate" title={record.error}>
                    {record.error}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-500">
                  {new Date(record.timestamp).toLocaleTimeString()}
                </span>

                {/* Retry button for failed payments */}
                {record.status === 'failed' && (
                  <Button
                    onClick={() => onRetryPayment(record)}
                    size="sm"
                    variant="default"
                    className="h-6 px-2 text-xs bg-black hover:bg-gray-800 text-white dark:bg-white dark:hover:bg-gray-200 dark:text-black"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                )}

                {/* Details button */}
                <Button
                  onClick={() => onShowDetails({ ...record, displayIndex: seqNumber })}
                  size="sm"
                  variant="outline"
                  className="h-6 w-6 p-0 border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  <Coins className="h-3 w-3" />
                </Button>
              </div>
            </div>
            );
            })}
        </div>
      ) : (
        <div className="text-xs text-gray-600 dark:text-gray-400 text-center py-4">
          Invoice payments will appear here during chat interactions.
        </div>
      )}
    </div>
  );
};
