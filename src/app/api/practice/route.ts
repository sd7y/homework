import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, badRequest, serverError } from '@/lib/server/auth';

const ALLOWED_COUNTS = new Set([5, 10]);

/**
 * 生成练习：按科目/知识点从错题本随机抽题（不返回答案与解析）
 * body: { subject?, knowledge_point?, count }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  try {
    const body = (await request.json()) as {
      subject?: string;
      knowledge_point?: string;
      count?: number;
    };
    const count = ALLOWED_COUNTS.has(Number(body.count)) ? Number(body.count) : 5;

    let query = auth.client
      .from('mistakes')
      .select('id, subject, grade, question_text, knowledge_points, error_type, status')
      .eq('user_id', auth.userId)
      .in('status', ['confirmed', 'mastered'])
      .order('created_at', { ascending: false })
      .limit(200);

    if (body.subject) query = query.eq('subject', body.subject);
    if (body.knowledge_point) query = query.contains('knowledge_points', [body.knowledge_point]);

    const { data, error } = await query;
    if (error) throw new Error(`抽取题目失败: ${error.message}`);
    if (!data || data.length === 0) {
      return badRequest('没有符合条件的错题，先去上传批改一些题目吧');
    }

    // 待复习优先：confirmed 排前面参与抽题，然后整体随机
    const confirmed = data.filter((d) => d.status === 'confirmed');
    const mastered = data.filter((d) => d.status === 'mastered');
    const picked = [...shuffle(confirmed), ...shuffle(mastered)].slice(0, count);

    return NextResponse.json({
      questions: picked.map((q) => ({
        id: q.id,
        subject: q.subject,
        grade: q.grade,
        question_text: q.question_text,
        knowledge_points: q.knowledge_points ?? [],
      })),
    });
  } catch (error) {
    return serverError(error, '生成练习失败');
  }
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
