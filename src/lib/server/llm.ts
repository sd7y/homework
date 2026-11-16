import { LLMClient, Config } from 'coze-coding-dev-sdk';
import type { StatsSummary } from '@/lib/server/stats';
import { DEFAULT_CUSTOM_PROFILE, type JudgeProfile } from '@/lib/server/subjects';

// 多模态主模型；不可用时回退到轻量多模态模型
export const GRADE_MODEL_PRIMARY = 'doubao-seed-2-0-pro-260215';
export const GRADE_MODEL_FALLBACK = 'doubao-seed-2-0-lite-260215';

export interface GradedQuestion {
  index: number;
  question_text: string;
  student_answer: string;
  correct_answer: string;
  judgement: 'correct' | 'wrong' | 'partial' | 'uncertain';
  analysis: string;
  knowledge_points: string[];
  error_type: string;
  confidence: number;
  // 记录该题出自第几张图（0-based），便于错题关联原图
  image_index: number;
}

export interface GradeResult {
  questions: GradedQuestion[];
}

const STRICTNESS_RULES: Record<JudgeProfile['strictness'], string> = {
  process:
    '判分重点在解题过程：逐步核对学生推导/作答过程，每一步都要检查。答案正确但过程有跳步、缺关键环节的，judgement 记为 partial 并在 analysis 中指出缺失步骤；过程正确但最终答案错误，judgement 记为 partial。',
  answer:
    '判分以最终答案为准：客观题答案完全正确即 correct，错误即 wrong；不要求学生展示完整过程。',
  points:
    '主观题按采分点覆盖度给分：先在心里列出该题的标准采分点，再核对学生命中了哪些。覆盖全部要点判 correct，部分覆盖判 partial，要点基本缺失判 wrong；analysis 中必须明确列出「答到的要点」与「漏掉的要点」。',
};

function buildGradingPrompt(
  subject: string,
  grade: string,
  imageCount: number,
  profile: JudgeProfile,
): string {
  const p = profile ?? DEFAULT_CUSTOM_PROFILE;
  const formulaRule =
    p.formula_format === 'latex'
      ? '题干、解析与答案中的公式、符号、方程式一律使用 LaTeX 表示，行内公式用 $...$ 包裹，独立公式用 $$...$$ 包裹。'
      : '题干、解析与答案一律使用纯文本表达（不使用 LaTeX 记号），分数线、根号等用自然语言或斜杠表示，确保直接阅读无障碍。';

  const subjectiveRule = p.has_subjective && p.subjective_rule ? `- 主观题规则：${p.subjective_rule}` : '';
  const extraRules = p.extra_rules ? `- 科目专属规则：${p.extra_rules}` : '';

  return `你是一位严谨的${grade}${subject}老师，正在批改学生的作业/试卷照片（共 ${imageCount} 张，按顺序给出）。

请仔细观察每一张图片，完成以下工作：
1. 识别图片中的每一道题目（一页可能有多题，按图片顺序连续编号）。
2. 识别每道题对应的学生手写作答内容。若某题未作答，student_answer 填空字符串，judgement 记为 wrong${p.error_types.includes('未作答') ? '，error_type 记为「未作答」' : ''}。
3. 结合${grade}${subject}的课程标准，判断学生作答是否正确。
4. 给出正确答案、解析、涉及的知识点、错误原因。

本科目判分策略（必须严格遵守）：
- ${STRICTNESS_RULES[p.strictness]}
${subjectiveRule}
${extraRules}

严格要求：
- 只输出一个 JSON 对象，禁止输出任何其他文字、解释或 Markdown 代码块标记。
- ${formulaRule}
- question_text 只保留题干本身，不要包含学生作答内容。
- analysis 为解析过程，步骤之间用换行分隔，语言简洁，适合${grade}学生理解。
- knowledge_points 为 1-3 个精炼的知识点标签（如「一元二次方程」「分数运算」），不要过长。
- error_type 只能从以下枚举中精确选择，禁止输出列表以外的任何值：${p.error_types.map((t) => `「${t}」`).join('、')}。学生答对（judgement=correct）时 error_type 填空字符串。
- judgement 只能取：correct（完全正确）、wrong（错误或未作答）、partial（部分正确/部分要点命中/作文类只评不判）、uncertain（图片模糊等无法确定）。
- confidence 为 0 到 1 之间的小数，表示你对该题识别与判定的把握。

输出 JSON 结构（questions 数组按题号排序）：
{
  "questions": [
    {
      "index": 1,
      "image_index": 0,
      "question_text": "题干",
      "student_answer": "识别出的学生作答",
      "correct_answer": "正确答案",
      "judgement": "correct|wrong|partial|uncertain",
      "analysis": "解析",
      "knowledge_points": ["知识点1"],
      "error_type": "错误类型（必须来自给定枚举）",
      "confidence": 0.95
    }
  ]
}`;
}

