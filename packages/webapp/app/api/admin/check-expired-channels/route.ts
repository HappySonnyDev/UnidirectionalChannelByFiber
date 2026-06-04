import { NextRequest, NextResponse } from 'next/server';
import { PaymentChannelRepository, PAYMENT_CHANNEL_STATUS, ScheduledTaskLogRepository } from '@/lib/server/database';
import { FIBER_CONFIG } from '@/lib/config';

/**
 * POST /api/admin/check-expired-channels
 *
 * Simplified for Fiber: Checks which database channels are still marked
 * as 'active' but may no longer be active on the Fiber node.
 * This now queries the merchant node for actual channel status.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const taskLogRepo = new ScheduledTaskLogRepository();

  try {
    console.log('Starting expired channels check (Fiber model)...');

    const channelRepo = new PaymentChannelRepository();

    // Get all active channels from database
    const activeChannels = channelRepo.getAllPaymentChannels()
      .filter(ch => ch.status === PAYMENT_CHANNEL_STATUS.ACTIVE);

    console.log(`Found ${activeChannels.length} active channels in database`);

    let closedCount = 0;

    // Try to verify with the merchant Fiber node
    try {
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

      if (!data.error && data.result?.channels) {
        // Get active channel IDs from the Fiber node
        const nodeActiveIds = new Set(
          data.result.channels.map((ch: Record<string, unknown>) => ch.channel_id)
        );

        // Close database channels that are no longer active on the Fiber node
        for (const channel of activeChannels) {
          if (!nodeActiveIds.has(channel.channel_id)) {
            channelRepo.updatePaymentChannelStatus(channel.channel_id, PAYMENT_CHANNEL_STATUS.CLOSED);
            closedCount++;
            console.log(`Closed channel ${channel.channel_id} (no longer active on Fiber node)`);
          }
        }
      }
    } catch (nodeError) {
      console.warn('Could not verify channels with Fiber node, skipping verification:', nodeError);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Log the task execution
    taskLogRepo.createTaskLog({
      task_name: 'check-expired-channels',
      task_type: 'scheduled',
      execution_status: 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date(endTime).toISOString(),
      duration_ms: duration,
      result_data: JSON.stringify({
        checked_count: activeChannels.length,
        closed_count: closedCount,
      }),
      checked_count: activeChannels.length,
      settled_count: closedCount,
    });

    return NextResponse.json({
      success: true,
      message: `Checked ${activeChannels.length} channels, closed ${closedCount} stale channels`,
      data: {
        checked_count: activeChannels.length,
        closed_count: closedCount,
        execution_time_ms: duration,
      },
    });

  } catch (error) {
    console.error('Error checking expired channels:', error);

    const endTime = Date.now();
    const duration = endTime - startTime;

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    taskLogRepo.createTaskLog({
      task_name: 'check-expired-channels',
      task_type: 'scheduled',
      execution_status: 'error',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date(endTime).toISOString(),
      duration_ms: duration,
      error_message: errorMessage,
      checked_count: 0,
      settled_count: 0,
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check expired channels',
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}