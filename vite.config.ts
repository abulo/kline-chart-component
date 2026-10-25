import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // GitHub Pages 部署基础路径占位（v1.7.1）：
  // Actions workflow 会用 sed 把这里替换为 "/<repo名>/"（Pages 项目路径 = 仓库名），
  // 本地 npm run build 直接产出 /kline/ 路径产物（对应仓库名 kline）。
  // 若仓库名不是 kline（如 kline-chart-component），Actions 会自动替换，无需改这里。
  base: '/kline/',
  server: {
    host: '127.0.0.1',
    port: 5199,
    // 开发环境代理：把 /api 请求转发到你的后端，规避跨域
    // 按需把 target 改成你的后端地址
    proxy: {
      '/api': {
        target: 'http://10.0.0.8:8080',
        changeOrigin: true,
        ws: true, // 同时代理 WebSocket（实时行情）
      },
    },
  },
})
