import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // GitHub Pages 部署基础路径（v1.7.1）：
  // Pages 项目路径 = 仓库名，仓库为 kline-chart-component → 部署地址
  // https://abulo.github.io/kline-chart-component/。本地 build 即产出该路径产物。
  base: '/kline-chart-component/',
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
