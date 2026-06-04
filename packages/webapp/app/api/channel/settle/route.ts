import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/server/auth';
import { PaymentChannelRepository, PAYMENT_CHANNEL_STATUS } from '@/lib/server/database';

/**
 * POST /api/channel/settle
 *
 * In the Fiber model, channel closing is handled by the Fiber node
 * (fnn) which automatically settles on-chain. This API simply records
 * the channel closure notification from the frontend.
 */
export async function POST(request: Request) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { channel_id } = await request.json();

    if (!channel_id) {
      return NextResponse.json(
        { error: 'channel_id is required' },
        { status: 400 },
      );
    }

    const channelRepo = new PaymentChannelRepository();

    // Verify channel exists
    const channel = channelRepo.getPaymentChannelByChannelId(channel_id);
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // Verify channel belongs to user
    if (channel.user_address !== user.address) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify channel is active
    if (channel.status !== PAYMENT_CHANNEL_STATUS.ACTIVE) {
      return NextResponse.json(
        { error: 'Only active channels can be closed' },
        { status: 400 },
      );
    }

    // Update channel status to closed
    const updatedChannel = channelRepo.updatePaymentChannelStatus(
      channel_id,
      PAYMENT_CHANNEL_STATUS.CLOSED,
    );

    return NextResponse.json({
      success: true,
      channel_id: updatedChannel?.channel_id,
      status: updatedChannel?.status,
      closed_at: updatedChannel?.closed_at,
    });
  } catch (error) {
    console.error('Channel settle notification error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}