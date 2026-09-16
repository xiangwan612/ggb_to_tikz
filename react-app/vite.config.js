import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 前端固定端口，和 启动项目.command 中的 FRONTEND_PORT 保持一致。
// 不要改回 vite 默认的 5173：本机另一个项目占用 5173/5174，会导致启动后打开错误的项目。
const DEV_PORT = 5180;
const BACKEND_PORT = 8787;

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages 生产环境走项目子路径，本地开发走根路径。
  base: command === 'build' ? '/ggb_to_tikz/' : '/',
  server: {
    port: DEV_PORT,
    // 端口被占用时直接失败，而不是悄悄涨到 5181 让浏览器打开别的服务。
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${BACKEND_PORT}`,
        changeOrigin: true
      }
    }
  }
}));
