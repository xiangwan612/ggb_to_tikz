# ggb_ai 项目地图

> 最后更新：2026-09-16
> 用途：给半年后重新回到这个项目的自己（以及任何接手的人）一份"从哪进、改哪里"的索引。

---

## 1. 一句话概览

这是一个 **"GeoGebra 作图 → TikZ 代码"的 AI 辅助工具**，面向高中数学题型：

1. 左边用自然语言（常常直接粘贴 LaTeX 题干）让 LLM 生成 GeoGebra 指令；
2. 右边的原生 GeoGebra 画板实时执行这些指令，形成可交互的图形；
3. 把画板内容解析成结构化数据，再生成可直接放进 LaTeX 讲义的 TikZ 代码；
4. TikZ 代码可以网页内编译预览（本地 pdflatex）并导出矢量 PDF。

同时配套一个 Fastify 后端，负责 **LLM 代理（BYOK / 平台额度）**、**账号与云端设置同步**、**TikZ 本地编译**。

---

## 2. 顶层目录

```
ggb_ai/
├── MAP.md                      ← 本文档
├── README.md                   ← 简版说明
├── 启动项目.command            ← 双击启动前后端的 macOS 脚本
├── react-app/                  ← 前端主工程（React + Vite）
│   ├── src/                    ← 源码（见 §4）
│   ├── public/                 ← 静态资源 + GGB/TikZ 转译引擎（见 §5）
│   ├── dist/                   ← 构建产物（GitHub Pages 用）
│   ├── docs/                   ← 迁移计划 / BYOK 上线清单
│   ├── index.html
│   └── vite.config.js          ← 端口、base、/api 代理
├── server/                     ← 后端主工程（Fastify + Prisma）
│   ├── src/                    ← 路由与业务逻辑（见 §6）
│   ├── prisma/                 ← SQLite schema 与 dev.db
│   └── .env                    ← 本地配置（不入库）
├── docs/                       ← 项目文档
│   ├── DEBUG_GUIDE.md          ← GGB 解析器语义与排查指南
│   ├── TIKZ_DEBUG_GUIDE.md     ← TikZ 调试器使用指南
│   └── PRD_AUTH_SETTINGS.md    ← 账号 + 云端设置同步 PRD
├── .github/workflows/          ← GitHub Pages 自动部署
├── output/ .playwright-cli/    ← 历史调试产物（可忽略/可删）
└── LICENSE
```

> **注意**：`legacy/` 目录（旧版纯 HTML/JS 全功能页面）在最近一次提交里被归档，但**当前工作区里已经被删除**（未提交的删除）。如果哪天需要参考旧实现，可以用 `git show 1f68115:legacy/old-web/index.html` 找回。

---

## 3. 怎么跑起来

### 3.1 一键启动（推荐）

双击根目录 **`启动项目.command`**：

- 自动检查 `node_modules`，缺失则 `npm install`
- 启动后端 `node --watch src/index.js` → `http://127.0.0.1:8787`
- 启动前端 vite → `http://127.0.0.1:5180`
- 等待两个端口就绪后自动打开浏览器

> **端口约定**：前端固定 **5180**，后端固定 **8787**。
> 不要改回 vite 的默认 5173 —— 本机另一个项目（`Desktop/题库项目2.0`）占用 5173/5174，历史上正是因为端口冲突，双击启动脚本后浏览器打开的是那个项目。

### 3.2 手动启动

```bash
# 后端
cd server && npm install && npm run dev

# 前端（另开一个终端）
cd react-app && npm install && npm run dev
```

### 3.3 依赖与前置条件

| 依赖 | 用途 | 缺失时的表现 |
|---|---|---|
| Node.js ≥ 18 | 前后端运行时 | 脚本直接报错退出 |
| `pdflatex`（MacTeX） | TikZ 网页内编译预览 | 后端返回 503，前端自动回退到 TikZJax |
| `sips`（macOS 自带） | PDF 转 PNG 预览图 | 同上 |
| `osascript`（macOS 自带） | 把矢量 PDF 写进系统剪贴板 | 「复制 PDF」按钮失败，另存仍可用 |

---

## 4. 前端结构（`react-app/src/`）

整个前端只有 **两个大组件**，没有路由、没有状态管理库、没有 TypeScript。

### 4.1 `App.jsx`（79 行）— 布局壳

