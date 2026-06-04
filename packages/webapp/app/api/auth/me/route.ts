import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/server/auth';

export async function GET(request: NextRequest) {
  try {
    const authService = new AuthService();
    const user = await authService.getCurrentUserAsync(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get user's active payment channel
    const activeChannel = authService.getActivePaymentChannel(user.id);

    const userData = {
      id: user.id,
      username: user.username,
      created_at: user.created_at,
      is_active: Boolean(user.is_active),
      ckbAddress: user.public_key,
      active_channel: activeChannel ? {
        channelId: activeChannel.channel_id,
        fundingAmount: activeChannel.funding_amount,
        userAddress: activeChannel.user_address,
        status: activeChannel.status
      } : null
    };

    return NextResponse.json({
      user: userData
    });

  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
