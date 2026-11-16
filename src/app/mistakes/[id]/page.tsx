'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Loader2,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AuthGuard } from '@/components/auth-guard';
import { MathText } from '@/components/math-text';
import { apiFetch } from '@/lib/api';
import { JUDGEMENT_META } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface MistakeDetail {
  id: string;
  subject: string;
  grade: string | null;
  question_text: string;
  student_answer: string;
  correct_answer: string;
  judgement: string;
  analysis: string;
  knowledge_points: string[];
  error_type: string;
  status: string;
  source_image_url: string | null;
  practice_count: number;
  practice_correct_count: number;
  created_at: string;
}

export default function MistakeDetailPage() {
  return (
    <AuthGuard>
      <Detail />
    </AuthGuard>
  );
}

function Detail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [item, setItem] = useState<MistakeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/mistakes/${id}`);
      const data = (await res.json()) as { item?: MistakeDetail; error?: string };
      if (!res.ok || !data.item) throw new Error(data.error ?? '加载失败');
      setItem(data.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleMastered() {
    if (!item) return;
    setActing(true);
    try {
      const next = item.status === 'mastered' ? 'confirmed' : 'mastered';
      const res = await apiFetch(`/api/mistakes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? '操作失败');
      toast.success(next === 'mastered' ? '已标记为掌握' : '已恢复为待复习');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setActing(false);
    }
  }

  async function handleDelete() {
    setActing(true);
    try {
      const res = await apiFetch(`/api/mistakes/${id}`, { method: 'DELETE' });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? '删除失败');
      toast.success('已删除');
      router.replace('/mistakes');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-destructive">{error ?? '错题不存在'}</p>
        <Button variant="outline" onClick={() => router.push('/mistakes')}>
          <ArrowLeft className="size-4" />
          返回错题本
        </Button>
      </div>
    );
  }

  const judgement = JUDGEMENT_META[item.judgement as keyof typeof JUDGEMENT_META];

  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
          返回
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{item.subject}</Badge>
          {item.grade && <Badge variant="outline">{item.grade}</Badge>}
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-2 border-b px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={cn(
                item.status === 'mastered'
                  ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10'
                  : 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/10',
              )}
            >
              {item.status === 'mastered' ? '已掌握' : '待复习'}
            </Badge>
            {judgement && (
              <Badge variant="outline">{judgement.label}</Badge>
            )}
            {item.error_type && (
              <span className="text-xs text-muted-foreground">错因：{item.error_type}</span>
            )}
          </div>
          {item.knowledge_points.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.knowledge_points.map((kp) => (
                <span
                  key={kp}
                  className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground"
                >
                  {kp}
                </span>
              ))}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-5 px-4 py-4">
          {item.source_image_url && (
            <section className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">题目原图（点击放大）</p>
              <button
                type="button"
                onClick={() => setZoomImage(item.source_image_url)}
                className="block max-h-56 overflow-hidden rounded-xl border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.source_image_url}
                  alt="题目原图"
                  className="max-h-56 w-auto object-contain"
                />
              </button>
            </section>
          )}

          <Section title="题干">
            <MathText text={item.question_text} />
          </Section>

          <div className="grid gap-5 sm:grid-cols-2">
            <Section title="你的作答">
              {item.student_answer ? (
                <MathText text={item.student_answer} />
              ) : (
                <span className="text-muted-foreground">（未作答）</span>
              )}
            </Section>
            <Section title="正确答案">
              <MathText text={item.correct_answer} />
            </Section>
          </div>

          <Section title="解析">
            <MathText text={item.analysis} />
          </Section>

          <p className="text-xs text-muted-foreground">
            收录于 {new Date(item.created_at).toLocaleDateString('zh-CN')}
            {item.practice_count > 0 &&
              ` · 练习 ${item.practice_count} 次，答对 ${item.practice_correct_count} 次`}
          </p>
        </CardContent>
      </Card>

      {/* 底部操作栏 */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-2 px-4 py-3">
          <Button
            variant={item.status === 'mastered' ? 'outline' : 'default'}
            className="h-11 flex-1"
            onClick={toggleMastered}
            disabled={acting}
          >
            {item.status === 'mastered' ? (
              <>
                <RotateCcw className="size-4" />
                恢复待复习
              </>
            ) : (
              <>
                <BadgeCheck className="size-4" />
                标记已掌握
              </>
            )}
          </Button>
          <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="h-11 text-destructive" disabled={acting}>
                {acting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                删除
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>删除这道错题？</AlertDialogTitle>
                <AlertDialogDescription>
                  删除后不可恢复，该题将不再出现在错题本与统计中。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>确认删除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="rounded-xl border bg-muted/30 px-3 py-2.5 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}
