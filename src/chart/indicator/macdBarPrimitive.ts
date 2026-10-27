// macdBarPrimitive.ts —— MACD 柱体自绘 primitive。
// 职责：通过 ISeriesPrimitive 挂载到 pane5 MACD 指标 series 上，自绘红绿柱。
// 视觉与 pane3 成交量 / pane1 K 线完全一致：
//  - 柱宽 = candlestickBarWidth(barSpacing, dpr)（与成交量同一函数，
//    宽度 / 间隔与 pane1 蜡烛柱绝对一致）；
//  - 柱中心 = 同一逻辑索引的 logicalToCoordinate（与 pane1 / pane3 柱位对齐）；
//  - 柱 > 0：空心红柱（背景色填充 + 红色边框，同 pane1 上涨柱）；
//  - 柱 < 0：绿色实心（同 pane1 下跌柱）；
//  - 柱底基准 = 数据区中间（与中间刻度固定值 0 对齐），柱从中间向上下延伸；
//  - 延伸量 = 值相对 0 轴的像素距离（priceToCoordinate 差值）。
// 注意：MACD 指标 series 数据不可见（color = 背景色），仅用于建立 Y 轴
//（DIF / DEA / MACD 值域）的 scale 锚点。
import {
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type SeriesAttachedParameter,
  type ISeriesApi,
  type IChartApiBase,
  type Time,
} from 'lightweight-charts'
import type { MacdThemeColors } from './macdBarPaneView'
import { MacdBarPaneView } from './macdBarPaneView'

/** MACD 指标数据点（由 controller 从 calcMACD 三线适配而来，供柱体自绘与 Y 轴锚点共用）。 */
export interface MacdPoint {
  /** bar 时间（与 K 线一致）。 */
  time: number
  /** DIF = EMA(C,12) - EMA(C,26)。 */
  dif: number
  /** DEA = EMA(DIF,9)。 */
  dea: number
  /** 柱值 = (DIF - DEA) × 2。 */
  macd: number
}

/**
 * MACD 柱体自绘 primitive。
 *
 * @remarks
 * 挂载到 pane5 MACD 指标 series，自绘红绿柱（视觉与 pane1/ pane3 一致）；
 * 柱宽 / 柱位与 K 线同一函数、同一逻辑索引，绝对对齐；
 * 分时周期柱宽自适应（timeshareBarWidth，保底可见）。
 */
export class MacdBarPrimitive implements ISeriesPrimitive<Time> {
  /** MACD 指标数据获取器（只读；每次 draw 现取，数据更新无需额外通知）。 */
  public readonly getPoints: () => readonly MacdPoint[]
  /** 主题颜色获取器（只读；draw 时动态取色，主题切换无需额外刷新）。 */
  public readonly getThemeColors: () => MacdThemeColors

  /** 挂载后的 chart 引用（draw 时取 timeScale；attached 时注入）。 */
  public chartApi: IChartApiBase<Time> | null = null
  /** 挂载后的 series 引用（draw 时取 priceScale；attached 时注入）。 */
  public seriesApi: ISeriesApi<'Histogram'> | null = null

  /** 渲染视图（单例：构造时创建一次，paneViews 每次返回同一实例，避免每帧重复创建对象）。 */
  private readonly paneView: MacdBarPaneView
  /**
   * 分时模式判定：分时 MACD 柱宽自适应（timeshareBarWidth，保底可见），
   * K 线周期柱宽与 pane1 一致。
   */
  public readonly getIsTimeshare: () => boolean

  constructor(
    getPoints: () => readonly MacdPoint[],
    getThemeColors: () => MacdThemeColors,
    getIsTimeshare: () => boolean = () => false,
  ) {
    this.getPoints = getPoints
    this.getThemeColors = getThemeColors
    this.getIsTimeshare = getIsTimeshare
    this.paneView = new MacdBarPaneView(this)
  }

  /** primitive 挂载：保存 chart / series 引用供 draw 使用。 */
  attached = (param: SeriesAttachedParameter<Time>): void  => {
    this.chartApi = param.chart
    this.seriesApi = param.series as ISeriesApi<'Histogram'>
  }

  /** primitive 卸载：清空引用（防内存泄漏）。 */
  detached = (): void  => {
    this.chartApi = null
    this.seriesApi = null
  }

  /** 返回本 primitive 的 pane 视图（渲染器；单例复用，避免每帧 new 对象）。 */
  paneViews = (): readonly IPrimitivePaneView[]  => {
    return [this.paneView]
  }
}
