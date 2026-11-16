# 错题集 Web 应用 — 项目上下文

移动端优先（375px+）的错题整理工具：拍照上传 → 多模态大模型批改 → 人工确认 → 错题归档 → 统计分析 → 抽题重练。

## 版本技术栈

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **UI**: shadcn/ui (`src/components/ui/`) + Tailwind CSS 4
- **数据库**: Supabase (Postgres)，SDK：`@supabase/supabase-js`，Drizzle 仅用于 schema 声明与迁移
- **对象存储**: `coze-coding-dev-sdk` 的 S3Storage（存题目原图）
- **大模型**: `coze-coding-dev-sdk` 的 LLMClient（多模态批改 + 练习判分 + 学习建议）
- **图表**: recharts ｜ **公式渲染**: katex

## 目录结构

```
src/
├── app/
│   ├── page.tsx                  # 首页 = 上传页（图片多选/压缩/科目年级/进度）
│   ├── login/page.tsx            # 登录/注册（邮箱+密码）
│   ├── review/[batchId]/page.tsx # 批改结果确认页（可编辑、改判、确认入库）
│   ├── mistakes/page.tsx         # 错题本列表（筛选/搜索/分页）
│   ├── mistakes/[id]/page.tsx    # 错题详情（原图放大/解析/已掌握/删除）
│   ├── stats/page.tsx            # 统计页（4 图表 + AI 流式建议）
│   ├── practice/page.tsx         # 练习模式（抽题/作答/判分/结果）
│   ├── profile/page.tsx          # 我的（账号信息/退出）
│   └── api/
│       ├── supabase-config/      # 下发前端 Supabase 配置（公开）
│       ├── subjects/             # 科目列表（service role 读）
│       ├── batches/              # POST 创建批次+图片上传 S3
│       ├── batches/[id]/         # GET 批次详情（含待确认题目+签名URL）
│       ├── batches/[id]/grade/   # POST 触发 AI 批改
│       ├── batches/[id]/confirm/ # POST 应用人工修正并确认入库
│       ├── mistakes/             # GET 列表（subject/status/kp/error_type/q/days/page）
│       ├── mistakes/[id]/        # GET/PATCH/DELETE
│       ├── stats/                # GET 聚合统计
│       ├── stats/advice/         # POST SSE 流式学习建议
│       ├── practice/             # POST 抽题（不含答案）
│       └── practice/submit/      # POST 判分+写 practice_sessions
├── components/
│   ├── app-shell.tsx             # 受保护页骨架（移动底部 tab / 桌面顶部导航）
│   ├── auth-guard.tsx            # 登录态守卫
│   ├── math-text.tsx             # KaTeX 混排渲染（$...$ / $$...$$）
│   └── ui/                       # shadcn 组件
├── lib/
│   ├── constants.ts              # 科目/年级/判定/错因 + SUBJECT_ICONS
│   ├── api.ts                    # apiFetch/apiJson（自动带 x-session）
│   ├── supabase-browser.ts       # 浏览器端 Supabase 客户端（懒加载，等 config）
│   ├── supabase-config-inject.tsx# SupabaseConfigProvider（挂载即取配置）
│   └── server/
│       ├── auth.ts               # getAuthContext：x-session → user + 带 RLS 的 client
│       ├── storage.ts            # S3Storage 封装（upload/signImageUrl）
│       ├── llm.ts                # gradeImages/judgePracticeAnswers/streamAdvice/buildAdvicePrompt
│       └── stats.ts              # computeStats（分页拉全量后应用层聚合）
└── storage/database/
    ├── supabase-client.ts        # getSupabaseClient(token?) 无 token=service role
    └── shared/schema.ts          # Drizzle schema（唯一表结构来源）
```

## 数据模型（schema.ts）

- `subjects`：id/name/icon/sort_order（9 个科目已种子；RLS 启用无策略，仅 service role 读）
- `batches`：id/user_id/subject/grade/image_keys(text[])/status(uploading|grading|done|failed)/raw_response/error_message
- `mistakes`：id/user_id/batch_id/subject/grade/source_image_key/question_index/question_text/student_answer/correct_answer/judgement(correct|wrong|partial|uncertain)/analysis/knowledge_points(text[])/error_type/confidence/status(pending_review|confirmed|mastered)/practice_count/practice_correct_count
- `practice_sessions`：id/user_id/subject/mistake_ids(text[])/correct_count/total/detail(jsonb)

**RLS**：三张用户表均为场景 D（`auth.uid() = user_id` 全策略）。后端一律经 `getAuthContext` 拿带 token 的 client 并显式 `.eq('user_id', ...)`，双重隔离。
**注意**：存储列保存的是对象存储 **key**（`image_keys`/`source_image_key`），读取时用 `signImageUrl` 生成签名 URL（有效期 1 小时），禁止把签名 URL 持久化。

## 核心流程约定

1. **上传**：前端 canvas 压缩（长边 1600px、JPEG 0.8、最多 9 张）→ `POST /api/batches`（multipart）→ `POST /api/batches/:id/grade`（同步等待，模型超时 5min）。
2. **批改**：`gradeImages` 主模型 `doubao-seed-2-0-pro-260215`，失败回退 `doubao-seed-2-0-lite-260215`，temperature 0.1，要求纯 JSON 输出；`extractJsonObject` 容错解析 + `normalizeQuestions` 归一化。结果写入 mistakes（status=pending_review，**含 correct 题**）。
3. **确认入库**：`POST confirm` 应用前端编辑 → 删除 judgement=correct 的行 → 其余置 confirmed。全部正确时返回 confirmed_count=0，前端给鼓励文案。
4. **错题本**：列表只展示 confirmed/mastered；facets（知识点/错因）用于筛选器选项。
5. **统计**：`computeStats` 分页拉取（防 1000 行截断）应用层聚合；建议走 SSE（`data: {content}` 增量，`data: [DONE]` 结束）。
6. **练习**：抽题不返回答案；提交后 `judgePracticeAnswers` 一次调用批量判分，回写 practice_count/practice_correct_count。

## 构建与测试命令

- 包管理：**仅 pnpm**
- 开发：`coze dev`（主仓预览常驻 5000 端口，HMR 自动生效）
- 静态检查：`pnpm ts-check` / `pnpm lint --quiet`
- 数据库迁移：`npx coze-coding-ai db upgrade`（改 schema.ts 后必跑）
- 模型回读：`npx coze-coding-ai db generate-models`

## 编码规范

- TypeScript strict 心智：禁止隐式 any/as any；API route 统一 `getAuthContext` 鉴权，401 用 `unauthorized()`，异常用 `serverError(e, '中文提示')`。
- Hydration：动态值（Date.now/Math.random/window）只在 client 组件 useEffect 后用；禁止非法嵌套。
- 前端调接口一律走 `apiFetch/apiJson`（自动处理 x-session 与未登录跳转）。
- 三方字体走 `globals.css` 顶部 `@import`（CN 用 fonts.googleapis.cn）；禁止 `<head>` 手写标签。
- 设计风格见 `DESIGN.md`：主色 teal（青绿）、错题信号色用柔化 rose/amber 而非刺眼大红、卡片式、触控目标 ≥44px。