左右分栏 + 可拖动分隔条。

- 状态：`boardType`（`'2d' | '3d'`，存 `ggb_board_type`）、`leftPercent`（左栏宽度，存 `ggb_split_left_percent`，范围 38–78，默认 62）
- 持有 GGB 画板 API 句柄 `ggbApi` / `ggbReady`，由 `NativeBoard` 通过 `onReadyChange` 回调上抛，再作为 props 传给 `CommandPanel`
- **数据流是"右 → 左"单向的**：右侧画板把 API 交给左侧命令面板使用

### 4.2 `CommandPanel.jsx`（约 3060 行）— 左栏：对话 + 命令 + 全部设置

职责非常重，是项目里改动最频繁的文件。

**UI 三大块：**
1. **对话框**：消息气泡、粘贴图片输入、流式输出（显示模型名 / 阶段 / 已用秒数）、发送 / 停止生成 / 清空
2. **命令编辑区**：AI 输出会自动追加到这里，可手动编辑，带 GeoGebra 命令自动补全；按钮：复制 / 清空画板 / 清空代码 / 执行
3. **设置弹窗**：账号与云同步、API 配置（服务商/模型/Key）、AI 提示词、画布显示、AI 对话（上下文记忆）、导出设置、BYOK 发布自查清单

**关键流程：**

| 流程 | 入口函数 | 说明 |
|---|---|---|
| 发送对话 | `sendMessage` | 组装 system prompt + 历史 + 用户消息 → `requestWithFallbackStream` → 流式渲染 → 成功后把结果追加到命令编辑器 |
| 停止生成 | `stopGenerating` | 通过 `AbortController` 中断流式请求 |
| 执行命令到画板 | `executeCommandsToBoard` | 逐行 `ggbApi.evalCommand`，执行前做白名单校验 |
| 清空画板 | `clearBoard` / `clearBoardObjects` | 保留 `xAxis/yAxis/zAxis/xOyPlane`，删除其余对象 |
| 加载模型列表 | `loadModels` | `POST /api/models`，失败回退到内置默认模型 |
| 提示词管理 | `openPromptEditor` / `savePromptConfig` | 支持 `{{CURRENT_OBJECTS}}`、`{{USER_INPUT}}` 变量 |
| 账号 | `loginByPassword` / `requestEmailCode` / `loginByEmailCode` | JWT 存 localStorage |
| 云同步 | `pullCloudSettings` / `pushCloudSettings` | 900ms 防抖自动保存；云端的 `ggb_tikz_*` 设置通过自定义事件下发给画板 |

**两个设计约定，改代码时要知道：**

- **白名单机制**：2D / 3D 各有一套允许执行的 GeoGebra 命令集合，`strictWhitelist` 开启时非法命令直接拦截，关闭时只提示不拦截。白名单集中在 `CommandPanel.jsx` 前半部分（`GGB_ALLOWED_COMMANDS_2D/3D`）。提示词 `public/prompts/default-prompt.txt` 里也写了同一份白名单，**两边要保持同步**。
- **跨组件通信**：`CommandPanel` 与 `NativeBoard` 之间用自定义事件 `ggb:tikz-settings-updated` + `ggb_tikz_*` 前缀的 localStorage 键通信。设置从云恢复后，左侧派发事件，右侧重新读取 localStorage 并刷新 TikZ 参数。

**已知技术债（不影响使用，但别被误导）：**
- `buildSystemPrompt` 里 `{{CURRENT_OBJECTS}}` 被硬编码成"（画布为空）"，**LLM 实际上看不到当前画板内容**，虽然提示词里写了这个变量。
- `validateCommands`（2085 行附近）和 `readCommandsFromLegacyBoard` 是定义了但没接到 UI 上的死代码。
- 非流式回退路径 `requestWithFallback` 没有传 `signal`，"停止生成"对它无效。
- `executeCommandsToBoard` 只按"没抛异常"判定成功，没有检查 `evalCommand` 的布尔返回值。

### 4.3 `NativeBoard.jsx`（约 4116 行）— 右栏：原生画板 + TikZ 调试器

