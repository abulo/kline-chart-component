// realtimePipeline.ts —— 实时增量管线（自 KLineChartController.ts 拆分）。
// 职责边界：实时订阅数据从"入队"到"上屏"的完整链路——
//  - 节流入队（enqueueRealtimePoint）：WS / SSE / 轮询高频推送合并为
//    REALTIME_FLUSH_MS 窗口内一次批量消费，避免数据争抢与逐点重建开销；
//  - 单点应用（applyRealtimePoint）：series 增量更新 + bars/barIndex 维护；
//  - 视口跟随（followLastBarIfTracking）：实时追加后保持当前视口宽度（放大/缩小状态不变）
//    可视（priceLine 恒在视口，用户左滑看历史时不抢回视口）；
//  - 指标缓存重建（rebuildRealtimeIndicators）：批量窗口统一重建一次。
// 与渲染解耦：bars / barIndex / series 均经 deps getter 取得引用直接变异
// （JS 引用语义），controller 侧状态同步变化，行为与单文件时代完全一致。
import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { createChart } from 'lightweight-charts'
import type { ChartDataPoint } from '../../types/chart'
import { normalizeChartTime } from '../util/format'
import { resolveBarColors } from './resolveBarColors'
import { themeColors, type ChartThemeName } from './theme'
import { REALTIME_FLUSH_MS } from './constants'
import { throttle, type Throttled } from '../util/timing'

/** RealtimePipeline 依赖（controller 注入；series 均可空——构造前未建 / 周期切换残留）。 */
export interface RealtimePipelineDeps {
  /** 图表实例 getter（惰性：controller 构造内 pipeline 先于 chart 创建，须取最新值而非快照）。 */
  getChart: () => ReturnType<typeof createChart>
  /** 当前 bars 数组引用（单点应用直接 push / 下标更新，controller 状态同步）。 */
  getBars: () => ChartDataPoint[]
  /** 当前 barIndex Map 引用（time → bar，实时增量 O(1) 维护 tooltip 索引）。 */
  getBarIndex: () => Map<number, ChartDataPoint>
  /** 是否分时周期（分时：价格/均价线 + 成交量直方图；K 线：K 线/成交量柱体）。 */
  getIsTimeshare: () => boolean
  /** 当前主题（K 线实时三态着色 resolveBarColors 用）。 */
  getTheme: () => ChartThemeName
  /** K 线 series（可能未创建，调用前判空）。 */
  getKlineSeries: () => ISeriesApi<'Candlestick'> | undefined
  /** 成交量 series（可能未创建，调用前判空）。 */
  getVolumeSeries: () => ISeriesApi<'Histogram'> | undefined
  /** 分时价格线 series（可能未创建，调用前判空）。 */
  getTimesharePriceSeries: () => ISeriesApi<'Line'> | undefined
  /** 分时均价线 series（可能未创建，调用前判空）。 */
  getTimeshareAvgSeries: () => ISeriesApi<'Line'> | undefined
  /** 分时右刻度承载 series（可能未创建，调用前判空）。 */
  getTimeshareRightAxisSeries: () => ISeriesApi<'Line'> | undefined
  /** 指标缓存统一重建（controller：volume / 主图 / 附图 / 分时价格范围）。 */
  onRebuildIndicators: () => void
}

/**
 * 实时增量管线：节流入队 → 批量消费 → 逐点应用 → 指标重建 + 视口跟随。
 *
 * @remarks
 * 节流语义：订阅回调进队列，REALTIME_FLUSH_MS 窗口内一次性消费——数据不丢
 * （trailing 保留末次点），渲染合并（避免高频推送逐点重建指标缓存导致的争抢 / 卡顿）。
 */
