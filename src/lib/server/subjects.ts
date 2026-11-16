import type { SupabaseClient } from '@supabase/supabase-js';
import type { JudgeProfile } from '@/lib/constants';

export type { JudgeProfile };

export interface SubjectPreset {
  name: string;
  icon: string;
  color: string;
  judge_profile: JudgeProfile;
}

/** 主观题按要点覆盖度给分的通用规则（生物/历史/地理/政治共用） */
const POINTS_RULE =
  '主观题按要点覆盖度给分：在 analysis 中明确列出「答到的要点」与「漏掉的要点」，覆盖全部要点判 correct，部分覆盖判 partial，要点基本缺失判 wrong。';

/** 系统预置 9 科目的判分策略（差异化核心，不同科目走不同判分逻辑） */
export const SUBJECT_PRESETS: SubjectPreset[] = [
  {
    name: '数学',
    icon: 'sigma',
    color: '#0d9488',
    judge_profile: {
      strictness: 'process',
      formula_format: 'latex',
      has_subjective: false,
      error_types: ['计算错误', '公式误用', '单位遗漏', '思路错误', '审题失误', '未作答'],
      subjective_rule: '',
      extra_rules:
        '重点核对推导过程：最终答案正确但存在跳步、缺少关键中间结果的，judgement 必须记为 partial，并在 analysis 中逐一指出缺失的步骤；所有公式、推导式与最终答案一律使用 LaTeX 表示。',
    },
  },
  {
    name: '语文',
    icon: 'book-open',
    color: '#d97706',
    judge_profile: {
      strictness: 'points',
      formula_format: 'plain',
      has_subjective: true,
      error_types: ['字词错误', '默写错误', '理解偏差', '要点遗漏', '表达不当', '未作答'],
      subjective_rule:
        '作文只给评语和改进建议，不判对错：judgement 固定为 partial，error_type 记为「表达不当」，analysis 中给出具体评语与至少 2 条可执行的改进建议。',
      extra_rules:
        '客观题（字词、拼音、默写、文学常识）严格判分，错一字即判 wrong；阅读理解按采分点命中给分，analysis 中列出命中与遗漏的采分点。',
    },
  },
  {
    name: '英语',
    icon: 'languages',
    color: '#0284c7',
    judge_profile: {
      strictness: 'answer',
      formula_format: 'plain',
      has_subjective: true,
      error_types: ['拼写错误', '用词错误', '语法错误', '时态错误', '句型结构错误', '理解偏差', '未作答'],
      subjective_rule:
        '作文不判 correct/wrong：按语法、词汇、结构三个维度分别给出评语与修改建议，judgement 固定为 partial。',
      extra_rules:
        '拼写类错误必须区分「拼写错误」（单词本身拼错，如 recieve）与「用词错误」（拼写正确但语境用词不当，如 affect/effect 混用），并在 analysis 中给出正确拼写或推荐用词。',
    },
  },
  {
    name: '物理',
    icon: 'atom',
    color: '#7c3aed',
    judge_profile: {
      strictness: 'process',
      formula_format: 'latex',
      has_subjective: false,
      error_types: ['计算错误', '公式误用', '单位遗漏', '思路错误', '审题失误', '未作答'],
      subjective_rule: '',
      extra_rules:
        '重点核对推导过程与公式适用条件；数值计算结果必须带单位，漏单位记为「单位遗漏」；答案正确但跳步记为 partial 并指出缺失步骤；公式使用 LaTeX。',
    },
  },
  {
    name: '化学',
    icon: 'flask-conical',
    color: '#059669',
    judge_profile: {
      strictness: 'process',
      formula_format: 'latex',
      has_subjective: false,
      error_types: ['方程式未配平', '条件标注缺失', '化学式错误', '计算错误', '概念不清', '审题失误', '未作答'],
      subjective_rule: '',
      extra_rules:
        '化学方程式必须单独校验：配平系数是否正确、反应条件标注（加热/催化剂/通电/点燃等）是否缺失、气体↑与沉淀↓符号是否标注；任一缺失按对应错因记录并记为 wrong 或 partial；化学式与方程式使用 LaTeX。',
    },
  },
  {
    name: '生物',
    icon: 'leaf',
    color: '#16a34a',
    judge_profile: {
      strictness: 'points',
      formula_format: 'plain',
      has_subjective: true,
      error_types: ['概念混淆', '要点遗漏', '术语错误', '理解偏差', '审题失误', '未作答'],
      subjective_rule: POINTS_RULE,
      extra_rules: '生物学术语用字必须准确（如「线粒体」不可写作「粒线体」），术语用字错误记为「术语错误」。',
    },
  },
  {
    name: '历史',
    icon: 'landmark',
    color: '#ea580c',
    judge_profile: {
      strictness: 'points',
      formula_format: 'plain',
      has_subjective: true,
      error_types: ['史实错误', '时间线混乱', '要点遗漏', '因果分析不足', '审题失误', '未作答'],
      subjective_rule: POINTS_RULE,
      extra_rules: '年代、事件、人物等史实性内容必须准确，张冠李戴记为「史实错误」。',
    },
  },
  {
    name: '地理',
    icon: 'globe',
    color: '#0891b2',
    judge_profile: {
      strictness: 'points',
      formula_format: 'plain',
      has_subjective: true,
      error_types: ['概念混淆', '读图错误', '要点遗漏', '因果分析不足', '审题失误', '未作答'],
      subjective_rule: POINTS_RULE,
      extra_rules: '涉及地图、等高线、气候图等读图题，误判图中信息记为「读图错误」。',
    },
  },
  {
    name: '政治',
    icon: 'scale',
    color: '#e11d48',
    judge_profile: {
      strictness: 'points',
      formula_format: 'plain',
      has_subjective: true,
      error_types: ['概念混淆', '要点遗漏', '理论联系实际不足', '理解偏差', '审题失误', '未作答'],
      subjective_rule: POINTS_RULE,
      extra_rules: '材料分析题须检查理论与材料是否结合，只背理论不扣材料记为「理论联系实际不足」。',
    },
  },
];

