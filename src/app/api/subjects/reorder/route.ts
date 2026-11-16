import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, serverError, badRequest } from '@/lib/server/auth';

/**
 * POST /api/subjects/reorder
 * 调整科目排序。body: { ordered_ids: string[] } —— 按数组顺序重排 sort_order（1..n）。
 * 仅重排当前用户自己的科目。
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  let body: { ordered_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return badRequest('请求体不是合法 JSON');
  }
  const orderedIds = body.ordered_ids;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0 || orderedIds.length > 200) {
    return badRequest('ordered_ids 必须是非空数组');
  }

  try {
    // 逐条更新（同用户科目数量有限，串行可接受）
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await auth.client
        .from('subjects')
        .update({ sort_order: i + 1 })
        .eq('id', orderedIds[i])
        .eq('user_id', auth.userId);
      if (error) throw new Error(`更新排序失败: ${error.message}`);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, '调整排序失败');
  }
}
