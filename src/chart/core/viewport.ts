// viewport.ts —— 视口 / 刻度 / 配色工具（自 KLineChartController.ts 拆分）。
// 纯 chart API 操作（无 controller 状态读写，参数 / 回调注入），职责单一：
//  - 缩放 / 平移视口（zoomIn / zoomOut / shiftLeft / shiftRight）
//  - 左右刻度区显隐统一应用（applyPriceScaleVisible，切换前后保持可见时间范围不变）
//  - K 线逐根三态配色重设（refreshKlineColors，主题切换时调用）
//  - 调试数据暴露（exposeDebugApi，挂 window.__klineChart 控制台实时查看）
import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { ChartDataPoint } from '../../types/chart'
import type { PeriodValueOrEmpty } from '../periods'
import type { ChartThemeName } from './theme'
import { PRICE_SCALE_MIN_WIDTH, VIEW_SHIFT_STEP } from './constants'
import { normalizeChartTime } from '../util/format'
import { resolveBarColors, type BarPalette } from './resolveBarColors'

/**
 * 放大（X 轴 barSpacing ×1.25，限幅 80）。
 *
 * @param chart 图表实例。
 */
export const zoomIn = (
  chart: ReturnType<typeof import('lightweight-charts').createChart>,
): void => {
  const timeScaleApi = chart.timeScale()
  const barSpacing = timeScaleApi.options().barSpacing
  timeScaleApi.applyOptions({ barSpacing: Math.min(barSpacing * 1.25, 80) })
}

/**
 * 缩小（X 轴 barSpacing ÷1.25，下限 0.5 = 库最小 barSpacing：可一路缩到全部数据可见）。
 *
 * @param chart 图表实例。
 */
export const zoomOut = (
  chart: ReturnType<typeof import('lightweight-charts').createChart>,
): void => {
  const timeScaleApi = chart.timeScale()
  const barSpacing = timeScaleApi.options().barSpacing
  timeScaleApi.applyOptions({ barSpacing: Math.max(barSpacing / 1.25, 0.5) })
}

/**
 * 左移（视口向左平移 60 根 K 线，看更早数据）。
 *
 * @remarks
 * 用逻辑范围平移替代 scrollToPosition（后者距右边缘不足一屏时减幅变负被 clamp，
 * 直接跳到最新数据末尾）；逻辑范围平移到达最左自然停止，无跳变。
 *
 * @param chart 图表实例。
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

/**
 * 右移（视口向右平移 60 根 K 线，看更晚数据；到达最右自然停止，不跳变）。
 *
 * @param chart 图表实例。
 */
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

/**
 * 刻度区统一应用（左右宽度一致）：逐个 Pane 设置 price scale 显隐与最小宽度。
 *
 * @remarks
 * 切换前后保持当前可见时间范围不变——刻度区开关只改变数据区宽度，
 * 不改变视图内的数据（不再 fitContent 重置视口）。
 *
 * @param chart 图表实例。
 * @param side 刻度区位置（左 / 右）。
 * @param visible 是否显示。
 */
export const applyPriceScaleVisible = (
  chart: ReturnType<typeof import('lightweight-charts').createChart>,
  side: 'left' | 'right',
  visible: boolean,
): void => {
  // 保存当前可见时间范围（秒级 {from, to}），宽度变化后恢复（视图内数据不变）。
  const visibleRange = chart.timeScale().getVisibleRange()
  const panes = chart.panes()
  panes.forEach((_, paneIndex) => {
    chart.priceScale(side, paneIndex).applyOptions({
      visible,
      borderVisible: false, // 刻度区无边框
      minimumWidth: visible ? PRICE_SCALE_MIN_WIDTH : 0, // 关闭时不占位；打开时左右宽度一致
    })
  })
  // 恢复原可见时间范围（刻度区开关仅改变数据区宽度，不改变视图内的数据）。
  if (visibleRange) chart.timeScale().setVisibleRange(visibleRange)
}

/**
 * 按当前主题重设 K 线逐根三态色（主题切换时调用，不动数据与指标）。
 *
 * @param bars 全部 K 线数据。
 * @param series K 线 series。
 * @param palette 主题三色画板。
 */
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

/**
 * 键盘十字星目标索引：方向键移动十字星的目标 bar 下标。
 *
 * @remarks
 * 基准：十字星当前命中的 bar（overlayTime 反查；鼠标 / 上次键盘位置均同步于此）；
 * 未激活（overlayTime = null）时从最后 bar 起算（首次按键即定位到最后 bar 附近）。
 * 目标 = base + delta，clamp 到 [0, bars.length - 1]。纯函数（无 chart / 状态依赖），
 * 可单测。
 *
 * @param bars 全部数据点。
 * @param overlayTime 十字星当前命中的 bar 时间（null = 未激活）。
 * @param delta 移动方向：-1 左移一根 / 1 右移一根。
 * @returns 目标下标；bars 为空返回 null（调用方直接跳过）。
 */
export const computeCrosshairTargetIndex = (
  bars: ChartDataPoint[],
  overlayTime: number | null,
  delta: -1 | 1,
): number | null => {
  if (bars.length === 0) return null
  const lastIndex = bars.length - 1
  let base = lastIndex
  if (overlayTime !== null) {
    const index = bars.findIndex((bar) => normalizeChartTime(bar.time) === overlayTime)
    if (index >= 0) base = index
  }
  return Math.max(0, Math.min(lastIndex, base + delta))
}

