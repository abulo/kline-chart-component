/**
 * viewport.ts —— 视口 / 刻度 / 配色工具（v1.7.1 自 KLineChartController.ts 拆分）
 *
 * 纯 chart API 操作（无 controller 状态读写，参数 / 回调注入），职责单一：
 *  - 缩放 / 平移视口（zoomIn / zoomOut / shiftLeft / shiftRight）
 *  - 左右刻度区显隐统一应用（applyPriceScaleVisible，切换前后保持可见时间范围不变）
 *  - K 线逐根三态配色重设（refreshKlineColors，主题切换时调用）
 *  - 调试数据暴露（exposeDebugApi，挂 window.__klineChart 控制台实时查看）
 */
import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { ChartDataPoint } from '../../types/chart'
import type { PeriodValueOrEmpty } from '../periods'
import type { ChartThemeName } from './theme'
import { PRICE_SCALE_MIN_WIDTH, VIEW_SHIFT_STEP } from './constants'
import { normalizeChartTime } from '../util/format'
import { resolveBarColors, type BarPalette } from './resolveBarColors'

/** 放大（X 轴 barSpacing ×1.25，限幅 80） */
export const zoomIn = (
  chart: ReturnType<typeof import('lightweight-charts').createChart>,
): void => {
  const timeScaleApi = chart.timeScale()
  const barSpacing = timeScaleApi.options().barSpacing
  timeScaleApi.applyOptions({ barSpacing: Math.min(barSpacing * 1.25, 80) })
}

/** 缩小（X 轴 barSpacing ÷1.25，下限 0.5 = 库最小 barSpacing：可一路缩到全部数据可见） */
export const zoomOut = (
  chart: ReturnType<typeof import('lightweight-charts').createChart>,
): void => {
  const timeScaleApi = chart.timeScale()
  const barSpacing = timeScaleApi.options().barSpacing
  timeScaleApi.applyOptions({ barSpacing: Math.max(barSpacing / 1.25, 0.5) })
}

/**
 * 左移（视口向左平移 30 根K线，看更早数据）。
 * 用逻辑范围平移替代 scrollToPosition（后者距右边缘不足一屏时减幅变负被 clamp，
 * 直接跳到最新数据末尾）；逻辑范围平移到达最左自然停止，无跳变。
 */
export const shiftLeft = (
  chart: ReturnType<typeof import('lightweight-charts').createChart>,
): void => {
  const timeScaleApi = chart.timeScale()
  const range = timeScaleApi.getVisibleLogicalRange()
  if (!range) return
  timeScaleApi.setVisibleLogicalRange({
    from: range.from - VIEW_SHIFT_STEP,
    to: range.to - VIEW_SHIFT_STEP,
  })
}

/** 右移（视口向右平移 30 根K线，看更晚数据；到达最右自然停止，不跳变） */
export const shiftRight = (
  chart: ReturnType<typeof import('lightweight-charts').createChart>,
): void => {
  const timeScaleApi = chart.timeScale()
  const range = timeScaleApi.getVisibleLogicalRange()
  if (!range) return
  timeScaleApi.setVisibleLogicalRange({
    from: range.from + VIEW_SHIFT_STEP,
    to: range.to + VIEW_SHIFT_STEP,
  })
}

/** 刻度区统一应用（左右宽度一致）：逐个 Pane 设置 price scale 显隐与最小宽度。
 *  切换前后**保持当前可见时间范围不变**——刻度区开关只改变数据区宽度，
 *  不改变视图内的数据（不再 fitContent 重置视口）。 */
export const applyPriceScaleVisible = (
  chart: ReturnType<typeof import('lightweight-charts').createChart>,
  side: 'left' | 'right',
  visible: boolean,
): void => {
  // 保存当前可见时间范围（秒级 {from, to}），宽度变化后恢复（视图内数据不变）
  const visibleRange = chart.timeScale().getVisibleRange()
  const panes = chart.panes()
  panes.forEach((_, paneIndex) => {
    chart.priceScale(side, paneIndex).applyOptions({
      visible,
      borderVisible: false, // 刻度区无边框
      minimumWidth: visible ? PRICE_SCALE_MIN_WIDTH : 0, // 关闭时不占位；打开时左右宽度一致
    })
  })
  // 恢复原可见时间范围（刻度区开关仅改变数据区宽度，不改变视图内的数据）
  if (visibleRange) chart.timeScale().setVisibleRange(visibleRange)
}

