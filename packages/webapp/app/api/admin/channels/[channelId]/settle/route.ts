import { NextRequest, NextResponse } from 'next/server';
import { PaymentChannelRepository, PAYMENT_CHANNEL_STATUS } from '@/lib/server/database';

/**
 * POST /api/admin/channels/[channelId]/settle
 *
 * Simplified for Fiber: In the Fiber model, channel closing/settlement
 * is handled by the fnn node automatically. This admin endpoint simply
 * marks the channel as closed in the database.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId: channelIdParam } = await params;
    const channelId = parseInt(channelIdParam);

    if (isNaN(channelId)) {
      return NextResponse.json(
        { error: 'Invalid channel ID' },
        { status: 400 },
      );
    }

    const channelRepo = new PaymentChannelRepository();

    const channel = channelRepo.getPaymentChannelById(channelId);
    if (!channel) {
      return NextResponse.json(
        { error: 'Payment channel not found' },
        { status: 404 },
      );
    }

    if (channel.status !== PAYMENT_CHANNEL_STATUS.ACTIVE) {
      return NextResponse.json(
        { error: 'Only active channels can be closed' },
        { status: 400 },
      );
    }

    // Mark channel as closed
    const updatedChannel = channelRepo.updatePaymentChannelStatusById(
      channelId,
      PAYMENT_CHANNEL_STATUS.CLOSED,
    );

    return NextResponse.json({
      success: true,
      message: 'Channel closed successfully (Fiber handles on-chain settlement automatically)',
      channel: updatedChannel,
    });
  } catch (error) {
    console.error('Admin channel close error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}