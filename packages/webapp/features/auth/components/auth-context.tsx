"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { useFiberNode } from "@/hooks/useFiberNode";
import { FIBER_CONFIG } from "@/lib/config";
import {
  loginWithCkbAddress,
  logoutUser,
  clearStoredCredentials,
  storeCkbAddress,
  getStoredCkbAddress,
  User,
} from "@/lib/client/auth-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthContextType {
  // Connection state
  isAuthenticated: boolean;
  isLoading: boolean;

  // User info (from Fiber node + server)
  user: User | null;
  ckbAddress: string | null;

  // Operations
  login: () => Promise<void>;       // Login with existing Passkey
  register: (displayName?: string) => Promise<void>; // Register new Passkey
  logout: () => Promise<void>;

  // Fiber node (exposed for advanced usage)
  fiberNode: ReturnType<typeof useFiberNode>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  // Fiber node – always mounted, auto-reconnects if previously connected
  const fiberNode = useFiberNode({
    merchantPubkey: FIBER_CONFIG.MERCHANT_PUBKEY,
    merchantMultiaddr: FIBER_CONFIG.MERCHANT_MULTIADDR,
    network: FIBER_CONFIG.NETWORK,
    autoConnect: false,
  });

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Derive auth state from Fiber node
  const isAuthenticated = fiberNode.isNodeReady;
  const ckbAddress = fiberNode.ckbAddress;

  // -----------------------------------------------------------------------
  // Sync CKB address to localStorage (for fetch header) and server
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (ckbAddress) {
      storeCkbAddress(ckbAddress);
    }
  }, [ckbAddress]);

  // When the node becomes ready, register / identify the user with the server.
  // If the server sync fails, we still create a fallback user so the UI
  // correctly reflects the authenticated state.
  useEffect(() => {
    if (!fiberNode.isNodeReady || !ckbAddress) return;

    let cancelled = false;

    (async () => {
      try {
        const userData = await loginWithCkbAddress(ckbAddress);
        if (!cancelled) {
          setUser(userData);
        }
      } catch (err) {
        console.error("[AuthProvider] Failed to sync user with server:", err);
        // Fallback: create a minimal user object from the CKB address so that
        // the UI can still reflect the authenticated state even when the server
        // login endpoint fails (e.g. 400 error).
        if (!cancelled) {
          setUser({
            id: -1,
            username: `user_${ckbAddress.slice(0, 12)}`,
            created_at: new Date().toISOString(),
            is_active: true,
            ckbAddress,
            active_channel: null,
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fiberNode.isNodeReady, ckbAddress]);

  // -----------------------------------------------------------------------
  // Initial load – check if we have a stored CKB address (already logged in)
  // -----------------------------------------------------------------------
  useEffect(() => {
    // When autoConnect is disabled, always resolve loading immediately
    // since we won't wait for WASM connection
    setIsLoading(false);
  }, []);

  // -----------------------------------------------------------------------
  // Operations
  // -----------------------------------------------------------------------

  /** Login with an existing Passkey (PasskeyCredentialProvider handles auth) */
  const login = useCallback(async () => {
    try {
      await fiberNode.connect();
      // User sync happens via the effect above once isNodeReady becomes true
    } catch (err) {
      console.error("[AuthProvider] Login failed:", err);
      throw err;
    }
  }, [fiberNode]);

  /** Register a new Passkey + connect Fiber node */
  const register = useCallback(
    async (displayName?: string) => {
      try {
        await fiberNode.connect(displayName || "AI Assistant User");
        // User sync happens via the effect above once isNodeReady becomes true
      } catch (err) {
        console.error("[AuthProvider] Registration failed:", err);
        throw err;
      }
    },
    [fiberNode],
  );

  /** Logout – disconnect Fiber node and clear all credentials */
  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      // Continue with logout even if request fails
    }

    try {
      await fiberNode.disconnect();
    } catch {
      // best-effort
    }

    clearStoredCredentials();
    setUser(null);
  }, [fiberNode]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const value: AuthContextType = {
    isAuthenticated,
    isLoading,
    user,
    ckbAddress,
    login,
    register,
    logout,
    fiberNode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
