import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, serverError } from '@/lib/server/auth';
import { computeStats } from '@/lib/server/stats';

/** 错题统计总览 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  try {
    const stats = await computeStats(auth.client, auth.userId);
    return NextResponse.json({ stats });
  } catch (error) {
    return serverError(error, '统计失败');
  }
}
