<script setup lang="ts">
/**
 * App.vue —— 应用入口（v1.0.0 重构）
 *
 * 职责：
 *  - 页面背景跟随主题（html 背景色，深系 / 浅系切换）；
 *  - 图表容器占浏览器 80% 宽高、居中；
 *  - 全局控制按钮：时间轴 / 左刻度 / 右刻度 / 风格 / 主图指标 / 附图指标
 *    （按钮只维护状态，通过 Props 单向数据流驱动 KLineChart.vue）；
 *  - 放大 / 缩小 / 左移 / 右移（瞬时动作）经 chartRef 直接调用控制器。
 *
 * 所有开关操作不得破坏整体布局尺寸，仅控制可见性 / 样式。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import KLineChart from './components/kLineChart.vue'
import { themeColors, type ChartThemeName } from './chart/core/theme'
import type { MainIndicatorName } from './chart/core/kLineChartController'
import type { SubIndicatorType } from './chart/indicator'
import { Periods, type PeriodValue } from './chart/periods'
import { MockChartDataService } from './services/chartDataService'

/** 图表组件 ref（访问控制器） */
const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)

/**
 * 数据服务实例（v1.6.16）：App 层集中选择并注入组件，组件内部管理。
 * 当前为 MockChartDataService（内置模拟行情）；接入真实行情时替换为
 * HttpChartDataService 即可（组件 / 控制器零改动）。
 */
const chartDataService = new MockChartDataService({ fetchLimit: 200 })

/** 图表加载状态（v1.6.18 示例：可从 controller.init 收到 loading / ready / error） */
const onChartStatusChange = (status: string): void => {
  console.log('[KLineChart] status:', status)
}

/** 当前周期（互斥单选，默认日K；仅维护状态，周期数据请求另行接入） */
const activePeriod = ref<PeriodValue>('day')

/** 周期切换（点击即选中，周期保持必选其一） */
const togglePeriod = (value: PeriodValue): void => {
  activePeriod.value = value
}

/** 组件内白名单周期按钮切换 → 同步 App 高亮（period 经 prop 联动组件重拉） */
const onPeriodChange = (value: PeriodValue): void => {
  activePeriod.value = value
}

/** 当前主题 */
const theme = ref<ChartThemeName>('dark')
/** 时间轴开关 */
const showTimeAxis = ref(true)
/** 附图指标（互斥单选，默认无选中 → 指标层关闭）。
 * 点击已选中指标 = 取消（关闭指标层）；点击其他指标 = 切换。 */
const activeSubIndicator = ref<SubIndicatorType | null>("macd")
/** 左刻度区开关（默认关） */
const showLeftScale = ref(false)
/** 右刻度区开关（默认关） */
const showRightScale = ref(false)
/** 主图指标开关（互斥：MA / EXPMA / BOLL / SAR / BBI，默认关） */
const activeMainIndicator = ref<MainIndicatorName | null>("ma")

/** 主图指标按钮配置（名称 + 标签；互斥） */
const mainIndicatorOptions: ReadonlyArray<{ name: MainIndicatorName; label: string }> = [
  { name: 'ma', label: 'MA' },
  { name: 'expma', label: 'EXPMA' },
  { name: 'boll', label: 'BOLL' },
  { name: 'sar', label: 'SAR' },
  { name: 'bbi', label: 'BBI' },
]

/** 主图指标开关（互斥）：点击已激活指标 = 关闭；否则切换。
 * 仅维护状态，图表由 KLineChart.vue 的 mainIndicator Props watch 驱动 */
const toggleMainIndicator = (name: MainIndicatorName): void => {
  const next = activeMainIndicator.value === name ? null : name
  activeMainIndicator.value = next
}

/** 主题切换：更新 html 背景 + 图表主题 */
const toggleTheme = (): void => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

/** 主题变化 → 仅同步页面 html 背景（图表主题由 KLineChart.vue 的
 * theme Props watch 驱动，页面背景用独立 pageBackground：深系更深 / 浅系更浅） */
watch(theme, (name) => {
  const themeColorSet = themeColors(name)
  document.documentElement.style.backgroundColor = themeColorSet.background
})

/** 时间轴开关：仅维护状态（图表由 KLineChart.vue 的 timeAxis Props watch 驱动） */
const toggleTimeAxis = (): void => {
  showTimeAxis.value = !showTimeAxis.value
}

/** 附图指标按钮配置（十个指标，互斥；无选中时关闭指标层） */
const subIndicatorOptions: ReadonlyArray<{ name: SubIndicatorType; label: string }> = [
  { name: 'rsi', label: 'RSI' },
  { name: 'kdj', label: 'KDJ' },
  { name: 'macd', label: 'MACD' },
  { name: 'wr', label: 'WR' },
  { name: 'dmi', label: 'DMI' },
  { name: 'bias', label: 'BIAS' },
  { name: 'obv', label: 'OBV' },
  { name: 'cci', label: 'CCI' },
  { name: 'roc', label: 'ROC' },
  { name: 'cr', label: 'CR' },
]

/** 附图指标开关（互斥）：点击已选中指标 = 关闭（null → 指标层关闭）；否则切换。
 * 仅维护状态，图表由 KLineChart.vue 的 subIndicator Props watch 驱动 */
const toggleSubIndicator = (name: SubIndicatorType): void => {
  const next = activeSubIndicator.value === name ? null : name
  activeSubIndicator.value = next
}

