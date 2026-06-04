import { NextRequest } from 'next/server';
import { getUserFromRequest } from '@/lib/server/auth';
import { PaymentChannelRepository, ChunkPaymentRepository } from '@/lib/server/database';
import { withAuth, ApiResponse } from '@/lib/server/api-middleware';

/**
 * GET /api/chunks
 *
 * Simplified for Fiber: returns pending payment info for a session.
 */
async function getChunksHandler(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return ApiResponse.error('Authentication required', 401);
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return ApiResponse.error('sessionId is required', 400);
  }

  const chunkRepo = new ChunkPaymentRepository();
  const payments = chunkRepo.getChunkPaymentsBySession(sessionId);

  const pendingCount = payments.filter(p => p.status === 'pending').length;

  return ApiResponse.success({
    payments: payments.map(p => ({
      id: p.id,
      sessionId: p.session_id,
      channelId: p.channel_id,
      invoice: p.invoice,
      paymentHash: p.payment_hash,
      amount: p.amount,
      status: p.status,
      createdAt: p.created_at,
    })),
    total: payments.length,
    pendingCount,
  });
}

/**
 * POST /api/chunks
 *
 * Simplified for Fiber: payment is now handled via invoices.
 * This endpoint is kept for backward compatibility but the 'pay' action
 * is deprecated — use /api/invoices/create + /api/invoices/[id]/confirm instead.
 */
async function postChunksHandler(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return ApiResponse.error('Authentication required', 401);
  }

  const { sessionId } = await req.json();

  if (!sessionId) {
    return ApiResponse.error('sessionId is required', 400);
  }

  // In Fiber model, payments are handled via invoices.
  // Return info about the user's active channel.
  const channelRepo = new PaymentChannelRepository();
  const activeChannel = channelRepo.getLatestActiveChannelByUserAddress(user.address);

  return ApiResponse.success({
    message: 'In Fiber model, use /api/invoices/create for payments',
    activeChannel: activeChannel ? {
      channelId: activeChannel.channel_id,
      fundingAmount: activeChannel.funding_amount,
      status: activeChannel.status,
    } : null,
  });
}

// Export wrapped handlers
export const GET = withAuth(getChunksHandler);
export const POST = withAuth(postChunksHandler);