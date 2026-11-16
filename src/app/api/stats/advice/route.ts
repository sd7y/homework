import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { getAuthContext, unauthorized } from '@/lib/server/auth';
import { computeStats } from '@/lib/server/stats';
import { streamAdvice, buildAdvicePrompt } from '@/lib/server/llm';

/**
 * AI 学习建议：基于用户错题统计数据，流式（SSE）输出 3-5 条可执行建议
 * body（可选）：{ subject_id?: string } —— 传了则生成该科目的专项建议
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  let subjectId = '';
  try {
    const body = (await request.json()) as { subject_id?: string };
    subjectId = body.subject_id ?? '';
  } catch {
    // 无 body 时按全科目处理
  }

  let prompt: string;
  try {
    let subjectName: string | undefined;
    if (subjectId) {
      const { data: subjectRow } = await auth.client
        .from('subjects')
        .select('name')
        .eq('id', subjectId)
        .eq('user_id', auth.userId)
        .maybeSingle();
      if (!subjectRow) return NextResponse.json({ error: '科目不存在' }, { status: 404 });
      subjectName = subjectRow.name as string;
    }
    const stats = await computeStats(auth.client, auth.userId, subjectId || undefined);
    prompt = buildAdvicePrompt(stats, subjectName);
  } catch (error) {
    const message = error instanceof Error ? error.message : '统计失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const headers = HeaderUtils.extractForwardHeaders(request.headers);

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        const stream = await streamAdvice({ prompt, headers });
        for await (const chunk of stream) {
          if (chunk.content) {
            push({ content: chunk.content.toString() });
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        const message = error instanceof Error ? error.message : '生成学习建议失败';
        push({ error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
