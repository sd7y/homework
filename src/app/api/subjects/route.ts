import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, serverError, badRequest } from '@/lib/server/auth';
import { ensureUserSubjects, parseJudgeProfile, DEFAULT_CUSTOM_PROFILE } from '@/lib/server/subjects';

/**
 * GET /api/subjects
 * 返回当前用户的科目列表（首次访问懒播种 9 个系统科目），
 * 附带每个科目的错题数（status in confirmed/mastered）用于 Tab 角标与管理页展示。
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  try {
    const subjects = await ensureUserSubjects(auth.client, auth.userId);

    // 每个科目的错题数（confirmed + mastered）
    const { data: rows, error } = await auth.client
      .from('mistakes')
      .select('subject_id')
      .eq('user_id', auth.userId)
      .in('status', ['confirmed', 'mastered'])
      .limit(10000);
    if (error) throw new Error(`统计科目错题数失败: ${error.message}`);

    const countMap = new Map<string, number>();
    for (const r of rows ?? []) {
      const sid = (r as { subject_id: string | null }).subject_id;
      if (sid) countMap.set(sid, (countMap.get(sid) ?? 0) + 1);
    }

    return NextResponse.json({
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        color: s.color,
        judge_profile: s.judge_profile,
        sort_order: s.sort_order,
        is_system: s.is_system,
        mistake_count: countMap.get(s.id) ?? 0,
      })),
    });
  } catch (e) {
    return serverError(e, '获取科目列表失败');
  }
}

/**
 * POST /api/subjects
 * 新增自定义科目。body: { name, icon?, color?, judge_profile? }
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  let body: { name?: string; icon?: string; color?: string; judge_profile?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest('请求体不是合法 JSON');
  }

  const name = (body.name ?? '').trim();
  if (!name) return badRequest('科目名称不能为空');
  if (name.length > 20) return badRequest('科目名称不能超过 20 个字');

  try {
    // 保证系统科目已播种（否则 sort_order 会冲突）
    const existing = await ensureUserSubjects(auth.client, auth.userId);
    if (existing.some((s) => s.name === name)) {
      return NextResponse.json({ error: `科目「${name}」已存在` }, { status: 409 });
    }

    const maxSort = existing.reduce((m, s) => Math.max(m, s.sort_order), 0);
    const profile = body.judge_profile ? parseJudgeProfile(body.judge_profile) : DEFAULT_CUSTOM_PROFILE;

    const { data, error } = await auth.client
      .from('subjects')
      .insert({
        user_id: auth.userId,
        name,
        icon: (body.icon ?? 'notebook-pen').trim() || 'notebook-pen',
        color: (body.color ?? '#0d9488').trim() || '#0d9488',
        judge_profile: profile,
        sort_order: maxSort + 1,
        is_system: false,
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        return NextResponse.json({ error: `科目「${name}」已存在` }, { status: 409 });
      }
      throw new Error(`创建科目失败: ${error.message}`);
    }
    return NextResponse.json({ subject: data });
  } catch (e) {
    return serverError(e, '创建科目失败');
  }
}
