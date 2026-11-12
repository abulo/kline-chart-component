// timeshareManager.ts —— 分时（1d~5d）计算管理器（自 KLineChartController.ts 拆分）。
// 职责：分时状态的全部"刻度 / 值域 / 等分"计算，controller 只负责调用与数据写入：
//  - isTimeshare：周期判定（1d~5d，periods.isTimesharePeriod）；
//  - preClose：首根 bar 的昨收（中间值基准，1d~5d 统一，用户定版口径）；
//  - half / applyPriceRange()：区间对称扩展（symmetricExpandRange，用户定版算法）
//    计算半幅 + 设置 pane1 左 / 右刻度 0 margins（坐标中间 ↔ 像素中间对齐，
//    十字星指示值 = 刻度值；一字板贴 pane 边框）+ 固定 autoscale 范围 [preClose±half]；
//  - horizontalCount：横向等分数（指标开 6 / 关 8，与栅格 / 刻度标签同一配置）；
//  - fixedValues：全序列等差刻度（buildTimeshareScaleValues，首尾 = newMax/newMin，
//    中间 = preClose），右刻度 format 为百分比；
//  - scaleValueColor：刻度值 vs preClose 三态着色（> 红 / < 绿 / = 平盘深白浅黑）。
import type { ISeriesApi } from 'lightweight-charts'
import type { ChartDataPoint } from '../../types/chart'
import { isTimesharePeriod, type PeriodValueOrEmpty } from '../periods'
import { normalizeDayPoints } from './constants'
import { symmetricExpandRange, buildTimeshareScaleValues } from '../util/timeshareScale'
import { normalizeChartTime } from '../util/format'
import { themeColors, type ChartThemeName } from './theme'
import { resolveVsBaseColor } from './resolveBarColors'

/** 分时渲染行：bar 为 null 表示补齐占位（只占横轴槽位，不画价格 / 成交量）。 */
export interface TimeshareRenderRow {
  /** 秒级时间戳（占位行为该交易日内推算的时刻）。 */
  time: number
  /** 所属交易日（占位行沿用当前交易日，用于天界判定）。 */
  tradeDate: string
  /** 所属数据点；null = 占位行。 */
  bar: ChartDataPoint | null
}

/** 构造依赖（controller 注入，全部为惰性读取闭包 → 数据 / 周期实时变化生效）。 */
export interface TimeshareManagerDeps {
  /** chart 实例（priceScale 0 margins 设置）。 */
  chart: ReturnType<typeof import('lightweight-charts').createChart>
  /** 当前周期（1d~5d 判定；允许 '' 空值 = 未设置）。 */
  getPeriod: () => PeriodValueOrEmpty
  /** 当前全部 bar（分时点含 preClose / price / avgPrice）。 */
  getBars: () => ChartDataPoint[]
  /** 附图指标层是否开启（横向等分数 6 / 8）。 */
  getShowIndicator: () => boolean
  /** 当前主题名（三态着色取 up/down/flat 色）。 */
  getTheme: () => ChartThemeName
  /** 分时价格线 series（autoscaleInfoProvider 固定对称范围）。 */
  getPriceSeries: () => ISeriesApi<'Line'> | null
  /** 当前市场每个交易日分时点数（用户直接传入数字，默认 241）。 */
  getDayPoints: () => number
}

/**
 * 分时（1d~5d）计算管理器。
 *
 * @remarks
 * 负责分时状态的全部刻度 / 值域 / 等分计算（见文件头注释），controller 仅调用
 * 与数据写入。关键定版算法：
 *  - 中间值 = 首根 bar 的 preClose（1d~5d 统一）；
 *  - 半幅 = symmetricExpandRange 的 expandDistance = max(|最高−preClose|, |preClose−最低|)，
 *    中间值保持不变，newMax / newMin = preClose ± half；
 *  - 刻度值在 [newMin, newMax] 内等差等分，首尾恰好 = newMax / newMin、中间 = preClose。
 */
export class TimeshareManager {
  /** 构造依赖（只读）。 */
  private readonly deps: TimeshareManagerDeps

  /**
   * 分时对称半幅（expandDistance = max(上偏, 下偏)）。
   *
   * @remarks
   * applyPriceRange() 计算缓存；fixedValues / 价格范围共用
   * （同一基准 → 刻度首尾恰好 = newMax / newMin，中间 = preClose）。
   */
  half = 0

