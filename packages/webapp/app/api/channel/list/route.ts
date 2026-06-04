import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/server/auth';
import { PaymentChannelRepository, PAYMENT_CHANNEL_STATUS } from '@/lib/server/database';
import { withAuth, ApiResponse } from '@/lib/server/api-middleware';

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

async function listChannelsHandler(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return ApiResponse.error('Authentication required', 401);
  }

  // Get payment channels for the user by CKB address
  const channelRepo = new PaymentChannelRepository();
  const channels = channelRepo.getPaymentChannelsByUserAddress(user.address);

  // Format the channels for the response
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

  return ApiResponse.success({
    channels: formattedChannels,
    total: formattedChannels.length,
  });
}

// Export the wrapped handler
export const GET = withAuth(listChannelsHandler);