import { NextRequest, NextResponse } from 'next/server';
import { PaymentChannelRepository, PAYMENT_CHANNEL_STATUS } from '@/lib/server/database';

/**
 * POST /api/admin/auto-settle-expiring
 *
 * DEPRECATED: In the Fiber model, channel settlement is handled
 * automatically by the fnn node. This endpoint is kept for
 * backward compatibility but is effectively a no-op.
 */
export async function POST(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Auto-settlement is handled by the Fiber node automatically. This endpoint is deprecated.',
    deprecated: true,
    settledCount: 0,
    checkedCount: 0,
  });
}