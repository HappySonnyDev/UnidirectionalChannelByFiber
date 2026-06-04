import { NextResponse } from 'next/server';

/**
 * POST /api/channel/confirm-funding
 *
 * DEPRECATED: In the Fiber model, channel funding confirmation is handled
 * automatically by the Fiber node. This endpoint is kept as a no-op
 * for backward compatibility.
 */
export async function POST() {
  return NextResponse.json({
    success: true,
    message: 'Fiber channels are confirmed automatically by the node. This endpoint is deprecated.',
    deprecated: true,
  });
}