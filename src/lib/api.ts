'use client';

import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';

/**
 * 携带登录态（x-session）调用业务接口。
 * 每次请求实时获取最新 session，不做缓存。
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const supabase = await getSupabaseBrowserClientWithRetry();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('未登录或登录已过期');
  }

  const headers = new Headers(options?.headers || {});
  headers.set('x-session', session.access_token);
  // 字符串 body 默认按 JSON 发送；FormData 由浏览器自动带 boundary，禁止手动设置
  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(path, { ...options, headers });
}

export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `请求失败（${res.status}）`);
  }
  return data as T;
}
