import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

const TOKEN_KEY = 'gm_access_token';
const REFRESH_KEY = 'gm_refresh_token';

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, access),
    SecureStore.setItemAsync(REFRESH_KEY, refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    const refresh = await getRefreshToken();
    if (!refresh) throw new Error('Session expired');

    const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });

    if (!refreshRes.ok) {
      await clearTokens();
      throw new Error('Session expired');
    }

    const body = await refreshRes.json() as { data: { access_token: string; refresh_token: string } };
    await setTokens(body.data.access_token, body.data.refresh_token);
    headers['Authorization'] = `Bearer ${body.data.access_token}`;

    const retryRes = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    if (!retryRes.ok) throw new Error(`HTTP ${retryRes.status}`);
    if (retryRes.status === 204) return undefined as T;
    return retryRes.json() as Promise<T>;
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const err = await res.json() as { error?: string };
      message = err.error ?? message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
