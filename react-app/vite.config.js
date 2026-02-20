import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages 生产环境走项目子路径，本地开发走根路径。
  base: command === 'build' ? '/ggb_to_tikz/' : '/',
}));
