/**
 * crosshairAxisLabelPrimitive.ts —— 十字星左刻度指示值 primitive（v1.4.40）
 *
 * 职责：通过 ISeriesPrimitive 挂载到内容 Pane（pane1 / pane3 / pane5）的 series 上，
 * 用 **priceAxisPaneViews()**（zOrder 'top'）在价格轴 **top canvas** 渲染十字星
 * 横线对应的数值指示标签。
 *
 * 交互流程：
 *   controller 订阅十字星移动（subscribeCrosshairMove），把十字星当前 y 通过
 *   setCrosshairY() 注入本 primitive（**库 MouseEventParams.point 相对当前 Pane 的
 *   canvas，即 Pane 本地坐标，不再做前序 Pane 高度换算**）；Pane 视图在价格轴
 *   top canvas 绘制时实时反算值与位置（随平移 / 缩放一致变化）。
 *
 * 为什么用 priceAxisPaneViews + zOrder 'top'：
 *   库 PriceAxisWidget 的 top canvas 在 Cursor 级 invalidation（十字星移动）也会
 *   重绘；而 priceAxisViews 的 axis 标签（main canvas / backLabels）只在非 Cursor
 *   级重绘 —— 后者（v1.4.39）导致指示值刷新迟钝（pane1 卡顿），前者（本版）
 *   让指示值跟随十字星逐帧流畅刷新。v1.4.38 同样用 paneViews 但当时 controller
 *   错误地把 pane 本地 y 再减去前序 Pane 高度和，导致 pane3/5 的 y 为负、
 *   coordinateToPrice 越界返回 null 而不绘制 —— 本次一并修正。
 *
 * 依赖：标签视图 CrosshairAxisLabelPaneView（同目录独立文件，实现 IPrimitivePaneView）。
 */
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

export interface CrosshairAxisLabelConfig {
  /** 所属 series（坐标反算用：coordinateToPrice 取横线所在价格） */
  series: ISeriesApi<SeriesType>
  /** Pane 索引（controller 注入时判断十字星命中的 pane） */
  getPaneIndex: () => number
  /** 标签文字颜色（主题 textColor） */
  getColor: () => string
  /** 标签背景颜色（主题 background） */
  getBackColor: () => string
  /** 全局字体（主题 chartFontFamily 组合 12px） */
  getFont: () => string
  /** 数值格式化（与对应 AxisLabelPrimitive 同一格式化函数） */
  format: (price: number) => string
}

export class CrosshairAxisLabelPrimitive implements ISeriesPrimitive<Time> {
  /** 标签配置（只读） */
  public readonly config: CrosshairAxisLabelConfig

  /** 挂载后的 chart 引用（attached 注入，备用） */
  public chartApi: IChartApiBase<Time> | null = null

  /** 当前十字星横线在 Pane 内的本地 y（null = 十字星不在此 Pane / 已清除） */
  private crosshairY: number | null = null

  /** 价格轴 Pane 视图（单例，priceAxisPaneViews 每次返回同一实例，避免重复创建） */
  private readonly paneView: CrosshairAxisLabelPaneView

  constructor(config: CrosshairAxisLabelConfig) {
    this.config = config
    this.paneView = new CrosshairAxisLabelPaneView(this)
  }

  /** primitive 挂载：保存 chart 引用 */
  attached(param: SeriesAttachedParameter<Time>): void {
    this.chartApi = param.chart
  }

  /** primitive 卸载：清空引用与状态（防内存泄漏） */
  detached(): void {
    this.chartApi = null
    this.crosshairY = null
  }

  /** 注入十字星横线 y（controller 十字星移动回调调用）；null = 清除指示值 */
  setCrosshairY(y: number | null): void {
    this.crosshairY = y
  }

  /** 读取当前注入的十字星 y（视图取值用） */
  getCrosshairY(): number | null {
    return this.crosshairY
  }

  /** 价格轴 Pane 视图：zOrder 'top'，随十字星移动逐帧重绘 */
  priceAxisPaneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView]
  }
}