export class RealtimePipeline {
  // 实时推送队列（节流）：订阅回调进入队列，REALTIME_FLUSH_MS 窗口内由
  // realtimeFlush 一次性消费。
  private realtimeQueue: ChartDataPoint[] = []
  // 实时批量 flush（throttle 包装，节流）：消费队列 → 逐点应用 series/bars
  // → 统一重建指标缓存一次（避免高频推送逐点重建导致的争抢 / 卡顿）。
  private readonly realtimeFlush: Throttled<[]> = throttle((): void => {
    if (this.realtimeQueue.length === 0) return
    const batch = this.realtimeQueue
    this.realtimeQueue = []
    for (const point of batch) this.applyRealtimePoint(point)
    this.rebuildRealtimeIndicators()
  }, REALTIME_FLUSH_MS)

  constructor(private readonly deps: RealtimePipelineDeps) {}

  /**
   * 实时订阅回调入口（节流批量）。
   *
   * @remarks
   * WS / SSE / 轮询高频推送合并为窗口内一次批量应用，避免数据争抢；单点透传不丢数据。
   *
   * @param point 实时推送的数据点。
   */
  enqueueRealtimePoint = (point: ChartDataPoint): void => {
    this.realtimeQueue.push(point)
    this.realtimeFlush()
  }

  // 实时单点应用（series 更新 + bars/barIndex 维护）：
  //  - 同 time = 刷新最后一点（series.update 覆盖语义）；
  //  - time 更大 = 追加新点（实时推送）。
  // 按周期接收对应点类型：K 线周期收 pointType='kline'（update K 线 / 成交量锚点），
  // 分时周期收 'timeshare'（update 价格 / 均价线 / 成交量直方图）。
  // 不含指标缓存重建：单点入口（updateLastBar）与批量入口（realtimeFlush）
  // 共用本方法，重建由调用方统一执行一次，避免逐点重建开销。
  private applyRealtimePoint = (point: ChartDataPoint): void => {
    const bars = this.deps.getBars()
    const isTimeshare = this.deps.getIsTimeshare()
    const expected = isTimeshare ? 'timeshare' : 'kline'
    if (point.pointType !== expected) return
    // time 统一归一化为数字秒（防 BusinessDay 对象 → series.update 报错）。
    const time = normalizeChartTime(point.time)
    if (time === null) return
    // 越界防御：新 time 早于最后一根（周期切换残留 / 旧周期实时推送）→ 忽略，
    // 避免 lightweight-charts "Cannot update oldest data, last time=[object Object]"。
    const last = bars[bars.length - 1]
    if (last && time < normalizeChartTime(last.time)!) return
    if (isTimeshare) {
      // 分时：更新价格 / 均价线 + 成交量锚点（1px 细柱由 VolumeBarPrimitive 自绘，
      // 红绿按 price vs preClose 三态）。
      this.deps.getTimesharePriceSeries()?.update({
        time: time as UTCTimestamp,
        value: point.price ?? 0,
      })
      this.deps.getTimeshareAvgSeries()?.update({
        time: time as UTCTimestamp,
        value: point.avgPrice ?? 0,
      })
      this.deps.getVolumeSeries()?.update({
        time: time as UTCTimestamp,
        value: point.volume ?? 0,
      })
      // 右刻度承载 series 同步（保持 right scale 有数据，见 applyData 注释）。
      this.deps.getTimeshareRightAxisSeries()?.update({
        time: time as UTCTimestamp,
        value: point.price ?? 0,
      })
    } else {
      this.deps.getKlineSeries()?.update({
        time: time as UTCTimestamp,
        open: point.open!,
        high: point.high!,
        low: point.low!,
        close: point.close!,
        ...resolveBarColors(point, themeColors(this.deps.getTheme())), // 三态色随实时数据更新
      })
      this.deps.getVolumeSeries()?.update({
        time: time as UTCTimestamp,
        value: point.volume ?? 0,
      })
      // 右刻度承载 series 同步（K 线实时推送保持 right scale 有数据）。
      this.deps.getTimeshareRightAxisSeries()?.update({
        time: time as UTCTimestamp,
        value: point.close ?? 0,
      })
    }
    if (last && time > normalizeChartTime(last.time)!) {
      bars.push({ ...point, time })
      // priceLine 修复：实时追加新 bar 后最后 bar 的 logical index 变大，
      // 视口若仍固定在旧 120 根范围 → 最后 bar 逐渐移出视口 → 库 priceLine
      // （画在最后 bar 位置）随之消失（"不操作，一会这条线就没有了"）。
      // 仅当视口右边缘贴近最后 bar（用户未左滑看历史）时跟随——保持最后 120 根
      // 可视 + 价格线恒在视口；用户左滑查看更早数据时不抢回视口。
      this.followLastBarIfTracking()
    } else {
      const index = bars.findIndex(bar => normalizeChartTime(bar.time) === time)
      if (index >= 0) bars[index] = { ...point, time }
    }
    // 实时增量维护 tooltip 索引（O(1)；批量场景走 rebuildBarIndex）。
    this.deps.getBarIndex().set(time, { ...point, time })
  }

