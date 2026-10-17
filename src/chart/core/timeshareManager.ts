/**
 * timeshareManager.ts —— 分时（1d~5d）计算管理器（v1.7.1 自 KLineChartController.ts 拆分）
 *
 * 职责：分时状态的全部"刻度 / 值域 / 等分"计算，controller 只负责调用与数据写入：
 *  - `isTimeshare`：周期判定（1d~5d，periods.isTimesharePeriod）
 *  - `preClose`：**首根 bar 的昨收**（中间值基准，1d~5d 统一，用户定版口径）
 *  - `half` / `applyPriceRange()`：区间对称扩展（symmetricExpandRange，用户定版算法）
 *    计算半幅 + 设置 pane1 左 / 右刻度 0 margins（坐标中间 ↔ 像素中间对齐，
 *    十字星指示值 = 刻度值；一字板贴 pane 边框）+ 固定 autoscale 范围 [preClose±half]
 *  - `horizontalCount`：横向等分数（指标开 6 / 关 8，与栅格 / 刻度标签同一配置）
 *  - `fixedValues`：全序列等差刻度（buildTimeshareScaleValues，首尾 = newMax/newMin，
 *    中间 = preClose），右刻度 format 为百分比
 *  - `scaleValueColor`：刻度值 vs preClose 三态着色（> 红 / < 绿 / = 平盘深白浅黑）
 */
import type { ISeriesApi } from 'lightweight-charts'
import type { ChartDataPoint } from '../../types/chart'
import { isTimesharePeriod, type PeriodValue } from '../periods'
import { symmetricExpandRange, buildTimeshareScaleValues } from '../util/timeshareScale'
import { themeColors, type ChartThemeName } from './theme'
import { resolveVsBaseColor } from './resolveBarColors'

/** 构造依赖（controller 注入，全部为惰性读取闭包 → 数据 / 周期实时变化生效） */
export interface TimeshareManagerDeps {
  /** chart 实例（priceScale 0 margins 设置） */
  chart: ReturnType<typeof import('lightweight-charts').createChart>
  /** 当前周期（1d~5d 判定） */
  getPeriod: () => PeriodValue
  /** 当前全部 bar（分时点含 preClose / price / avgPrice） */
  getBars: () => ChartDataPoint[]
  /** 附图指标层是否开启（横向等分数 6 / 8） */
  getShowIndicator: () => boolean
  /** 当前主题名（三态着色取 up/down/flat 色） */
  getTheme: () => ChartThemeName
  /** 分时价格线 series（autoscaleInfoProvider 固定对称范围） */
  getPriceSeries: () => ISeriesApi<'Line'> | null
}

export class TimeshareManager {
  /** 构造依赖（只读） */
  private readonly deps: TimeshareManagerDeps

  /** 分时对称半幅（用户定版 expandDistance = max(上偏, 下偏)）：
   *  applyPriceRange() 计算缓存；fixedValues / 价格范围共用
   *  （同一基准 → 刻度首尾恰好 = newMax / newMin，中间 = preClose） */
  half = 0

  constructor(deps: TimeshareManagerDeps) {
    this.deps = deps
  }

  /** 当前周期是否为分时（1d~5d）：
   *  pane1 双线 / 成交量直方图 / 栅格份数 / 指标过滤（无 CR）/ 无主图指标 /
   *  App 平移缩放按钮隐藏 —— 全部由该判定统一驱动 */
  get isTimeshare(): boolean {
    return isTimesharePeriod(this.deps.getPeriod())
  }

  /** 分时昨收基准：**永远取第一根 bar 的 preClose**（1d~5d 统一）。
   *  栅格中间横线 = 左刻度中间值 = 右刻度 0%。
   *  多日分时（2d~5d）同样以最早交易日第一根的 preClose 为基准。 */
  get preClose(): number {
    const bars = this.deps.getBars()
    return bars.length > 0 ? (bars[0].preClose ?? 0) : 0
  }

  /** 分时横向等分数：指标关 8 / 指标开 6（与栅格 / 刻度标签同一配置，固定） */
  get horizontalCount(): number {
    return this.deps.getShowIndicator() ? 6 : 8
  }

  /**
   * 分时 pane1 全序列固定等差刻度（用户定版）：
   * 区间对称扩展（symmetricExpandRange）：半幅 = max(上偏, 下偏)，中间值不变；
   * 刻度在 [newMin, newMax] 内**等分**（固定 6/8 等分 → 严格等差，首尾恰好 =
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

  /** 分时左右刻度按值着色：刻度值 vs 首根 preClose 三态 ——
   *  大于红（upColor）/ 小于绿（downColor）/ 等于平盘中色（flatColor，深白浅黑）。
   *  K 线周期返回 undefined（左刻度保持主题单色，不按值着色） */
  scaleValueColor = (value: number): string | undefined => {
    if (!this.isTimeshare) return undefined
    const preClose = this.preClose
    if (preClose <= 0) return undefined
    return resolveVsBaseColor(value, preClose, themeColors(this.deps.getTheme()))
  }

  /** 分时 pane1 价格范围（用户定版）：区间对称扩展 symmetricExpandRange——
   *  半幅 expandDistance = max(上偏, 下偏)，中间 = 首根 preClose 不变；
   *  范围 [mid−half, mid+half] 恰好包住最高 / 最低价（首尾刻度 = newMax / newMin），
   *  等分像素 ↔ 刻度值严格线性对应。
   *  实现：分时价格线 series 的 autoscaleInfoProvider 固定返回对称范围
   *  （lightweight-charts v5 无 PriceScaleOptions.minValue/maxValue）；
   *  provider 闭包实时读数据 → 数据加载 / 实时推送后重设即可。
   *  K 线周期 provider 返回 null（不覆盖库默认 autoscale，空 series 无贡献）。
   *  分时禁平移、缩放不改价格范围 → 固定范围下刻度标签稳定。 */
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
    // 中间值不变 → newMax = mid + dist / newMin = mid − dist（恰好包住最高 / 最低价）
    const range = symmetricExpandRange(maxPrice, preClose, minPrice)
    const half = Math.max(range.expandDistance, 0.001)
    this.half = half
    // 修复：库默认 scaleMargins 不对称（top 0.2 / bottom 0.1）→ 数据中间值
    // 映射在 0.55H 而非像素中间 H/2，导致十字星横线指示值（coordinateToPrice 反算）
    // 与刻度标签（像素等分固定值）在同一 y 显示不一致（如刻度中间 10、指示值 9.43）。
    // 分时下设置**对称 0 margins**：坐标中间 ↔ 像素中间严格对齐（十字星指示值 = 刻度值），
    // 且一字板涨停（max = preClose+half）价格线贴 pane1 上边框、一字板跌停贴下边框。
    this.deps.chart.priceScale('left', 1).applyOptions({
      scaleMargins: { top: 0, bottom: 0 },
    })
    this.deps.chart.priceScale('right', 1).applyOptions({
      scaleMargins: { top: 0, bottom: 0 },
    })
    priceSeries.applyOptions({
      autoscaleInfoProvider: () => {
        // K 线周期 / 数据清空：返回 null 不覆盖库默认 autoscale（空 series 无贡献，
        // 避免分时对称范围污染 K 线价格轴）
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
