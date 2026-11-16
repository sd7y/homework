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
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { BookCheck, Brain, CalendarPlus, Layers, Loader2, Sparkles } from 'lucide-react';
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

interface StatsData {
  total: number;
  confirmed: number;
  mastered: number;
  weekNew: number;
  bySubject: Array<{ subject: string; count: number }>;
  byErrorType: Array<{ error_type: string; count: number }>;
  trend30d: Array<{ date: string; count: number }>;
  topKnowledgePoints: Array<{ name: string; count: number }>;
}

const PIE_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  '#94a3b8',
  '#0ea5e9',
  '#f472b6',
  '#a3e635',
];

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
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [advice, setAdvice] = useState('');
  const [adviceLoading, setAdviceLoading] = useState(false);
  const adviceAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/stats');
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
    load();
    return () => adviceAbortRef.current?.abort();
  }, [load]);

  async function generateAdvice() {
    setAdvice('');
    setAdviceLoading(true);
    adviceAbortRef.current?.abort();
    const controller = new AbortController();
    adviceAbortRef.current = controller;

    try {
      const res = await apiFetch('/api/stats/advice', {
        method: 'POST',
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

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-sm text-destructive">{error ?? '加载失败'}</p>
        <Button variant="outline" onClick={load}>
          重试
        </Button>
      </div>
    );
  }

  const subjectConfig: ChartConfig = Object.fromEntries(
    stats.bySubject.map((s, i) => [
      s.subject,
      { label: s.subject, color: PIE_COLORS[i % PIE_COLORS.length] },
    ]),
  );
  const trendConfig: ChartConfig = {
    count: { label: '新增错题', color: 'var(--color-chart-1)' },
  };
  const errorConfig: ChartConfig = {
    count: { label: '错误次数', color: 'var(--color-chart-3)' },
  };
  const kpConfig: ChartConfig = {
    count: { label: '出现次数', color: 'var(--color-chart-2)' },
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">错题统计</h1>

      {/* 数字总览 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <OverviewCard icon={Layers} label="错题总数" value={stats.total} />
        <OverviewCard icon={BookCheck} label="待复习" value={stats.confirmed} tone="amber" />
        <OverviewCard icon={Brain} label="已掌握" value={stats.mastered} tone="emerald" />
        <OverviewCard icon={CalendarPlus} label="本周新增" value={stats.weekNew} tone="blue" />
      </div>

      {stats.total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">还没有错题数据，先去上传批改吧</p>
            <Link href="/">
              <Button>去上传</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 科目分布 + 错因分布 */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-base">科目分布</CardTitle>
              </CardHeader>
              <CardContent className="chart-box">
                <ChartContainer config={subjectConfig} className="mx-auto aspect-square max-h-64">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="subject" />} />
                    <Pie
                      data={stats.bySubject}
                      dataKey="count"
                      nameKey="subject"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                    >
                      {stats.bySubject.map((s, i) => (
                        <Cell key={s.subject} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pb-2 text-xs">
                  {stats.bySubject.map((s, i) => (
                    <span key={s.subject} className="flex items-center gap-1">
                      <span
                        className="inline-block size-2.5 rounded-sm"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      {s.subject} {s.count}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-base">错因分布</CardTitle>
              </CardHeader>
              <CardContent className="chart-box">
                {stats.byErrorType.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">暂无措因数据</p>
                ) : (
                  <ChartContainer config={errorConfig} className="h-64 w-full">
                    <BarChart
                      data={stats.byErrorType}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
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
          </div>

          {/* 近 30 天趋势 */}
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">近 30 天新增趋势</CardTitle>
            </CardHeader>
            <CardContent className="chart-box">
              <ChartContainer config={trendConfig} className="h-60 w-full">
                <LineChart data={stats.trend30d} margin={{ left: 8, right: 8, top: 8 }}>
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

          {/* 高频知识点 */}
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">高频错误知识点 Top10</CardTitle>
            </CardHeader>
            <CardContent className="chart-box">
              {stats.topKnowledgePoints.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">暂无知识点数据</p>
              ) : (
                <ChartContainer config={kpConfig} className="h-64 w-full">
                  <BarChart
                    data={stats.topKnowledgePoints}
                    layout="vertical"
                    margin={{ left: 8, right: 16 }}
                  >
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

          {/* AI 学习建议 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" />
                AI 学习建议
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {advice ? (
                <div className="whitespace-pre-wrap rounded-xl bg-accent/50 px-4 py-3 text-sm leading-relaxed">
                  {advice}
                  {adviceLoading && <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-primary" />}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  基于你的错题分布与高频知识点，生成 3-5 条具体可执行的复习建议
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
