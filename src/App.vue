<script setup lang="ts">
/**
 * App.vue —— 应用入口（v1.0.0 重构）
 *
 * 职责：
 *  - 页面背景跟随主题（html 背景色，深系 / 浅系切换）；
 *  - 图表容器占浏览器 80% 宽高、居中；
 *  - 全局控制按钮：时间轴开关 / 缩小 / 放大 / 风格切换。
 *
 * 所有开关操作不得破坏整体布局尺寸，仅控制可见性 / 样式。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import KLineChart from './components/kLineChart.vue'
import { themeColors, type ChartThemeName } from './chart/theme'

/** 图表组件 ref（访问控制器） */
const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)

/** 当前主题 */
const theme = ref<ChartThemeName>('dark')
/** 时间轴开关 */
const showTimeAxis = ref(true)
/** 指标开关（指标 Pane pane4 / pane5，默认开启） */
const showIndicator = ref(true)

/** 主题切换：更新 html 背景 + 图表主题 */
const toggleTheme = (): void => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

/** 主题变化 → 同步 html 背景与图表 */
watch(theme, (name) => {
  const themeColorSet = themeColors(name)
  document.documentElement.style.backgroundColor = themeColorSet.background
  chartRef.value?.controller?.applyTheme(name)
})

/** 时间轴开关：显隐由控制器调库 timeScale.visible */
const toggleTimeAxis = (): void => {
  showTimeAxis.value = !showTimeAxis.value
  chartRef.value?.controller?.toggleTimeAxis(showTimeAxis.value)
}

/** 指标开关：动态创建 / 删除指标 Pane（布局 60:20:20 ⇄ 80:20） */
const toggleIndicator = (): void => {
  showIndicator.value = !showIndicator.value
  chartRef.value?.controller?.setShowIndicator(showIndicator.value)
}

/** 放大 / 缩小（X 轴全局） */
const zoomIn = (): void => chartRef.value?.controller?.zoomIn()
const zoomOut = (): void => chartRef.value?.controller?.zoomOut()

/** 首次进入：设置页面背景 */
onMounted(() => {
  document.documentElement.style.backgroundColor = themeColors(theme.value).background
})

/** 卸载：恢复默认背景 */
onBeforeUnmount(() => {
  document.documentElement.style.backgroundColor = ''
})

/** 按钮 hover 色（从主题取，避免硬编码） */
const hoverColor = (): string => themeColors(theme.value).buttonHover
</script>

<template>
  <div class="page">
    <!-- 顶部工具栏：全部全局控制按钮 -->
    <div class="toolbar">
      <span class="hint">指标开关 + 分组 60/20/20 ⇄ 80/20 + K线 + 量 + MACD v1.4.17</span>
      <div class="spacer" />
      <button class="btn" :class="{ active: showIndicator }" @click="toggleIndicator">
        指标{{ showIndicator ? '开' : '关' }}
      </button>
      <button class="btn" :class="{ active: showTimeAxis }" @click="toggleTimeAxis">
        时间轴{{ showTimeAxis ? '开' : '关' }}
      </button>
      <button class="btn" @click="zoomOut">缩小</button>
      <button class="btn" @click="zoomIn">放大</button>
      <button class="btn" :class="{ active: theme === 'light' }" @click="toggleTheme">
        {{ theme === 'dark' ? '浅系' : '深系' }}
      </button>
    </div>

    <!-- 图表容器：占浏览器 80% 宽高、居中 -->
    <div class="chart-wrap">
      <KLineChart ref="chartRef" />
    </div>
  </div>
</template>

<style>
/* 全局：页面背景由 JS 跟随主题设置（html），body/#app 占满视口保证百分比高度链；
   全局字体 12px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif */
html,
body,
#app {
  margin: 0;
  padding: 0;
  height: 100%;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
}
</style>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 80%;
  padding: 10px 12px;
  box-sizing: border-box;
  margin-top: 12px;
  margin-bottom: 12px;
  /* 工具栏配色跟随主题 */
  background: v-bind('themeColors(theme).toolbarBackground');
  border: 1px solid v-bind('themeColors(theme).toolbarBorder');
  border-radius: 4px;
}

.hint {
  font-size: 12px;
  color: v-bind('themeColors(theme).hintText');
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
}

.spacer {
  flex: 1;
}

.btn {
  font-size: 12px;
  padding: 4px 12px;
  cursor: pointer;
  border-radius: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  background: v-bind('themeColors(theme).buttonBackground');
  color: v-bind('themeColors(theme).buttonText');
  border: 1px solid v-bind('themeColors(theme).buttonBorder');
  transition: background 0.15s;
}

.btn:hover {
  background: v-bind('hoverColor()');
}

.btn.active {
  color: v-bind('themeColors(theme).buttonActiveColor');
  border-color: v-bind('themeColors(theme).buttonActiveColor');
}

/* 图表容器：占浏览器 80% 宽高、居中（无边框）。
   背景与图表底色一致（库的 separator / 时间轴裁切处会露出此背景）。 */
.chart-wrap {
  width: 80%;
  height: 80%;
  min-height: 400px;
  box-sizing: border-box;
  background: v-bind('themeColors(theme).background');
}
</style>
