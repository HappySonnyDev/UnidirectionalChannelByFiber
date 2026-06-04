import { useState, useCallback } from "react";
import { useAuth } from "@/features/auth/components/auth-context";

/**
 * @deprecated Spilman-specific. Will be migrated to Fiber payment model.
 */
export interface PaymentTransactionData {
  transaction: Record<string, unknown>; // CKB transaction object
  buyerSignature: string; // Single buyer signature
}

export interface PaymentTransactionResult {
  success: boolean;
  transactionData?: PaymentTransactionData;
  error?: string;
}

/**
 * @deprecated Spilman-specific. Payment is now handled via Fiber node's sendPayment.
 */
export function usePaymentTransaction() {
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);

  const constructPaymentTransaction = useCallback(
    async (
      _chunkId: string,
      _cumulativePayment: number,
      _remainingBalance: number,
      _channelId: string,
      _channelTxHash: string,
    ): Promise<PaymentTransactionResult> => {
      if (!user) {
        return {
          success: false,
          error: "User not authenticated",
        };
      }

      // Spilman-based payment is deprecated. Use Fiber node's sendPayment instead.
      return {
        success: false,
        error: "Payment transaction construction has been migrated to Fiber. Use the Fiber node payment API instead.",
      };
    },
    [user],
  );

  return {
    constructPaymentTransaction,
    isProcessing,
  };
}
