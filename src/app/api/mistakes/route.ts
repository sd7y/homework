import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, serverError } from '@/lib/server/auth';
import { signImageUrl } from '@/lib/server/storage';

const PAGE_SIZE_MAX = 50;

/**
 * 错题本列表：支持科目 / 状态 / 知识点 / 错因 / 时间范围 / 题干搜索 + 分页
 * 同时返回 facets（当前用户出现过的知识点与错因），用于筛选项
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  try {
    const sp = request.nextUrl.searchParams;
    const subject = sp.get('subject') ?? '';
    const status = sp.get('status') ?? '';
    const knowledgePoint = sp.get('knowledge_point') ?? '';
    const errorType = sp.get('error_type') ?? '';
    const q = (sp.get('q') ?? '').trim();
    const days = Number(sp.get('days') ?? '0');
    const page = Math.max(1, Number(sp.get('page') ?? '1'));
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(sp.get('page_size') ?? '10')));

    let query = auth.client
      .from('mistakes')
      .select(
        'id, subject, grade, question_text, knowledge_points, error_type, judgement, status, source_image_key, created_at',
        { count: 'exact' },
      )
      .eq('user_id', auth.userId)
      .in('status', ['confirmed', 'mastered'])
      .order('created_at', { ascending: false });

    if (subject) query = query.eq('subject', subject);
    if (status === 'confirmed' || status === 'mastered') query = query.eq('status', status);
    if (knowledgePoint) query = query.contains('knowledge_points', [knowledgePoint]);
    if (errorType) query = query.eq('error_type', errorType);
    if (q) {
      const escaped = q.replace(/[%_\\]/g, (m) => `\\${m}`);
      query = query.ilike('question_text', `%${escaped}%`);
    }
    if (days > 0) {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      query = query.gte('created_at', since);
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`查询错题失败: ${error.message}`);

    // facets：用户的知识点与错因全集（轻量列查询）
    const { data: facetRows, error: facetError } = await auth.client
      .from('mistakes')
      .select('knowledge_points, error_type')
      .eq('user_id', auth.userId)
      .in('status', ['confirmed', 'mastered'])
      .limit(2000);
    if (facetError) throw new Error(`查询筛选项失败: ${facetError.message}`);

    const kpSet = new Set<string>();
    const etSet = new Set<string>();
    for (const row of facetRows ?? []) {
      for (const kp of (row.knowledge_points as string[] | null) ?? []) {
        if (kp) kpSet.add(kp);
      }
      if (row.error_type) etSet.add(row.error_type as string);
    }

    const items = await Promise.all(
      (data ?? []).map(async (item) => ({
        ...item,
        source_image_url: item.source_image_key
          ? await signImageUrl(item.source_image_key as string)
          : null,
        source_image_key: undefined,
      })),
    );

    return NextResponse.json({
      items,
      total: count ?? 0,
      page,
      page_size: pageSize,
      facets: {
        knowledge_points: [...kpSet].sort(),
        error_types: [...etSet].sort(),
      },
    });
  } catch (error) {
    return serverError(error, '查询错题失败');
  }
}