  // 渲染行缓存（键：bar 数 + 首末时间 + 每天点数 + 周期；见 renderRows getter）。
  private renderRowsCache: TimeshareRenderRow[] = []
  private renderRowsCacheKey = ''

  constructor(deps: TimeshareManagerDeps) {
    this.deps = deps
  }

  /**
   * 当前周期是否为分时（1d~5d）。
   *
   * @remarks
   * pane1 双线 / 成交量直方图 / 栅格份数 / 指标过滤（无 CR）/ 无主图指标 /
   * App 平移缩放按钮隐藏——全部由该判定统一驱动。
   */
  get isTimeshare(): boolean {
    return isTimesharePeriod(this.deps.getPeriod())
  }

  /** 当前市场每个交易日分时点数（组件传入，非法值回退默认 241）。 */
  get dayPoints(): number {
    return normalizeDayPoints(this.deps.getDayPoints())
  }

  /**
   * 当前数据实际包含的交易日数（按 tradeDate 分组计数）。
   *
   * @remarks
   * 多日分时竖线栅格按实际天数等分（不再是"周期名义天数"）：
   * 周期 5d 但数据只有 3 天时，按 3 天等分，竖线仍落在真实交易日分界。
   */
  get dayCount(): number {
    let count = 0
    let lastDate = ''
    for (const { bar } of this.normalizedBars()) {
      if (bar.tradeDate !== lastDate) {
        lastDate = bar.tradeDate
        count++
      }
    }
    return count
  }

  /**
   * 分时竖向栅格等分数（多日分时的回退口径）。
   *
   * @remarks
   * 1d → 4 等分（延续 K 线竖等分风格）；多日分时 → 实际交易日数
   * （每个交易日交界一条竖线）。多日分时正常由 verticalRatios 按天界索引精确定位，
   * 本值在渲染行不足 2 行时作为回退；数据为空时至少按 1（不画竖线）。
   */
  get verticalCount(): number {
    const period = this.deps.getPeriod()
    if (period === '1d') return 4
    return Math.max(this.dayCount, 1)
  }

  /**
   * 分时渲染行：按"每交易日固定槽位（dayPoints）"对齐。
   *
   * @remarks
   * 不同市场每天分时点数不同（A 股 241 / 港股 331 / 美股 391 …）。原始数据
   * 若某交易日点数不足 dayPoints（半日市 / 缺失点），该日尾部补占位行
   * （时间按 1 分钟递增推算，不与次日首点冲突），使：
   *  - 多日分时每天占宽严格相等（不再出现某天被压缩 / 拉伸）；
   *  - 竖线栅格按天数等分即落在真实交易日分界。
   * 占位行只参与横轴槽位，价格线 / 均价线 / 成交量以 whitespace 形式跳过。
   * 最后一个交易日（盘中最新日）同样补齐：当日只有 120/240 条时，右侧 120 个
   * 槽位留白（呈现"当天还没走完"），数据严格占 120/240 宽度而不是被拉伸满窗。
   * 实时推送时末尾占位会占住未来时间槽位，由 realtimePipeline 检测
   * （hasTrailingPlaceholder）改为整段重排，占位随真实点数增加自动缩短。
   *
   * @returns 渲染行数组；非分时周期返回空数组。
   */
  buildRenderRows = (): TimeshareRenderRow[] => {
    if (!this.isTimeshare) return []
    const bars = this.normalizedBars()
    if (bars.length === 0) return []
    const dayPoints = this.dayPoints
    const rows: TimeshareRenderRow[] = []
    let i = 0
    while (i < bars.length) {
      const tradeDate = bars[i].bar.tradeDate
      let j = i
      while (j < bars.length && bars[j].bar.tradeDate === tradeDate) j++
      const nextTime = j < bars.length ? bars[j].time : Number.POSITIVE_INFINITY
      for (let k = i; k < j; k++) {
        rows.push({ time: bars[k].time, tradeDate, bar: bars[k].bar })
      }
      // 补齐：该日不足 dayPoints 时尾部补占位（时间 = 末点 + 1 分钟递增），
      // 与次日首个数据点时间冲突时停止（保持严格递增，不覆盖真实数据）。
      // 最后一个交易日同样补齐（无次日 → 上限 Infinity），右侧留白表示尚未交易。
      {
        const lastTime = bars[j - 1].time
        for (let k = j - i; k < dayPoints; k++) {
          const time = lastTime + (k - (j - i) + 1) * 60
          if (time >= nextTime) break
          rows.push({ time, tradeDate, bar: null })
        }
      }
      i = j
    }
    return rows
  }

