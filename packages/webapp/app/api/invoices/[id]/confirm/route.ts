import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/server/auth';
import { ChunkPaymentRepository, CHUNK_PAYMENT_STATUS } from '@/lib/server/database';

/**
 * POST /api/invoices/[id]/confirm
 *
 * Payment confirmation API: user pays an invoice via their Fiber channel,
 * then calls this endpoint to mark the payment as confirmed.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { payment_hash } = await request.json();

    if (!payment_hash) {
      return NextResponse.json(
        { error: 'payment_hash is required' },
        { status: 400 },
      );
    }

    const chunkRepo = new ChunkPaymentRepository();

    // Verify the payment exists
    const chunkPayment = chunkRepo.getChunkPaymentByPaymentHash(payment_hash);
    if (!chunkPayment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 },
      );
    }

    // Update payment status to confirmed
    // For single-direction channels, the merchant node receives payment
    // and confirms it automatically
    const updated = chunkRepo.updateChunkPaymentByHash(
      payment_hash,
      CHUNK_PAYMENT_STATUS.CONFIRMED,
    );

    return NextResponse.json({
      success: true,
      payment_hash: updated?.payment_hash,
      status: updated?.status,
    });
  } catch (error) {
    console.error('Payment confirmation error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}