import type { AuthStatus } from './api';

const TOKEN_KEY = 'flux_auth_token';

// Cached auth status from server (populated by initAuth())
let _authStatus: AuthStatus | null = null;

/**
 * Initialize auth mode by checking /api/auth/status.
 * Call once at app startup before rendering. Returns cached result on repeat calls.
 */
export async function initAuth(): Promise<AuthStatus> {
  if (_authStatus) return _authStatus;
  try {
    const res = await fetch('/api/auth/status');
    if (res.ok) {
      _authStatus = await res.json() as AuthStatus;
    } else {
      _authStatus = { authenticated: false, keyType: 'anonymous' };
    }
  } catch {
    _authStatus = { authenticated: false, keyType: 'anonymous' };
  }
  return _authStatus;
}

/**
 * Get cached auth status. Returns null if initAuth() has not been called yet.
 */
export function getAuthMode(): AuthStatus | null {
  return _authStatus;
}

/**
 * Get stored auth token from localStorage
 */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Store auth token in localStorage
 */
export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    console.error('Failed to save auth token');
  }
}

/**
 * Clear stored auth token
 */
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Check if user is authenticated (has token stored)
 */
export function hasToken(): boolean {
  return getToken() !== null;
}