**画板初始化：**
- 从 CDN 加载 `https://www.geogebra.org/apps/deployggb.js`，再 `new window.GGBApplet(params, true).inject(host)`
- **2D 用的是 GeoGebra `geometry` app，3D 用的是 `3d` app**（不是 graphing/classic）
- 切换 2D/3D 会**整体销毁并重建 applet**（初始化 effect 的依赖里有 `boardType`）
- applet 参数：显示工具栏、代数输入、菜单栏、右键、撤销重做，语言 `zh`
- 就绪后通过 `onReadyChange(api, true)` 把**原生 API 对象**（没有任何包装）交给父组件
- 用 `ResizeObserver` + window resize 同步 applet 尺寸

**用到的 GeoGebra API：** `evalCommand`、`getXML`、`setXML`、`setXMLBase64`、`getAllObjectNames`、`getObjectType`、`deleteObject`、`reset`、`setAxesVisible`、`setAxisVisible`、`setVisible`、`setFilling`、`setGridVisible`、`stopAnimation`、`getPNGBase64`、`setSize`。
**没有注册任何 applet 事件监听**（无 `registerUpdateListener` 等），所以画板上的手动修改不会回流到 React。

**功能入口（顶部按钮）：** 清空画板 / 画板元素 / 导出图片 / TikZ 调试 / 导出 TikZ。

**TikZ 调试器**（可拖动浮窗）：
- 左：TikZ 代码编辑框；右：编译预览（本地 LaTeX 优先，TikZJax 回退）
- 「转译偏好」弹窗：缩放与画幅、标签与角度、3D 转译偏好（仅 3D 模式）、TikZ 导出样式
- 「标签微调」「线/面微调」两组内联微调面板，改动带防抖后自动重新编译
- 「导出矢量图」：把编译出的 PDF 复制到剪贴板，或另存为 PDF
- 「AI优化」按钮目前是**空壳**，只改状态文字，没接任何逻辑

**TikZ 后处理（这个文件的精华所在）**，从 `getXML()` 拿到代码后做一整套数值优化：
- `computeOptimizedAxisBounds` / `selectSymmetricAxisBounds`：算包围盒、保证原点可见、按对称性择优取坐标轴范围
- `replaceAxisAndOrigin`：删掉生成器画的坐标轴并重建标准样式
- `alignFunctionDomainsToClip`：把函数 `domain` 对齐到 clip 范围；对 `tan/ln/log/sqrt/asin/acos` 或含除法的表达式保守处理，避免错误连线
- `optimizePointLabels`：贪心法放置点标签，8 个候选方位，按重叠 / 邻近 / 离心方向打分
- `applyGlobalTikzStyleOverrides` 等：应用线宽、颜色、点半径、填充等样式覆盖

**3D 专有逻辑：**
- `apply3DEntryPresetWithRetry`：反复尝试把 applet XML 打补丁到固定的默认视角（方位角 32°、仰角 64°、scale 55.3），最多重试 4 次
- `read3DProjectionFromXml`：从 XML 反推方位角与深度系数，用于 TikZ 投影
- `apply3DDisplayVisibility`：坐标系 / 平面 / 网格 / 自动旋转的显隐控制（自动旋转靠 `SetSpinSpeed`，关闭时还会调 `stopAnimation` 强制停）

### 4.4 `src/lib/` — 薄封装层

| 文件 | 内容 |
|---|---|
| `llm.js`（361 行） | 所有 HTTP 调用的唯一出口。`requestWithFallbackStream`（NDJSON 流式）、`requestWithFallback`（非流式）、`fetchModelsViaServer`，以及鉴权与云设置的 API 封装。客户端标识 `x-client-id` 存 `ggb_client_id`。`API_BASE` 来自 `VITE_API_BASE_URL`，默认空 = 走同源（开发时由 vite 代理转发） |
| `providers.js` | 内置服务商（当前只有 **DeepSeek**）的 baseUrl 与默认模型；自定义服务商存 `ggb_custom_providers` |
| `ggbCompletions.js`（38 行） | GeoGebra 命令自动补全词表 + 前缀搜索 |

---

## 5. 转译引擎（`react-app/public/` 下的 4 个独立脚本）

这四个文件是**独立的 ES5 风格类**，通过 `<script>` 标签注入，挂在 window 上，**不走打包**。这样做是为了保留旧版直接复用能力，代价是没有类型/模块化。

