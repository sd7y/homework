import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { getAuthContext, unauthorized } from '@/lib/server/auth';
import { computeStats } from '@/lib/server/stats';
import { streamAdvice, buildAdvicePrompt } from '@/lib/server/llm';

/**
 * AI 学习建议：基于用户错题统计数据，流式（SSE）输出 3-5 条可执行建议
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  let prompt: string;
  try {
    const stats = await computeStats(auth.client, auth.userId);
    prompt = buildAdvicePrompt(stats);
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