  /**
   * 分时渲染行（带缓存）。
   *
   * @remarks
   * 栅格每帧读取竖线位置、数据写入读渲染行，逐帧重建 ~2000 行对象会造成 GC 抖动，
   * 故按「bar 数 + 首末时间 + 市场点数 + 周期」缓存；实时追加 / 周期切换 / 市场切换
   * 任一变化即失效重算。
   */
  get renderRows(): TimeshareRenderRow[] {
    if (!this.isTimeshare) return []
    const bars = this.deps.getBars()
    const key = [
      bars.length,
      bars[0]?.time ?? '',
      bars[bars.length - 1]?.time ?? '',
      this.dayPoints,
      this.deps.getPeriod(),
    ].join('|')
    if (this.renderRowsCacheKey !== key) {
      this.renderRowsCache = this.buildRenderRows()
      this.renderRowsCacheKey = key
    }
    return this.renderRowsCache
  }

  /**
   * 末尾是否存在占位行（最后一个交易日盘中未满）。
   *
   * @remarks
   * 占位行时间落在"未来"（当日尚未交易到的分钟），实时推送 / 新增分钟点时
   * series.update 会与既有末点时间冲突（库要求时间不早于最后数据），故实时管线
   * 需检测该标记并改为整段重排（见 RealtimePipeline.applyRealtimePoint）。
   */
  get hasTrailingPlaceholder(): boolean {
    if (!this.isTimeshare) return false
    const rows = this.renderRows
    return rows.length > 0 && rows[rows.length - 1].bar === null
  }