```
GeoGebra getXML()
      │
      ├─ 2D: window.GGBParser      → structured（points/functions/segments/polygons/vectors/lines/rays/angles/conics/conicparts）
      │                              + semantics（commandGraph/pointRelations/derivedPoints/lineRelations/conicRelations/unresolved）
      │      → window.TikZGenerator → TikZ 代码
      │
      └─ 3D: window.GGB3DParser    → structured（points3d/segments3d/lines3d/planes3d/polyhedra3d/cylinders3d/cones3d/spheres3d ...）
             → window.TikZ3DGenerator → 3D TikZ 代码（exam / round / azimuth 三种投影预设）
```

**核心设计原则（摘自 `docs/DEBUG_GUIDE.md`）："语义保留 + 坐标落地"**
- 解析器不只输出坐标，还输出**命令依赖图**和**几何关系**（切线切点、垂线垂足、交点是第几个解）
- 派生点（切点、垂足）在**解析阶段就算好坐标**，TikZ 层只负责画，不再求交
- 无法解析的对象进 `semantics.unresolved[]`，这是排查的首选入口

**建图规范（决定转译成功率，务必遵守）：**
1. 关键点显式命名创建：`P = Intersect(l, c, 1)`
2. 后续要引用的点必须有标签/名字
3. 不要只依赖视觉构造结果，要有对应命令对象
4. 多用约定结构：交点、切线、角平分线、垂线、中点、内心、外心、垂心

**提示词**：`react-app/public/prompts/default-prompt.txt`（147 行）是默认的 system prompt，规定了输出格式、白名单、`Intersect` 取点去重规则等硬约束，和 `CommandPanel` 的白名单一一对应。

---

## 6. 后端结构（`server/src/`）

Fastify 4 + Prisma 5 + SQLite。默认监听 `0.0.0.0:8787`。

### 6.1 `index.js`（593 行）— 应用主体

注册 CORS、JWT，挂载鉴权装饰器 `app.authenticate`，然后：

| 路由 | 说明 |
|---|---|
| `GET /api/health` | 健康检查，返回 `service: 'ggb-ai-server'` |
| `POST /api/models` | 模型列表代理（GET 上游 `/models`） |
| `POST /api/chat/stream` | **流式对话代理**，返回 NDJSON |
| `POST /api/chat` | 非流式对话代理（流式失败时的回退） |

**流式协议（NDJSON，每行一个 JSON）：**

| type | 含义 |
|---|---|
| `meta` | 已连接，带上游通道、密钥来源、配额 |
| `phase` | 阶段提示：`fallback`（切换备用通道）/ `generating`（开始出字） |
| `delta` | 增量文本 |
| `done` | 结束，带完整内容与最终统计 |
| `error` | 失败 |

**密钥解析优先级**（`providers.js` 的 `resolveApiKey`）：请求体里的 BYOK key > 登录用户云端加密存储的 key > 平台环境变量 key。返回的 `source` 字段标明走的是 `user` 还是 `platform`。

**平台额度**（`quota.js`）：按 `x-client-id` 每天限 `PLATFORM_DAILY_LIMIT`（默认 30）次，**仅对平台 key 生效**，内存 Map 计数，进程重启即清零。

**上游适配**（`llmProxy.js`）：统一走 OpenAI 兼容的 `/chat/completions`。主通道成功但无输出时，会自动尝试下一个通道并给前端发 `phase: fallback`（当前只配置了一个通道，所以这条路径实际不会触发，但框架保留）。

### 6.2 `authRoutes.js`（876 行）— 账号体系

| 路由 | 鉴权 |
|---|---|
| `POST /api/auth/register` / `POST /api/auth/login` | 否 |
| `POST /api/auth/email/request-code` / `POST /api/auth/email/login` | 否（邮箱验证码登录） |
| `GET /api/me` / `PUT /api/me/profile` | 是 |
| `POST /api/auth/password/set` | 是（微信注册用户补设密码） |
| `GET /api/settings` / `PUT /api/settings` | 是（整包设置 JSON） |
| `GET /api/settings/api-keys` | 是（只回传 provider 列表，不回传明文） |
| `PUT/DELETE /api/settings/api-keys/:providerKey` | 是 |
| `GET /api/settings/api-keys/:providerKey/test` | 是 |
| `POST /api/auth/wechat/mock-login` | 否，**需 `WECHAT_MOCK_ENABLED=true`**，本地测试用 |
| `GET /api/auth/wechat/login-url` / `POST /api/auth/wechat/code-login` | 否，需配置 `WECHAT_APP_ID` / `WECHAT_REDIRECT_URI` |

