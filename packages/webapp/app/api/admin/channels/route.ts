import { NextRequest, NextResponse } from 'next/server';
import { PaymentChannelRepository, PAYMENT_CHANNEL_STATUS } from '@/lib/server/database';

// Helper function to get status text
function getStatusText(status: string): string {
  switch (status) {
    case PAYMENT_CHANNEL_STATUS.PENDING:
      return 'Pending';
    case PAYMENT_CHANNEL_STATUS.ACTIVE:
      return 'Active';
    case PAYMENT_CHANNEL_STATUS.CLOSED:
      return 'Closed';
    default:
      return 'Unknown';
  }
}

export async function GET(request: NextRequest) {
  try {
    const channelRepo = new PaymentChannelRepository();
    const channels = channelRepo.getAllPaymentChannels();

    const formattedChannels = channels.map(channel => ({
      id: channel.id,
      channelId: channel.channel_id,
      userAddress: channel.user_address,
      fundingAmount: channel.funding_amount,
      status: channel.status,
      statusText: getStatusText(channel.status),
      createdAt: channel.created_at,
      closedAt: channel.closed_at,
    }));

    return NextResponse.json({
      channels: formattedChannels,
      total: formattedChannels.length,
    });
  } catch (error) {
    console.error('Error fetching payment channels for admin:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment channels' },
      { status: 500 },
    );
  }
}