/**
 * Token tracking utilities (simplified for Fiber invoice model).
 *
 * In the Fiber model, billing is controlled by server-side invoices,
 * not by client-side token counting. These utilities are kept for
 * optional local display purposes only.
 */

/** Simple token count approximation (4 chars ≈ 1 token) */
export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
