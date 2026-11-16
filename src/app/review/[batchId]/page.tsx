'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CircleHelp,
  CircleSlash,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AuthGuard } from '@/components/auth-guard';
import { MathText } from '@/components/math-text';
import { apiFetch } from '@/lib/api';
import { JUDGEMENT_META } from '@/lib/constants';
import { cn } from '@/lib/utils';

type Judgement = 'correct' | 'wrong' | 'partial' | 'uncertain';

interface ReviewItem {
  id: string;
  question_index: number;
  question_text: string;
  student_answer: string;
  correct_answer: string;
  judgement: Judgement;
  analysis: string;
  knowledge_points: string[];
  error_type: string;
  confidence: number | null;
  status: string;
  source_image_url: string | null;
}

interface BatchInfo {
  id: string;
  subject: string;
  grade: string;
  status: string;
  error_message: string | null;
}

const JUDGEMENT_STYLES: Record<Judgement, { badge: string; icon: typeof Check }> = {
  correct: { badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', icon: Check },
  wrong: { badge: 'bg-rose-500/10 text-rose-600 border-rose-500/30', icon: X },
  partial: { badge: 'bg-amber-500/10 text-amber-600 border-amber-500/30', icon: CircleSlash },
  uncertain: { badge: 'bg-slate-500/10 text-slate-500 border-slate-500/30', icon: CircleHelp },
};

export default function ReviewPage() {
  return (
    <AuthGuard>
      <ReviewContent />
    </AuthGuard>
  );
}

function ReviewContent() {
  const params = useParams<{ batchId: string }>();
  const router = useRouter();
  const batchId = params.batchId;

  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [grading, setGrading] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [showAllCorrect, setShowAllCorrect] = useState(false);
  const [kpDrafts, setKpDrafts] = useState<Record<string, string>>({});
  const [errorTypeOptions, setErrorTypeOptions] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/batches/${batchId}`);
      const data = (await res.json()) as {
        batch?: BatchInfo;
        image_urls?: string[];
        items?: ReviewItem[];
        error_type_options?: string[];
        error?: string;
      };
      if (!res.ok || !data.batch) throw new Error(data.error ?? '加载失败');
      setBatch(data.batch);
      setImageUrls(data.image_urls ?? []);
      setItems((data.items ?? []).filter((it) => it.status === 'pending_review'));
      if (Array.isArray(data.error_type_options) && data.error_type_options.length > 0) {
        setErrorTypeOptions(data.error_type_options);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  async function retryGrade() {
    setGrading(true);
    try {
      const res = await apiFetch(`/api/batches/${batchId}/grade`, { method: 'POST' });
      const data = (await res.json()) as { question_count?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? '批改失败');
      toast.success(`批改完成，识别出 ${data.question_count ?? 0} 道题`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '批改失败');
      await load();
    } finally {
      setGrading(false);
    }
  }

  function patchItem(id: string, patch: Partial<ReviewItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function addKnowledgePoint(id: string) {
    const draft = (kpDrafts[id] ?? '').trim();
    if (!draft) return;
    const item = items.find((it) => it.id === id);
    if (!item) return;
    if (item.knowledge_points.includes(draft)) {
      toast.warning('该知识点已存在');
      return;
    }
    if (item.knowledge_points.length >= 5) {
      toast.warning('知识点最多 5 个');
      return;
    }
    patchItem(id, { knowledge_points: [...item.knowledge_points, draft] });
    setKpDrafts((prev) => ({ ...prev, [id]: '' }));
  }

  function removeKnowledgePoint(id: string, kp: string) {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    patchItem(id, { knowledge_points: item.knowledge_points.filter((k) => k !== kp) });
  }

  async function handleConfirm() {
    setConfirming(true);
    try {
      const res = await apiFetch(`/api/batches/${batchId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          items: items.map((it) => ({
            id: it.id,
            judgement: it.judgement,
            question_text: it.question_text,
            student_answer: it.student_answer,
            correct_answer: it.correct_answer,
            analysis: it.analysis,
            knowledge_points: it.knowledge_points,
            error_type: it.error_type,
          })),
        }),
      });
      const data = (await res.json()) as {
        confirmed_count?: number;
        correct_count?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '确认入库失败');

      if ((data.confirmed_count ?? 0) === 0) {
        setShowAllCorrect(true);
      } else {
        toast.success(`已将 ${data.confirmed_count} 道错题加入错题本`);
        router.push('/mistakes');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '确认入库失败');
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-destructive">{error ?? '批次不存在'}</p>
        <Button variant="outline" onClick={() => router.push('/')}>
          <ArrowLeft className="size-4" />
          返回首页
        </Button>
      </div>
    );
  }

  // 批改失败/未批改状态
  if (batch.status === 'failed' || batch.status === 'uploading' || items.length === 0) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <Sparkles className="size-10 text-primary" />
        <div className="space-y-1">
          <p className="font-medium">
            {batch.status === 'failed' ? 'AI 批改失败' : '尚未完成批改'}
          </p>
          {batch.error_message && (
            <p className="text-sm text-muted-foreground">{batch.error_message}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={retryGrade} disabled={grading}>
            {grading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {grading ? '批改中…' : '重新批改'}
          </Button>
          <Button variant="outline" onClick={() => router.push('/')}>
            返回首页
          </Button>
        </div>
      </div>
    );
  }

  const wrongCount = items.filter((it) => it.judgement !== 'correct').length;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-4">
      {/* 头部 */}
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="size-4" />
          首页
        </Button>
        <div className="text-right">
          <p className="text-sm font-medium">
            {batch.subject} · {batch.grade}
          </p>
          <p className="text-xs text-muted-foreground">
            共 {items.length} 题，{wrongCount} 道待入库
          </p>
        </div>
      </div>

      {/* 原图速览 */}
      {imageUrls.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {imageUrls.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setZoomImage(url)}
              className="h-20 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`原图 ${i + 1}`} className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* 题目卡片 */}
      <div className="space-y-4">
        {items.map((item) => {
          const meta = JUDGEMENT_STYLES[item.judgement];
          const JudgementIcon = meta.icon;
          return (
            <Card key={item.id} className="overflow-hidden">
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b bg-muted/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">第 {item.question_index} 题</span>
                  <Badge variant="outline" className={cn('gap-1', meta.badge)}>
                    <JudgementIcon className="size-3" />
                    {JUDGEMENT_META[item.judgement].label}
                  </Badge>
                </div>
                {item.source_image_url && (
                  <button
                    type="button"
                    onClick={() => setZoomImage(item.source_image_url)}
                    className="h-12 w-10 shrink-0 overflow-hidden rounded-md border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.source_image_url}
                      alt="题目原图"
                      className="size-full object-cover"
                    />
                  </button>
                )}
              </CardHeader>

              <CardContent className="space-y-4 px-4 py-4">
                {/* 改判 */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">判定（可改判）</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(Object.keys(JUDGEMENT_META) as Judgement[]).map((j) => (
                      <button
                        key={j}
                        type="button"
                        onClick={() => patchItem(item.id, { judgement: j })}
                        className={cn(
                          'h-9 rounded-lg border text-xs transition-all',
                          item.judgement === j
                            ? JUDGEMENT_STYLES[j].badge + ' font-medium'
                            : 'bg-card hover:bg-muted',
                        )}
                      >
                        {JUDGEMENT_META[j].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 题干 */}
                <EditableBlock
                  label="题干"
                  value={item.question_text}
                  onChange={(v) => patchItem(item.id, { question_text: v })}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <EditableBlock
                    label="学生作答"
                    value={item.student_answer}
                    onChange={(v) => patchItem(item.id, { student_answer: v })}
                  />
                  <EditableBlock
                    label="正确答案"
                    value={item.correct_answer}
                    onChange={(v) => patchItem(item.id, { correct_answer: v })}
                  />
                </div>

                {/* 解析 */}
                <EditableBlock
                  label="解析"
                  value={item.analysis}
                  onChange={(v) => patchItem(item.id, { analysis: v })}
                  rows={3}
                />

                {/* 错因 */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">错因类型</p>
                  <Select
                    value={item.error_type || '未分类'}
                    onValueChange={(v) => patchItem(item.id, { error_type: v === '未分类' ? '' : v })}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="未分类">未分类</SelectItem>
                      {errorTypeOptions.map((et) => (
                        <SelectItem key={et} value={et}>
                          {et}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 知识点 */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">知识点</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.knowledge_points.map((kp) => (
                      <Badge key={kp} variant="secondary" className="gap-1 pr-1">
                        {kp}
                        <button
                          type="button"
                          onClick={() => removeKnowledgePoint(item.id, kp)}
                          className="flex size-4 items-center justify-center rounded-full hover:bg-black/10"
                          aria-label={`删除知识点 ${kp}`}
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                    <div className="flex items-center gap-1">
                      <Input
                        value={kpDrafts[item.id] ?? ''}
                        onChange={(e) =>
                          setKpDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addKnowledgePoint(item.id);
                          }
                        }}
                        placeholder="添加"
                        className="h-8 w-24 text-xs"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="size-8"
                        onClick={() => addKnowledgePoint(item.id)}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 底部确认栏 */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <p className="flex-1 text-xs text-muted-foreground">
            判定为「对」的题目不会进入错题本
          </p>
          <Button onClick={handleConfirm} disabled={confirming} className="h-11 px-6">
            {confirming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <BadgeCheck className="size-4" />
            )}
            确认入库（{wrongCount}）
          </Button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>

      {/* 图片放大 */}
      <Dialog open={!!zoomImage} onOpenChange={(open) => !open && setZoomImage(null)}>
        <DialogContent className="max-w-3xl p-2">
          {zoomImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={zoomImage} alt="题目原图" className="max-h-[80svh] w-full object-contain" />
          )}
        </DialogContent>
      </Dialog>

      {/* 全部正确鼓励 */}
      <AlertDialog open={showAllCorrect} onOpenChange={setShowAllCorrect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本次全部正确</AlertDialogTitle>
            <AlertDialogDescription>
              太棒了！这次作业没有错题，说明相关知识点掌握得很扎实。继续保持，可以挑战更难的题目了！
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => router.push('/')}>继续上传</AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push('/mistakes')}>
              查看错题本
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** 可编辑文本块：展示态 KaTeX 渲染，点击切换到编辑态 */
function EditableBlock({
  label,
  value,
  onChange,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? '完成' : '编辑'}
        </Button>
      </div>
      {editing ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="text-sm"
        />
      ) : (
        <div
          className="min-h-9 cursor-text rounded-lg border bg-muted/30 px-3 py-2 text-sm"
          onClick={() => setEditing(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}
        >
          {value ? <MathText text={value} /> : <span className="text-muted-foreground">（空）</span>}
        </div>
      )}
    </div>
  );
}
