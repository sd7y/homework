import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, serverError, badRequest } from '@/lib/server/auth';
import { parseJudgeProfile } from '@/lib/server/subjects';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/subjects/[id]
 * 编辑科目。系统科目仅允许调整 judge_profile / icon / color（禁止改名）；
 * 自定义科目可改名称/图标/颜色/判分策略。改名会级联更新 mistakes/batches 的冗余名称。
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  let body: { name?: string; icon?: string; color?: string; judge_profile?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest('请求体不是合法 JSON');
  }

  try {
    const { data: subject, error: fetchError } = await auth.client
      .from('subjects')
      .select('*')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .single();
    if (fetchError || !subject) return NextResponse.json({ error: '科目不存在' }, { status: 404 });

    const updates: Record<string, unknown> = {};
    const newName = body.name?.trim();
    if (newName !== undefined && newName !== subject.name) {
      if (subject.is_system) return badRequest('系统科目不能修改名称');
      if (!newName) return badRequest('科目名称不能为空');
      if (newName.length > 20) return badRequest('科目名称不能超过 20 个字');
      // 重名检查
      const { data: dup } = await auth.client
        .from('subjects')
        .select('id')
        .eq('user_id', auth.userId)
        .eq('name', newName)
        .neq('id', id)
        .maybeSingle();
      if (dup) return badRequest(`科目「${newName}」已存在`);
      updates.name = newName;
    }
    if (body.icon !== undefined) updates.icon = body.icon.trim() || 'notebook-pen';
    if (body.color !== undefined) updates.color = body.color.trim() || '#0d9488';
    if (body.judge_profile !== undefined) updates.judge_profile = parseJudgeProfile(body.judge_profile);

    if (Object.keys(updates).length === 0) return badRequest('没有需要更新的字段');

    const { data, error } = await auth.client
      .from('subjects')
      .update(updates)
      .eq('id', id)
      .eq('user_id', auth.userId)
      .select()
      .single();
    if (error) throw new Error(`更新科目失败: ${error.message}`);

    // 级联更新冗余名称
    if (updates.name) {
      await auth.client.from('mistakes').update({ subject: updates.name }).eq('user_id', auth.userId).eq('subject_id', id);
      await auth.client.from('batches').update({ subject: updates.name }).eq('user_id', auth.userId).eq('subject_id', id);
    }

    return NextResponse.json({ subject: data });
  } catch (e) {
    return serverError(e, '更新科目失败');
  }
}

/**
 * DELETE /api/subjects/[id]?transfer_to=<subjectId>
 * 删除自定义科目。系统科目禁止删除。
 * 若科目下已有错题/批次：
 *   - 未传 transfer_to → 返回 409 + mistake_count，由前端二次确认并选择转移目标
 *   - 传了 transfer_to → 先把该科目的 mistakes/batches 转移到目标科目，再删除
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  const transferTo = req.nextUrl.searchParams.get('transfer_to');

  try {
    const { data: subject, error: fetchError } = await auth.client
      .from('subjects')
      .select('*')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .single();
    if (fetchError || !subject) return NextResponse.json({ error: '科目不存在' }, { status: 404 });
    if (subject.is_system) return badRequest('系统预置科目不能删除');

    const { count: mistakeCount, error: countError } = await auth.client
      .from('mistakes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', auth.userId)
      .eq('subject_id', id);
    if (countError) throw new Error(`统计科目错题失败: ${countError.message}`);

    if ((mistakeCount ?? 0) > 0 && !transferTo) {
      return NextResponse.json(
        { error: '该科目下已有错题，需要选择转移目标', mistake_count: mistakeCount, requires_transfer: true },
        { status: 409 },
      );
    }

    if (transferTo) {
      if (transferTo === id) return badRequest('不能转移到待删除的科目本身');
      const { data: target, error: targetError } = await auth.client
        .from('subjects')
        .select('id, name')
        .eq('id', transferTo)
        .eq('user_id', auth.userId)
        .single();
      if (targetError || !target) return badRequest('转移目标科目不存在');

      // 转移错题与批次（冗余名称同步更新）
      const { error: mError } = await auth.client
        .from('mistakes')
        .update({ subject_id: target.id, subject: target.name })
        .eq('user_id', auth.userId)
        .eq('subject_id', id);
      if (mError) throw new Error(`转移错题失败: ${mError.message}`);
      const { error: bError } = await auth.client
        .from('batches')
        .update({ subject_id: target.id, subject: target.name })
        .eq('user_id', auth.userId)
        .eq('subject_id', id);
      if (bError) throw new Error(`转移批次失败: ${bError.message}`);
    }

    const { error: delError } = await auth.client
      .from('subjects')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.userId);
    if (delError) throw new Error(`删除科目失败: ${delError.message}`);

    return NextResponse.json({ ok: true, transferred_count: transferTo ? (mistakeCount ?? 0) : 0 });
  } catch (e) {
    return serverError(e, '删除科目失败');
  }
}
