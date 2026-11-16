import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, badRequest, serverError } from '@/lib/server/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ConfirmItem {
  id: string;
  judgement?: string;
  question_text?: string;
  student_answer?: string;
  correct_answer?: string;
  analysis?: string;
  knowledge_points?: string[];
  error_type?: string;
}

const VALID_JUDGEMENTS = new Set(['correct', 'wrong', 'partial', 'uncertain']);

/**
 * 确认入库：应用人工修正 → judgement=correct 的题目移除 → 其余写入错题本（confirmed）
 * body: { items: ConfirmItem[] }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { items?: ConfirmItem[] };
    const items = Array.isArray(body.items) ? body.items : [];

    const { data: batch, error: batchError } = await auth.client
      .from('batches')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (batchError) throw new Error(`查询批次失败: ${batchError.message}`);
    if (!batch) return badRequest('批次不存在');

    // 当前批次的待确认题目
    const { data: pending, error: pendingError } = await auth.client
      .from('mistakes')
      .select('id, judgement')
      .eq('batch_id', id)
      .eq('user_id', auth.userId)
      .eq('status', 'pending_review');
    if (pendingError) throw new Error(`查询待确认题目失败: ${pendingError.message}`);

    const pendingIds = new Set((pending ?? []).map((p) => p.id as string));
    const itemMap = new Map(items.filter((it) => pendingIds.has(it.id)).map((it) => [it.id, it]));

    // 应用人工修正
    for (const [mistakeId, item] of itemMap) {
      const patch: Record<string, unknown> = {};
      if (item.judgement && VALID_JUDGEMENTS.has(item.judgement)) patch.judgement = item.judgement;
      if (typeof item.question_text === 'string') patch.question_text = item.question_text;
      if (typeof item.student_answer === 'string') patch.student_answer = item.student_answer;
      if (typeof item.correct_answer === 'string') patch.correct_answer = item.correct_answer;
      if (typeof item.analysis === 'string') patch.analysis = item.analysis;
      if (Array.isArray(item.knowledge_points)) {
        patch.knowledge_points = item.knowledge_points.map((k) => String(k)).filter(Boolean).slice(0, 5);
      }
      if (typeof item.error_type === 'string') patch.error_type = item.error_type;
      if (Object.keys(patch).length === 0) continue;
      patch.updated_at = new Date().toISOString();

      const { error: updateError } = await auth.client
        .from('mistakes')
        .update(patch)
        .eq('id', mistakeId)
        .eq('user_id', auth.userId);
      if (updateError) throw new Error(`保存修正失败: ${updateError.message}`);
    }

    // 删除判为正确的题目（不进入错题本）
    const { data: correctRows, error: correctQueryError } = await auth.client
      .from('mistakes')
      .select('id')
      .eq('batch_id', id)
      .eq('user_id', auth.userId)
      .eq('status', 'pending_review')
      .eq('judgement', 'correct');
    if (correctQueryError) throw new Error(`查询正确题目失败: ${correctQueryError.message}`);

    const correctIds = (correctRows ?? []).map((r) => r.id as string);
    if (correctIds.length > 0) {
      const { error: deleteError } = await auth.client
        .from('mistakes')
        .delete()
        .eq('user_id', auth.userId)
        .in('id', correctIds);
      if (deleteError) throw new Error(`移除正确题目失败: ${deleteError.message}`);
    }

    // 其余待确认题目写入错题本
    const { data: confirmedRows, error: confirmError } = await auth.client
      .from('mistakes')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('batch_id', id)
      .eq('user_id', auth.userId)
      .eq('status', 'pending_review')
      .select('id');
    if (confirmError) throw new Error(`确认入库失败: ${confirmError.message}`);

    return NextResponse.json({
      ok: true,
      confirmed_count: confirmedRows?.length ?? 0,
      correct_count: correctIds.length,
    });
  } catch (error) {
    return serverError(error, '确认入库失败');
  }
}
