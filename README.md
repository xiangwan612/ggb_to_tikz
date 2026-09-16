# ggb_ai Workspace

GeoGebra 作图 → TikZ 代码的 AI 辅助工具。完整架构说明见 **[MAP.md](./MAP.md)**。

当前仓库包含：
- `react-app/`：前端主工程（React + Vite）
- `server/`：后端主工程（Fastify + Prisma/SQLite）

## 一键启动

双击根目录的 **`启动项目.command`**，会自动启动前后端并打开浏览器。

## 端口约定

| 服务 | 端口 |
|---|---|
| 前端（vite） | **5180** |
| 后端（Fastify） | **8787** |

前端端口在 `react-app/vite.config.js` 的 `DEV_PORT` 与 `启动项目.command` 的 `FRONTEND_PORT` 两处定义，**必须保持一致**。

> ⚠️ 不要把前端改回 vite 默认的 5173。本机另一个项目（`Desktop/题库项目2.0`）占用 5173/5174，
> 一旦冲突，vite 会静默换端口而浏览器仍打开 5173，看到的会是那个项目。
> 因此 vite 配置里开了 `strictPort`，启动脚本也会在启动前检查端口占用并给出明确提示。

## 开发与构建

前端：

```bash
cd react-app
npm install
npm run dev      # http://127.0.0.1:5180
```

后端：

```bash
cd server
npm install
npm run dev      # http://127.0.0.1:8787
```

后端提供：

- `GET /api/health`：健康检查
- `POST /api/auth/register` / `POST /api/auth/login` / `GET /api/me`：账号体系（MVP）
- `POST /api/auth/email/request-code` / `POST /api/auth/email/login`：邮箱验证码登录
- `POST /api/models`：模型列表代理（支持 BYOK 或平台 key）
- `POST /api/chat` / `POST /api/chat/stream`：对话代理（支持 BYOK；平台 key 可配置每日次数限制）
- `POST /api/tikz/compile`：TikZ 本地编译预览（需要本机安装 pdflatex）
- `POST /api/tikz/copy-pdf`：把矢量 PDF 写入系统剪贴板

## LLM 服务商与 API Key

内置服务商只有 **DeepSeek**。密钥有两条存放路径，都在本地、都不会进 Git：

| 方式 | 存放位置 | 说明 |
|---|---|---|
| 用户自带 Key（BYOK） | 浏览器 `localStorage` | 在设置面板里填写，每个浏览器各自保存 |
| 平台 Key | `server/.env` 的 `PLATFORM_DEEPSEEK_API_KEY` | 服务端统一调用，按 `PLATFORM_DAILY_LIMIT` 限流 |

解析优先级：请求里的 BYOK Key > 登录用户云端加密存储的 Key > 平台 Key。

`server/.env` 已被 `.gitignore` 忽略，只有不含真实密钥的 `server/.env.example` 会入库。

> ⚠️ 不要把 API Key 写进任何**前端**文件。前端会部署成公开的 GitHub Pages 站点，
> 构建时 `VITE_` 开头的变量会被内联进 JS 产物，等于公开发布。

前端构建：

```bash
cd react-app
npm run build
```

## 环境要求

- Node.js ≥ 18
- 可选：MacTeX（`pdflatex`）——用于 TikZ 网页内编译预览，缺失时自动回退 TikZJax
- 后端配置见 `server/.env.example`，复制为 `server/.env` 后填写

## 发布

GitHub Pages workflow 使用 `react-app/` 进行构建并发布。

注意线上是纯静态部署，**没有后端**：账号、云同步、TikZ 编译预览均不可用，只能 BYOK 直连模型服务商。

## 建议的整理前备份方式

在做大规模结构调整前，建议先执行：

```bash
git checkout -b backup/before-restructure-YYYYMMDD
git add -A
git commit -m "backup: before restructure"
```

这样后续任何调整都可快速回滚。
