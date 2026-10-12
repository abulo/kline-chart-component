/**
 * main.ts —— Vue 应用入口
 *
 * 仅负责挂载根组件 App.vue；组件内部（KLineChart.vue）负责创建
 * KLineChartController 与数据服务，业务逻辑不在入口处。
 */
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
