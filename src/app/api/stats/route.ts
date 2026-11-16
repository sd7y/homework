import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, serverError } from '@/lib/server/auth';
import { aggregateMistakes, computeSubjectComparison, fetchAllMistakes } from '@/lib/server/stats';
import { ensureUserSubjects } from '@/lib/server/subjects';

/**
 * 错题统计
 * - 无参数：全科目视图（scope=all，bySubject 为各科目对比，含错题数/掌握进度/练习正确率）
 * - ?subject_id=xxx：单科目详情（scope=subject，该科目的错因分布/知识点Top10/30天趋势）
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  try {
    const subjectId = request.nextUrl.searchParams.get('subject_id') ?? '';
    const subjects = await ensureUserSubjects(auth.client, auth.userId);

    if (subjectId) {
      const rows = await fetchAllMistakes(auth.client, auth.userId, subjectId);
      const meta = subjects.find((s) => s.id === subjectId) ?? null;
      return NextResponse.json({
        stats: {
          ...aggregateMistakes(rows),
          scope: 'subject',
          subject: meta
            ? { subject_id: meta.id, name: meta.name, icon: meta.icon, color: meta.color }
            : null,
          bySubject: [],
        },
      });
    }

    const rows = await fetchAllMistakes(auth.client, auth.userId);
    const stats = aggregateMistakes(rows);
    return NextResponse.json({
      stats: {
        ...stats,
        scope: 'all',
        subject: null,
        bySubject: computeSubjectComparison(rows, subjects),
      },
    });
  } catch (error) {
    return serverError(error, '统计失败');
  }
}
