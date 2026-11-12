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
    // 开发环境代理：/api → 本地行情后端（同源请求，规避浏览器 CORS）。
    // 后端真实路径是 /v1/quant/...，因此转发时剥掉 /api 前缀；
    // headers（如 x-access-token）由代理原样转发，不再触发预检。
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:11000',
        changeOrigin: true,
        ws: true, // 同时代理 WebSocket（实时行情）
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },
})
