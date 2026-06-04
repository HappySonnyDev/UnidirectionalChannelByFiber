import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/server/auth';
import { PaymentChannelRepository, PAYMENT_CHANNEL_STATUS } from '@/lib/server/database';

/**
 * POST /api/channel/create
 *
 * In the Fiber model, channel opening happens on the client side via
 * `node.openChannel()` (Fiber WASM). This API simply records the
 * channel creation notification from the frontend.
 */
export async function POST(request: Request) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { channel_id, funding_amount } = await request.json();

    if (!channel_id || !funding_amount) {
      return NextResponse.json(
        { error: 'channel_id and funding_amount are required' },
        { status: 400 },
      );
    }

    // Record the channel in the database
    const channelRepo = new PaymentChannelRepository();
    const paymentChannel = channelRepo.createPaymentChannel({
      channel_id,
      user_address: user.address,
      funding_amount: String(funding_amount),
      status: PAYMENT_CHANNEL_STATUS.ACTIVE,
    });

    return NextResponse.json({
      success: true,
      channel_id: paymentChannel.channel_id,
      status: paymentChannel.status,
      funding_amount: paymentChannel.funding_amount,
      created_at: paymentChannel.created_at,
    });
  } catch (error) {
    console.error('Channel creation notification error:', error);

    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}