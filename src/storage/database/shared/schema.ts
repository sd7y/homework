import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  index,
  uuid,
} from "drizzle-orm/pg-core";

// 系统健康检查表（勿删）
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
});

// 科目字典表（公共数据，后端 service role 读取）
export const subjects = pgTable("subjects", {
  id: serial().primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  icon: varchar("icon", { length: 64 }).notNull().default("book-open"),
  sort_order: integer("sort_order").notNull().default(0),
});

// 批改批次：一次上传（可多张图）对应一个批次
// 注意：按对象存储最佳实践，图片持久化存储 key，读取时动态生成签名 URL
export const batches = pgTable(
  "batches",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
    subject: varchar("subject", { length: 64 }).notNull(),
    grade: varchar("grade", { length: 32 }).notNull(),
    image_keys: text("image_keys").array().notNull().default(sql`'{}'::text[]`),
    // uploading | grading | done | failed
    status: varchar("status", { length: 20 }).notNull().default("uploading"),
    raw_response: jsonb("raw_response"),
    error_message: text("error_message"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("batches_user_id_idx").on(table.user_id),
    index("batches_user_status_idx").on(table.user_id, table.status),
    index("batches_created_at_idx").on(table.created_at),
  ],
);

// 错题表：AI 批改产物（pending_review）→ 人工确认入库（confirmed）→ 已掌握（mastered）
export const mistakes = pgTable(
  "mistakes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
    batch_id: uuid("batch_id").references(() => batches.id, { onDelete: "set null" }),
    subject: varchar("subject", { length: 64 }).notNull(),
    grade: varchar("grade", { length: 32 }),
    source_image_key: text("source_image_key"),
    question_index: integer("question_index").notNull().default(1),
    // 题干，公式使用 LaTeX（$...$ 行内 / $$...$$ 块级）
    question_text: text("question_text").notNull().default(""),
    student_answer: text("student_answer").notNull().default(""),
    correct_answer: text("correct_answer").notNull().default(""),
    // correct | wrong | partial | uncertain
    judgement: varchar("judgement", { length: 20 }).notNull().default("uncertain"),
    // 分步解析（Markdown + LaTeX）
    analysis: text("analysis").notNull().default(""),
    knowledge_points: text("knowledge_points").array().notNull().default(sql`'{}'::text[]`),
    error_type: varchar("error_type", { length: 64 }).notNull().default(""),
    confidence: real("confidence"),
    // pending_review | confirmed | mastered
    status: varchar("status", { length: 20 }).notNull().default("pending_review"),
    practice_count: integer("practice_count").notNull().default(0),
    practice_correct_count: integer("practice_correct_count").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("mistakes_user_id_idx").on(table.user_id),
    index("mistakes_batch_id_idx").on(table.batch_id),
    index("mistakes_user_status_idx").on(table.user_id, table.status),
    index("mistakes_user_subject_idx").on(table.user_id, table.subject),
    index("mistakes_user_created_idx").on(table.user_id, table.created_at),
  ],
);

// 练习记录：一次抽题重做对应一条记录
export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
    subject: varchar("subject", { length: 64 }),
    knowledge_point: varchar("knowledge_point", { length: 128 }),
    mistake_ids: text("mistake_ids").array().notNull().default(sql`'{}'::text[]`),
    correct_count: integer("correct_count").notNull().default(0),
    total: integer("total").notNull().default(0),
    // 逐题结果明细 [{ mistake_id, user_answer, is_correct }]
    detail: jsonb("detail"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("practice_sessions_user_id_idx").on(table.user_id),
    index("practice_sessions_user_created_idx").on(table.user_id, table.created_at),
  ],
);
