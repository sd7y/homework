'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import { BookCheck, Brain, CalendarPlus, ChevronLeft, Layers, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { AuthGuard } from '@/components/auth-guard';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { iconByName, type SubjectInfo } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface SubjectBreakdownItem {
  subject_id: string | null;
  name: string;
  icon: string;
  color: string;
  total: number;
  confirmed: number;
  mastered: number;
  practice_count: number;
  practice_correct_count: number;
  practice_accuracy: number | null;
}

interface StatsData {
  scope: 'all' | 'subject';
  subject?: SubjectBreakdownItem | null;
  total: number;
  confirmed: number;
  mastered: number;
  weekNew: number;
  bySubject: SubjectBreakdownItem[];
  byErrorType: Array<{ error_type: string; count: number }>;
  trend30d: Array<{ date: string; count: number }>;
  topKnowledgePoints: Array<{ name: string; count: number }>;
}

export default function StatsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <StatsPanel />
      </AppShell>
    </AuthGuard>
  );
}

function StatsPanel() {
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [scopeId, setScopeId] = useState(''); // '' = 全科目对比
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [advice, setAdvice] = useState('');
  const [adviceLoading, setAdviceLoading] = useState(false);
  const adviceAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    apiFetch('/api/subjects')
      .then(async (res) => {
        const data = (await res.json()) as { subjects?: SubjectInfo[] };
        if (res.ok) setSubjects(data.subjects ?? []);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async (subjectId: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = subjectId ? `?subject_id=${encodeURIComponent(subjectId)}` : '';
      const res = await apiFetch(`/api/stats${qs}`);
      const data = (await res.json()) as { stats?: StatsData; error?: string };
      if (!res.ok || !data.stats) throw new Error(data.error ?? '加载统计失败');
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载统计失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(scopeId);
  }, [load, scopeId]);

  useEffect(() => () => adviceAbortRef.current?.abort(), []);

  function switchScope(id: string) {
    adviceAbortRef.current?.abort();
    setAdvice('');
    setScopeId(id);
  }

  async function generateAdvice() {
    setAdvice('');
    setAdviceLoading(true);
    adviceAbortRef.current?.abort();
    const controller = new AbortController();
    adviceAbortRef.current = controller;

    try {
      const res = await apiFetch('/api/stats/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scopeId ? { subject_id: scopeId } : {}),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? '生成学习建议失败');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload) as { content?: string; error?: string };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.content) setAdvice((prev) => prev + parsed.content);
          } catch (parseError) {
            if (parseError instanceof SyntaxError) continue;
            throw parseError;
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      toast.error(e instanceof Error ? e.message : '生成学习建议失败');
    } finally {
      setAdviceLoading(false);
    }
  }

  const currentSubject = scopeId ? subjects.find((s) => s.id === scopeId) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {scopeId && (
          <Button variant="ghost" size="icon" className="size-9" onClick={() => switchScope('')}>
            <ChevronLeft className="size-5" />
          </Button>
        )}
        <h1 className="text-lg font-bold">
          {currentSubject ? `${currentSubject.name} · 科目详情` : '错题统计'}
        </h1>
      </div>

      {/* 科目切换（全科目对比 / 单科目详情） */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <ScopeChip
          label="全科目"
          count={subjects.reduce((n, s) => n + s.mistake_count, 0)}
          active={scopeId === ''}
          onClick={() => switchScope('')}
        />
        {subjects.map((s) => (
          <ScopeChip
            key={s.id}
            label={s.name}
            count={s.mistake_count}
            color={s.color}
            active={scopeId === s.id}
            onClick={() => switchScope(s.id)}
          />
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : error || !stats ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-sm text-destructive">{error ?? '加载失败'}</p>
          <Button variant="outline" onClick={() => load(scopeId)}>
            重试
          </Button>
        </div>
      ) : stats.total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {scopeId ? '该科目下还没有错题数据' : '还没有错题数据，先去上传批改吧'}
            </p>
            <Link href="/">
              <Button>去上传</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 数字总览 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <OverviewCard icon={Layers} label="错题总数" value={stats.total} />
            <OverviewCard icon={BookCheck} label="待复习" value={stats.confirmed} tone="amber" />
            <OverviewCard icon={Brain} label="已掌握" value={stats.mastered} tone="emerald" />
            <OverviewCard icon={CalendarPlus} label="本周新增" value={stats.weekNew} tone="blue" />
          </div>

          {/* 全科目对比视图 */}
          {stats.scope === 'all' && (
            <AllSubjectsView bySubject={stats.bySubject} onPick={switchScope} />
          )}

          {/* 错因分布 + 知识点 / 趋势 */}
          <div className="grid gap-4 md:grid-cols-2">
            <ErrorTypeCard data={stats.byErrorType} />
            <KnowledgePointCard data={stats.topKnowledgePoints} />
          </div>

          <TrendCard data={stats.trend30d} />

          {/* AI 学习建议 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" />
                {currentSubject ? `${currentSubject.name} · AI 学习建议` : 'AI 学习建议'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {advice ? (
                <div className="whitespace-pre-wrap rounded-xl bg-accent/50 px-4 py-3 text-sm leading-relaxed">
                  {advice}
                  {adviceLoading && (
                    <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-primary" />
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  基于{currentSubject ? `「${currentSubject.name}」` : '当前'}的错题分布与高频知识点，生成
                  3-5 条具体可执行的复习建议
                </p>
              )}
              <Button onClick={generateAdvice} disabled={adviceLoading} className="w-full sm:w-auto">
                {adviceLoading && <Loader2 className="size-4 animate-spin" />}
                {advice ? '重新生成' : '生成学习建议'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ScopeChip({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:border-primary/50',
      )}
    >
      {color && (
        <span className="size-2 rounded-full" style={{ backgroundColor: active ? 'currentColor' : color }} />
      )}
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-xs leading-none tabular-nums',
          active ? 'bg-white/25' : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}

/** 全科目对比：各科错题数 + 练习正确率 */
function AllSubjectsView({
  bySubject,
  onPick,
}: {
  bySubject: SubjectBreakdownItem[];
  onPick: (subjectId: string) => void;
}) {
  const countConfig: ChartConfig = { count: { label: '错题数', color: 'var(--color-chart-1)' } };
  const accConfig: ChartConfig = { accuracy: { label: '练习正确率', color: 'var(--color-chart-2)' } };
  const accData = bySubject
    .filter((s) => s.practice_accuracy !== null)
    .map((s) => ({ ...s, accuracy: Math.round((s.practice_accuracy ?? 0) * 100) }));

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">全科目对比</CardTitle>
      </CardHeader>
      <CardContent className="chart-box space-y-4">
        {bySubject.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">暂无数据</p>
        ) : (
          <>
            <ChartContainer config={countConfig} className="h-56 w-full">
              <BarChart data={bySubject} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} interval={0} />
                <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={26}>
                  {bySubject.map((s) => (
                    <Cell key={s.name} fill={s.color || 'var(--color-chart-1)'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>

            {/* 科目标签列表：点击进入单科目详情 */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {bySubject.map((s) => {
                const Icon = iconByName(s.icon);
                return (
                  <button
                    key={s.name}
                    type="button"
                    disabled={!s.subject_id}
                    onClick={() => s.subject_id && onPick(s.subject_id)}
                    className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-primary/50 disabled:opacity-60"
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: s.color || 'var(--primary)' }}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {s.total} 题 · 待复习 {s.confirmed} · 已掌握 {s.mastered}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.practice_accuracy !== null
                        ? `正确率 ${Math.round(s.practice_accuracy * 100)}%`
                        : '未练习'}
                    </span>
                  </button>
                );
              })}
            </div>

            {accData.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">各科练习正确率（%）</p>
                <ChartContainer config={accConfig} className="h-48 w-full">
                  <BarChart data={accData} layout="vertical" margin={{ left: 8, right: 32 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={64}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="accuracy" radius={[0, 6, 6, 0]} barSize={16}>
                      {accData.map((s) => (
                        <Cell key={s.name} fill={s.color || 'var(--color-chart-2)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ErrorTypeCard({ data }: { data: Array<{ error_type: string; count: number }> }) {
  const config: ChartConfig = { count: { label: '错误次数', color: 'var(--color-chart-3)' } };
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">错因分布</CardTitle>
      </CardHeader>
      <CardContent className="chart-box">
        {data.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">暂无措因数据</p>
        ) : (
          <ChartContainer config={config} className="h-64 w-full">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} hide />
              <YAxis
                type="category"
                dataKey="error_type"
                width={88}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-chart-3)" radius={[0, 6, 6, 0]} barSize={18} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function KnowledgePointCard({ data }: { data: Array<{ name: string; count: number }> }) {
  const config: ChartConfig = { count: { label: '出现次数', color: 'var(--color-chart-2)' } };
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">高频错误知识点 Top10</CardTitle>
      </CardHeader>
      <CardContent className="chart-box">
        {data.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">暂无知识点数据</p>
        ) : (
          <ChartContainer config={config} className="h-64 w-full">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} hide />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-chart-2)" radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function TrendCard({ data }: { data: Array<{ date: string; count: number }> }) {
  const config: ChartConfig = { count: { label: '新增错题', color: 'var(--color-chart-1)' } };
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">近 30 天新增趋势</CardTitle>
      </CardHeader>
      <CardContent className="chart-box">
        <ChartContainer config={config} className="h-60 w-full">
          <LineChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5)}
              interval={4}
            />
            <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function OverviewCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Layers;
  label: string;
  value: number;
  tone?: 'amber' | 'emerald' | 'blue';
}) {
  const toneClass =
    tone === 'amber'
      ? 'bg-amber-500/10 text-amber-600'
      : tone === 'emerald'
        ? 'bg-emerald-500/10 text-emerald-600'
        : tone === 'blue'
          ? 'bg-sky-500/10 text-sky-600'
          : 'bg-primary/10 text-primary';
  return (
    <Card>
      <CardContent className="flex items-center gap-3 px-4 py-4">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
