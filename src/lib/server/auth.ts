import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface AuthContext {
  userId: string;
  email: string | undefined;
  client: SupabaseClient;
}

/**
 * 从请求头 x-session 校验登录态，返回带用户身份的 Supabase client（受 RLS 约束）。
 * 校验失败返回 null，由调用方返回 401。
 */
export async function getAuthContext(req: NextRequest): Promise<AuthContext | null> {
  const token = req.headers.get('x-session');
  if (!token) return null;

  const client = getSupabaseClient(token);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) return null;
  return { userId: user.id, email: user.email, client };
}

export function unauthorized(message = '请先登录') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(error: unknown, fallback = '服务器内部错误') {
  const message = error instanceof Error ? error.message : fallback;
  console.error(fallback, error);
  return NextResponse.json({ error: message || fallback }, { status: 500 });
}
