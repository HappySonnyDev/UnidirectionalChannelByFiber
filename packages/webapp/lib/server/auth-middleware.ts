// Edge Runtime compatible auth utilities for middleware

// Check if user is authenticated via X-CKB-Address header (Passkey auth)
export async function requireAuthMiddleware(request: Request): Promise<boolean> {
  const ckbAddress = request.headers.get('X-CKB-Address');
  const url = new URL(request.url);
  console.log('[auth-middleware]', url.pathname, '| X-CKB-Address:', ckbAddress ? ckbAddress.slice(0, 20) + '...' : 'MISSING');
  return !!(ckbAddress && ckbAddress.trim().length > 0);
}
