import { NextResponse } from 'next/server';
import { FIBER_CONFIG } from '@/lib/config';

/**
 * GET /api/channel/status
 *
 * Proxy API that queries the merchant Fiber node (fnn) for channel status.
 * Returns channel information from the merchant node's perspective.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channel_id');

    // Call merchant node list_channels RPC
    const response = await fetch(FIBER_CONFIG.MERCHANT_NODE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'list_channels',
        params: [{ peer_id: null }],
        id: 1,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('Fiber node list_channels error:', data.error);
      return NextResponse.json(
        { error: data.error.message || 'Fiber node error' },
        { status: 500 },
      );
    }

    // If a specific channel_id is requested, filter for it
    if (channelId && data.result) {
      const channel = data.result.channels?.find(
        (ch: Record<string, unknown>) => ch.channel_id === channelId
      );
      return NextResponse.json({ channel: channel || null });
    }

    return NextResponse.json({
      channels: data.result?.channels || [],
    });
  } catch (error) {
    console.error('Channel status query error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}