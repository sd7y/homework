'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  Loader2,
  Play,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AuthGuard } from '@/components/auth-guard';
import { AppShell } from '@/components/app-shell';
import { MathText } from '@/components/math-text';
import { apiFetch } from '@/lib/api';
import { SUBJECTS } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface PracticeQuestion {
  id: string;
  subject: string;
  grade: string | null;
  question_text: string;
  knowledge_points: string[];
}

interface PracticeResult {
  mistake_id: string;
  user_answer: string;
  is_correct: boolean;
  feedback: string;
  question_text: string;
  correct_answer: string;
  analysis: string;
  knowledge_points: string[];
}

type Phase = 'setup' | 'answering' | 'result';

const QUICK_OPTIONS = ['A', 'B', 'C', 'D'];

export default function PracticePage() {
  return (
    <AuthGuard>
      <AppShell>
        <Practice />
      </AppShell>
    </AuthGuard>
  );
}

function Practice() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('setup');
  const [subject, setSubject] = useState('');
  const [knowledgePoint, setKnowledgePoint] = useState('');
  const [count, setCount] = useState<5 | 10>(5);
  const [knowledgePoints, setKnowledgePoints] = useState<string[]>([]);

  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [results, setResults] = useState<PracticeResult[]>([]);
  const [correctCount, setCorrectCount] = useState(0);

  // 加载知识点 facet
  useEffect(() => {
    apiFetch('/api/mistakes?page_size=1')
      .then(async (res) => {
        const data = (await res.json()) as {
          facets?: { knowledge_points: string[] };
        };
        setKnowledgePoints(data.facets?.knowledge_points ?? []);
      })
      .catch(() => {});
  }, []);

  async function startPractice() {
    setStarting(true);
    try {
      const res = await apiFetch('/api/practice', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject || undefined,
          knowledge_point: knowledgePoint || undefined,
          count,
        }),
      });
      const data = (await res.json()) as { questions?: PracticeQuestion[]; error?: string };
      if (!res.ok || !data.questions) throw new Error(data.error ?? '生成练习失败');
      if (data.questions.length === 0) throw new Error('没有符合条件的错题');
      setQuestions(data.questions);
      setAnswers({});
      setCurrentIndex(0);
      setPhase('answering');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成练习失败');
    } finally {
      setStarting(false);
    }
  }

  async function submitPractice() {
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/practice/submit', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject || undefined,
          items: questions.map((q) => ({
            mistake_id: q.id,
            user_answer: (answers[q.id] ?? '').trim(),
          })),
        }),
      });
      const data = (await res.json()) as {
        correct_count?: number;
        results?: PracticeResult[];
        error?: string;
      };
      if (!res.ok || !data.results) throw new Error(data.error ?? '提交失败');
      setResults(data.results);
      setCorrectCount(data.correct_count ?? 0);
      setPhase('result');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------- 设置阶段 ---------- */
  if (phase === 'setup') {
    return (
      <div className="mx-auto max-w-md space-y-5">
        <div className="space-y-1">
          <h1 className="text-lg font-bold">错题重练</h1>
          <p className="text-sm text-muted-foreground">
            从错题本抽题重做，答对才算真正掌握
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">科目（可选）</p>
              <Select
                value={subject || '__all__'}
                onValueChange={(v) => setSubject(v === '__all__' ? '' : v)}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部科目</SelectItem>
                  {SUBJECTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">知识点（可选）</p>
              <Select
                value={knowledgePoint || '__all__'}
                onValueChange={(v) => setKnowledgePoint(v === '__all__' ? '' : v)}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部知识点</SelectItem>
                  {knowledgePoints.map((kp) => (
                    <SelectItem key={kp} value={kp}>
                      {kp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">题目数量</p>
              <div className="grid grid-cols-2 gap-2">
                {([5, 10] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    className={cn(
                      'h-11 rounded-xl border text-sm font-medium transition-all',
                      count === n
                        ? 'border-primary bg-primary text-primary-foreground shadow'
                        : 'bg-card hover:border-primary/50',
                    )}
                  >
                    {n} 题
                  </button>
                ))}
              </div>
            </div>

            <Button
              size="lg"
              className="h-12 w-full text-base"
              onClick={startPractice}
              disabled={starting}
            >
              {starting ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}
              开始练习
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---------- 作答阶段 ---------- */
  if (phase === 'answering') {
    const question = questions[currentIndex];
    const currentAnswer = answers[question.id] ?? '';
    const answeredCount = questions.filter((q) => (answers[q.id] ?? '').trim()).length;

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setPhase('setup')}>
            <ChevronLeft className="size-5" />
          </Button>
          <div className="flex-1">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>
                第 {currentIndex + 1} / {questions.length} 题
              </span>
              <span>已作答 {answeredCount}</span>
            </div>
            <Progress value={((currentIndex + 1) / questions.length) * 100} className="h-1.5" />
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-2 border-b px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{question.subject}</Badge>
              {question.knowledge_points.map((kp) => (
                <span
                  key={kp}
                  className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground"
                >
                  {kp}
                </span>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4">
            <div className="text-[15px] leading-relaxed">
              <MathText text={question.question_text} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">你的答案</p>
              <div className="flex gap-2">
                {QUICK_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: opt }))}
                    className={cn(
                      'size-11 rounded-xl border text-sm font-medium transition-all',
                      currentAnswer === opt
                        ? 'border-primary bg-primary text-primary-foreground shadow'
                        : 'bg-card hover:border-primary/50',
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <Input
                value={currentAnswer}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))
                }
                placeholder="或直接输入答案…"
                className="h-11"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-11 flex-1"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          >
            <ArrowLeft className="size-4" />
            上一题
          </Button>
          {currentIndex < questions.length - 1 ? (
            <Button
              className="h-11 flex-1"
              onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
            >
              下一题
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button className="h-11 flex-1" onClick={submitPractice} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  AI 判分中…
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  提交答案
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }

  /* ---------- 结果阶段 ---------- */
  const total = results.length;
  const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary to-teal-500 px-5 py-6 text-center text-primary-foreground">
          <p className="text-4xl font-bold tabular-nums">
            {correctCount}
            <span className="text-lg font-normal opacity-80"> / {total}</span>
          </p>
          <p className="mt-1 text-sm opacity-90">
            正确率 {pct}% · {pct >= 80 ? '很棒，继续保持！' : pct >= 60 ? '有进步，再巩固一下' : '别灰心，看解析再来一组'}
          </p>
        </div>
      </Card>

      <div className="space-y-3">
        {results.map((r, i) => (
          <Card key={r.mistake_id}>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b px-4 py-3">
              <span className="text-sm font-semibold">第 {i + 1} 题</span>
              <Badge
                className={cn(
                  r.is_correct
                    ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10'
                    : 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/10',
                )}
              >
                {r.is_correct ? <Check className="size-3" /> : <X className="size-3" />}
                {r.is_correct ? '答对了' : '答错了'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 px-4 py-3.5 text-sm">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">题目</p>
                <MathText text={r.question_text} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">你的答案</p>
                  <p className={cn('rounded-lg border px-3 py-2', r.is_correct ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5')}>
                    {r.user_answer || '（未作答）'}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">正确答案</p>
                  <div className="rounded-lg border px-3 py-2">
                    <MathText text={r.correct_answer} />
                  </div>
                </div>
              </div>
              {r.feedback && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">判分说明</p>
                  <p className="rounded-lg bg-muted/50 px-3 py-2">{r.feedback}</p>
                </div>
              )}
              {r.analysis && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">解析</p>
                  <div className="rounded-lg bg-muted/50 px-3 py-2">
                    <MathText text={r.analysis} />
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-fit text-xs text-muted-foreground"
                onClick={() => router.push(`/mistakes/${r.mistake_id}`)}
              >
                查看完整错题
                <ArrowRight className="size-3" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="h-11 flex-1"
          onClick={() => {
            setPhase('setup');
            setResults([]);
          }}
        >
          <RefreshCw className="size-4" />
          再练一组
        </Button>
        <Button className="h-11 flex-1" onClick={() => router.push('/mistakes')}>
          回到错题本
        </Button>
      </div>
    </div>
  );
}
