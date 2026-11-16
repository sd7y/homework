import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, serverError } from '@/lib/server/auth';
import { signImageKeys, signImageUrl } from '@/lib/server/storage';
import { parseJudgeProfile } from '@/lib/server/subjects';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** 批次详情：批次信息 + 全部题目（含签名图片 URL）+ 该科目的错因枚举（供人工改判选择） */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  try {
    const { id } = await context.params;

    const { data: batch, error: batchError } = await auth.client
      .from('batches')
      .select('id, subject, subject_id, grade, image_keys, status, error_message, created_at')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (batchError) throw new Error(`查询批次失败: ${batchError.message}`);
    if (!batch) {
      return NextResponse.json({ error: '批次不存在' }, { status: 404 });
    }

    const { data: items, error: itemsError } = await auth.client
      .from('mistakes')
      .select(
        'id, question_index, question_text, student_answer, correct_answer, judgement, analysis, knowledge_points, error_type, confidence, status, source_image_key, created_at',
      )
      .eq('batch_id', id)
      .eq('user_id', auth.userId)
      .order('question_index', { ascending: true });
    if (itemsError) throw new Error(`查询题目失败: ${itemsError.message}`);

    // 读取该科目判分策略中的错因枚举，用于人工修正时的下拉选项
    let errorTypes: string[] = [];
    if (batch.subject_id) {
      const { data: subjectRow } = await auth.client
        .from('subjects')
        .select('judge_profile')
        .eq('id', batch.subject_id as string)
        .eq('user_id', auth.userId)
        .maybeSingle();
      if (subjectRow?.judge_profile) {
        errorTypes = parseJudgeProfile(subjectRow.judge_profile).error_types;
      }
    }

    const imageKeys = (batch.image_keys ?? []) as string[];
    const imageUrls = await signImageKeys(imageKeys);

    const itemsWithUrls = await Promise.all(
      (items ?? []).map(async (item) => ({
        ...item,
        source_image_url: item.source_image_key
          ? await signImageUrl(item.source_image_key as string)
          : null,
      })),
    );

    return NextResponse.json({
      batch: {
        id: batch.id,
        subject: batch.subject,
        subject_id: batch.subject_id,
        grade: batch.grade,
        status: batch.status,
        error_message: batch.error_message,
        created_at: batch.created_at,
        image_count: imageKeys.length,
      },
      image_urls: imageUrls,
      error_type_options: errorTypes,
      items: itemsWithUrls,
    });
  } catch (error) {
    return serverError(error, '查询批次失败');
  }
}
