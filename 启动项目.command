#!/bin/zsh

# 双击此文件，同时启动 ggb_ai 的前端和后端。
#
# 端口约定：前端 5180，后端 8787。
# 前端端口与 react-app/vite.config.js 里的 DEV_PORT 必须一致。
# 不要改回 5173：本机其他项目会占用它，vite 会悄悄换端口，
# 而浏览器仍打开 5173，结果看到的是别人的项目。

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/react-app"
BACKEND_DIR="$SCRIPT_DIR/server"

FRONTEND_PORT=5180
BACKEND_PORT=8787
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}"

# 用于确认监听端口的到底是不是本项目。
FRONTEND_MARKER="AI-GeoGebra React 迁移版"
BACKEND_MARKER="ggb-ai-server"

# Finder 启动的终端可能没有加载用户的 PATH。
export PATH="$HOME/.local/bin:/Library/TeX/texbin:/opt/homebrew/bin:/usr/local/bin:$PATH"

frontend_pid=""
backend_pid=""
cleanup_done=0

cleanup() {
  [[ "$cleanup_done" -eq 1 ]] && return
  cleanup_done=1
  trap - INT TERM EXIT
  # 什么都没启动过（例如检测到已在运行就退出）时不必报告"正在停止"。
  if [[ -z "$frontend_pid" && -z "$backend_pid" ]]; then
    return
  fi
  echo ""
  echo "正在停止前后端服务..."
  [[ -n "$frontend_pid" ]] && kill "$frontend_pid" 2>/dev/null || true
  [[ -n "$backend_pid" ]] && kill "$backend_pid" 2>/dev/null || true
  [[ -n "$frontend_pid" ]] && wait "$frontend_pid" 2>/dev/null || true
  [[ -n "$backend_pid" ]] && wait "$backend_pid" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

# 端口占用者（PID + 命令），无占用时输出空。
port_owner() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1
}

port_owner_desc() {
  local pid="$1"
  [[ -z "$pid" ]] && return
  ps -o command= -p "$pid" 2>/dev/null | cut -c1-140
}

fail_and_wait() {
  echo ""
  echo "$1"
  read -r "?按回车键关闭..."
  exit 1
}

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  fail_and_wait "错误：未找到 Node.js/npm。请先安装 Node.js，然后重新双击本文件。"
fi

install_if_needed() {
  local project_dir="$1"
  local project_name="$2"

  if [[ ! -d "$project_dir/node_modules" ]]; then
    echo "首次运行：正在安装${project_name}依赖..."
    (cd "$project_dir" && npm install) || {
      fail_and_wait "错误：${project_name}依赖安装失败。"
    }
  fi
}

install_if_needed "$BACKEND_DIR" "后端"
install_if_needed "$FRONTEND_DIR" "前端"

# ---------- 启动前检查端口占用 ----------

frontend_owner="$(port_owner "$FRONTEND_PORT")"
backend_owner="$(port_owner "$BACKEND_PORT")"

if [[ -n "$frontend_owner" ]]; then
  if curl --silent --fail --max-time 3 "$FRONTEND_URL/" 2>/dev/null | grep -q "$FRONTEND_MARKER"; then
    echo "本项目前端已在运行：$FRONTEND_URL"
    if [[ "${GGB_SKIP_OPEN:-0}" != "1" ]]; then
      open "$FRONTEND_URL"
    fi
    echo "无需重复启动。按回车键关闭此窗口。"
    read -r "?按回车键关闭..."
    exit 0
  fi

  fail_and_wait "错误：端口 ${FRONTEND_PORT} 被其他程序占用，不能启动本项目前端。

占用进程：$(port_owner_desc "$frontend_owner")

请先结束该进程（kill ${frontend_owner}），或修改 react-app/vite.config.js 的
DEV_PORT 与本脚本的 FRONTEND_PORT 后重试。"
fi

start_backend=1
if [[ -n "$backend_owner" ]]; then
  if curl --silent --fail --max-time 3 "http://127.0.0.1:${BACKEND_PORT}/api/health" 2>/dev/null | grep -q "$BACKEND_MARKER"; then
    start_backend=0
  else
    fail_and_wait "错误：端口 ${BACKEND_PORT} 被其他程序占用，不能启动本项目后端。

占用进程：$(port_owner_desc "$backend_owner")

请先结束该进程（kill ${backend_owner}）后重试。"
  fi
fi

# ---------- 启动服务 ----------

if [[ "$start_backend" -eq 1 ]]; then
  echo "正在启动后端：http://127.0.0.1:${BACKEND_PORT}"
  (trap - INT TERM EXIT; cd "$BACKEND_DIR" && exec node --watch src/index.js) &
  backend_pid=$!
else
  echo "后端已在运行，直接复用：http://127.0.0.1:${BACKEND_PORT}"
fi

echo "正在启动前端：${FRONTEND_URL}"
(trap - INT TERM EXIT; cd "$FRONTEND_DIR" && exec ./node_modules/.bin/vite --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort) &
frontend_pid=$!

# 确认前端确实由本项目提供，而不只是"端口上有东西响应"。
frontend_is_ours() {
  curl --silent --fail --max-time 3 "$FRONTEND_URL/" 2>/dev/null | grep -q "$FRONTEND_MARKER"
}

backend_is_ours() {
  curl --silent --fail --max-time 3 "http://127.0.0.1:${BACKEND_PORT}/api/health" 2>/dev/null | grep -q "$BACKEND_MARKER"
}

echo "等待服务就绪..."
ready=0
for _ in {1..60}; do
  if ! kill -0 "$frontend_pid" 2>/dev/null; then
    fail_and_wait "错误：前端启动失败，请查看上方日志。"
  fi
  if [[ -n "$backend_pid" ]] && ! kill -0 "$backend_pid" 2>/dev/null; then
    fail_and_wait "错误：后端启动失败，请查看上方日志。"
  fi

  if frontend_is_ours && backend_is_ours; then
    ready=1
    break
  fi
  sleep 0.5
done

if [[ "$ready" -eq 1 ]]; then
  echo ""
  echo "项目已启动：${FRONTEND_URL}"
  echo "关闭此窗口或按 Ctrl+C 即可停止前后端。"
  if [[ "${GGB_SKIP_OPEN:-0}" != "1" ]]; then
    open "$FRONTEND_URL"
  fi
else
  echo ""
  echo "警告：等待服务超时，请根据上方日志排查。"
fi

wait "$frontend_pid" 2>/dev/null || true
[[ -n "$backend_pid" ]] && wait "$backend_pid" 2>/dev/null || true