/** 从模型输出中稳健提取 JSON 对象 */
export function extractJsonObject<T>(raw: string): T {
  let text = raw.trim();
  // 去掉可能的 markdown 代码块
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型输出中未找到 JSON 内容');
  }
  return JSON.parse(text.slice(start, end + 1)) as T;
}

function normalizeJudgement(value: unknown): GradedQuestion['judgement'] {
  const v = String(value || '').toLowerCase();
  if (v === 'correct' || v === 'wrong' || v === 'partial' || v === 'uncertain') return v;
  return 'uncertain';
}

/**
 * 错因强约束：模型输出的 error_type 必须落在该科目的 error_types 枚举内。
 * 不在枚举内时：答对题置空；其余映射为枚举中最接近的一项，无法匹配则置空。
 */
function normalizeErrorType(raw: unknown, allowed: string[], judgement: string, studentAnswer: string): string {
  const value = String(raw ?? '').trim();
  if (judgement === 'correct') return '';
  if (allowed.includes(value)) return value;
  // 未作答兜底
  if (!studentAnswer.trim() && allowed.includes('未作答')) return '未作答';
  // 模糊匹配（包含关系）
  const fuzzy = allowed.find((t) => value && (value.includes(t) || t.includes(value)));
  if (fuzzy) return fuzzy;
  return '';
}

function normalizeQuestions(raw: unknown, imageCount: number, profile: JudgeProfile): GradedQuestion[] {
  const list = (raw as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) return [];
  const allowed = profile.error_types;
  return list.map((q, i) => {
    const item = (q ?? {}) as Record<string, unknown>;
    const imageIndex = Number(item.image_index);
    const judgement = normalizeJudgement(item.judgement);
    const studentAnswer = String(item.student_answer ?? '');
    return {
      index: Number.isFinite(Number(item.index)) ? Number(item.index) : i + 1,
      image_index:
        Number.isFinite(Number(item.image_index)) && Number(item.image_index) >= 0
          ? Math.min(Number(item.image_index), imageCount - 1)
          : 0,
      question_text: String(item.question_text ?? ''),
      student_answer: studentAnswer,
      correct_answer: String(item.correct_answer ?? ''),
      judgement,
      analysis: String(item.analysis ?? ''),
      knowledge_points: Array.isArray(item.knowledge_points)
        ? (item.knowledge_points as unknown[]).map((k) => String(k)).filter(Boolean).slice(0, 5)
        : [],
      error_type: normalizeErrorType(item.error_type, allowed, judgement, studentAnswer),
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0.5,
    };
  });
}

/**
 * 调用多模态大模型批改图片作业。
 * imageUrls：可直接访问的图片 URL（签名 URL）。
 * profile：该科目的判分策略（严格度/错因枚举/主观题规则等）。
 */
