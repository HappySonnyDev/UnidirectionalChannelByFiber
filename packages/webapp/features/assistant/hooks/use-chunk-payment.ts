import { useState, useCallback } from 'react';
import { useAuth } from '@/features/auth/components/auth-context';

/**
 * @deprecated Spilman-specific chunk payment hook.
 * Payment is now handled via Fiber node's sendPayment through chunk-aware-composer.
 * This hook is kept as a stub to avoid breaking imports.
 */

interface ChunkPaymentResult {
  success: boolean;
  chunkId: string;
  tokens: number;
  remainingTokens: number;
  error?: string;
}

export function useChunkPayment() {
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<ChunkPaymentResult[]>([]);

  // Pay for a single chunk — now handled by Fiber payment flow
  const payForChunk = useCallback(async (
    _chunkId: string,
    _paymentInfo: unknown,
  ): Promise<ChunkPaymentResult> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    throw new Error(
      'Chunk payment has been migrated to Fiber. Use the Fiber node payment flow via chunk-aware-composer instead.',
    );
  }, [user]);

  // Clear payment history
  const clearHistory = useCallback(() => {
    setPaymentHistory([]);
  }, []);

  return {
    payForChunk,
    isProcessing,
    paymentHistory,
    clearHistory,
  };
}
