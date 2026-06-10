/**
 * API Layer - Centralized API functions for backend communication
 */

import { apiGet, apiPost, APIError } from './fetch';
import { User } from './auth-client';

// API Response Types
interface LoginResponse {
  message: string;
  user: User;
}

interface MeResponse {
  user: User;
}

// Authentication API
export const auth = {
  /**
   * Login with CKB address (Fiber/Passkey auth)
   */
  async login(data: { ckbAddress: string }): Promise<LoginResponse> {
    return apiPost<LoginResponse>('/api/auth/login', data);
  },

  /**
   * Get current user info
   */
  async me(headers?: Record<string, string>): Promise<MeResponse> {
    return apiGet<MeResponse>('/api/auth/me', headers);
  },

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    return apiPost<void>('/api/auth/logout');
  },

  /**
   * Register user (legacy - kept for compatibility)
   */
  async register(data: { email: string; username: string; password: string }): Promise<LoginResponse> {
    return apiPost<LoginResponse>('/api/auth/register', data);
  },
};

// Chat/Session API
export const chat = {
  /**
   * Send chat message
   */
  async send(data: unknown): Promise<unknown> {
    return apiPost('/api/chat', data);
  },
};

// Session API
export const session = {
  /**
   * Get current session
   */
  async current(): Promise<unknown> {
    return apiGet('/api/session/current');
  },

  /**
   * Pay for session
   */
  async pay(data: unknown): Promise<unknown> {
    return apiPost('/api/session/pay', data);
  },
};

// Admin API
export const admin = {
  /**
   * Get all users
   */
  async getUsers(): Promise<unknown> {
    return apiGet('/api/admin/users');
  },

  /**
   * Toggle user status
   */
  async toggleUserStatus(userId: string): Promise<unknown> {
    return apiPost(`/api/admin/users/${userId}/toggle-status`);
  },
};

// Debug API
export const debug = {
  /**
   * Check payment status
   */
  async paymentStatus(): Promise<unknown> {
    return apiGet('/api/debug/payment-status');
  },
};

// Export APIError for error handling
export { APIError };
