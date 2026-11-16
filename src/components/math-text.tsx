'use client';

import { useMemo } from 'react';
import katex from 'katex';
import { cn } from '@/lib/utils';

interface MathTextProps {
  text: string;
  className?: string;
}

interface Segment {
  type: 'text' | 'inline' | 'block';
  content: string;
}

/** 将文本按 $...$ / $$...$$ 切分为普通文本与公式片段 */
function splitSegments(input: string): Segment[] {
  const segments: Segment[] = [];
  let rest = input;
  while (rest.length > 0) {
    const blockIdx = rest.indexOf('$$');
    const inlineIdx = rest.indexOf('$');
    if (inlineIdx === -1) {
      segments.push({ type: 'text', content: rest });
      break;
    }
    const isBlock = blockIdx !== -1 && blockIdx === inlineIdx;
    const marker = isBlock ? '$$' : '$';
    if (inlineIdx > 0) {
      segments.push({ type: 'text', content: rest.slice(0, inlineIdx) });
    }
    const after = rest.slice(inlineIdx + marker.length);
    const closeIdx = after.indexOf(marker);
    if (closeIdx === -1) {
      // 未闭合，按普通文本处理
      segments.push({ type: 'text', content: rest.slice(inlineIdx) });
      break;
    }
    segments.push({
      type: isBlock ? 'block' : 'inline',
      content: after.slice(0, closeIdx),
    });
    rest = after.slice(closeIdx + marker.length);
  }
  return segments;
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return tex;
  }
}

/** 混合渲染普通文本与 LaTeX 公式（$..$ 行内，$$..$$ 块级），支持换行 */
export function MathText({ text, className }: MathTextProps) {
  const segments = useMemo(() => splitSegments(text ?? ''), [text]);

  return (
    <span className={cn('katex-wrap leading-relaxed', className)}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return (
            <span key={i} className="whitespace-pre-wrap">
              {seg.content}
            </span>
          );
        }
        const html = renderMath(seg.content, seg.type === 'block');
        if (seg.type === 'block') {
          return (
            <span
              key={i}
              className="my-1 block overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}
