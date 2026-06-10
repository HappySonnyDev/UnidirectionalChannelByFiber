'use client';

import type { UseFiberNodeResult } from '@/hooks/useFiberNode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChunkPaymentEvent {
  type: 'invoice-request';
  data: {
    invoice: string;
    payment_hash: string;
    amount: string;
    chunkIndex: number;
  };
}

export interface InvoiceFailedEvent {
  type: 'invoice-failed';
  data: {
    chunkIndex: number;
    error: string;
  };
}

export interface PaymentStatus {
  chunkIndex: number;
  status: 'pending' | 'paying' | 'confirmed' | 'failed';
  payment_hash: string;
  amount: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Polling helper
// ---------------------------------------------------------------------------

/**
 * Poll the Fiber node for payment status until it reaches a terminal state.
 *
 * Uses the SDK's `waitForPayment` convenience method which handles
 * polling internally with configurable timeout and interval.
 *
 * @param fiberNode  The useFiberNode hook result
 * @param paymentHash  The payment hash to track
 * @param timeout   Maximum wait time in ms (default 30 000)
 * @param interval  Polling interval in ms (default 2 000)
 */
async function pollPaymentStatus(
  fiberNode: UseFiberNodeResult,
  paymentHash: string,
  timeout = 30_000,
  interval = 2_000,
): Promise<{ status: 'Success' | 'Failed'; failed_error?: string }> {
  try {
    const finalResult = await fiberNode.waitForPayment(paymentHash, { timeout, interval });
    return {
      status: finalResult.status === 'Success' ? 'Success' : 'Failed',
      failed_error: finalResult.failed_error,
    };
  } catch (err) {
    // waitForPayment throws on timeout — treat as failure
    return {
      status: 'Failed',
      failed_error: err instanceof Error ? err.message : 'Payment polling timeout',
    };
  }
}

// ---------------------------------------------------------------------------
// Core payment processing
// ---------------------------------------------------------------------------

/**
 * Process a single invoice payment via the Fiber WASM node.
 *
 * Flow:
 * 1. Call `fiberNode.sendPayment(invoice)` — WASM node routes payment through Fiber channel
 * 2. On success, update local payment status
 *    (server-side invoice confirmation route has been removed)
 * 3. Return the payment status
 */
export async function processInvoicePayment(
  fiberNode: UseFiberNodeResult,
  event: ChunkPaymentEvent['data'],
): Promise<PaymentStatus> {
  try {
    // Send payment through the Fiber WASM node
    const result = await fiberNode.sendPayment(event.invoice);

    // --- Handle different payment states from send_payment ---
    //
    // Fiber payment states:
    //   "Success"   — payment completed immediately
    //   "Created"   — payment session created, awaiting routing
    //   "Inflight"  — payment is being routed through the network
    //   "Failed"    — payment failed
    //
    // "Created" and "Inflight" are non-terminal; we poll for the final result.

    if (result.status === 'Success') {
      // Payment succeeded immediately — update local state
      return {
        chunkIndex: event.chunkIndex,
        status: 'confirmed',
        payment_hash: event.payment_hash,
        amount: event.amount,
      };
    }

    if (result.status === 'Created' || result.status === 'Inflight') {
      // Payment was accepted but hasn't completed yet.
      // Poll until it reaches Success or Failed (timeout → Failed).
      const paymentHash = result.payment_hash || event.payment_hash;
      const finalResult = await pollPaymentStatus(fiberNode, paymentHash);

      if (finalResult.status === 'Success') {
        // Payment eventually succeeded — update local state
        return {
          chunkIndex: event.chunkIndex,
          status: 'confirmed',
          payment_hash: event.payment_hash,
          amount: event.amount,
        };
      }

      // Payment actually failed after polling
      return {
        chunkIndex: event.chunkIndex,
        status: 'failed',
        payment_hash: event.payment_hash,
        amount: event.amount,
        error: finalResult.failed_error || 'Payment failed after polling',
      };
    }

    // Any other status (e.g. "Failed") — treat as failure immediately
    return {
      chunkIndex: event.chunkIndex,
      status: 'failed',
      payment_hash: event.payment_hash,
      amount: event.amount,
      error: result.failed_error || `Payment status: ${result.status}`,
    };
  } catch (error) {
    return {
      chunkIndex: event.chunkIndex,
      status: 'failed',
      payment_hash: event.payment_hash,
      amount: event.amount,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// Balance helpers
// ---------------------------------------------------------------------------

/** Shannon per CKB */
const SHANNON_PER_CKB = BigInt(100_000_000);

/**
 * Check if the available balance is sufficient for a payment.
 *
 * @param availableBalance Human-readable balance string from useFiberNode, e.g. "1.500000 CKB"
 * @param requiredAmountShannon Required amount in shannon as string (e.g. "50000000")
 */
export function hasInsufficientBalance(
  availableBalance: string,
  requiredAmountShannon: string,
): boolean {
  // Parse the human-readable balance: "1.500000 CKB" -> 1.5 CKB
  const match = availableBalance.match(/^([\d.]+)/);
  if (!match) return true;

  const balanceCkb = parseFloat(match[1]);
  const balanceShannon = BigInt(Math.floor(balanceCkb * Number(SHANNON_PER_CKB)));
  const required = BigInt(requiredAmountShannon || '0');

  return balanceShannon < required;
}

/**
 * Convert shannon amount to human-readable CKB string.
 */
export function shannonToCkbDisplay(shannon: string): string {
  const value = Number(BigInt(shannon || '0')) / Number(SHANNON_PER_CKB);
  return `${value.toFixed(2)} CKB`;
}
