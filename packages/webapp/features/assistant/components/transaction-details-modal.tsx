import React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { X, Loader2, Check, AlertTriangle } from "lucide-react";
import { PaymentRecord } from "./payment-types";
import { DataDisplay } from "@/components/shared/data-display";
import { shannonToCkbDisplay } from "@/lib/client/chunk-payment-integration";

interface TransactionDetailsModalProps {
  selectedRecord: PaymentRecord | null;
  showPaymentModal: boolean;
  onClose: () => void;
  onRetry: () => void;
}

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({
  selectedRecord,
  showPaymentModal,
  onClose,
  onRetry,
}) => {
  if (!selectedRecord) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {showPaymentModal ? "Payment Failed" : "Invoice Details"}
          </h3>
          <Button onClick={onClose} size="sm" variant="ghost" className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Failed payment message */}
        {showPaymentModal && selectedRecord.status === 'failed' && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
              A payment has failed. Please retry or check your Fiber channel balance.
            </p>
            {selectedRecord.error && (
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                Error: {selectedRecord.error}
              </p>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <DataDisplay
                title="Chunk #"
                data={`#${selectedRecord.displayIndex ?? selectedRecord.chunkIndex}`}
                className="mb-0"
              />
            </div>
            <div>
              <DataDisplay
                title="Amount"
                data={shannonToCkbDisplay(selectedRecord.amount)}
                className="mb-0"
              />
            </div>
            <div>
              <DataDisplay
                title="Payment Status"
                data={
                  selectedRecord.status === 'confirmed' ? '✓ Paid' :
                  selectedRecord.status === 'paying' ? '⏳ Paying...' :
                  selectedRecord.status === 'failed' ? '✗ Failed' :
                  '⏸ Pending'
                }
                className="mb-0"
              />
            </div>
            <div>
              <DataDisplay
                title="Timestamp"
                data={new Date(selectedRecord.timestamp).toLocaleString("en-US", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZoneName: "short",
                })}
                className="mb-0"
              />
            </div>
          </div>

          <DataDisplay
            title="Payment Hash"
            data={selectedRecord.payment_hash}
          />

          <DataDisplay
            title="Invoice"
            data={selectedRecord.invoice}
          />

          {selectedRecord.error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-red-800 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Error:</span>
                <span>{selectedRecord.error}</span>
              </div>
            </div>
          )}

          {/* Retry button for failed payments */}
          {selectedRecord.status === 'failed' && (
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-600">
              <Button onClick={onClose} variant="outline" size="sm">
                Cancel
              </Button>
              <Button
                onClick={onRetry}
                size="sm"
                className="bg-black hover:bg-gray-800 text-white dark:bg-white dark:hover:bg-gray-200 dark:text-black"
              >
                Retry Payment
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