/** 左刻度区开关：仅维护状态（图表由 KLineChart.vue 的 leftScale Props watch 驱动） */
const toggleLeftScale = (): void => {
  showLeftScale.value = !showLeftScale.value
}

/** 右刻度区开关：仅维护状态（图表由 KLineChart.vue 的 rightScale Props watch 驱动） */
const toggleRightScale = (): void => {
  showRightScale.value = !showRightScale.value
}

/** 放大 / 缩小 / 左移 / 右移（X 轴全局） */
const zoomIn = (): void => chartRef.value?.controller?.zoomIn()
const zoomOut = (): void => chartRef.value?.controller?.zoomOut()
const shiftLeft = (): void => chartRef.value?.controller?.shiftLeft()
const shiftRight = (): void => chartRef.value?.controller?.shiftRight()

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
    <div class="info">
      <span class="hint">附图指标互斥 + 分组 60/20/20 ⇄ 80/20 + K线 + 量 + RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR v1.6.53</span>
    </div>

    <div class="toolbar">
      <button class="btn" :class="{ active: showTimeAxis }" @click="toggleTimeAxis">
        时间轴{{ showTimeAxis ? '开' : '关' }}
      </button>
      <button class="btn" :class="{ active: showLeftScale }" @click="toggleLeftScale">
        左刻度{{ showLeftScale ? '开' : '关' }}
      </button>
      <button class="btn" :class="{ active: showRightScale }" @click="toggleRightScale">
        右刻度{{ showRightScale ? '开' : '关' }}
      </button>
      <button class="btn" @click="shiftLeft">左移</button>
      <button class="btn" @click="shiftRight">右移</button>
      <button class="btn" @click="zoomOut">缩小</button>
      <button class="btn" @click="zoomIn">放大</button>
      <button class="btn" :class="{ active: theme === 'light' }" @click="toggleTheme">
        {{ theme === 'dark' ? '浅系' : '深系' }}
      </button>
    </div>

    <!-- 图表容器：占浏览器 80% 宽高、居中（symbol / name 在 pane0 顶部信息行显示） -->
    <div class="chart-wrap">
      <KLineChart
        ref="chartRef"
        symbol="300750"
        name="宁德时代"
        :time-axis="showTimeAxis"
        :left-scale="showLeftScale"
        :right-scale="showRightScale"
        :theme="theme"
        :main-indicator="activeMainIndicator ?? ''"
        :sub-indicator="activeSubIndicator ?? ''"
        :period="activePeriod"
        :service="chartDataService"
        @status-change="onChartStatusChange"
        @period-change="onPeriodChange"
      />
    </div>

    <!-- 底部容器：主图指标（MA / EXPMA / BOLL / SAR / BBI，互斥开关，画在 pane1） -->
    <div class="main-indicator-bar">
      <span class="hint">主图指标</span>
      <button
        v-for="option in mainIndicatorOptions"
        :key="option.name"
        class="btn"
        :class="{ active: activeMainIndicator === option.name }"
        @click="toggleMainIndicator(option.name)"
      >
        {{ option.label }}
      </button>
    </div>

    <!-- 底部容器：附图指标（RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR，
         互斥开关，画在 pane5；无选中时关闭指标层） -->
    <div class="sub-indicator-bar">
      <span class="hint">附图指标</span>
      <button
        v-for="option in subIndicatorOptions"
        :key="option.name"
        class="btn"
        :class="{ active: activeSubIndicator === option.name }"
        @click="toggleSubIndicator(option.name)"
      >
        {{ option.label }}
      </button>
    </div>

    <!-- 底部容器：周期（全量互斥单选） -->
    <div class="period-bar">
      <span class="hint">周期</span>
      <button
        v-for="option in Periods"
        :key="option.value"
        class="btn"
        :class="{ active: activePeriod === option.value }"
        @click="togglePeriod(option.value)"
      >
        {{ option.label }}
      </button>
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

.info {
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

/* 底部容器：主图指标（MA / EXPMA / BOLL / SAR / BBI，样式与顶部工具栏一致） */
.main-indicator-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 80%;
  padding: 10px 12px;
  box-sizing: border-box;
  margin-top: 12px;
  margin-bottom: 12px;
  background: v-bind('themeColors(theme).toolbarBackground');
  border: 1px solid v-bind('themeColors(theme).toolbarBorder');
  border-radius: 4px;
}

/* 底部容器：附图指标（RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR，
   样式与主图指标容器一致） */
.sub-indicator-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 80%;
  padding: 10px 12px;
  box-sizing: border-box;
  margin-top: 0;
  margin-bottom: 12px;
  background: v-bind('themeColors(theme).toolbarBackground');
  border: 1px solid v-bind('themeColors(theme).toolbarBorder');
  border-radius: 4px;
}

/* 底部容器：周期（13 项：分时 1~5 日 + 日/周/月 K + 60~1 分 K，样式与指标容器一致） */
.period-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 80%;
  padding: 10px 12px;
  box-sizing: border-box;
  margin-top: 0;
  margin-bottom: 12px;
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

/* 图表容器：宽度 80%、高度占满剩余空间（顶部信息行 + 工具栏 + 底部指标容器之外）居中。
   背景与图表底色一致（库的 separator / 时间轴裁切处会露出此背景）。 */
.chart-wrap {
  flex: 1;
  width: 80%;
  min-height: 400px;
  box-sizing: border-box;
  background: v-bind('themeColors(theme).background');
}
</style>
