/**
 * sarMarkerPrimitive.ts —— SAR 圆点绘制插件
 *
 * SAR（抛物线转向）在东财等行情软件中显示为 K 线上方/下方的圆点：
 *  - 多头趋势：圆点在 K 线下方（支撑位）；
 *  - 空头趋势：圆点在 K 线上方（压力位）。
 *
 * 颜色按涨跌方向着色（与 K 线红涨绿跌一致）：
 *  - 多头 / 上涨：红色圆点；
 *  - 空头 / 下跌：绿色圆点。
 *
 * lightweight-charts 的 LineSeries 只能画连线、不能只画点，
 * 故用自定义 ISeriesPrimitive 在蜡烛图 Pane 上逐点绘制：
 *  - zOrder 'top'，画在 K 线之上；
 *  - 数据由控制器每次全量重算后 setData 到本插件（SarPoint 数组）；
 *  - 支持 visible 开关（关闭时跳过绘制）。
 */
import {
  type IChartApi,
  type ISeriesApi,
  type IPrimitivePaneView,
  type PrimitivePaneViewZOrder,
  type ISeriesPrimitive,
  type Logical,
  type Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { SarPoint } from './'
import type { ChartThemeColors } from '../core/theme'

/** 圆点半径（CSS px） */
const DOT_RADIUS = 2.5

export class SarMarkerPrimitive implements ISeriesPrimitive<Time> {
  private _view: SarMarkerPaneView
  private _visible = true
  /** chart 引用：setVisible 显隐变化后触发重绘（库 primitive 无自动 invalidate，需手动） */
  private readonly _chart: IChartApi

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    private _getLines: () => SarPoint[],
    theme: ChartThemeColors,
  ) {
    this._chart = chart
    this._view = new SarMarkerPaneView(chart, series, () => {
      if (!this._visible) return []
      return this._getLines()
    }, theme)
  }

  /** 主题切换：更新上涨/下跌圆点色并触发重绘 */
  setTheme(theme: ChartThemeColors): void {
    this._view.setTheme(theme)
    this._chart.applyOptions({}) // 空 applyOptions 触发库 fullUpdate（颜色下次 draw 生效）
  }

  /** 显隐开关（供指标切换按钮调用）：变化后立即触发重绘，保证点击立即可见 */
  setVisible(v: boolean): void {
    if (this._visible === v) return
    this._visible = v
    // ChartModel.applyOptions 末尾无条件 fullUpdate —— 空对象即可安全触发重绘，
    // 否则仅改标志不会引起库 invalidate，SAR 圆点不刷新
    this._chart.applyOptions({})
  }

  get visible(): boolean {
    return this._visible
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._view]
  }
}

class SarMarkerPaneView implements IPrimitivePaneView {
  private _renderer: SarMarkerRenderer

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    getLines: () => SarPoint[],
    theme: ChartThemeColors,
  ) {
    this._renderer = new SarMarkerRenderer(chart, series, getLines, theme)
  }

  /** 主题切换：透传给 renderer */
  setTheme(theme: ChartThemeColors): void {
    this._renderer.setTheme(theme)
  }

  // zOrder 'normal'：绘制在 series 之上、库十字星之下（标记不再遮挡十字星虚线）
  zOrder(): PrimitivePaneViewZOrder {
    return 'normal'
  }

  renderer() {
    return this._renderer
  }
}

class SarMarkerRenderer {
  private _chart: IChartApi
  private _series: ISeriesApi<'Candlestick'>
  private _getLines: () => SarPoint[]
  /** SAR 上涨圆点色（与 K 线上涨色一致） */
  private _upColor: string
  /** SAR 下跌圆点色（与 K 线下跌色一致） */
  private _downColor: string

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    getLines: () => SarPoint[],
    theme: ChartThemeColors,
  ) {
    this._chart = chart
    this._series = series
    this._getLines = getLines
    this._upColor = theme.sarUp
    this._downColor = theme.sarDown
  }

  /** 主题切换：更新颜色（下次 draw 生效） */
  setTheme(theme: ChartThemeColors): void {
    this._upColor = theme.sarUp
    this._downColor = theme.sarDown
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hp = scope.horizontalPixelRatio
      const vp = scope.verticalPixelRatio

      const lines = this._getLines()
      if (lines.length === 0) return

      // 只绘制可视区域内的 SAR 点（性能 + 避免画到画布外）
      const ts = this._chart.timeScale()
      const range = ts.getVisibleLogicalRange()
      if (!range) return

      // SAR 与 K 线一一对应（每根都有值），lines 下标即 K 线逻辑下标
      const from = Math.max(0, Math.floor(range.from))
      const to = Math.min(lines.length - 1, Math.ceil(range.to))

      // 按方向分两组绘制：多头红、空头绿（一次 fill 两种颜色）
      const up: { x: number; y: number }[] = []
      const down: { x: number; y: number }[] = []
      for (let i = from; i <= to; i++) {
        const l = lines[i]
        const x = ts.logicalToCoordinate(i as Logical)
        if (x === null) continue
        const y = this._series.priceToCoordinate(l.value)
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

      fillDots(up, this._upColor)
      fillDots(down, this._downColor)
    })
  }
}
