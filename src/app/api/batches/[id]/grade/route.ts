import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { getAuthContext, unauthorized, badRequest, serverError } from '@/lib/server/auth';
import { signImageKeys } from '@/lib/server/storage';
import { gradeImages } from '@/lib/server/llm';
import { parseJudgeProfile, DEFAULT_CUSTOM_PROFILE } from '@/lib/server/subjects';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** 触发 AI 批改：读取批次图片 → 按科目 judge_profile 构建判分提示词 → 多模态模型识别判题 → 写入 mistakes（pending_review） */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  try {
    const { id } = await context.params;

    const { data: batch, error: batchError } = await auth.client
      .from('batches')
      .select('id, user_id, subject, subject_id, grade, image_keys, status')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (batchError) throw new Error(`查询批次失败: ${batchError.message}`);
    if (!batch) return badRequest('批次不存在');

    const imageKeys = (batch.image_keys ?? []) as string[];
    if (imageKeys.length === 0) return badRequest('批次中没有图片');

    // 读取科目判分策略（科目被删等异常场景回退到默认策略）
    let profile = DEFAULT_CUSTOM_PROFILE;
    if (batch.subject_id) {
      const { data: subjectRow } = await auth.client
        .from('subjects')
        .select('judge_profile')
        .eq('id', batch.subject_id as string)
        .eq('user_id', auth.userId)
        .maybeSingle();
      if (subjectRow?.judge_profile) profile = parseJudgeProfile(subjectRow.judge_profile);
    }

    // 标记批改中
    const { error: markError } = await auth.client
      .from('batches')
      .update({ status: 'grading', error_message: null })
      .eq('id', id)
      .eq('user_id', auth.userId);
    if (markError) throw new Error(`更新批次状态失败: ${markError.message}`);

    try {
      // 生成签名 URL 供模型读取图片（1 小时有效）
      const imageUrls = await signImageKeys(imageKeys, 3600);

      const { questions, raw } = await gradeImages({
        imageUrls,
        subject: batch.subject as string,
        grade: batch.grade as string,
        profile,
        headers: HeaderUtils.extractForwardHeaders(request.headers),
      });

      // 清理旧的 pending_review 记录（支持失败重试）
      const { error: cleanError } = await auth.client
        .from('mistakes')
        .delete()
        .eq('batch_id', id)
        .eq('user_id', auth.userId)
        .eq('status', 'pending_review');
      if (cleanError) throw new Error(`清理旧批改结果失败: ${cleanError.message}`);

      const rows = questions.map((q) => ({
        user_id: auth.userId,
        batch_id: id,
        subject_id: (batch.subject_id as string | null) ?? null,
        subject: batch.subject as string,
        grade: batch.grade as string,
        source_image_key: imageKeys[q.image_index] ?? imageKeys[0] ?? null,
        question_index: q.index,
        question_text: q.question_text,
        student_answer: q.student_answer,
        correct_answer: q.correct_answer,
        judgement: q.judgement,
        analysis: q.analysis,
        knowledge_points: q.knowledge_points,
        error_type: q.error_type,
        confidence: q.confidence,
        status: 'pending_review',
      }));

      const { error: insertError } = await auth.client.from('mistakes').insert(rows);
      if (insertError) throw new Error(`写入批改结果失败: ${insertError.message}`);

      let parsedRaw: unknown = null;
      try {
        parsedRaw = JSON.parse(raw);
      } catch {
        parsedRaw = { text: raw.slice(0, 4000) };
      }

      const { error: doneError } = await auth.client
        .from('batches')
        .update({ status: 'done', raw_response: parsedRaw, error_message: null })
        .eq('id', id)
        .eq('user_id', auth.userId);
      if (doneError) throw new Error(`更新批次状态失败: ${doneError.message}`);

      return NextResponse.json({ ok: true, question_count: rows.length });
    } catch (gradingError) {
      const message = gradingError instanceof Error ? gradingError.message : 'AI 批改失败';
      await auth.client
        .from('batches')
        .update({ status: 'failed', error_message: message })
        .eq('id', id)
        .eq('user_id', auth.userId);
      throw gradingError;
    }
  } catch (error) {
    return serverError(error, 'AI 批改失败');
  }
}
