import { NextRequest, NextResponse } from 'next/server';
import { PaymentChannelRepository, PAYMENT_CHANNEL_STATUS } from '@/lib/server/database';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId: channelIdParam } = await params;
    const channelId = parseInt(channelIdParam);
    const { status } = await request.json();

    if (isNaN(channelId)) {
      return NextResponse.json(
        { error: 'Invalid channel ID' },
        { status: 400 },
      );
    }

    if (!Object.values(PAYMENT_CHANNEL_STATUS).includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Valid values: ${Object.values(PAYMENT_CHANNEL_STATUS).join(', ')}` },
        { status: 400 },
      );
    }

    const channelRepo = new PaymentChannelRepository();

    // Check if channel exists
    const channel = channelRepo.getPaymentChannelById(channelId);
    if (!channel) {
      return NextResponse.json(
        { error: 'Payment channel not found' },
        { status: 404 },
      );
    }

    // Update channel status
    const updatedChannel = channelRepo.updatePaymentChannelStatusById(channelId, status);

    if (!updatedChannel) {
      return NextResponse.json(
        { error: 'Failed to update channel status' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Payment channel status updated to ${status}`,
      channel: updatedChannel,
    });

  } catch (error) {
    console.error('Error updating payment channel status:', error);
    return NextResponse.json(
      { error: 'Failed to update payment channel status' },
      { status: 500 },
    );
  }
}