/**
 * 键盘十字星视口滚动量：目标 bar 索引超出当前可视 logical 范围时返回需要平移的
 * bar 数（右移为正 / 左移为负；0 = 不滚动）。
 *
 * @remarks
 *  - 十字星在可视区边缘（最后一个可见 bar）再按键：target 超界 1 根 → 滚动 1 根，
 *    视口平移一个 bar、目标进入视野（用户语义）；
 *  - 目标距可视区较远（如未激活时直接按键，base = 最后 bar）：一次滚动到目标可见，
 *    避免十字星长期停在被滚出视野的 bar 上（每按一次按键只发生一次）；
 *  - 可视范围未布局（null）→ 0（不滚动）。
 * 纯函数，不触碰 chart 实例（可单测）。
 *
 * @param targetIndex 目标 bar 下标。
 * @param visibleRange 当前可视逻辑范围（from/to 可能为小数，取整判定）。
 * @returns 需要平移的 bar 数（右移为正 / 左移为负；0 = 不滚动）。
 */
export const getCrosshairScrollOffset = (
  targetIndex: number,
  visibleRange: { from: number; to: number } | null,
): number => {
  if (visibleRange === null) return 0
  const firstVisible = Math.ceil(visibleRange.from)
  const lastVisible = Math.floor(visibleRange.to)
  if (targetIndex > lastVisible) return targetIndex - lastVisible
  if (targetIndex < firstVisible) return targetIndex - firstVisible
  return 0
}

/** 调试对象访问器（controller 注入；getter 惰性读取 → 数据 / 周期实时变化生效）。 */
export interface DebugApiAccessors {
  /** 静态字段（构造时固定）。 */
  symbol: string
  /** 静态字段（构造时固定）。 */
  name: string
  /** 静态字段（构造时固定）。 */
  period: PeriodValueOrEmpty
  /** 静态字段（构造时固定）。 */
  isTimeshare: boolean
  /** 静态字段（构造时固定）。 */
  theme: ChartThemeName
  /** 动态字段（getter 实时取最新值）。 */
  getBars: () => ChartDataPoint[]
  /** 动态字段：首根 bar 的昨收（中间值基准）。 */
  getPreClose: () => number
  /** 动态字段：对称半幅。 */
  getTimeshareHalf: () => number
  /** 动态字段：当前等差刻度序列。 */
  getScaleValues: () => (number | undefined)[] | null
  /** 动态字段：横向等分数。 */
  getHorizontalCount: () => number
  /** 视口探针（调试）：逻辑范围（null = 尚未布局）。 */
  getVisibleLogicalRange: () => { from: number; to: number } | null
  /** 视口探针（调试）：时间范围（null = 尚未布局）。 */
  getVisibleRange: () => import('lightweight-charts').IRange<import('lightweight-charts').Time> | null
  /** 十字星当前命中 bar 时间探针（调试）：拖拽 / 键盘移动时 overlayTime 是否实时跟随。 */
  getOverlayTime: () => number | null
  /** 自绘竖线 x 探针（调试）：高频移动帧级采样用（null = 未命中）。 */
  getLineX: () => number | null
  /** 竖线同步判定探针（调试）：'pixel' | 'snap' | 'none'（速度自适应验证）。 */
  getSyncMode: () => string
}

/**
 * 调试数据暴露（仅开发用）：挂 window.__klineChart，控制台实时查看当前数据与
 * 分时刻度计算。
 *
 * @remarks
 * getter 每次访问取最新值，无缓存开销：
 *  - bars：原始数据（分时点含 preClose / price / avgPrice / volume）
 *  - preClose：首根 bar 的昨收（中间值基准）
 *  - timeshareHalf：对称半幅 expandDistance = max(上偏, 下偏)
 *  - scaleValues：当前等差刻度序列（首尾 = newMax / newMin，中间 = preClose）
 *  - getMaxMin()：遍历全部 bar 返回最高 / 最低价（price / avgPrice 极值）
 *
 * @param accessors 调试访问器（见 {@link DebugApiAccessors}）。
 */
export const exposeDebugApi = (accessors: DebugApiAccessors): void => {
  const win = window as unknown as { __klineChart?: Record<string, unknown> }
  const debug: Record<string, unknown> = {}
  // 静态字段（构造时固定）。
  debug.symbol = accessors.symbol
  debug.name = accessors.name
  debug.period = accessors.period
  debug.isTimeshare = accessors.isTimeshare
  debug.theme = accessors.theme
  // 动态字段（getter 实时取最新值，随数据更新自动刷新）。
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
  // 视口探针（调试）：getVisibleLogicalRange / getVisibleRange（null = 尚未布局）。
  define('logicalRange', () => accessors.getVisibleLogicalRange())
  define('visibleRange', () => accessors.getVisibleRange())
  // 十字星命中 time 探针（调试）：拖拽 / 键盘移动时实时查看 overlayTime 是否跟随。
  define('overlayTime', () => accessors.getOverlayTime())
  // 自绘竖线 x 探针（调试）：高频移动帧级采样（null = 未命中 / pane0）。
  define('lineX', () => accessors.getLineX())
  define('syncMode', () => accessors.getSyncMode())

  // 遍历全部 bar 返回最高 / 最低价（price / avgPrice 极值）。
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
