import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, badRequest, serverError } from '@/lib/server/auth';
import { signImageUrl } from '@/lib/server/storage';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** 错题详情（含签名原图 URL） */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  try {
    const { id } = await context.params;
    const { data, error } = await auth.client
      .from('mistakes')
      .select(
        'id, subject, grade, question_text, student_answer, correct_answer, judgement, analysis, knowledge_points, error_type, confidence, status, source_image_key, practice_count, practice_correct_count, created_at, batch_id',
      )
      .eq('id', id)
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (error) throw new Error(`查询错题失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: '错题不存在' }, { status: 404 });

    return NextResponse.json({
      item: {
        ...data,
        source_image_url: data.source_image_key
          ? await signImageUrl(data.source_image_key as string)
          : null,
      },
    });
  } catch (error) {
    return serverError(error, '查询错题失败');
  }
}

/** 更新错题：标记已掌握/恢复待复习、编辑内容 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if (body.status === 'mastered' || body.status === 'confirmed') patch.status = body.status;
    if (typeof body.question_text === 'string') patch.question_text = body.question_text;
    if (typeof body.correct_answer === 'string') patch.correct_answer = body.correct_answer;
    if (typeof body.analysis === 'string') patch.analysis = body.analysis;
    if (Array.isArray(body.knowledge_points)) {
      patch.knowledge_points = (body.knowledge_points as unknown[])
        .map((k) => String(k))
        .filter(Boolean)
        .slice(0, 5);
    }
    if (typeof body.error_type === 'string') patch.error_type = body.error_type;

    if (Object.keys(patch).length === 0) return badRequest('没有可更新的字段');
    patch.updated_at = new Date().toISOString();

    const { data, error } = await auth.client
      .from('mistakes')
      .update(patch)
      .eq('id', id)
      .eq('user_id', auth.userId)
      .select('id, status')
      .maybeSingle();
    if (error) throw new Error(`更新错题失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: '错题不存在' }, { status: 404 });

    return NextResponse.json({ ok: true, item: data });
  } catch (error) {
    return serverError(error, '更新错题失败');
  }
}

/** 删除错题 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  try {
    const { id } = await context.params;
    const { data, error } = await auth.client
      .from('mistakes')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.userId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`删除错题失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: '错题不存在' }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, '删除错题失败');
  }
}
