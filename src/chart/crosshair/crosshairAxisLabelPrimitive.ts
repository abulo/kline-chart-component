// crosshairAxisLabelPrimitive.ts —— 十字星左刻度指示值 primitive。
// 职责：通过 ISeriesPrimitive 挂载到内容 Pane（pane1 / pane3 / pane5）的 series 上，
// 用 priceAxisPaneViews()（zOrder 'top'）在价格轴 top canvas 渲染十字星
// 横线对应的数值指示标签。
//
// 交互流程：
//  controller 订阅十字星移动（subscribeCrosshairMove），把十字星当前 y 通过
//  setCrosshairY() 注入本 primitive（库 MouseEventParams.point 相对当前 Pane 的
//  canvas，即 Pane 本地坐标，不再做前序 Pane 高度换算）；Pane 视图在价格轴
//  top canvas 绘制时实时反算值与位置（随平移 / 缩放一致变化）。
//
// 为什么用 priceAxisPaneViews + zOrder 'top'：
//  库 PriceAxisWidget 的 top canvas 在 Cursor 级 invalidation（十字星移动）也会
//  重绘；而 priceAxisViews 的 axis 标签（main canvas / backLabels）只在非 Cursor
//  级重绘 —— 后者导致指示值刷新迟钝（pane1 卡顿），前者让指示值跟随十字星
//  逐帧流畅刷新。此前同样用 paneViews 但 controller 错误地把 pane 本地 y 再减去
//  前序 Pane 高度和，导致 pane3/5 的 y 为负、coordinateToPrice 越界返回 null
//  而不绘制 —— 已修正（注入 y 直接用 pane 本地坐标）。
import {
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type SeriesAttachedParameter,
  type IChartApiBase,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from 'lightweight-charts'
import { CrosshairAxisLabelPaneView } from './crosshairAxisLabelPaneView'

/** 十字星指示值 primitive 配置。 */
export interface CrosshairAxisLabelConfig {
  /**
   * 所属 series（坐标反算用：coordinateToPrice 取横线所在价格）。
   * 支持函数：分时周期 pane1 动态切换 price 线 / K 线周期用 klineSeries。
   */
  series: ISeriesApi<SeriesType> | (() => ISeriesApi<SeriesType>)
  /** Pane 索引（controller 注入时判断十字星命中的 pane）。 */
  getPaneIndex: () => number
  /** 标签文字颜色（主题 textColor）。 */
  getColor: () => string
  /** 标签背景颜色（主题 background）。 */
  getBackColor: () => string
  /** 全局字体（theme.chartFont：12px chartFontFamily，与刻度标签一致）。 */
  getFont: () => string
  /** 数值格式化（与对应 AxisLabelPrimitive 同一格式化函数）。 */
  format: (price: number) => string
  /** 渲染开关（false 时不绘制；右刻度区指示值：仅分时启用）。 */
  getEnabled?: () => boolean
  /**
   * 文字对齐：'right' = 右对齐贴区右缘（默认，左刻度区）；
   * 'left' = 左对齐贴区左缘（右刻度区，与右刻度标签同侧）。
   */
  align?: 'right' | 'left'
}

/**
 * 十字星左刻度指示值 primitive。
 *
 * @remarks
 * 挂载到内容 Pane（pane1 / pane3 / pane5）的 series，价格轴 top canvas
 * 渲染十字星横线对应数值指示标签；y 由 controller 注入（Pane 本地坐标），
 * 值 = coordinateToPrice(y) 实时反算。
 */
export class CrosshairAxisLabelPrimitive implements ISeriesPrimitive<Time> {
  /** 标签配置（只读）。 */
  public readonly config: CrosshairAxisLabelConfig

  /** 挂载后的 chart 引用（attached 注入，备用）。 */
  public chartApi: IChartApiBase<Time> | null = null

  /** 当前十字星横线在 Pane 内的本地 y（null = 十字星不在此 Pane / 已清除）。 */
  private crosshairY: number | null = null

  /** 价格轴 Pane 视图（单例，priceAxisPaneViews 每次返回同一实例，避免重复创建）。 */
  private readonly paneView: CrosshairAxisLabelPaneView

  constructor(config: CrosshairAxisLabelConfig) {
    this.config = config
    this.paneView = new CrosshairAxisLabelPaneView(this)
  }

  /** primitive 挂载：保存 chart 引用。 */
  attached = (param: SeriesAttachedParameter<Time>): void  => {
    this.chartApi = param.chart
  }

  /** primitive 卸载：清空引用与状态（防内存泄漏）。 */
  detached = (): void  => {
    this.chartApi = null
    this.crosshairY = null
  }

  /**
   * 注入十字星横线 y（controller 十字星移动回调调用）；null = 清除指示值。
   *
   * @remarks
   * 同值跳过：拖拽平移 / 高频 mousemove 时 y 可能连续相同，
   * 避免无变化也触发 requestUpdate（库 fullUpdate 是平移卡顿主因之一）。
   *
   * @param y 横线在 Pane 内的本地 y（null = 清除）。
   */
  setCrosshairY = (y: number | null): void  => {
    if (this.crosshairY === y) return
    this.crosshairY = y
  }

  /** 读取当前注入的十字星 y（视图取值用）。 */
  getCrosshairY = (): number | null  => {
    return this.crosshairY
  }

  /** 价格轴 Pane 视图：zOrder 'top'，随十字星移动逐帧重绘。 */
  priceAxisPaneViews = (): readonly IPrimitivePaneView[]  => {
    return [this.paneView]
  }
}
