/**
 * core/api.js — Authenticated fetch wrapper.
 *
 * Handles:
 * - Attaching Authorization: Bearer <access_token> to every request
 * - Automatic token refresh on 401 (retries original request once)
 * - Consistent error parsing using the { detail, code } error model
 * - Redirect to login on second 401 (expired refresh token)
 *
 * Usage:
 *   import { api } from './api.js';
 *   const data = await api.get('/api/client/dashboard');
 *   await api.post('/api/client/pay-out', { amount: 5000 });
 *   const result = await api.upload('/api/client/pay-in', formData);
 */

import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from './auth.js';

// Empty string = same origin. Frontend is served by FastAPI on the same port.
const BASE_URL = '';


// ─── Token Refresh ────────────────────────────────────────────────────────────

let _refreshing = null;  // Shared promise so concurrent 401s only trigger one refresh

async function refreshAccessToken() {
  if (_refreshing) return _refreshing;

  _refreshing = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      window.location.href = '/index.html';
      return null;
    }
    try {
      const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        window.location.href = '/index.html';
        return null;
      }
      const data = await res.json();
      saveTokens(data.access_token, data.refresh_token);
      return data.access_token;
    } finally {
      _refreshing = null;
    }
  })();

  return _refreshing;
}


// ─── Core Request Function ────────────────────────────────────────────────────

async function request(method, path, options = {}) {
  const { body, headers = {}, isFormData = false, retry = true } = options;
  const token = getAccessToken();

  const fetchOptions = {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
  };

  if (body !== undefined) {
    fetchOptions.body = isFormData ? body : JSON.stringify(body);
  }

  let res = await fetch(`${BASE_URL}${path}`, fetchOptions);

  // 401 → try refresh once
  if (res.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (!newToken) return;  // Already redirected to login

    fetchOptions.headers.Authorization = `Bearer ${newToken}`;
    res = await fetch(`${BASE_URL}${path}`, fetchOptions);
  }

  // Parse response
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    let errorDetail = `Request failed with status ${res.status}`;
    let errorCode = 'UNKNOWN_ERROR';
    try {
      if (contentType.includes('application/json')) {
        const err = await res.json();
        errorDetail = err.detail || errorDetail;
        errorCode = err.code || errorCode;
      }
    } catch { /* ignore */ }
    const error = new Error(errorDetail);
    error.code = errorCode;
    error.status = res.status;
    throw error;
  }

  // Binary responses (reports)
  if (contentType.includes('application/pdf') || contentType.includes('spreadsheetml')) {
    return res.blob();
  }

  if (res.status === 204) return null;

  if (contentType.includes('application/json')) {
    return res.json();
  }

  return res.text();
}


// ─── Public API ───────────────────────────────────────────────────────────────

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  delete: (path, opts) => request('DELETE', path, opts),

  /** Upload multipart/form-data (for proof images) */
  upload: (path, formData) => request('POST', path, { body: formData, isFormData: true }),
};
