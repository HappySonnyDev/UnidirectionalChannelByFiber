import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/server/auth';
import { ChunkPaymentRepository } from '@/lib/server/database';
import { FIBER_CONFIG } from '@/lib/config';

/**
 * POST /api/invoices/create
 *
 * Core new API for Fiber payment flow:
 * Calls the merchant fnn node's `new_invoice` RPC to generate an invoice,
 * then records it in the database.
 */
export async function POST(request: Request) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { amount, description, session_id, channel_id } = await request.json();

    if (!amount) {
      return NextResponse.json(
        { error: 'amount is required' },
        { status: 400 },
      );
    }

    // Call merchant Fiber node new_invoice RPC
    const response = await fetch(FIBER_CONFIG.MERCHANT_NODE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'new_invoice',
        params: [{
          amount: '0x' + BigInt(amount).toString(16),
          currency: FIBER_CONFIG.INVOICE_CURRENCY,
          description: description || 'AI assistant payment',
          expiry: '0x' + FIBER_CONFIG.PAYMENT.INVOICE_EXPIRY.toString(16),
        }],
        id: 1,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('Fiber node invoice error:', data.error);
      return NextResponse.json(
        { error: data.error.message || 'Fiber node error' },
        { status: 500 },
      );
    }

    const invoice = data.result.invoice_address;
    const payment_hash = data.result.invoice?.data?.payment_hash;

    // Record in database
    const chunkRepo = new ChunkPaymentRepository();
    chunkRepo.createChunkPayment({
      session_id: session_id || `session_${Date.now()}`,
      channel_id: channel_id || undefined,
      invoice,
      payment_hash,
      amount: String(amount),
      status: 'pending' as const,
    });

    return NextResponse.json({
      success: true,
      invoice,
      payment_hash,
      amount: String(amount),
    });
  } catch (error) {
    console.error('Invoice creation error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}