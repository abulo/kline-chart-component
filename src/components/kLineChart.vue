<script setup lang="ts">
/**
 * KLineChart.vue —— 图表组件（v1.5.0：数据服务集成）
 *
 * 职责：提供一个占满容器的 div，挂载 KLineChartController；
 * 将工具栏状态下沉为 Props（单向数据流），组件内部 watch Props 驱动控制器；
 * **数据层接入 src/services（ChartDataService 接口）**：
 *  - 首次挂载 / symbol / period / service 变化 → fetchHistory 拉历史
 *    → controller.setKlineData（过滤 kline 点，整体重建 + fitContent）；
 *  - 实时订阅 service.subscribeRealtime → controller.updateLastBar
 *    （同 time 覆盖最后一根 / 更大 time 追加新 K，指标增量重建）。
 *
 * Props：
 *  - symbol / name：股票代码 / 名称（pane0 信息行：名称 [代码]）；
 *  - timeAxis / leftScale / rightScale / theme / mainIndicator / subIndicator：状态开关；
 *  - 拉取条数：内部常量 DEFAULT_FETCH_LIMIT（默认 120）；
 *  - period：当前周期（外部可控，默认 'day'；变化时重新拉取）；
 *  - service：数据服务实现（默认 MockChartDataService 单例；接入真实行情传
 *    HttpChartDataService 实例即可，组件 / 控制器零改动）。
 *
 * 生命周期（实例保护 + 内存管理）：
 *  - onMounted：controller 为空才创建（防重复挂载重复创建 chart）；
 *  - onBeforeUnmount：退订实时 + 销毁控制器并置空引用（防内存泄漏）；
 *  - loadData 带请求序号守卫：快速切换周期时丢弃过期响应（防乱序覆盖）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { KLineChartController, type MainIndicatorName } from '../chart/core/kLineChartController'
import type { ChartThemeName } from '../chart/core/theme'
import { DEFAULT_FETCH_LIMIT } from '../chart/core/constants'
import type { SubIndicatorType } from '../chart/indicator'
import type { PeriodValue } from '../chart/periods'
import type { ChartDataService } from '../services/chartDataService'
import { MockChartDataService } from '../services/chartDataService'

/** 默认数据服务（Mock 单例：池缓存复用，内存友好；接入后端时父组件传 HttpChartDataService） */
const defaultService = new MockChartDataService()

/** 图表组件 Props（工具栏状态 + 数据服务 单向数据流） */
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
    /** 当前周期（外部可控；变化时经 service 重新拉取该周期数据） */
    period?: PeriodValue
    /** 数据服务（默认 MockChartDataService 单例；传 HttpChartDataService 接入真实行情） */
    service?: ChartDataService
    /** 时间格式模板（v1.6.9）：如 'YYYY-MM-DD' / 'YYYY-MM-DD HH:mm'；缺省按周期自动 */
    format?: string
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
    period: 'day',
  },
)

/** 容器 ref（需有确定宽高，由父组件 CSS 保证） */
const containerRef = ref<HTMLDivElement | null>(null)

/** 控制器实例（父组件 ref 访问：放大 / 缩小 / 左移 / 右移） */
const controller = ref<KLineChartController | null>(null)

/** 组件内当前周期（默认取 props.period；白名单按钮点击 / 外部 period 变化同步） */
const activePeriod = ref<PeriodValue>(props.period)

/** 实时订阅清理函数（周期 / symbol 变化或卸载时调用） */
let unsubscribeRealtime: (() => void) | null = null

/** 数据加载请求序号（快速切换周期时丢弃过期响应，防乱序覆盖） */
let loadSeq = 0

/**
 * 拉取当前 symbol / period 的历史数据并写入控制器。
 * 竞态保护：仅最新一次请求（seq === loadSeq）允许写盘，旧响应直接丢弃。
 */
const loadData = async (): Promise<void> => {
  const seq = ++loadSeq
  try {
    const points = await (props.service ?? defaultService).fetchHistory({
      symbol: props.symbol,
      period: activePeriod.value,
      limit: DEFAULT_FETCH_LIMIT,
    })
    if (seq !== loadSeq) return // 过期响应丢弃
    controller.value?.setKlineData(points)
  } catch (error) {
    if (seq !== loadSeq) return
    console.error('[KLineChart] 历史数据拉取失败：', error)
  }
}

