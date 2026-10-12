import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
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
