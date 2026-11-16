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

/** 全科目对比视图的单行：错题数 / 掌握进度 / 练习正确率 */
export interface SubjectComparisonItem {
  subject_id: string | null;
  name: string;
  icon: string;
  color: string;
  total: number;
  confirmed: number;
  mastered: number;
  practice_count: number;
  practice_correct_count: number;
  /** 练习正确率 0-1；无练习记录时为 null */
  practice_accuracy: number | null;
}

interface SubjectMeta {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** 全科目对比：按 subject_id 分组聚合错题数、掌握进度与练习正确率，并合入科目元信息 */
export function computeSubjectComparison(
  rows: MistakeRow[],
  subjects: SubjectMeta[],
): SubjectComparisonItem[] {
  const metaById = new Map(subjects.map((s) => [s.id, s]));
  const metaByName = new Map(subjects.map((s) => [s.name, s]));

  const map = new Map<
    string,
    { subject_id: string | null; name: string; total: number; confirmed: number; mastered: number; pc: number; pcc: number }
  >();

  for (const row of rows) {
    const key = row.subject_id ?? `name:${row.subject}`;
    let item = map.get(key);
    if (!item) {
      item = {
        subject_id: row.subject_id,
        name: row.subject,
        total: 0,
        confirmed: 0,
        mastered: 0,
        pc: 0,
        pcc: 0,
      };
      map.set(key, item);
    }
    item.total += 1;
    if (row.status === 'mastered') item.mastered += 1;
    else item.confirmed += 1;
    item.pc += row.practice_count ?? 0;
    item.pcc += row.practice_correct_count ?? 0;
  }

  return [...map.values()]
    .map((it) => {
      const meta = (it.subject_id ? metaById.get(it.subject_id) : undefined) ?? metaByName.get(it.name);
      return {
        subject_id: it.subject_id ?? meta?.id ?? null,
        name: it.name,
        icon: meta?.icon ?? 'book-open',
        color: meta?.color ?? '#64748b',
        total: it.total,
        confirmed: it.confirmed,
        mastered: it.mastered,
        practice_count: it.pc,
        practice_correct_count: it.pcc,
        practice_accuracy: it.pc > 0 ? it.pcc / it.pc : null,
      };
    })
    .sort((a, b) => b.total - a.total);
}

interface MistakeRow {
  id: string;
  subject: string;
  subject_id: string | null;
  error_type: string;
  knowledge_points: string[] | null;
  status: string;
  practice_count: number;
  practice_correct_count: number;
  created_at: string;
}

/** 拉取用户全部入库错题（分页避免 1000 行静默截断），在应用层聚合统计 */
export async function fetchAllMistakes(
  client: SupabaseClient,
  userId: string,
  subjectId?: string,
): Promise<MistakeRow[]> {
  const rows: MistakeRow[] = [];
  const pageSize = 1000;
  let page = 0;
  // 个人错题本规模有限，最多拉取 10 页（1 万条）作为保护
  while (page < 10) {
    let query = client
      .from('mistakes')
      .select('id, subject, subject_id, error_type, knowledge_points, status, practice_count, practice_correct_count, created_at')
      .eq('user_id', userId)
      .in('status', ['confirmed', 'mastered'])
      .order('created_at', { ascending: false });
    if (subjectId) query = query.eq('subject_id', subjectId);
    const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
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

export async function computeStats(
  client: SupabaseClient,
  userId: string,
  subjectId?: string,
): Promise<StatsSummary> {
  const rows = await fetchAllMistakes(client, userId, subjectId);
  return aggregateMistakes(rows);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
