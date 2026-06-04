// Client-side authentication utilities (Edge Runtime compatible)
// Migrated from private-key-based auth to Fiber/Passkey-based auth.
// User identity is now derived from the Fiber node's CKB address.

export interface User {
  id: number;
  username: string;
  created_at: string;
  is_active: boolean;
  /** CKB address from Fiber node (primary identifier) */
  ckbAddress?: string;
  /** Active payment channel info (Fiber-based) */
  active_channel?: {
    channelId: string;
    txHash: string | null;
    amount: number;
    consumed_tokens: number;
    status: number;
  } | null;
}

// ---------------------------------------------------------------------------
// CKB address storage (replaces private_key storage)
// ---------------------------------------------------------------------------

const STORAGE_KEY_CKB_ADDRESS = 'dapp2-ckb-address';

/** Store CKB address in localStorage for persistent identification */
export function storeCkbAddress(address: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_CKB_ADDRESS, address);
}

/** Get stored CKB address */
export function getStoredCkbAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY_CKB_ADDRESS);
}

/** Clear stored credentials */
export function clearStoredCredentials(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_CKB_ADDRESS);
  localStorage.removeItem('private_key'); // Clean up legacy key
  localStorage.removeItem('dapp2-fiber-connected');
}

// ---------------------------------------------------------------------------
// Auth API helpers
// ---------------------------------------------------------------------------

/**
 * Login / register with a CKB address.
 * The server will find-or-create a user record keyed by CKB address.
 */
export async function loginWithCkbAddress(ckbAddress: string): Promise<User> {
  const { apiPost } = await import('@/lib/client/fetch');
  const response = await apiPost<{ message: string; user: User }>(
    '/api/auth/login',
    { ckbAddress },
  );
  return response.user;
}

/** Logout current user */
export async function logoutUser(): Promise<void> {
  const { apiPost } = await import('@/lib/client/fetch');
  await apiPost<void>('/api/auth/logout');
}

/** Get current user info from server (uses X-CKB-Address header via fetch wrapper) */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const ckbAddress = getStoredCkbAddress();
    if (!ckbAddress) {
      return null;
    }
    const { apiGet } = await import('@/lib/client/fetch');
    const response = await apiGet<{ user: User }>('/api/auth/me');
    return response.user;
  } catch {
    return null;
  }
}

/** Check if user has a stored CKB address (i.e. has authenticated before) */
export function isLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(STORAGE_KEY_CKB_ADDRESS);
}

// ---------------------------------------------------------------------------
// Legacy compatibility – these are no-ops / removed but exported to avoid
// immediate breakage of any remaining consumers during the migration.
// ---------------------------------------------------------------------------

/** @deprecated Use loginWithCkbAddress instead */
export async function loginWithWallet(_privateKey: string): Promise<User> {
  throw new Error('loginWithWallet is deprecated. Use Passkey-based login via auth-context instead.');
}

/** @deprecated CKB address is now stored, not private key */
export function getStoredPrivateKey(): string | null {
  return null;
}
