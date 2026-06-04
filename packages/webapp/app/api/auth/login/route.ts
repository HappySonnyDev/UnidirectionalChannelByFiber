import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ckbAddress } = body;

    if (!ckbAddress) {
      return NextResponse.json(
        { error: "CKB address is required" },
        { status: 400 },
      );
    }

    const authService = new AuthService();
    const { user } = await authService.loginWithCkbAddress(ckbAddress);

    // Get user's active payment channel
    const activeChannel = authService.getActivePaymentChannel(user.id);

    const userData = {
      id: user.id,
      created_at: user.created_at,
      is_active: Boolean(user.is_active),
      ckbAddress,
      username: user.username,
      active_channel: activeChannel
        ? {
            channelId: activeChannel.channel_id,
            fundingAmount: activeChannel.funding_amount,
            userAddress: activeChannel.user_address,
            status: activeChannel.status,
          }
        : null,
    };

    // No cookie needed – auth is via X-CKB-Address header
    return NextResponse.json({
      message: "OK",
      user: userData,
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
