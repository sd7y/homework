// 全局常量：科目、年级、判定、错因
import {
  Atom,
  BookOpen,
  FlaskConical,
  Globe,
  Landmark,
  Languages,
  Leaf,
  Scale,
  Sigma,
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
};

export function iconByName(name: string | null | undefined): LucideIcon {
  if (!name) return BookOpen;
  return SUBJECT_ICONS[name] ?? BookOpen;
}

export const SUBJECTS = [
  '数学',
  '语文',
  '英语',
  '物理',
  '化学',
  '生物',
  '历史',
  '地理',
  '政治',
] as const;

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

export const ERROR_TYPES = [
  '概念不清',
  '计算错误',
  '审题偏差',
  '方法不会',
  '粗心大意',
  '表达不规范',
  '知识遗忘',
  '其他',
] as const;

export const MAX_UPLOAD_IMAGES = 9;

// 图片压缩参数：长边 1600px，JPEG 质量 0.8
export const IMAGE_MAX_EDGE = 1600;
export const IMAGE_JPEG_QUALITY = 0.8;