export async function gradeImages(params: {
  imageUrls: string[];
  subject: string;
  grade: string;
  profile: JudgeProfile;
  headers?: Record<string, string>;
}): Promise<{ questions: GradedQuestion[]; raw: string }> {
  const { imageUrls, subject, grade, profile, headers } = params;
  const client = new LLMClient(new Config({ timeout: 300000 }), headers);

  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail: 'high' | 'low' } }
  > = [{ type: 'text', text: buildGradingPrompt(subject, grade, imageUrls.length, profile) }];
  for (const url of imageUrls) {
    content.push({ type: 'image_url', image_url: { url, detail: 'high' } });
  }

  const messages = [{ role: 'user' as const, content }];

  let lastError: unknown = null;
  for (const model of [GRADE_MODEL_PRIMARY, GRADE_MODEL_FALLBACK]) {
    try {
      const response = await client.invoke(messages, {
        model,
        temperature: 0.1,
        thinking: 'disabled',
      });
      const raw = response.content ?? '';
      const parsed = extractJsonObject<GradeResult>(raw);
      const questions = normalizeQuestions(parsed, imageUrls.length, profile);
      if (questions.length === 0) {
        throw new Error('模型未识别出任何题目，请检查图片是否清晰完整');
      }
      return { questions, raw };
    } catch (error) {
      lastError = error;
      console.error(`[gradeImages] model ${model} failed:`, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI 批改失败，请稍后重试');
}

export interface PracticeVerdict {
  mistake_id: string;
  is_correct: boolean;
  feedback: string;
}

/** 练习模式：批量判定学生答案对错（纯文本模型即可） */
export async function judgePracticeAnswers(params: {
  items: Array<{
    mistake_id: string;
    question_text: string;
    correct_answer: string;
    user_answer: string;
    subject: string;
  }>;
  headers?: Record<string, string>;
}): Promise<PracticeVerdict[]> {
  const client = new LLMClient(new Config({ timeout: 120000 }), params.headers);

  const payload = params.items.map((it, i) => ({
    seq: i + 1,
    mistake_id: it.mistake_id,
    subject: it.subject,
    question_text: it.question_text,
    correct_answer: it.correct_answer,
    user_answer: it.user_answer,
  }));

  const prompt = `你是一位严格的老师。下面是若干道题目的标准答案与学生的新作答，请逐题判断学生这次是否答对。

判定规则：
- 数学/物理/化学等科目：数值或表达式与标准答案等价即算对（如 0.5 与 $1/2$ 等价），过程不作要求。
- 语文/英语等科目：意思相符、无明显错别字或语法错误即算对。
- 学生未作答或明显乱答，判错。

只输出一个 JSON 对象，禁止输出其他内容：
{
  "results": [
    { "seq": 1, "is_correct": true, "feedback": "一句话点评，说明对错原因" }
  ]
}

题目与作答：
${JSON.stringify(payload, null, 2)}`;

  const response = await client.invoke([{ role: 'user', content: prompt }], {
    model: GRADE_MODEL_PRIMARY,
    temperature: 0.1,
    thinking: 'disabled',
  });

  const parsed = extractJsonObject<{ results: Array<{ seq: number; is_correct: boolean; feedback: string }> }>(
    response.content ?? '',
  );
  const bySeq = new Map((parsed.results || []).map((r) => [Number(r.seq), r]));

  return params.items.map((it, i) => {
    const r = bySeq.get(i + 1);
    return {
      mistake_id: it.mistake_id,
      is_correct: r ? Boolean(r.is_correct) : false,
      feedback: r?.feedback ? String(r.feedback) : '',
    };
  });
}

/** 根据错题统计数据构造「阶段性学习建议」提示词；subjectName 存在时生成单科目建议 */
export function buildAdvicePrompt(stats: StatsSummary, subjectName?: string): string {
  const subjectLines = stats.bySubject.map((s) => `${s.subject} ${s.count} 题`).join('、') || '暂无';
  const kpLines =
    stats.topKnowledgePoints
      .slice(0, 10)
      .map((k) => `${k.name}（${k.count} 次）`)
      .join('、') || '暂无';
  const errorLines =
    stats.byErrorType
      .filter((e) => e.error_type)
      .map((e) => `${e.error_type} ${e.count} 次`)
      .join('、') || '暂无';

  const scopeDesc = subjectName ? `该学生在「${subjectName}」这一科的` : '该学生全部科目的';
  const subjectSection = subjectName ? '' : `\n- 科目分布：${subjectLines}`;

  return `你是一位经验丰富的学习规划师。下面是一位学生的错题本统计数据（${scopeDesc}数据），请据此输出 3-5 条具体、可执行的阶段性学习建议。

统计数据：
- 错题总数：${stats.total}（待复习 ${stats.confirmed}，已掌握 ${stats.mastered}，近 7 天新增 ${stats.weekNew}）${subjectSection}
- 高频错误知识点 Top10：${kpLines}
- 错因分布：${errorLines}

要求：
- 每条建议必须针对上面出现的具体${subjectName ? '知识点或错因' : '科目、知识点或错因'}，写明「做什么、怎么做、做到什么程度」。
- 禁止空话套话（如"努力学习""查漏补缺"这类没有针对性的表述）。
- 用简体中文输出，每条一个小标题加两行以内的说明，使用 Markdown 列表格式。
- 总长度控制在 400 字以内。`;
}

/** 流式生成学习建议，返回 SDK 的 AsyncGenerator */
export function streamAdvice(params: { prompt: string; headers?: Record<string, string> }) {
  const client = new LLMClient(new Config({ timeout: 180000 }), params.headers);
  return client.stream([{ role: 'user' as const, content: params.prompt }], {
    model: GRADE_MODEL_PRIMARY,
    temperature: 0.4,
    thinking: 'disabled',
  });
}