/** 按当前主题重设 K 线逐根三态色（主题切换时调用，不动数据与指标） */
export const refreshKlineColors = (
  bars: ChartDataPoint[],
  series: ISeriesApi<'Candlestick'>,
  palette: BarPalette,
): void => {
  const points = bars
    .map((bar) => {
      const time = normalizeChartTime(bar.time)
      if (time === null) return null
      return {
        time: time as UTCTimestamp,
        open: bar.open!,
        high: bar.high!,
        low: bar.low!,
        close: bar.close!,
        ...resolveBarColors(bar, palette),
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
  series.setData(points)
}

/** 调试对象访问器（controller 注入；getter 惰性读取 → 数据 / 周期实时变化生效） */
export interface DebugApiAccessors {
  /** 静态字段（构造时固定） */
  symbol: string
  name: string
  period: PeriodValueOrEmpty
  isTimeshare: boolean
  theme: ChartThemeName
  /** 动态字段（getter 实时取最新值） */
  getBars: () => ChartDataPoint[]
  getPreClose: () => number
  getTimeshareHalf: () => number
  getScaleValues: () => (number | undefined)[] | null
  getHorizontalCount: () => number
}

/** 调试数据暴露（仅开发用）：挂 window.__klineChart，控制台实时查看
 *  当前数据与分时刻度计算（getter 每次访问取最新值，无缓存开销）：
 *  - bars：原始数据（分时点含 preClose / price / avgPrice / volume）
 *  - preClose：首根 bar 的昨收（中间值基准）
 *  - timeshareHalf：对称半幅 expandDistance = max(上偏, 下偏)
 *  - scaleValues：当前等差刻度序列（首尾 = newMax / newMin，中间 = preClose）
 *  - getMaxMin()：遍历全部 bar 返回最高 / 最低价（price / avgPrice 极值） */
export const exposeDebugApi = (accessors: DebugApiAccessors): void => {
  const win = window as unknown as { __klineChart?: Record<string, unknown> }
  const debug: Record<string, unknown> = {}
  // 静态字段（构造时固定）
  debug.symbol = accessors.symbol
  debug.name = accessors.name
  debug.period = accessors.period
  debug.isTimeshare = accessors.isTimeshare
  debug.theme = accessors.theme
  // 动态字段（getter 实时取最新值，随数据更新自动刷新）
  const define = (key: string, get: () => unknown): void => {
    Object.defineProperty(debug, key, {
      get,
      enumerable: true,
      configurable: true,
    })
  }
  define('bars', () => accessors.getBars())
  define('barCount', () => accessors.getBars().length)
  define('preClose', () => accessors.getPreClose())
  define('timeshareHalf', () => accessors.getTimeshareHalf())
  define('scaleValues', () => accessors.getScaleValues())
  define('horizontalCount', () => accessors.getHorizontalCount())
  // 遍历全部 bar 返回最高 / 最低价（price / avgPrice 极值）
  debug.getMaxMin = (): { maxPrice: number; minPrice: number } => {
    let maxPrice = Number.NEGATIVE_INFINITY
    let minPrice = Number.POSITIVE_INFINITY
    for (const bar of accessors.getBars()) {
      const price = bar.price ?? 0
      const avgPrice = bar.avgPrice ?? 0
      if (price > maxPrice) maxPrice = price
      if (avgPrice > maxPrice) maxPrice = avgPrice
      if (price < minPrice) minPrice = price
      if (avgPrice < minPrice) minPrice = avgPrice
    }
    return { maxPrice, minPrice }
  }
  win.__klineChart = debug
}
