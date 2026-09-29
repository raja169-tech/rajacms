/**
 * core/auth.js — Token storage, login/logout helpers, and token parsing.
 *
 * Tokens are stored in memory (for the current session) + sessionStorage
 * as a pragmatic balance for a PWA:
 * - NOT localStorage (persists until manually cleared, XSS risk)
 * - NOT httpOnly cookies (requires same-origin server-side rendering)
 * - sessionStorage is cleared when the tab closes — acceptable for internal app
 *
 * Access token is decoded client-side to read role/display_name from payload
 * (no sensitive data is acted upon from the client-side decode; the backend
 * verifies the signature on every authenticated request).
 */

// Empty string = same origin. Frontend is served by FastAPI on the same port.
const API_BASE = '';

const ACCESS_KEY  = 'cms_access';
const REFRESH_KEY = 'cms_refresh';

// In-memory cache so we don't parse sessionStorage on every call
let _accessToken  = null;
let _refreshToken = null;


// ─── Storage ──────────────────────────────────────────────────────────────────

export function saveTokens(accessToken, refreshToken) {
  _accessToken  = accessToken;
  _refreshToken = refreshToken;
  sessionStorage.setItem(ACCESS_KEY,  accessToken);
  sessionStorage.setItem(REFRESH_KEY, refreshToken);
}

export function getAccessToken() {
  return _accessToken || sessionStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken() {
  return _refreshToken || sessionStorage.getItem(REFRESH_KEY);
}

export function clearTokens() {
  _accessToken  = null;
  _refreshToken = null;
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}


// ─── JWT Parsing (client-side, for UI display only) ───────────────────────────

/**
 * Decode a JWT payload without verifying the signature.
 * IMPORTANT: Never use these values for authorization decisions —
 * that happens on the backend. This is only for UI display.
 */
export function parseJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function getCurrentUser() {
  const token = getAccessToken();
  if (!token) return null;
  const payload = parseJwtPayload(token);
  if (!payload || !payload.sub) return null;
  // Check expiry
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;
  return payload;
}

export function getUserRole() {
  return getCurrentUser()?.role || null;
}

export function isAuthenticated() {
  return !!getCurrentUser();
}


// ─── Login / Logout Flow ─────────────────────────────────────────────────────

/**
 * Perform login API call, store tokens, and redirect to correct dashboard.
 * Returns { success, error, user }
 */
export async function login(loginIdentifier, password) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login_identifier: loginIdentifier, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.detail || 'Login failed' };
    }
    saveTokens(data.access_token, data.refresh_token);
    return { success: true, user: data };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

export async function logout() {
  const refresh = getRefreshToken();
  if (refresh) {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
    } catch { /* best effort */ }
  }
  clearTokens();
  window.location.href = '/index.html';
}