- 密码用 bcrypt 哈希
- API Key 用 AES-256-GCM 加密后入库（`crypto.js`，密钥来自 `API_KEY_ENCRYPTION_SECRET`）
- 邮箱验证码：`EMAIL_CODE_DEV_MODE=true` 时直接把验证码回给前端，方便本地调试；生产必须关掉
- 邮箱发送走 `emailSender.js`（nodemailer），SMTP 未配置时降级为只打日志

### 6.3 `tikzPreview.js`（165 行）— TikZ 本地编译

- `POST /api/tikz/compile`：把前端传来的 TikZ 代码包成 `standalone` 文档 → `pdflatex -no-shell-escape` 编译 → `sips` 转 PNG，返回 PNG 与 PDF 两个 data URL
- **安全防护**：拒绝含 `\input` / `\include` / `\write` / `\usepackage` / `\directlua` 等文件与文档级命令的代码；限制 20 万字符；20 秒超时；临时目录编译完即删
- LaTeX 未安装时返回 503，前端自动回退 TikZJax 在线渲染
- `POST /api/tikz/copy-pdf`：通过 `osascript` 调 AppKit 把 PDF 写进 macOS 系统剪贴板（只能整段粘贴，不能局部取用）

### 6.4 数据模型（`prisma/schema.prisma`）

SQLite，5 张表：`User`、`UserPassword`、`UserWechatIdentity`、`UserSettings`（`settingsJson` 存整包）、`UserApiKey`（`@@unique([userId, providerKey])`，存加密后的 key）、`EmailLoginCode`（验证码哈希 + 过期 + 尝试次数）。

数据库文件：`server/prisma/dev.db`（已 gitignore）。

---

## 7. 前端本地存储（localStorage 键位表）

改设置相关代码时对照这张表，**云同步会整包 round-trip 所有 `ggb_tikz_*` 前缀的键**。

| 前缀 | 内容 |
|---|---|
| `ggb_api_provider` / `ggb_api_model` / `ggb_provider_keys` | 当前服务商、模型、各服务商 API Key |
| `ggb_custom_providers` | 自定义服务商定义 |
| `ggb_prompt_configs` / `ggb_active_prompt` | 提示词配置与当前选中 |
| `ggb_board_type` / `ggb_split_left_percent` | 布局（App.jsx） |
| `ggb_show_axes` / `ggb_show_grid` | 2D 显示 |
| `ggb_3d_show_axes` / `ggb_3d_show_grid` / `ggb_3d_show_plane` / `ggb_3d_auto_rotate` / `ggb_3d_spin_speed` | 3D 显示 |
| `ggb_context_memory` / `ggb_max_history` / `ggb_strict_whitelist` | 对话与校验行为 |
| `ggb_ui_font` / `ggb_ui_font_size` | 界面字体 |
| `ggb_export_image_mode` / `ggb_export_scale` | 图片导出 |
| `ggb_tikz_*` | TikZ 全部样式与优化参数（约 40 个键，见 `NativeBoard.jsx` 顶部常量表） |
| `ggb_tikz_label_overrides` | 标签位置手动覆盖（JSON） |
| `ggb_tikz3d_*` | 3D 投影参数（方位角 / 深度 / 投影预设 / 是否显示点标签） |
| `ggb_auth_token` / `ggb_auth_user` / `ggb_client_id` | 登录态与客户端标识 |

### 7.1 API Key 放在哪（重要）

内置服务商目前**只有 DeepSeek**。密钥有两条存放路径，**两者都在本地，都不会进 Git**：

| 方式 | 位置 | 谁用 | 是否入库 |
|---|---|---|---|
| **用户自带 Key（BYOK）** | 浏览器 `localStorage` 的 `ggb_provider_keys` | 每个用户自己的浏览器 | 否，localStorage 不属于文件系统 |
| **平台 Key** | `server/.env` 的 `PLATFORM_DEEPSEEK_API_KEY` | 服务端统一调用，按 `PLATFORM_DAILY_LIMIT` 限流 | 否，`.env` 已被 `.gitignore` 忽略 |

解析优先级在 `server/src/providers.js` 的 `resolveApiKey`：**请求里的 BYOK > 登录用户云端加密存储的 Key > 平台的 Key**，返回的 `source` 字段标明实际走了哪一条。

