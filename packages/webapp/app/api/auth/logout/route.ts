import { NextResponse } from 'next/server';

export async function POST() {
  // No cookie to clear – auth is via X-CKB-Address header only.
  // Client-side cleanup (localStorage, Fiber node disconnect) is
  // handled by the auth-context logout callback.
  return NextResponse.json({ message: 'OK' });
}
