# ggb_ai Workspace

当前仓库以 `react-app/` 为主工程（React + Vite）。

## 目录结构

- `react-app/`：当前主应用（开发、构建、发布都在这里）
- `docs/`：项目文档
- `legacy/old-web/`：旧版网页与旧测试文件归档
- `legacy/prompts-root-backup/`：根目录旧提示词备份

## 开发与构建

```bash
cd react-app
npm install
npm run dev
```

构建：

```bash
cd react-app
npm run build
```

## 发布

GitHub Pages workflow 使用 `react-app/` 进行构建并发布。

## 建议的整理前备份方式

在做大规模结构调整前，建议先执行：

```bash
git checkout -b backup/before-restructure-YYYYMMDD
git add -A
git commit -m "backup: before restructure"
```

这样后续任何调整都可快速回滚。
