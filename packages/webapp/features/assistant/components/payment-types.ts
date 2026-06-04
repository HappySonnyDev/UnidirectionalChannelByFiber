/**
 * Payment types for Fiber invoice-based payment flow.
 *
 * Old model: CKB Spilman payment channels with token-based accounting
 * New model: Fiber invoice payments in shannon (1 CKB = 100_000_000 shannon)
 */

export interface PaymentRecord {
  /** Unique chunk index in the conversation */
  chunkIndex: number;
  /** Invoice string from the Fiber node */
  invoice: string;
  /** Payment hash for tracking */
  payment_hash: string;
  /** Amount in shannon */
  amount: string;
  /** Payment status */
  status: 'pending' | 'paying' | 'confirmed' | 'failed';
  /** ISO timestamp */
  timestamp: string;
  /** Error message if failed */
  error?: string;
}

export interface PaymentChannelInfo {
  /** Available balance in human-readable format (e.g. "1.500000 CKB") */
  availableBalance: string;
  /** Total amount paid in shannon across all confirmed payments */
  totalPaidShannon: string;
  /** Number of confirmed payments */
  confirmedCount: number;
  /** Number of failed payments */
  failedCount: number;
}
