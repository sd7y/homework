// 全局常量：年级、判定、图片压缩参数、科目图标与颜色选择器
import {
  Atom,
  BookOpen,
  Brain,
  Calculator,
  Code,
  FlaskConical,
  Globe,
  Landmark,
  Languages,
  Leaf,
  Lightbulb,
  Microscope,
  Music,
  NotebookPen,
  Palette,
  Pencil,
  Puzzle,
  Rocket,
  Scale,
  Sigma,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

/** 科目图标名（与 subjects 表 icon 字段对应）→ Lucide 组件 */
export const SUBJECT_ICONS: Record<string, LucideIcon> = {
  sigma: Sigma,
  'book-open': BookOpen,
  languages: Languages,
  atom: Atom,
  'flask-conical': FlaskConical,
  leaf: Leaf,
  landmark: Landmark,
  globe: Globe,
  scale: Scale,
  'notebook-pen': NotebookPen,
  code: Code,
  calculator: Calculator,
  brain: Brain,
  microscope: Microscope,
  music: Music,
  palette: Palette,
  pencil: Pencil,
  puzzle: Puzzle,
  rocket: Rocket,
  trophy: Trophy,
  lightbulb: Lightbulb,
  sparkles: Sparkles,
};

export function iconByName(name: string | null | undefined): LucideIcon {
  if (!name) return BookOpen;
  return SUBJECT_ICONS[name] ?? BookOpen;
}

/** 自定义科目图标选择器的可选项 */
export const SUBJECT_ICON_CHOICES: string[] = [
  'notebook-pen',
  'code',
  'calculator',
  'brain',
  'microscope',
  'music',
  'palette',
  'pencil',
  'puzzle',
  'rocket',
  'trophy',
  'lightbulb',
  'sparkles',
  'globe',
  'languages',
  'book-open',
];

/** 科目颜色选择器的可选色板（低饱和、适合教育的色调） */
export const SUBJECT_COLORS: string[] = [
  '#0d9488', // teal
  '#0284c7', // sky
  '#7c3aed', // violet
  '#059669', // emerald
  '#16a34a', // green
  '#d97706', // amber
  '#ea580c', // orange
  '#e11d48', // rose
  '#0891b2', // cyan
  '#4f46e5', // indigo
  '#65a30d', // lime
  '#c026d3', // fuchsia
];

export const GRADES = [
  '小学一年级',
  '小学二年级',
  '小学三年级',
  '小学四年级',
  '小学五年级',
  '小学六年级',
  '初中一年级',
  '初中二年级',
  '初中三年级',
  '高中一年级',
  '高中二年级',
  '高中三年级',
] as const;

export type Judgement = 'correct' | 'wrong' | 'partial' | 'uncertain';

export const JUDGEMENT_META: Record<
  Judgement,
  { label: string; badgeClass: string; dotClass: string }
> = {
  correct: {
    label: '正确',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  wrong: {
    label: '错误',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClass: 'bg-rose-500',
  },
  partial: {
    label: '部分正确',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  uncertain: {
    label: '待确认',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    dotClass: 'bg-sky-500',
  },
};

/** 严格度选项的展示文案（科目设置用） */
export const STRICTNESS_META: Record<
  JudgeProfile['strictness'],
  { label: string; description: string }
> = {
  process: { label: '重过程', description: '逐步核对推导过程，跳步会指出' },
  answer: { label: '看答案', description: '以最终答案对错为准' },
  points: { label: '采分点', description: '按要点覆盖度给分' },
};

export const MAX_UPLOAD_IMAGES = 9;

// 图片压缩参数：长边 1600px，JPEG 质量 0.8
export const IMAGE_MAX_EDGE = 1600;
export const IMAGE_JPEG_QUALITY = 0.8;

/** 科目批改策略配置（subjects 表 judge_profile jsonb 的结构约定，前后端共享） */
export interface JudgeProfile {
  /** 判分严格度：process=重推导过程 / answer=只看最终答案 / points=按采分点覆盖度 */
  strictness: 'process' | 'answer' | 'points';
  /** 公式输出格式：latex | plain */
  formula_format: 'latex' | 'plain';
  /** 是否包含主观题 */
  has_subjective: boolean;
  /** 错因枚举（批改时强约束模型只能从中选择） */
  error_types: string[];
  /** 主观题评分规则（无主观题的科目为空字符串） */
  subjective_rule: string;
  /** 科目附加判分规则 */
  extra_rules: string;
}

/** 前端共享的科目类型（GET /api/subjects 返回结构） */
export interface SubjectInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  judge_profile: JudgeProfile;
  sort_order: number;
  is_system: boolean;
  mistake_count: number;
}
