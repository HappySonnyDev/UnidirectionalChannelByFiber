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

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        public_key: user.public_key,
        is_active: Boolean(user.is_active),
        created_at: user.created_at,
      }
    });

  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
