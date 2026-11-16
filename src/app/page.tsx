'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, ImagePlus, Loader2, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthGuard } from '@/components/auth-guard';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { GRADES, MAX_UPLOAD_IMAGES, SUBJECT_ICONS, iconByName } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface SubjectItem {
  id: number;
  name: string;
  icon: string;
}

interface PickedImage {
  key: string;
  blob: Blob;
  previewUrl: string;
  size: number;
}

type Stage = 'idle' | 'uploading' | 'grading';

export default function UploadPage() {
  return (
    <AuthGuard>
      <AppShell>
        <UploadPanel />
      </AppShell>
    </AuthGuard>
  );
}

function UploadPanel() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  useEffect(() => {
    apiFetch('/api/subjects')
      .then(async (res) => {
        const data = (await res.json()) as { subjects?: SubjectItem[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? '加载科目失败');
        setSubjects(data.subjects ?? []);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setSubjectsLoading(false));
  }, []);

  useEffect(() => {
    // 卸载时释放预览 URL
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePickFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const remaining = MAX_UPLOAD_IMAGES - images.length;
    if (files.length > remaining) {
      toast.warning(`最多上传 ${MAX_UPLOAD_IMAGES} 张，已为你截取前 ${remaining} 张`);
    }
    const picked = files.slice(0, Math.max(0, remaining));

    setCompressing(true);
    setError(null);
    try {
      const compressed: PickedImage[] = [];
      for (const file of picked) {
        if (!file.type.startsWith('image/')) {
          toast.warning(`「${file.name}」不是图片，已跳过`);
          continue;
        }
        const blob = await compressImage(file);
        compressed.push({
          key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          blob,
          previewUrl: URL.createObjectURL(blob),
          size: blob.size,
        });
      }
      setImages((prev) => [...prev, ...compressed]);
    } catch {
      toast.error('图片处理失败，请换一张试试');
    } finally {
      setCompressing(false);
    }
  }

  function removeImage(key: string) {
    setImages((prev) => {
      const target = prev.find((img) => img.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.key !== key);
    });
  }

  async function handleSubmit() {
    setError(null);
    if (!subject) {
      setError('请先选择科目');
      return;
    }
    if (!grade) {
      setError('请先选择年级');
      return;
    }
    if (images.length === 0) {
      setError('请先上传题目图片');
      return;
    }

    try {
      // 阶段一：上传图片
      setStage('uploading');
      const formData = new FormData();
      formData.append('subject', subject);
      formData.append('grade', grade);
      for (const img of images) {
        formData.append('images', new File([img.blob], 'question.jpg', { type: 'image/jpeg' }));
      }
      const uploadRes = await apiFetch('/api/batches', { method: 'POST', body: formData });
      const uploadData = (await uploadRes.json()) as {
        batch?: { id: string };
        error?: string;
      };
      if (!uploadRes.ok || !uploadData.batch) {
        throw new Error(uploadData.error ?? '上传失败，请重试');
      }
      const batchId = uploadData.batch.id;

      // 阶段二：AI 批改
      setStage('grading');
      const gradeRes = await apiFetch(`/api/batches/${batchId}/grade`, { method: 'POST' });
      const gradeData = (await gradeRes.json()) as { question_count?: number; error?: string };
      if (!gradeRes.ok) {
        throw new Error(gradeData.error ?? 'AI 批改失败，请重试');
      }
      if (!gradeData.question_count) {
        throw new Error('没有识别到题目，请确保照片清晰包含题目后重试');
      }

      toast.success(`批改完成，识别出 ${gradeData.question_count} 道题`);
      router.push(`/review/${batchId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '处理失败，请重试');
      setStage('idle');
    }
  }

  const busy = stage !== 'idle';

  return (
    <div className="space-y-5">
      {/* 引导文案 */}
      <div className="rounded-2xl bg-gradient-to-r from-primary to-teal-500 p-5 text-primary-foreground shadow-md">
        <h1 className="text-lg font-bold">拍照上传，AI 帮你批改</h1>
        <p className="mt-1 text-sm opacity-90">
          对准作业或试卷拍一张，自动识别题目与手写作答，错题一键归档
        </p>
      </div>

      {/* 上传区 */}
      <Card>
        <CardContent className="space-y-4 pt-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePickFiles}
          />

          {images.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || compressing}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-accent/50 px-4 py-10 text-center transition-colors hover:bg-accent disabled:opacity-60"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                <Camera className="size-7" />
              </span>
              <span className="text-base font-medium">拍照 / 上传图片</span>
              <span className="text-xs text-muted-foreground">
                支持一次多选，最多 {MAX_UPLOAD_IMAGES} 张，自动压缩
              </span>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {images.map((img) => (
                  <div key={img.key} className="relative aspect-[3/4] overflow-hidden rounded-lg border bg-muted">
                    {/* 本地预览 blob，使用原生 img 避免 next/image 域名配置 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.previewUrl}
                      alt="题目图片预览"
                      className="size-full object-cover"
                    />
                    {!busy && (
                      <button
                        type="button"
                        onClick={() => removeImage(img.key)}
                        className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                        aria-label="删除图片"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {images.length < MAX_UPLOAD_IMAGES && !busy && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <ImagePlus className="size-6" />
                    <span className="text-xs">继续添加</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                已选 {images.length}/{MAX_UPLOAD_IMAGES} 张
                {compressing && '，正在压缩…'}
              </p>
              {!busy && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
                    setImages([]);
                  }}
                >
                  <Trash2 className="size-4" />
                  清空重选
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 科目 */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">选择科目</h2>
        {subjectsLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {subjects.map((s) => {
              const Icon = iconByName(s.icon) ?? SUBJECT_ICONS.default;
              const active = subject === s.name;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setSubject(s.name)}
                  className={cn(
                    'flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm transition-all',
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow'
                      : 'border-border bg-card hover:border-primary/50',
                  )}
                >
                  <Icon className="size-4" />
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 年级 */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">选择年级</h2>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {GRADES.map((g) => {
            const active = grade === g;
            return (
              <button
                key={g}
                type="button"
                disabled={busy}
                onClick={() => setGrade(g)}
                className={cn(
                  'h-10 rounded-xl border text-sm transition-all',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow'
                    : 'border-border bg-card hover:border-primary/50',
                )}
              >
                {g}
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* 提交按钮 / 进度态 */}
      <Button
        size="lg"
        className="h-13 w-full rounded-xl text-base shadow-md"
        disabled={busy || compressing || images.length === 0}
        onClick={handleSubmit}
      >
        {stage === 'idle' && (
          <>
            <Sparkles className="size-5" />
            开始批改
          </>
        )}
        {stage === 'uploading' && (
          <>
            <UploadCloud className="size-5 animate-bounce" />
            正在上传图片…
          </>
        )}
        {stage === 'grading' && (
          <>
            <Loader2 className="size-5 animate-spin" />
            AI 正在识别批改，请稍候…
          </>
        )}
      </Button>

      {stage === 'grading' && (
        <p className="text-center text-xs text-muted-foreground">
          图片较多时可能需要 30 秒左右，请不要关闭页面
        </p>
      )}
    </div>
  );
}

/** 前端压缩：长边 1600px，JPEG 质量 0.8 */
async function compressImage(file: File): Promise<Blob> {
  const MAX_EDGE = 1600;
  const QUALITY = 0.8;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('无法创建画布');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片压缩失败'))),
      'image/jpeg',
      QUALITY,
    );
  });
}
