'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthGuard } from '@/components/auth-guard';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import {
  STRICTNESS_META,
  SUBJECT_COLORS,
  SUBJECT_ICON_CHOICES,
  iconByName,
  type JudgeProfile,
  type SubjectInfo,
} from '@/lib/constants';
import { cn } from '@/lib/utils';

export default function SubjectsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <SubjectsPanel />
      </AppShell>
    </AuthGuard>
  );
}

function SubjectsPanel() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const [editTarget, setEditTarget] = useState<SubjectInfo | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SubjectInfo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/subjects');
      const data = (await res.json()) as { subjects?: SubjectInfo[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? '加载科目失败');
      setSubjects(data.subjects ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载科目失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function moveSubject(index: number, direction: -1 | 1) {
    const next = [...subjects];
    const j = index + direction;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setSubjects(next);
    try {
      const res = await apiFetch('/api/subjects/reorder', {
        method: 'POST',
        body: JSON.stringify({ ordered_ids: next.map((s) => s.id) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? '排序保存失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '排序保存失败');
      load();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="size-9" onClick={() => router.push('/profile')}>
          <ChevronLeft className="size-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">科目管理</h1>
          <p className="text-xs text-muted-foreground">自定义科目，并为每个科目配置批改策略</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          新增科目
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {subjects.map((s, index) => {
            const Icon = iconByName(s.icon);
            return (
              <Card key={s.id}>
                <CardContent className="flex items-center gap-3 px-3 py-3">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: s.color }}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      {s.is_system ? (
                        <Badge variant="secondary" className="h-5 shrink-0 gap-0.5 px-1.5 text-[10px]">
                          <Lock className="size-2.5" />
                          系统
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
                          自定义
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {STRICTNESS_META[s.judge_profile.strictness]?.label ?? '结果判分'} ·{' '}
                      {s.mistake_count} 道错题
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={index === 0}
                      onClick={() => moveSubject(index, -1)}
                      aria-label="上移"
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={index === subjects.length - 1}
                      onClick={() => moveSubject(index, 1)}
                      aria-label="下移"
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setEditTarget(s)}
                      aria-label="编辑"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {!s.is_system && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteTarget(s)}
                        aria-label="删除"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateSubjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingNames={subjects.map((s) => s.name)}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
      />

      <EditSubjectDialog
        subject={editTarget}
        allSubjects={subjects}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          load();
        }}
      />

      <DeleteSubjectDialog
        subject={deleteTarget}
        allSubjects={subjects}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          load();
        }}
      />
    </div>
  );
}

/* ---------------- 新增科目 ---------------- */

function CreateSubjectDialog({
  open,
  onOpenChange,
  existingNames,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingNames: string[];
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('puzzle');
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const nameError = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (trimmed.length > 12) return '名称最长 12 个字符';
    if (existingNames.includes(trimmed)) return '科目名称已存在';
    return null;
  }, [name, existingNames]);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('请输入科目名称');
      return;
    }
    if (nameError) {
      toast.error(nameError);
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/subjects', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, icon, color }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? '创建失败');
      toast.success(`科目「${trimmed}」已创建`);
      setName('');
      setIcon('puzzle');
      setColor(SUBJECT_COLORS[0]);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>新增自定义科目</DialogTitle>
          <DialogDescription>创建后即可在上传页选择该科目，AI 将按通用策略批改</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="subject-name">科目名称</Label>
            <Input
              id="subject-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：编程 / 日语 / 奥数"
              maxLength={12}
              className="h-11"
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>图标</Label>
            <div className="grid grid-cols-8 gap-1.5">
              {SUBJECT_ICON_CHOICES.map((iconName) => {
                const Icon = iconByName(iconName);
                const active = icon === iconName;
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setIcon(iconName)}
                    aria-pressed={active}
                    className={cn(
                      'flex h-9 items-center justify-center rounded-lg border transition-colors',
                      active ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40',
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>颜色</Label>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-pressed={color === c}
                  className={cn(
                    'size-8 rounded-full transition-transform',
                    color === c && 'ring-2 ring-offset-2 ring-foreground/40 scale-110',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- 编辑科目（含批改策略） ---------------- */

function EditSubjectDialog({
  subject,
  allSubjects,
  onClose,
  onSaved,
}: {
  subject: SubjectInfo | null;
  allSubjects: SubjectInfo[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('book-open');
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [strictness, setStrictness] = useState<JudgeProfile['strictness']>('answer');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (subject) {
      setName(subject.name);
      setIcon(subject.icon);
      setColor(subject.color);
      setStrictness(subject.judge_profile.strictness);
    }
  }, [subject]);

  if (!subject) return null;

  const otherNames = allSubjects.filter((s) => s.id !== subject.id).map((s) => s.name);
  const trimmedName = name.trim();
  const nameInvalid =
    !subject.is_system && (!trimmedName || trimmedName.length > 12 || otherNames.includes(trimmedName));

  async function handleSave() {
    if (nameInvalid) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        icon,
        color,
        judge_profile: { ...subject!.judge_profile, strictness },
      };
      if (!subject!.is_system) body.name = trimmedName;
      const res = await apiFetch(`/api/subjects/${subject!.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? '保存失败');
      toast.success('已保存');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!subject} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>编辑科目 · {subject.name}</DialogTitle>
          <DialogDescription>
            {subject.is_system ? '系统科目不可删除、不可改名，可调整批改策略' : '可修改名称、图标、颜色与批改策略'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!subject.is_system && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-subject-name">科目名称</Label>
              <Input
                id="edit-subject-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={12}
                className="h-11"
              />
              {trimmedName && otherNames.includes(trimmedName) && (
                <p className="text-xs text-destructive">科目名称已存在</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>图标</Label>
            <div className="grid grid-cols-8 gap-1.5">
              {SUBJECT_ICON_CHOICES.map((iconName) => {
                const Icon = iconByName(iconName);
                const active = icon === iconName;
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setIcon(iconName)}
                    className={cn(
                      'flex h-9 items-center justify-center rounded-lg border transition-colors',
                      active ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40',
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>颜色</Label>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'size-8 rounded-full transition-transform',
                    color === c && 'ring-2 ring-offset-2 ring-foreground/40 scale-110',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>批改严格程度</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(STRICTNESS_META) as Array<JudgeProfile['strictness']>).map((key) => {
                const meta = STRICTNESS_META[key];
                const active = strictness === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStrictness(key)}
                    className={cn(
                      'flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-colors',
                      active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                    )}
                  >
                    <span className={cn('text-sm font-medium', active && 'text-primary')}>{meta.label}</span>
                    <span className="text-[11px] leading-tight text-muted-foreground">{meta.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>该科目错因枚举（AI 判分时约束）</Label>
            <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted/50 p-2.5">
              {subject.judge_profile.error_types.map((et) => (
                <Badge key={et} variant="secondary" className="text-xs">
                  {et}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving || nameInvalid}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- 删除科目（二次确认 + 错题转移） ---------------- */

function DeleteSubjectDialog({
  subject,
  allSubjects,
  onClose,
  onDeleted,
}: {
  subject: SubjectInfo | null;
  allSubjects: SubjectInfo[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [transferTo, setTransferTo] = useState('');
  const [ackText, setAckText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setTransferTo('');
    setAckText('');
  }, [subject]);

  if (!subject) return null;

  const hasMistakes = subject.mistake_count > 0;
  const transferTargets = allSubjects.filter((s) => s.id !== subject.id);
  // 有错题时必须选择转移目标，并通过输入科目名二次确认
  const canDelete = hasMistakes ? !!transferTo && ackText.trim() === subject.name : true;

  async function handleDelete() {
    setDeleting(true);
    try {
      const qs = hasMistakes ? `?transfer_to=${encodeURIComponent(transferTo)}` : '';
      const res = await apiFetch(`/api/subjects/${subject!.id}${qs}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        transferred_count?: number;
      };
      if (!res.ok) throw new Error(data.error ?? '删除失败');
      toast.success(
        data.transferred_count
          ? `已删除，${data.transferred_count} 道错题已转移`
          : `科目「${subject!.name}」已删除`,
      );
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={!!subject} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-amber-500" />
            删除科目「{subject.name}」
          </DialogTitle>
          <DialogDescription>此操作不可撤销，请仔细确认。</DialogDescription>
        </DialogHeader>

        {hasMistakes ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
              该科目下还有 <strong className="tabular-nums">{subject.mistake_count}</strong> 道错题。
              删除科目前，必须先将它们转移到其他科目，系统不会静默删除任何错题数据。
            </div>
            <div className="space-y-1.5">
              <Label>转移错题到</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="选择目标科目" />
                </SelectTrigger>
                <SelectContent>
                  {transferTargets.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ack-delete">
                输入「{subject.name}」确认删除
              </Label>
              <Input
                id="ack-delete"
                value={ackText}
                onChange={(e) => setAckText(e.target.value)}
                placeholder={subject.name}
                className="h-11"
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">该科目下没有错题，可以安全删除。</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting || !canDelete}>
            {deleting && <Loader2 className="size-4 animate-spin" />}
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
