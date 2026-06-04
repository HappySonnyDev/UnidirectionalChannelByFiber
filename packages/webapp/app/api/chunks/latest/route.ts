import { NextRequest } from 'next/server';
import { getUserFromRequest } from '@/lib/server/auth';
import { ChunkPaymentRepository, PaymentChannelRepository } from '@/lib/server/database';
import { withAuth, ApiResponse } from '@/lib/server/api-middleware';

/**
 * GET /api/chunks/latest
 *
 * Simplified for Fiber: returns the latest payment for a channel.
 */
async function getLatestChunkHandler(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return ApiResponse.error('Authentication required', 401);
  }

  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('channel_id');

  const channelRepo = new PaymentChannelRepository();

  let targetChannelId: string;
  let channelInfo;

  if (channelId) {
    const channel = channelRepo.getPaymentChannelByChannelId(channelId);
    if (!channel || channel.user_address !== user.address) {
      return ApiResponse.error('Channel not found or access denied');
    }
    targetChannelId = channelId;
    channelInfo = {
      channelId: channel.channel_id,
      fundingAmount: channel.funding_amount,
      status: channel.status,
    };
  } else {
    const activeChannel = channelRepo.getLatestActiveChannelByUserAddress(user.address);
    if (!activeChannel) {
      return ApiResponse.error('No active payment channel found');
    }
    targetChannelId = activeChannel.channel_id;
    channelInfo = {
      channelId: activeChannel.channel_id,
      fundingAmount: activeChannel.funding_amount,
      status: activeChannel.status,
    };
  }

  // Get latest payment for this channel
  const chunkRepo = new ChunkPaymentRepository();
  const payments = chunkRepo.getChunkPaymentsBySession(targetChannelId);
  const latestPayment = payments.length > 0 ? payments[payments.length - 1] : null;

  if (!latestPayment) {
    return ApiResponse.success({
      hasLatestPayment: false,
      message: 'No payments found for this channel',
      channelInfo,
    });
  }

  return ApiResponse.success({
    hasLatestPayment: true,
    latestPayment: {
      id: latestPayment.id,
      sessionId: latestPayment.session_id,
      channelId: latestPayment.channel_id,
      invoice: latestPayment.invoice,
      paymentHash: latestPayment.payment_hash,
      amount: latestPayment.amount,
      status: latestPayment.status,
      createdAt: latestPayment.created_at,
    },
    channelInfo,
  });
}

// Export the wrapped handler
export const GET = withAuth(getLatestChunkHandler);