  // 实时视口跟随（priceLine 修复）：K 线模式实时追加新 bar 后，
  // 若视口右边缘贴近最后 bar（用户未左滑查看更早历史），将右缘重新贴到
  // 数据末尾——最后 bar（及库 priceLine）恒在视口内；用户左滑看历史
  // （右边缘远离最后 bar）时不抢回视口。
  // 分时模式：视口由 fitContent 固定（整日数据无追加），直接跳过。
  // 改用 scrollToPosition(0,false)（右偏移置 0），barSpacing / 视口宽度保持——
  // 放大 / 缩小状态不被实时推送重置（"放大后复原" bug）。
  private followLastBarIfTracking = (): void => {
    const bars = this.deps.getBars()
    if (this.deps.getIsTimeshare() || bars.length === 0) return
    const range = this.deps.getChart().timeScale().getVisibleLogicalRange()
    if (!range) return
    const lastIndex = bars.length - 1
    // 仅当视口右缘与最后 bar 相差不足 1 根（贴住数据末尾、未主动平移 / 越界）时跟随；
    // lightweight-charts 允许逻辑范围越出数据右缘（拖拽后 to 可 > lastIndex），
    // 此时若用宽松条件（to >= lastIndex - 1）会在下一次实时推送把视口拽回最后 120 根
    // （"右移 10 多条后一段时间复原" 修复）——越界（to > lastIndex）或
    // 看历史（to < lastIndex - 1）均视为用户已脱离跟踪，实时追加不再抢回视口。
    if (Math.abs(range.to - lastIndex) < 1) {
      // scrollToPosition(0, false) 直接设置右偏移 0（右缘贴数据末尾），
      // barSpacing / 视口宽度完全不变（用户放大 / 缩小状态不被实时推送重置）——
      // 原实现 setVisibleLogicalRange 固定拉回最后 VISIBLE_BAR_COUNT 根（"放大 5
      // 次等待 10 秒后图像复原" bug）；且 setVisibleLogicalRange 会按目标范围重算
      // barSpacing（每帧 -1px 宽度漂移），scrollToPosition 无此副作用。
      this.deps.getChart().timeScale().scrollToPosition(0, false)
    }
  }

  // 实时指标缓存统一重建（节流关键）：单点入口（updateLastBar）与批量
  // flush（realtimeFlush）共用，高频推送窗口内只重建一次，避免逐点重建开销。
  private rebuildRealtimeIndicators = (): void => {
    this.deps.onRebuildIndicators()
  }

  /**
   * 实时增量更新（ChartDataService 订阅回调；外部 / 测试单点调用入口）。
   *
   * @remarks
   * series 更新 + bars/barIndex 维护 + 指标缓存重建（单点立即执行，语义与
   * 节流改造前一致）；订阅内部走 enqueueRealtimePoint（节流批量合并）。
   *
   * @param point 实时推送的数据点。
   */
  updateLastBar = (point: ChartDataPoint): void => {
    this.applyRealtimePoint(point)
    this.rebuildRealtimeIndicators()
  }

  /** 销毁清理：取消窗口内 trailing 定时器 + 清空未消费队列（防泄漏 / 防销毁后回调）。 */
  cancel = (): void => {
    this.realtimeFlush.cancel()
    this.realtimeQueue = []
  }
}