  /**
   * 多日分时交易日分界的竖向栅格位置（0~1 比例，相对 Pane 宽度）。
   *
   * @remarks
   * 竖线不再按"天数等分"画（最后交易日盘中未满时等分位置会偏离真实天界），
   * 而是按渲染行中交易日首行的索引占比定位：全量 fitContent 时索引与像素线性，
   * 竖线落在真实交易日分界。1d 单日返回 null（回退 4 等分，见 verticalCount）。
   *
   * @returns 天界比例数组（排除首行 0）；单日 / 非分时返回 null。
   */
  get verticalRatios(): number[] | null {
    if (!this.isTimeshare || this.deps.getPeriod() === '1d') return null
    const rows = this.renderRows
    if (rows.length < 2) return []
    const ratios: number[] = []
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].tradeDate !== rows[i - 1].tradeDate) {
        ratios.push(i / (rows.length - 1))
      }
    }
    return ratios
  }

  // 归一化 bars（time 为秒级数字，过滤非法条）——与 controller 同一口径。
  private normalizedBars = (): { bar: ChartDataPoint; time: number }[] =>
    this.deps.getBars().flatMap(bar => {
      const time = normalizeChartTime(bar.time)
      return time === null ? [] : [{ bar, time }]
    })

  /**
   * 分时昨收基准：永远取第一根 bar 的 preClose（1d~5d 统一）。
   *
   * @remarks
   * 栅格中间横线 = 左刻度中间值 = 右刻度 0%。
   * 多日分时（2d~5d）同样以最早交易日第一根的 preClose 为基准。
   */
  get preClose(): number {
    const bars = this.deps.getBars()
    return bars.length > 0 ? (bars[0].preClose ?? 0) : 0
  }

  /** 分时横向等分数：指标关 8 / 指标开 6（与栅格 / 刻度标签同一配置，固定）。 */
  get horizontalCount(): number {
    return this.deps.getShowIndicator() ? 6 : 8
  }

  /**
   * 分时 pane1 全序列固定等差刻度。
   *
   * @remarks
   * 区间对称扩展（symmetricExpandRange）：半幅 = max(上偏, 下偏)，中间值不变；
   * 刻度在 [newMin, newMax] 内等分（固定 6/8 等分 → 严格等差，首尾恰好 =
   * newMax / newMin，中间 = 首根 preClose），不随平移 / 缩放变化。
   * 右刻度 format 为百分比（价格等差 → 百分比等差，中间精确 0.00%）。
   * K 线周期返回 null（回退坐标反算，保持原行为）。
   */
  get fixedValues(): (number | undefined)[] | null {
    if (!this.isTimeshare || this.half <= 0) return null
    const preClose = this.preClose
    if (preClose <= 0) return null
    return buildTimeshareScaleValues(preClose, this.half, this.horizontalCount)
  }

  /**
   * 分时左右刻度按值着色：刻度值 vs 首根 preClose 三态。
   *
   * @remarks
   * 大于红（upColor）/ 小于绿（downColor）/ 等于平盘中色（flatColor，深白浅黑）。
   * K 线周期返回 undefined（左刻度保持主题单色，不按值着色）。
   *
   * @param value 刻度值。
   * @returns 对应三态颜色；非分时或 preClose 无效时返回 undefined。
   */
  scaleValueColor = (value: number): string | undefined => {
    if (!this.isTimeshare) return undefined
    const preClose = this.preClose
    if (preClose <= 0) return undefined
    return resolveVsBaseColor(value, preClose, themeColors(this.deps.getTheme()))
  }

  /**
   * 分时 pane1 价格范围（区间对称扩展，用户定版）。
   *
   * @remarks
   * 半幅 expandDistance = max(上偏, 下偏)，中间 = 首根 preClose 不变；
   * 范围 [mid−half, mid+half] 恰好包住最高 / 最低价（首尾刻度 = newMax / newMin），
   * 等分像素 ↔ 刻度值严格线性对应。
   * 实现：分时价格线 series 的 autoscaleInfoProvider 固定返回对称范围
   * （lightweight-charts v5 无 PriceScaleOptions.minValue/maxValue）；
   * provider 闭包实时读数据 → 数据加载 / 实时推送后重设即可。
   * 另设置左 / 右刻度对称 0 margins：坐标中间 ↔ 像素中间严格对齐（十字星指示值 =
   * 刻度值），且一字板涨停（max = preClose+half）价格线贴 pane1 上边框、
   * 一字板跌停贴下边框。
   * K 线周期 provider 返回 null（不覆盖库默认 autoscale，空 series 无贡献）。
   * 分时禁平移、缩放不改价格范围 → 固定范围下刻度标签稳定。
   */
  applyPriceRange = (): void => {
    if (!this.isTimeshare) return
    const priceSeries = this.deps.getPriceSeries()
    if (!priceSeries) return
    const preClose = this.preClose
    if (preClose <= 0) return
    const bars = this.deps.getBars()
    let maxPrice = preClose
    let minPrice = preClose
    for (const bar of bars) {
      const high = Math.max(bar.price ?? 0, bar.avgPrice ?? 0)
      const low = Math.min(bar.price ?? 0, bar.avgPrice ?? 0)
      if (high > maxPrice) maxPrice = high
      if (low < minPrice) minPrice = low
    }
    // 区间对称扩展（用户定版 symmetricExpandRange）：半幅 = max(上偏, 下偏)，
    // 中间值不变 → newMax = mid + dist / newMin = mid − dist（恰好包住最高 / 最低价）。
    const range = symmetricExpandRange(maxPrice, preClose, minPrice)
    const half = Math.max(range.expandDistance, 0.001)
    this.half = half
    // 修复：库默认 scaleMargins 不对称（top 0.2 / bottom 0.1）→ 数据中间值
    // 映射在 0.55H 而非像素中间 H/2，导致十字星横线指示值（coordinateToPrice 反算）
    // 与刻度标签（像素等分固定值）在同一 y 显示不一致（如刻度中间 10、指示值 9.43）。
    // 分时下设置对称 0 margins：坐标中间 ↔ 像素中间严格对齐。
    this.deps.chart.priceScale('left', 1).applyOptions({
      scaleMargins: { top: 0, bottom: 0 },
    })
    this.deps.chart.priceScale('right', 1).applyOptions({
      scaleMargins: { top: 0, bottom: 0 },
    })
    priceSeries.applyOptions({
      autoscaleInfoProvider: () => {
        // K 线周期 / 数据清空：返回 null 不覆盖库默认 autoscale（空 series 无贡献，
        // 避免分时对称范围污染 K 线价格轴）。
        if (!this.isTimeshare || bars.length === 0) return null
        return {
          priceRange: {
            minValue: preClose - half,
            maxValue: preClose + half,
          },
        }
      },
    })
  }
}
