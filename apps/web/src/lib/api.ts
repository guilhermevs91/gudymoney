// =============================================================================
// Gudy Money — typed API client
// =============================================================================

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gm_access_token');
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gm_refresh_token');
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem('gm_access_token', access);
  localStorage.setItem('gm_refresh_token', refresh);
}

export function clearTokens(): void {
  localStorage.removeItem('gm_access_token');
  localStorage.removeItem('gm_refresh_token');
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const refresh = getRefreshToken();
  if (!refresh) throw new Error('No refresh token');

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });

  if (!res.ok) {
    clearTokens();
    window.location.replace('/login');
    throw new Error('Session expired');
  }

  const body = (await res.json()) as { data?: { access_token: string; refresh_token: string }; access_token?: string; refresh_token?: string };
  const accessToken = body.data?.access_token ?? (body as { access_token?: string }).access_token;
  const refreshToken = body.data?.refresh_token ?? (body as { refresh_token?: string }).refresh_token;

  if (!accessToken || !refreshToken) {
    clearTokens();
    window.location.replace('/login');
    throw new Error('Invalid refresh response');
  }

  setTokens(accessToken, refreshToken);
  return accessToken;
}

async function freshToken(): Promise<string | null> {
  const token = getAccessToken();
  if (!token) return null;
  return token;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchOptions = {
  method?: string;
  body?: string | FormData;
  headers?: Record<string, string>;
};

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  let token = await freshToken();

  const makeHeaders = (t: string | null): Record<string, string> => {
    const h: Record<string, string> = { ...(options.headers ?? {}) };
    // Only inject the user token if no Authorization header was explicitly provided
    if (t && !h['Authorization']) h['Authorization'] = `Bearer ${t}`;
    if (!(options.body instanceof FormData)) {
      h['Content-Type'] = 'application/json';
    }
    return h;
  };

  let res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: makeHeaders(token),
    body: options.body,
  });

  // Auto-refresh on 401 — skip if caller provided its own Authorization header
  const hasCustomAuth = !!(options.headers?.['Authorization']);
  if (res.status === 401 && token && !hasCustomAuth) {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
    }
    try {
      token = await refreshPromise;
      res = await fetch(`${BASE_URL}${path}`, {
        method: options.method ?? 'GET',
        headers: makeHeaders(token),
        body: options.body,
      });
    } catch (refreshErr) {
      console.error('[api] refresh failed:', refreshErr);
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const err = (await res.json()) as { error?: string; code?: string };
      message = err.error ?? message;
      code = err.code;
    } catch {
      // ignore parse error
    }
    console.error(`[api] ${options.method ?? 'GET'} ${path} → ${res.status}: ${message}`);
    throw new ApiError(message, res.status, code);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function buildQuery(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export const api = {
  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return request<T>(`${path}${buildQuery(params)}`);
  },

  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  delete<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'DELETE',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  postForm<T>(path: string, formData: FormData): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: formData,
    });
  },
};

// ---------------------------------------------------------------------------
// SuperAdmin token helpers (separate storage)
// ---------------------------------------------------------------------------

export function getSuperAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gm_sa_token');
}

export function setSuperAdminToken(token: string): void {
  localStorage.setItem('gm_sa_token', token);
}

export function clearSuperAdminToken(): void {
  localStorage.removeItem('gm_sa_token');
}

export const superadminApi = {
  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const token = getSuperAdminToken();
    return request<T>(`${path}${buildQuery(params)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  post<T>(path: string, body: unknown): Promise<T> {
    const token = getSuperAdminToken();
    return request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  patch<T>(path: string, body: unknown): Promise<T> {
    const token = getSuperAdminToken();
    return request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  put<T>(path: string, body: unknown): Promise<T> {
    const token = getSuperAdminToken();
    return request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  delete<T>(path: string): Promise<T> {
    const token = getSuperAdminToken();
    return request<T>(path, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
};
