/**
 * macdBarPaneView.ts —— MACD 柱体自绘渲染视图（v1.4.18）
 *
 * 职责：提供 IPrimitivePaneRenderer，在 draw 回调中绘制 MACD 红绿柱。
 * 绘制规格（与 pane3 成交量 / pane1 K 线视觉完全一致）：
 *  - 柱宽 = candlestickBarWidth(barSpacing, dpr)（与成交量同一函数、
 *    同一 barSpacing → 宽度 / 间隔绝对一致）；
 *  - 柱中心 = 同一逻辑索引的 logicalToCoordinate（与 pane1 柱位完全对齐）；
 *  - 柱 > 0：背景色填充 + 红色边框（空心红柱）；柱 < 0：绿色实心；
 *  - 柱底基准 = 数据区中间（mediaSize.height / 2，与中间刻度固定值 0 对齐），
 *    柱从中间向上下延伸（柱 > 0 向上、柱 < 0 向下），延伸量 = 值相对 0 轴的像素距离。
 *
 * 说明：v5 的 draw 接收 CanvasRenderingTarget2D（fancy-canvas），
 * useMediaCoordinateSpace 为回调式 API，scope 提供 context 与 mediaSize（CSS 像素）。
 */
import {
  type IPrimitivePaneView,
  type IPrimitivePaneRenderer,
  type Logical,
} from 'lightweight-charts'
import type { MacdBarPrimitive } from './macdBarPrimitive'
import { candlestickBarWidth } from '../core/candlestickWidth'

/** MACD 柱主题颜色（与 K 线同源：background 用于空心填充，up/down 红绿） */
export interface MacdThemeColors {
  /** 图表背景色（空心红柱的填充） */
  background: string
  /** 上涨色（红，空心红柱的边框） */
  upColor: string
  /** 下跌色（绿，实心填充） */
  downColor: string
}

export class MacdBarPaneView implements IPrimitivePaneView {
  /** 所属 primitive（只读，提供数据与颜色来源） */
  private readonly source: MacdBarPrimitive

  constructor(source: MacdBarPrimitive) {
    this.source = source
  }

  /** zOrder 'normal' → 绘制在数据层（十字星之下、K 线/柱之上）。
   *  用户既定叠加顺序：十字星（最上）→ 指标绘图 → K 线/成交量。
   *  库 top canvas 先画十字星再画 primitive top 视图 —— 若柱用 'top' 会盖住
   *  十字星；'normal' 使 MACD 柱在十字星之下、同时高于底层数据。 */
  zOrder = (): 'normal'  => {
    return 'normal'
  }

  /** 渲染器：自绘 MACD 柱（media 坐标系 = CSS 像素） */
  renderer = (): IPrimitivePaneRenderer  => {
    return {
      draw: (target) => {
        const chartApi = this.source.chartApi
        const seriesApi = this.source.seriesApi
        if (!chartApi || !seriesApi) return
        const timeScale = chartApi.timeScale()

        // 可见逻辑范围（裁剪绘制窗口，避免全量遍历）
        const visibleRange = timeScale.getVisibleLogicalRange()
        if (!visibleRange) return
        const fromIndex = Math.max(0, Math.floor(visibleRange.from))
        const toIndex = Math.ceil(visibleRange.to)

        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          const barSpacing = timeScale.options().barSpacing
          const pixelRatio = window.devicePixelRatio || 1
          // 柱宽：分时周期固定 1px（东财分时 MACD 细柱，v1.7.0）；
          // K 线周期 = 库源码原版 optimalCandlestickWidth + 奇偶修正
          // （与成交量 / pane1 同一函数同一 barSpacing → 位图像素宽度绝对一致），
          // 转 CSS 像素
          const isTimeshare = this.source.getIsTimeshare()
          const barWidthBitmap = isTimeshare ? 1 : candlestickBarWidth(barSpacing, pixelRatio)
          const barWidth = barWidthBitmap / pixelRatio
          const colors = this.source.getThemeColors()
          // 0 轴参考：priceToCoordinate(0) 仅用于计算"值相对 0 轴的像素距离"（延伸量）；
          // 柱底基准 = 数据区中间（mediaSize.height / 2）—— 与中间刻度固定值 0
          // 的位置对齐，柱从中间向上下延伸（正值向上、负值向下）。
          const yZero = seriesApi.priceToCoordinate(0)
          if (yZero === null) return
          const yBase = mediaSize.height / 2
          const points = this.source.getPoints()

          context.lineWidth = 1
          for (let index = fromIndex; index <= toIndex; index++) {
            const point = points[index]
            if (!point) continue
            // 柱中心 = 同一逻辑索引坐标；按库 bitmap 取整对齐：
            // left = round(center×dpr) - floor(barWidthBitmap/2)，再转 CSS
            const centerX = timeScale.logicalToCoordinate(index as Logical)
            if (centerX === null) continue
            const centerBitmap = Math.round(centerX * pixelRatio)
            const leftBitmap = centerBitmap - Math.floor(barWidthBitmap / 2)
            const barX = leftBitmap / pixelRatio
            // 柱顶 = macd 值坐标（> 0 在中间上方，< 0 在下方）
            const yValue = seriesApi.priceToCoordinate(point.macd)
            if (yValue === null) continue
            const barHeight = Math.abs(yZero - yValue)
            if (barHeight <= 0) continue

            if (point.macd >= 0) {
              // 柱 > 0：K 线周期 = 空心红柱（背景填充 + 红色边框，同 pane1 上涨柱）；
              // 分时周期 = 1px 实心红线（不做空心，细线视觉，v1.7.0）
              const top = yBase - barHeight
              if (isTimeshare) {
                context.fillStyle = colors.upColor
                context.fillRect(barX, top, barWidth, barHeight)
              } else {
                context.fillStyle = colors.background
                context.fillRect(barX, top, barWidth, barHeight)
                context.strokeStyle = colors.upColor
                // +0.5 对齐 CSS 像素网格，避免 1px 边框模糊
                context.strokeRect(barX + 0.5, top + 0.5, barWidth - 1, barHeight - 1)
              }
            } else {
              // 柱 < 0：绿色实心（同 pane1 下跌柱；分时 1px 同），从中间向下延伸
              context.fillStyle = colors.downColor
              context.fillRect(barX, yBase, barWidth, barHeight)
            }
          }
        })
      },
    }
  }
}
