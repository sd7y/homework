import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { getAuthContext, unauthorized, badRequest, serverError } from '@/lib/server/auth';
import { judgePracticeAnswers } from '@/lib/server/llm';

interface SubmitItem {
  mistake_id: string;
  user_answer: string;
}

/**
 * 提交练习答案：LLM 对照判分 → 写入 practice_sessions → 更新错题练习计数
 * body: { subject?, items: [{ mistake_id, user_answer }] }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  try {
    const body = (await request.json()) as { subject?: string; items?: SubmitItem[] };
    const items = (body.items ?? []).filter((it) => it && typeof it.mistake_id === 'string');
    if (items.length === 0) return badRequest('没有可提交的答案');

    const ids = items.map((it) => it.mistake_id);
    const { data: mistakes, error } = await auth.client
      .from('mistakes')
      .select('id, subject, question_text, correct_answer, analysis, knowledge_points, practice_count, practice_correct_count')
      .eq('user_id', auth.userId)
      .in('id', ids);
    if (error) throw new Error(`查询错题失败: ${error.message}`);
    if (!mistakes || mistakes.length === 0) return badRequest('错题不存在');

    const mistakeMap = new Map(mistakes.map((m) => [m.id as string, m]));

    // 判分输入（保持提交顺序，过滤掉不存在的题目）
    const judgeInputs = items
      .filter((it) => mistakeMap.has(it.mistake_id))
      .map((it) => {
        const m = mistakeMap.get(it.mistake_id)!;
        return {
          mistake_id: it.mistake_id,
          question_text: (m.question_text as string) ?? '',
          correct_answer: (m.correct_answer as string) ?? '',
          user_answer: String(it.user_answer ?? ''),
          subject: (m.subject as string) ?? '',
        };
      });

    const judgements = await judgePracticeAnswers({
      items: judgeInputs,
      headers: HeaderUtils.extractForwardHeaders(request.headers),
    });
    const judgementMap = new Map(judgements.map((j) => [j.mistake_id, j]));

    const results = judgeInputs.map((input) => {
      const m = mistakeMap.get(input.mistake_id)!;
      const j = judgementMap.get(input.mistake_id);
      return {
        mistake_id: input.mistake_id,
        user_answer: input.user_answer,
        is_correct: j?.is_correct ?? false,
        feedback: j?.feedback ?? '',
        question_text: (m.question_text as string) ?? '',
        correct_answer: (m.correct_answer as string) ?? '',
        analysis: (m.analysis as string) ?? '',
        knowledge_points: (m.knowledge_points as string[] | null) ?? [],
      };
    });

    const correctCount = results.filter((r) => r.is_correct).length;

    // 写入练习记录
    const { error: insertError } = await auth.client.from('practice_sessions').insert({
      user_id: auth.userId,
      subject: body.subject || null,
      mistake_ids: results.map((r) => r.mistake_id),
      correct_count: correctCount,
      total: results.length,
      detail: results.map((r) => ({
        mistake_id: r.mistake_id,
        user_answer: r.user_answer,
        is_correct: r.is_correct,
      })),
    });
    if (insertError) throw new Error(`保存练习记录失败: ${insertError.message}`);

    // 更新错题练习计数
    for (const r of results) {
      const m = mistakeMap.get(r.mistake_id)!;
      const { error: updateError } = await auth.client
        .from('mistakes')
        .update({
          practice_count: ((m.practice_count as number) ?? 0) + 1,
          practice_correct_count: ((m.practice_correct_count as number) ?? 0) + (r.is_correct ? 1 : 0),
          updated_at: new Date().toISOString(),
        })
        .eq('id', r.mistake_id)
        .eq('user_id', auth.userId);
      if (updateError) throw new Error(`更新练习计数失败: ${updateError.message}`);
    }

    return NextResponse.json({
      correct_count: correctCount,
      total: results.length,
      results,
    });
  } catch (error) {
    return serverError(error, '提交练习失败');
  }
}
