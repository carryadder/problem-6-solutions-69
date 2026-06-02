'use client';

import useSWR from 'swr';
import { useEffect, useState } from 'react';

type AuthBootstrap = {
  token: string | null;
  backendUrl: string | null;
};

let cachedAuthBootstrap: AuthBootstrap | null = null;
let tokenPromise: Promise<AuthBootstrap> | null = null;

export async function getAuthBootstrap(): Promise<AuthBootstrap> {
  if (cachedAuthBootstrap) return cachedAuthBootstrap;
  if (tokenPromise) return tokenPromise;
  tokenPromise = fetch('/api/auth/token', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : { token: null, backendUrl: null }))
    .then((j) => {
      cachedAuthBootstrap = {
        token: j.token || null,
        backendUrl: j.backendUrl || null,
      };
      return cachedAuthBootstrap;
    })
    .finally(() => {
      tokenPromise = null;
    });
  return tokenPromise;
}

export async function getToken(): Promise<string | null> {
  return (await getAuthBootstrap()).token;
}

export function clearToken() {
  cachedAuthBootstrap = null;
}

async function authedFetch(url: string, init: RequestInit = {}) {
  const token = await getToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers, credentials: 'include' });
}

export async function api<T = any>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const r = await authedFetch(url, init);
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`${r.status}: ${txt || r.statusText}`);
  }
  if (r.status === 204) return null as any;
  return (await r.json()) as T;
}

export async function apiJson<T = any>(
  url: string,
  body: any,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST',
): Promise<T> {
  return api<T>(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function apiUpload<T = any>(url: string, form: FormData): Promise<T> {
  return api<T>(url, { method: 'POST', body: form });
}

const fetcher = (url: string) => api(url);

export function useApi<T = any>(url: string | null) {
  return useSWR<T>(url, fetcher);
}

// useAuthToken — true once we have a usable Bearer token (or null if not signed in).
export function useAuthToken() {
  const [token, setToken] = useState<string | null>(cachedAuthBootstrap?.token || null);
  useEffect(() => {
    let alive = true;
    getToken().then((t) => alive && setToken(t));
    return () => {
      alive = false;
    };
  }, []);
  return token;
}
