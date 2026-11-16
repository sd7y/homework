'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Camera, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

interface MistakeListItem {
  id: string;
  subject: string;
  grade: string | null;
  question_text: string;
  knowledge_points: string[];
  error_type: string;
  judgement: string;
  status: string;
  created_at: string;
}

interface Facets {
  knowledge_points: string[];
  error_types: string[];
}

interface ListResponse {
  items: MistakeListItem[];
  total: number;
  page: number;
  facets: Facets;
  error?: string;
}

const TIME_OPTIONS = [
  { value: '0', label: '全部时间' },
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
];

const PAGE_SIZE = 10;

export default function MistakesPage() {
  return (
    <AuthGuard>
      <AppShell>
        <MistakesList />
      </AppShell>
    </AuthGuard>
  );
}

function MistakesList() {
  const router = useRouter();

  const [items, setItems] = useState<MistakeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Facets>({ knowledge_points: [], error_types: [] });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState('');
  const [knowledgePoint, setKnowledgePoint] = useState('');
  const [errorType, setErrorType] = useState('');
  const [days, setDays] = useState('0');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // 搜索防抖
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const fetchPage = useCallback(
    async (page: number, append: boolean) => {
      const params = new URLSearchParams();
      if (subject) params.set('subject', subject);
      if (status) params.set('status', status);
      if (knowledgePoint) params.set('knowledge_point', knowledgePoint);
      if (errorType) params.set('error_type', errorType);
      if (search) params.set('q', search);
      if (days !== '0') params.set('days', days);
      params.set('page', String(page));
      params.set('page_size', String(PAGE_SIZE));

      const res = await apiFetch(`/api/mistakes?${params.toString()}`);
      const data = (await res.json()) as ListResponse;
      if (!res.ok) throw new Error(data.error ?? '加载失败');

      setTotal(data.total);
      setFacets(data.facets);
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      return data.items.length;
    },
    [subject, status, knowledgePoint, errorType, search, days],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPage(1, false)
      .catch((e: Error) => {
        if (!cancelled) toast.error(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const nextPage = Math.floor(items.length / PAGE_SIZE) + 1;
      await fetchPage(nextPage, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoadingMore(false);
    }
  }

  const hasMore = items.length < total;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">错题本</h1>
        <span className="text-sm text-muted-foreground">共 {total} 道</span>
      </div>

      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="搜索题干内容…"
          className="h-11 rounded-xl pl-9"
        />
      </div>

      {/* 筛选 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Select value={subject || '__all__'} onValueChange={(v) => setSubject(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder="科目" />
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

        <Select value={status || '__all__'} onValueChange={(v) => setStatus(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部状态</SelectItem>
            <SelectItem value="confirmed">待复习</SelectItem>
            <SelectItem value="mastered">已掌握</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={knowledgePoint || '__all__'}
          onValueChange={(v) => setKnowledgePoint(v === '__all__' ? '' : v)}
        >
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder="知识点" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部知识点</SelectItem>
            {facets.knowledge_points.map((kp) => (
              <SelectItem key={kp} value={kp}>
                {kp}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={errorType || '__all__'} onValueChange={(v) => setErrorType(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder="错因" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部错因</SelectItem>
            {facets.error_types.map((et) => (
              <SelectItem key={et} value={et}>
                {et}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BookOpen className="size-10 text-muted-foreground/50" />
            <div>
              <p className="font-medium">暂无错题</p>
              <p className="mt-1 text-sm text-muted-foreground">
                上传作业照片，AI 批改后错题会自动归档到这里
              </p>
            </div>
            <Button onClick={() => router.push('/')}>
              <Camera className="size-4" />
              去上传批改
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link key={item.id} href={`/mistakes/${item.id}`} className="block">
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="space-y-2 px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{item.subject}</Badge>
                    {item.status === 'mastered' ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
                        已掌握
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10">
                        待复习
                      </Badge>
                    )}
                    {item.error_type && (
                      <span className="text-xs text-muted-foreground">{item.error_type}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatTime(item.created_at)}
                    </span>
                  </div>
                  <div className="line-clamp-2 text-sm leading-relaxed">
                    <MathText text={item.question_text} />
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
                </CardContent>
              </Card>
            </Link>
          ))}

          {hasMore && (
            <Button
              variant="outline"
              className="w-full"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore && <Loader2 className="size-4 animate-spin" />}
              加载更多（剩余 {total - items.length} 道）
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 3600 * 1000));
  if (diffDays <= 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 30) return `${diffDays} 天前`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
