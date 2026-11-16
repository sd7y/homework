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
│   ├── stats/page.tsx            # 统计页（全科目对比 + 单科目详情 + AI 流式建议）
│   ├── practice/page.tsx         # 练习模式（先选科目→知识点→抽题/作答/判分）
│   ├── subjects/page.tsx         # 科目管理（新增/编辑/排序/删除转移/严格程度调整）
│   ├── profile/page.tsx          # 我的（账号信息/科目管理入口/退出）
│   └── api/
│       ├── supabase-config/      # 下发前端 Supabase 配置（公开）
│       ├── subjects/             # GET 用户科目（懒播种+错题计数）/ POST 新增自定义
│       ├── subjects/[id]/        # PATCH 编辑 / DELETE 删除（409+transfer_to 转移）
│       ├── subjects/reorder/     # POST 排序（ordered_ids）
│       ├── batches/              # POST 创建批次+图片上传 S3（subject_id 必选）
│       ├── batches/[id]/         # GET 批次详情（含待确认题目+签名URL）
│       ├── batches/[id]/grade/   # POST 触发 AI 批改
│       ├── batches/[id]/confirm/ # POST 应用人工修正并确认入库
│       ├── mistakes/             # GET 列表（subject_id/status/kp/error_type/q/days/page）
│       ├── mistakes/[id]/        # GET/PATCH/DELETE
│       ├── stats/                # GET 聚合统计（无参=全科目对比；?subject_id=单科目详情）
│       ├── stats/advice/         # POST SSE 流式学习建议（body 可带 subject_id）
│       ├── practice/             # POST 抽题（subject_id 必选，不含答案）
│       └── practice/submit/      # POST 判分+写 practice_sessions
├── components/
│   ├── app-shell.tsx             # 受保护页骨架（移动底部 tab / 桌面顶部导航）
│   ├── auth-guard.tsx            # 登录态守卫
│   ├── math-text.tsx             # KaTeX 混排渲染（$...$ / $$...$$）
│   └── ui/                       # shadcn 组件
├── lib/
│   ├── constants.ts              # 年级/判定/科目图标映射/SUBJECT_COLORS/STRICTNESS_META
│   ├── api.ts                    # apiFetch/apiJson（自动带 x-session）
│   ├── supabase-browser.ts       # 浏览器端 Supabase 客户端（懒加载，等 config）
│   ├── supabase-config-inject.tsx# SupabaseConfigProvider（挂载即取配置）
│   └── server/
│       ├── auth.ts               # getAuthContext：x-session → user + 带 RLS 的 client
│       ├── storage.ts            # S3Storage 封装（upload/signImageUrl）
│       ├── subjects.ts           # SUBJECT_PRESETS/ensureUserSubjects 懒播种+回填/parseJudgeProfile
│       ├── llm.ts                # gradeImages(按judge_profile组prompt)/judgePracticeAnswers/streamAdvice
│       └── stats.ts              # computeStats/computeSubjectComparison（分页拉全量后聚合）
└── storage/database/
    ├── supabase-client.ts        # getSupabaseClient(token?) 无 token=service role
    └── shared/schema.ts          # Drizzle schema（唯一表结构来源）
```

## 数据模型（schema.ts）

- `subjects`：id(uuid)/user_id/name/icon/color/judge_profile(jsonb)/sort_order/is_system/created_at；唯一键 (user_id, name)。9 个系统科目由 `ensureUserSubjects` 首次访问时按用户懒播种（is_system=true 不可删除）；用户可增删自定义科目
- `batches`：id/user_id/**subject_id**/subject(名称冗余)/grade/image_keys(text[])/status(uploading|grading|done|failed)/raw_response/error_message
- `mistakes`：id/user_id/batch_id/**subject_id**/subject(名称冗余)/grade/source_image_key/question_index/question_text/student_answer/correct_answer/judgement(correct|wrong|partial|uncertain)/analysis/knowledge_points(text[])/error_type/confidence/status(pending_review|confirmed|mastered)/practice_count/practice_correct_count
- `practice_sessions`：id/user_id/subject/mistake_ids(text[])/correct_count/total/detail(jsonb)

**RLS**：四张表均为场景 D（`auth.uid() = user_id` 全策略）。后端一律经 `getAuthContext` 拿带 token 的 client 并显式 `.eq('user_id', ...)`，双重隔离。
**注意**：存储列保存的是对象存储 **key**（`image_keys`/`source_image_key`），读取时用 `signImageUrl` 生成签名 URL（有效期 1 小时），禁止把签名 URL 持久化。

## 科目批改策略（judge_profile）

- 字段：`strictness(process|answer|points)`、`formula_format(latex|plain)`、`has_subjective`、`error_types(string[])`、`subjective_rule`、`extra_rules`
- 预置：数学/物理=process（跳步必纠）；化学=process+方程式配平校验；英语=answer（拼写/用词分开标注，作文三维评语）；语文=客观题严判+阅读按采分点+作文只给评语；生物/历史/地理/政治=points（按要点覆盖度给分）
- 批改时 `gradeImages` 按科目 judge_profile 拼装 system prompt；`error_types` 作为**强约束枚举**传给模型，禁止自由发挥错因；用户可在科目管理页调整严格程度
- 解析容错：`parseJudgeProfile` 缺字段时回落到 `DEFAULT_CUSTOM_PROFILE`

## 核心流程约定

1. **上传**：前端 canvas 压缩（长边 1600px、JPEG 0.8、最多 9 张）→ `POST /api/batches`（multipart，subject_id 必选，服务端冗余 subject 名称）→ `POST /api/batches/:id/grade`（同步等待，模型超时 5min）。
2. **批改**：`gradeImages` 主模型 `doubao-seed-2-0-pro-260215`，失败回退 `doubao-seed-2-0-lite-260215`，temperature 0.1，要求纯 JSON 输出；`extractJsonObject` 容错解析 + `normalizeQuestions` 归一化。结果写入 mistakes（status=pending_review，**含 correct 题**）。
3. **确认入库**：`POST confirm` 应用前端编辑 → 删除 judgement=correct 的行 → 其余置 confirmed。全部正确时返回 confirmed_count=0，前端给鼓励文案。
4. **错题本**：列表只展示 confirmed/mastered；顶部科目 Tab（角标=该科目错题数）；facets（知识点/错因）用于筛选器选项。
5. **统计**：无参=全科目对比（bySubject）；`?subject_id=`=单科目详情；建议走 SSE（`data: {content}` 增量，`data: [DONE]` 结束），body 可带 subject_id 生成科目级建议。
6. **练习**：抽题必须带 subject_id；不返回答案；提交后 `judgePracticeAnswers` 一次调用批量判分，回写 practice_count/practice_correct_count。
7. **科目管理**：删除有错题的自定义科目返回 409+mistake_count，前端二次确认后带 `?transfer_to=` 重试（错题/批次转移至目标科目），禁止静默删数据；系统科目（is_system=true）禁止删除/改名。

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
