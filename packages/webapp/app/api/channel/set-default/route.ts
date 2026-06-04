import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/server/auth';
import { PaymentChannelRepository, PAYMENT_CHANNEL_STATUS } from '@/lib/server/database';

/**
 * POST /api/channel/set-default
 *
 * Simplified for Fiber: In the Fiber model there is no explicit "default"
 * channel concept. The latest active channel is used automatically.
 * This endpoint remains for backward compatibility but now just
 * returns the user's latest active channel.
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
        { error: 'channelId is required' },
        { status: 400 },
      );
    }

    const channelRepo = new PaymentChannelRepository();
    const channel = channelRepo.getPaymentChannelByChannelId(channel_id);

    if (!channel) {
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 },
      );
    }

    if (channel.user_address !== user.address) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 },
      );
    }

    if (channel.status !== PAYMENT_CHANNEL_STATUS.ACTIVE) {
      return NextResponse.json(
        { error: 'Only active channels can be set as default' },
        { status: 400 },
      );
    }

    // In Fiber, the latest active channel is the effective default
    return NextResponse.json({
      success: true,
      message: 'In Fiber model, the latest active channel is used automatically',
      channel_id: channel.channel_id,
      status: channel.status,
    });
  } catch (error) {
    console.error('Set default channel error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}