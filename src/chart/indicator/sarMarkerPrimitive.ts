// sarMarkerPrimitive.ts —— SAR 圆点绘制插件。
// SAR（抛物线转向）在东财等行情软件中显示为 K 线上方/下方的圆点：
//  - 多头趋势：圆点在 K 线下方（支撑位）；
//  - 空头趋势：圆点在 K 线上方（压力位）。
// 颜色按涨跌方向着色（与 K 线红涨绿跌一致）：
//  - 多头 / 上涨：红色圆点；
//  - 空头 / 下跌：绿色圆点。
// lightweight-charts 的 LineSeries 只能画连线、不能只画点，
// 故用自定义 ISeriesPrimitive 在蜡烛图 Pane 上逐点绘制：
//  - zOrder 'normal'，画在 K 线之上、十字星之下；
//  - 数据由控制器每次全量重算后 setData 到本插件（SarPoint 数组）；
//  - 支持 visible 开关（关闭时跳过绘制）。
import {
  type IChartApi,
  type ISeriesApi,
  type IPrimitivePaneView,
  type IPrimitivePaneRenderer,
  type PrimitivePaneViewZOrder,
  type ISeriesPrimitive,
  type Logical,
  type Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { SarPoint } from './'
import type { ChartThemeColors } from '../core/theme'

/** 圆点半径（CSS px）。 */
const DOT_RADIUS = 2.5

/**
 * SAR 圆点绘制插件。
 *
 * @remarks
 * 逐点绘制 SAR 圆点（多头红 / 空头绿，与 K 线涨跌色一致）；
 * 数据由控制器全量重算后注入；zOrder 'normal' 绘制在 K 线之上、
 * 十字星之下（不遮挡十字星虚线）。
 */
export class SarMarkerPrimitive implements ISeriesPrimitive<Time> {
  private view: SarMarkerPaneView
  private visibleValue = true
  /** chart 引用：setVisible 显隐变化后触发重绘（库 primitive 无自动 invalidate，需手动）。 */
  private readonly chart: IChartApi

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    private getLines: () => SarPoint[],
    theme: ChartThemeColors,
  ) {
    this.chart = chart
    this.view = new SarMarkerPaneView(chart, series, () => {
      if (!this.visibleValue) return []
      return this.getLines()
    }, theme)
  }

  /** 主题切换：更新上涨/下跌圆点色并触发重绘。 */
  setTheme = (theme: ChartThemeColors): void  => {
    this.view.setTheme(theme)
    this.chart.applyOptions({}) // 空 applyOptions 触发库 fullUpdate（颜色下次 draw 生效）
  }

  /** 显隐开关（供指标切换按钮调用）：变化后立即触发重绘，保证点击立即可见。 */
  setVisible = (v: boolean): void  => {
    if (this.visibleValue === v) return
    this.visibleValue = v
    // ChartModel.applyOptions 末尾无条件 fullUpdate —— 空对象即可安全触发重绘，
    // 否则仅改标志不会引起库 invalidate，SAR 圆点不刷新。
    this.chart.applyOptions({})
  }

  /** 当前可见状态。 */
  get visible(): boolean {
    return this.visibleValue
  }

  /** Pane 视图（SAR 圆点渲染视图）。 */
  paneViews = (): readonly IPrimitivePaneView[]  => {
    return [this.view]
  }
}

// SAR 圆点渲染视图（zOrder 'normal'：绘制在 series 之上、库十字星之下）。
class SarMarkerPaneView implements IPrimitivePaneView {
  /** 渲染器（单例复用，避免重复创建与内存泄漏；闭包持有 primitive 引用）。 */
  private rendererImpl: SarMarkerRenderer

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    getLines: () => SarPoint[],
    theme: ChartThemeColors,
  ) {
    this.rendererImpl = new SarMarkerRenderer(chart, series, getLines, theme)
  }

  /** 主题切换：透传给 renderer。 */
  setTheme = (theme: ChartThemeColors): void  => {
    this.rendererImpl.setTheme(theme)
  }

  /** zOrder 'normal'：绘制在 series 之上、库十字星之下（标记不再遮挡十字星虚线）。 */
  zOrder = (): PrimitivePaneViewZOrder  => {
    return 'normal'
  }

  /** 返回渲染器。 */
  renderer = (): IPrimitivePaneRenderer => {
    return this.rendererImpl
  }
}

// SAR 圆点渲染器：真正执行 canvas 绘制（bitmap 坐标空间，物理像素对齐）。
class SarMarkerRenderer {
  private chart: IChartApi
  private series: ISeriesApi<'Candlestick'>
  private getLines: () => SarPoint[]
  /** SAR 上涨圆点色（与 K 线上涨色一致）。 */
  private upColor: string
  /** SAR 下跌圆点色（与 K 线下跌色一致）。 */
  private downColor: string

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    getLines: () => SarPoint[],
    theme: ChartThemeColors,
  ) {
    this.chart = chart
    this.series = series
    this.getLines = getLines
    this.upColor = theme.sarUp
    this.downColor = theme.sarDown
  }

  /** 主题切换：更新颜色（下次 draw 生效）。 */
  setTheme = (theme: ChartThemeColors): void  => {
    this.upColor = theme.sarUp
    this.downColor = theme.sarDown
  }

  /** 库绘制时调用：按涨跌方向分两组绘制圆点（一次 fill 两种颜色）。 */
  draw = (target: CanvasRenderingTarget2D): void  => {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hp = scope.horizontalPixelRatio
      const vp = scope.verticalPixelRatio

      const lines = this.getLines()
      if (lines.length === 0) return

      // 只绘制可视区域内的 SAR 点（性能 + 避免画到画布外）。
      const ts = this.chart.timeScale()
      const range = ts.getVisibleLogicalRange()
      if (!range) return

      // SAR 与 K 线一一对应（每根都有值），lines 下标即 K 线逻辑下标。
      const from = Math.max(0, Math.floor(range.from))
      const to = Math.min(lines.length - 1, Math.ceil(range.to))

      // 按方向分两组绘制：多头红、空头绿（一次 fill 两种颜色）。
      const up: { x: number; y: number }[] = []
      const down: { x: number; y: number }[] = []
      for (let i = from; i <= to; i++) {
        const l = lines[i]
        const x = ts.logicalToCoordinate(i as Logical)
        if (x === null) continue
        const y = this.series.priceToCoordinate(l.value)
        if (y === null) continue
        const px = Math.round(x * hp)
        const py = Math.round(y * vp)
        ;(l.trend > 0 ? up : down).push({ x: px, y: py })
      }

      const fillDots = (pts: { x: number; y: number }[], color: string) => {
        if (!pts.length) return
        ctx.fillStyle = color
        ctx.beginPath()
        for (const p of pts) {
          ctx.moveTo(p.x + DOT_RADIUS * hp, p.y)
          ctx.arc(p.x, p.y, DOT_RADIUS * hp, 0, Math.PI * 2)
        }
        ctx.fill()
      }

      fillDots(up, this.upColor)
      fillDots(down, this.downColor)
    })
  }
}
