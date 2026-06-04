import { NextResponse } from 'next/server';

/**
 * POST /api/chunks/pay-enhanced
 *
 * DEPRECATED: In the Fiber model, payment is handled via invoices.
 * Use /api/invoices/create + /api/invoices/[id]/confirm instead.
 * This endpoint is kept as a no-op for backward compatibility.
 */
export async function POST() {
  return NextResponse.json({
    success: true,
    message: 'This endpoint is deprecated. Use /api/invoices/create and /api/invoices/[id]/confirm for Fiber payments.',
    deprecated: true,
  });
}