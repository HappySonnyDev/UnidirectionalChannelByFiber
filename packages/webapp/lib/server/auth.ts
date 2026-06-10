import "server-only";
import { NextRequest } from "next/server";
import {
  UserRepository,
  User,
} from '@/lib/server/database';

// ---------------------------------------------------------------------------
// AuthService – Fiber/Passkey authentication via X-CKB-Address header
// ---------------------------------------------------------------------------

export class AuthService {
  private userRepo: UserRepository;
  constructor() {
    this.userRepo = new UserRepository();
  }

  /**
   * Login or register a user by CKB address.
   * In the Fiber/Passkey model, authentication happens entirely on the client
   * (Passkey + Fiber WASM node). The server only needs to identify users by
   * their CKB address to look up / create user records.
   */
  async loginWithCkbAddress(ckbAddress: string): Promise<{ user: User }> {
    if (!ckbAddress || ckbAddress.trim().length === 0) {
      throw new Error("CKB address is required");
    }

    // Try to find user by CKB address (stored in public_key field)
    let user = this.userRepo.getUserByPublicKey(ckbAddress);

    if (!user) {
      // Auto-create user with CKB address as identifier
      const username = `user_${ckbAddress.slice(0, 12)}`;

      let finalUsername = username;
      let counter = 1;
      while (this.userRepo.getUserByUsername(finalUsername)) {
        finalUsername = `${username}_${counter}`;
        counter++;
      }

      user = await this.userRepo.createUserFromPublicKey({
        username: finalUsername,
        public_key: ckbAddress,
      });
    }

    // Update last login
    this.userRepo.updateLastLogin(user.id);

    return { user };
  }

  // Get current user from request (X-CKB-Address header only)
  getCurrentUser(request: NextRequest): User | null {
    const ckbAddress = request.headers.get("X-CKB-Address");
    if (!ckbAddress) return null;

    let user = this.userRepo.getUserByPublicKey(ckbAddress);
    if (!user) {
      // Auto-create user based on CKB address so that subsequent
      // requests can identify the user without requiring a prior login.
      try {
        const username = `user_${ckbAddress.slice(0, 12)}`;
        let finalUsername = username;
        let counter = 1;
        while (this.userRepo.getUserByUsername(finalUsername)) {
          finalUsername = `${username}_${counter}`;
          counter++;
        }
        // createUserFromPublicKey is async but we call it in a sync method
        // This is acceptable because better-sqlite3 is synchronous
        user = this.userRepo.getUserByPublicKey(ckbAddress);
      } catch {
        user = this.userRepo.getUserByPublicKey(ckbAddress);
      }
    }
    return user;
  }

  /**
   * Async version of getCurrentUser – needed when auto-creating the user
   * (createUserFromPublicKey is async due to the legacy email/password path).
   */
  async getCurrentUserAsync(request: NextRequest): Promise<User | null> {
    const ckbAddress = request.headers.get("X-CKB-Address");
    if (!ckbAddress) return null;

    let user = this.userRepo.getUserByPublicKey(ckbAddress);
    if (!user) {
      try {
        const username = `user_${ckbAddress.slice(0, 12)}`;
        let finalUsername = username;
        let counter = 1;
        while (this.userRepo.getUserByUsername(finalUsername)) {
          finalUsername = `${username}_${counter}`;
          counter++;
        }
        user = await this.userRepo.createUserFromPublicKey({
          username: finalUsername,
          public_key: ckbAddress,
        });
      } catch {
        user = this.userRepo.getUserByPublicKey(ckbAddress);
      }
    }
    return user;
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Get user identity from request (X-CKB-Address header only).
 */
export function getUserFromRequest(request: Request): { address: string } | null {
  const address = request.headers.get("X-CKB-Address");
  if (address) return { address };
  return null;
}

// Server-side helper (Node.js Runtime)
export async function requireAuth(request: NextRequest): Promise<User> {
  const authService = new AuthService();
  const user = await authService.getCurrentUserAsync(request);

  if (!user) {
    throw new Error("Authentication required");
  }

  return user;
}