设置面板里对 Key 的三个操作（改 / 删 / 上传云端）都在 `CommandPanel.jsx` 的「API 配置」区：

- **改**：直接改输入框 → 存进 `ggb_provider_keys`
- **删**：删除当前云端 Key（`DELETE /api/settings/api-keys/:providerKey`）
- **上传**：保存当前 Key 到云端（`PUT /api/settings/api-keys/:providerKey`，服务端 AES-256-GCM 加密后入库）

> ⚠️ **不要**把 API Key 写进任何前端文件（`react-app/.env`、`providers.js` 里的默认值等）。
> 前端是部署到 GitHub Pages 的公开静态站点，构建时 `VITE_` 变量会被内联进 JS 产物并公开可读。
> 根目录 `.gitignore` 已经把各处 `.env` / `.env.local` 都挡住了（`git check-ignore` 验证过），
> 但"没被提交"不等于"没被公开"——打包产物照样会把值泄出去。

---

## 8. 部署

`.github/workflows/deploy-pages.yml`：push 到 `main` 时构建 `react-app/` 并发布到 GitHub Pages。

- 生产构建的 `base` 是 **`/ggb_to_tikz/`**（仓库名），开发时是 `/`
- 这部分逻辑在 `vite.config.js` 里靠 `command === 'build'` 区分
- 线上是纯静态部署（只发布 `dist/`），**没有任何后端**——所以线上只能 BYOK 直连各家 API，账号/云同步/TikZ 本地编译都不可用

---

## 9. 想改某个功能，从哪下手

| 想做的事 | 改哪里 |
|---|---|
| 调 AI 生成的 GeoGebra 指令质量 | `react-app/public/prompts/default-prompt.txt` + 白名单（两处同步） |
| 加/改 GeoGebra 命令白名单 | `CommandPanel.jsx` 的 `GGB_ALLOWED_COMMANDS_2D/3D` + 提示词 |
| 改对话 UI / 消息渲染 | `CommandPanel.jsx` 的 `col-chat` 区块 |
| 改 TikZ 输出样式 / 坐标轴 / 标签算法 | `NativeBoard.jsx` 后处理函数 + `public/tikz-generator.js` / `tikz-3d-generator.js` |
| 改 XML → 结构化数据的解析 | `public/ggb-parser.js` / `ggb-3d-parser.js`（先看 `docs/DEBUG_GUIDE.md`） |
| 加新的 LLM 服务商 | 前端 `src/lib/providers.js` + 后端 `server/src/providers.js`（两处都要加） |
| 改上游适配 / 流式协议 | `server/src/llmProxy.js` + `server/src/index.js` |
| 加后端接口 | `server/src/index.js`（或新建 `xxx.js` 然后 `registerXxxRoute(app)`），前端封装加到 `src/lib/llm.js` |
| 改账号 / 云同步 | `server/src/authRoutes.js` + `server/src/crypto.js`，前端在 `CommandPanel.jsx` 设置弹窗 |
| 改端口 | `react-app/vite.config.js` 与 `启动项目.command`（两处同步） |

---

## 10. 已知问题与技术债

**启动相关**
- 端口默认值曾与 `Desktop/题库项目2.0` 冲突，导致双击启动脚本打开的是别人的项目。现已固定前端 5180 + `strictPort`，并在脚本里加了占用检测。

**架构相关**
- 两个组件各 3000–4000 行，`CommandPanel` 承担了对话、命令、设置、鉴权、云同步五件事，已经很难维护；如果继续迭代，值得按"对话区 / 命令区 / 设置区"拆开
- `public/` 下四个转译脚本不走打包、挂 window 全局，没有模块边界
- 前端没有 TypeScript，跨组件靠 localStorage 键和自定义事件耦合，容易改漏
- 画板没有注册任何 applet 事件监听，用户在画板上手动改的对象不会同步到 React 状态

**功能相关**
- 提示词里的 `{{CURRENT_OBJECTS}}` 变量实际被硬编码为空，LLM 看不到当前画板
- 「AI优化」按钮是空壳
- 平台额度用内存 Map 计数，多进程或重启后不准确；未登录用户靠 `x-client-id` 识别，可被绕过
- 线上静态部署没有后端，账号、云同步、TikZ 编译预览全部不可用
- `legacy/` 旧版实现已从工作区删除（未提交），需要时从 `git show 1f68115:legacy/old-web/` 取回
