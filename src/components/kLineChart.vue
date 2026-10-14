<script setup lang="ts">
/**
 * KLineChart.vue —— 图表组件（v1.4.74 状态 Props 化）
 *
 * 职责：提供一个占满容器的 div，挂载 KLineChartController；
 * 将工具栏状态下沉为 Props（单向数据流），组件内部 watch Props 驱动控制器：
 *
 * Props：
 *  - symbol：股票代码（可选，pane0 顶部信息行显示）；
 *  - name：股票名称（可选，pane0 顶部信息行显示，格式：名称 [代码]）；
 *  - timeAxis：时间轴开关（默认开）；
 *  - leftScale：左刻度区开关（默认关）；
 *  - rightScale：右刻度区开关（默认关）；
 *  - theme：风格（'dark' | 'light'，默认深系）；
 *  - mainIndicator：主图指标（MA/EXPMA/BOLL/SAR/BBI，'' = 关闭）；
 *  - subIndicator：附图指标（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR，'' = 关闭指标层）。
 *
 * 父组件（App.vue）只负责维护状态并传 Props；放大 / 缩小 / 左移 / 右移等
 * 瞬时动作仍通过 ref 直接调用控制器。
 *
 * 生命周期（实例保护）：
 *  - onMounted：controller 为空才创建（防组件重复挂载重复创建 chart），
 *    创建后立即应用全部 Props 初始值；控制器内部再对容器打 dataset 标记；
 *  - watch Props：任一开关变化即调用对应控制器方法（theme 变化同时由父组件
 *    同步 html 背景，组件内只负责图表主题）；
 *  - onBeforeUnmount：销毁控制器并置空引用（防内存泄漏）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { KLineChartController, type MainIndicatorName } from '../chart/core/KLineChartController'
import type { ChartThemeName } from '../chart/core/theme'
import type { SubIndicatorType } from '../chart/indicator'
import { Periods, type PeriodItem, type PeriodValue } from '../chart/periods'

/** 图表组件 Props（工具栏状态单向数据流） */
const props = withDefaults(
  defineProps<{
    /** 股票代码（pane0 顶部信息行显示） */
    symbol?: string
    /** 股票名称（pane0 顶部信息行显示） */
    name?: string
    /** 时间轴开关（默认开） */
    timeAxis?: boolean
    /** 左刻度区开关（默认关） */
    leftScale?: boolean
    /** 右刻度区开关（默认关） */
    rightScale?: boolean
    /** 风格（'dark' | 'light'，默认深系） */
    theme?: string
    /** 主图指标（'' = 关闭；互斥单选，由父组件保证） */
    mainIndicator?: string
    /** 附图指标（'' = 关闭指标层；互斥单选，由父组件保证） */
    subIndicator?: string
    /** 内置演示数据条数（默认 120；极限压测可传 10000） */
    dataCount?: number
    /**
     * 周期白名单（可选）：数组（如 ['day', 'week', 'month']）或逗号分隔字符串
     * （如 'day,week,month'）。有值（非空）时组件内渲染白名单内的周期按钮，
     * 点击 emit 'period-change'；无值 / 空时不渲染（周期由外部 App 工具栏控制）。
     */
    periodWhitelist?: PeriodValue[] | string
  }>(),
  {
    symbol: '',
    name: '',
    timeAxis: true,
    leftScale: false,
    rightScale: false,
    theme: 'dark',
    mainIndicator: '',
    subIndicator: '',
    dataCount: 120,
    periodWhitelist: '',
  },
)

/** 白名单周期解析：字符串按逗号分隔 / 数组直接使用 → 过滤 Periods 子集 */
const whitelistedPeriods = computed<PeriodItem[]>(() => {
  const raw = props.periodWhitelist
  if (!raw || (typeof raw === 'string' && raw.trim() === '')) return []
  const values = Array.isArray(raw) ? raw : raw.split(',').map((item) => item.trim())
  return Periods.filter((period) => values.includes(period.value))
})

/** 周期切换事件（点击白名单周期按钮时触发，value 为周期标识） */
const emit = defineEmits<{ (event: 'period-change', value: PeriodValue): void }>()

/** 容器 ref（需有确定宽高，由父组件 CSS 保证） */
const containerRef = ref<HTMLDivElement | null>(null)

/** 控制器实例（父组件 ref 访问：放大 / 缩小 / 左移 / 右移） */
const controller = ref<KLineChartController | null>(null)

onMounted(() => {
  // 实例保护：仅当控制器未创建（且容器未被标记）时才创建；
  // 若已存在实例则复用（防重复挂载导致 chart 重复创建）
  if (!containerRef.value || controller.value) return
  controller.value = new KLineChartController({
    container: containerRef.value,
    symbol: props.symbol,
    name: props.name,
    dataCount: props.dataCount,
  })
  // 创建后立即应用全部 Props 初始值（与控制器构造默认值一致时幂等无副作用）
  controller.value.applyTheme(props.theme as ChartThemeName)
  controller.value.toggleTimeAxis(props.timeAxis)
  controller.value.setLeftScaleVisible(props.leftScale)
  controller.value.setRightScaleVisible(props.rightScale)
  controller.value.setMainIndicator(
    props.mainIndicator ? (props.mainIndicator as MainIndicatorName) : null,
  )
  controller.value.setSubIndicator(props.subIndicator ? (props.subIndicator as SubIndicatorType) : null)
})

onBeforeUnmount(() => {
  controller.value?.destroy()
  controller.value = null
})

/* ===== Props watch：工具栏状态变化 → 驱动控制器（单向数据流） ===== */
/** 时间轴开关 */
watch(
  () => props.timeAxis,
  (visible) => controller.value?.toggleTimeAxis(visible),
)
/** 左刻度区开关 */
watch(
  () => props.leftScale,
  (visible) => controller.value?.setLeftScaleVisible(visible),
)
/** 右刻度区开关 */
watch(
  () => props.rightScale,
  (visible) => controller.value?.setRightScaleVisible(visible),
)
/** 风格切换（图表主题；html 背景由父组件同步） */
watch(
  () => props.theme,
  (value) => controller.value?.applyTheme(value as ChartThemeName),
)
/** 主图指标（'' → null = 关闭） */
watch(
  () => props.mainIndicator,
  (value) =>
    controller.value?.setMainIndicator(value ? (value as MainIndicatorName) : null),
)
/** 附图指标（'' → null = 关闭指标层） */
watch(
  () => props.subIndicator,
  (value) =>
    controller.value?.setSubIndicator(value ? (value as SubIndicatorType) : null),
)

/** 向父组件暴露控制器（放大 / 缩小 / 左移 / 右移等瞬时动作） */
defineExpose({ controller })
</script>

<template>
  <div ref="containerRef" class="kline-chart-container" />
</template>

<style scoped>

.kline-chart-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
