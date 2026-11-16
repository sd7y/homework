import type { SupabaseClient } from '@supabase/supabase-js';

export interface StatsSummary {
  total: number;
  /** 待复习（已确认未掌握） */
  confirmed: number;
  mastered: number;
  weekNew: number;
  bySubject: Array<{ subject: string; count: number }>;
  byErrorType: Array<{ error_type: string; count: number }>;
  trend30d: Array<{ date: string; count: number }>;
  topKnowledgePoints: Array<{ name: string; count: number }>;
}

interface MistakeRow {
  id: string;
  subject: string;
  error_type: string;
  knowledge_points: string[] | null;
  status: string;
  created_at: string;
}

/** 拉取用户全部入库错题（分页避免 1000 行静默截断），在应用层聚合统计 */
export async function fetchAllMistakes(
  client: SupabaseClient,
  userId: string,
): Promise<MistakeRow[]> {
  const rows: MistakeRow[] = [];
  const pageSize = 1000;
  let page = 0;
  // 个人错题本规模有限，最多拉取 10 页（1 万条）作为保护
  while (page < 10) {
    const { data, error } = await client
      .from('mistakes')
      .select('id, subject, error_type, knowledge_points, status, created_at')
      .eq('user_id', userId)
      .in('status', ['confirmed', 'mastered'])
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(`统计查询失败: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as MistakeRow[]));
    if (data.length < pageSize) break;
    page += 1;
  }
  return rows;
}

export function aggregateMistakes(rows: MistakeRow[]): StatsSummary {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const subjectCount = new Map<string, number>();
  const errorCount = new Map<string, number>();
  const kpCount = new Map<string, number>();
  const dayCount = new Map<string, number>();

  // 初始化近 30 天（含今天）的日期桶
  const trend30d: Array<{ date: string; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    const key = formatDate(d);
    dayCount.set(key, 0);
    trend30d.push({ date: key, count: 0 });
  }

  let confirmed = 0;
  let mastered = 0;
  let weekNew = 0;

  for (const row of rows) {
    if (row.status === 'mastered') mastered += 1;
    else confirmed += 1;

    const created = new Date(row.created_at);
    if (created >= weekAgo) weekNew += 1;

    subjectCount.set(row.subject, (subjectCount.get(row.subject) ?? 0) + 1);

    if (row.error_type) {
      errorCount.set(row.error_type, (errorCount.get(row.error_type) ?? 0) + 1);
    }

    for (const kp of row.knowledge_points ?? []) {
      if (!kp) continue;
      kpCount.set(kp, (kpCount.get(kp) ?? 0) + 1);
    }

    const dayKey = formatDate(created);
    if (dayCount.has(dayKey)) {
      dayCount.set(dayKey, (dayCount.get(dayKey) ?? 0) + 1);
    }
  }

  for (const item of trend30d) {
    item.count = dayCount.get(item.date) ?? 0;
  }

  return {
    total: rows.length,
    confirmed,
    mastered,
    weekNew,
    bySubject: [...subjectCount.entries()]
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count),
    byErrorType: [...errorCount.entries()]
      .map(([error_type, count]) => ({ error_type, count }))
      .sort((a, b) => b.count - a.count),
    trend30d,
    topKnowledgePoints: [...kpCount.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}

export async function computeStats(client: SupabaseClient, userId: string): Promise<StatsSummary> {
  const rows = await fetchAllMistakes(client, userId);
  return aggregateMistakes(rows);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