/** 自定义科目的默认判分策略（用户可在科目设置中调整） */
export const DEFAULT_CUSTOM_PROFILE: JudgeProfile = {
  strictness: 'answer',
  formula_format: 'plain',
  has_subjective: true,
  error_types: ['知识性错误', '理解偏差', '表达不规范', '计算错误', '审题失误', '未作答'],
  subjective_rule: '主观题按要点覆盖度给分，在 analysis 中列出答到的要点与漏掉的要点。',
  extra_rules: '',
};

export interface SubjectRow {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  judge_profile: JudgeProfile;
  sort_order: number;
  is_system: boolean;
  created_at: string;
}

/** 解析 judge_profile（容错：缺字段时用自定义默认补全） */
export function parseJudgeProfile(raw: unknown): JudgeProfile {
  const base = { ...DEFAULT_CUSTOM_PROFILE };
  if (!raw || typeof raw !== 'object') return base;
  const p = raw as Record<string, unknown>;
  if (p.strictness === 'process' || p.strictness === 'answer' || p.strictness === 'points') {
    base.strictness = p.strictness;
  }
  if (p.formula_format === 'latex' || p.formula_format === 'plain') base.formula_format = p.formula_format;
  if (typeof p.has_subjective === 'boolean') base.has_subjective = p.has_subjective;
  if (Array.isArray(p.error_types)) {
    base.error_types = p.error_types.filter((t): t is string => typeof t === 'string' && t.length > 0);
  }
  if (typeof p.subjective_rule === 'string') base.subjective_rule = p.subjective_rule;
  if (typeof p.extra_rules === 'string') base.extra_rules = p.extra_rules;
  if (base.error_types.length === 0) base.error_types = DEFAULT_CUSTOM_PROFILE.error_types;
  return base;
}

/**
 * 确保用户拥有科目集合：首次访问时懒播种 9 个系统科目，
 * 并把该用户历史 mistakes/batches 中 subject_id 为空的行按科目名回填关联。
 * 返回该用户全部科目（按 sort_order, created_at 排序）。
 */
export async function ensureUserSubjects(client: SupabaseClient, userId: string): Promise<SubjectRow[]> {
  const { data: existing, error } = await client
    .from('subjects')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`读取科目失败: ${error.message}`);

  if (!existing || existing.length === 0) {
    const rows = SUBJECT_PRESETS.map((p, i) => ({
      user_id: userId,
      name: p.name,
      icon: p.icon,
      color: p.color,
      judge_profile: p.judge_profile,
      sort_order: i + 1,
      is_system: true,
    }));
    const { error: insertError } = await client.from('subjects').insert(rows);
    // 并发首次访问时可能唯一键冲突，忽略后重新读取即可
    if (insertError && !insertError.message.includes('duplicate')) {
      throw new Error(`初始化科目失败: ${insertError.message}`);
    }

    // 历史数据回填：把 subject_id 为空、但 subject 名称能匹配上的行关联到新科目
    const { data: seeded } = await client.from('subjects').select('id, name').eq('user_id', userId);
    for (const s of seeded ?? []) {
      await client
        .from('mistakes')
        .update({ subject_id: s.id })
        .eq('user_id', userId)
        .eq('subject', s.name)
        .is('subject_id', null);
      await client
        .from('batches')
        .update({ subject_id: s.id })
        .eq('user_id', userId)
        .eq('subject', s.name)
        .is('subject_id', null);
    }

    const { data: fresh, error: rereadError } = await client
      .from('subjects')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (rereadError) throw new Error(`读取科目失败: ${rereadError.message}`);
    return (fresh ?? []) as SubjectRow[];
  }

  return existing as SubjectRow[];
}