/** 订阅实时行情（先退订旧订阅保证唯一；回调 = 控制器增量更新最后一根） */
const setupRealtime = (): void => {
  unsubscribeRealtime?.()
  unsubscribeRealtime = (props.service ?? defaultService).subscribeRealtime(
    props.symbol,
    activePeriod.value,
    (point) => controller.value?.updateLastBar(point),
  )
}

/** 更早历史加载中标志（防抖：一次只允许一个在途请求） */
let loadingEarlier = false
/** 是否还有更早历史（added=0 或返回不足 limit → false，停止边缘触发防死循环） */
let hasMoreHistory = true

/**
 * 平移左滑到最左边缘触发（controller.onNeedEarlierData）：
 * 以当前最早一根 time 为 before 锚点拉取更早一页 → prependHistory 前置插入。
 * 停止条件：返回条数 < limit（服务语义：无更早数据）或合并新增 0（重复页）。
 */
const loadEarlier = async (): Promise<void> => {
  if (loadingEarlier || !hasMoreHistory) return
  const earliest = controller.value?.getEarliestTime()
  if (earliest === undefined) return
  loadingEarlier = true
  try {
    const points = await (props.service ?? defaultService).fetchHistory({
      symbol: props.symbol,
      period: activePeriod.value,
      before: earliest,
      limit: DEFAULT_FETCH_LIMIT,
    })
    const added = controller.value?.prependHistory(points) ?? 0
    if (added === 0 || points.length < DEFAULT_FETCH_LIMIT) hasMoreHistory = false
  } catch (error) {
    console.error('[KLineChart] 更早历史拉取失败：', error)
  } finally {
    loadingEarlier = false
  }
}

onMounted(() => {
  // 实例保护：仅当控制器未创建（且容器未被标记）时才创建；
  // 若已存在实例则复用（防重复挂载导致 chart 重复创建）
  if (!containerRef.value || controller.value) return
  controller.value = new KLineChartController({
    container: containerRef.value,
    symbol: props.symbol,
    name: props.name,
    // v1.6.9：时间格式模板透传（pane0 信息行时间；缺省按周期自动）
    format: props.format,
    // 平移左滑到最左边缘 → 自动加载更早历史（防抖 + 停止条件见 loadEarlier）
    onNeedEarlierData: () => void loadEarlier(),
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
  // 数据层：拉历史 + 订阅实时
  void loadData()
  setupRealtime()
})

onBeforeUnmount(() => {
  unsubscribeRealtime?.()
  unsubscribeRealtime = null
  controller.value?.destroy()
  controller.value = null
})

/* ===== Props watch：状态变化 → 驱动控制器 / 数据层（单向数据流） ===== */
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
/** 外部周期变化 → 同步内部周期 + 重拉数据 + 重订阅实时（重置边缘加载状态） */
watch(
  () => props.period,
  (value) => {
    if (value === activePeriod.value) return
    activePeriod.value = value
    hasMoreHistory = true // 新周期可重新加载更早历史
    // v1.6.9：周期切换 → pane0 信息行时间格式随周期变更（setPeriod 触发重绘）
    controller.value?.setPeriod(value)
    void loadData()
    setupRealtime()
  },
)
/** symbol 变化 → 重拉数据 + 重订阅实时（新标的；重置边缘加载状态） */
watch(
  () => props.symbol,
  () => {
    hasMoreHistory = true
    void loadData()
    setupRealtime()
  },
)
/** service 实例变化 → 重拉数据 + 重订阅实时 */
watch(
  () => props.service,
  () => {
    void loadData()
    setupRealtime()
  },
)

/** 向父组件暴露控制器（放大 / 缩小 / 左移 / 右移等瞬时动作） */
defineExpose({ controller })
</script>

<template>
  <div class="kline-chart">
    <div ref="containerRef" class="kline-chart-container" />
  </div>
</template>

<style scoped>

.kline-chart {
  position: relative;
  width: 100%;
  height: 100%;
}

.kline-chart-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
