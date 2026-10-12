/**
 * volumeBarPaneView.ts —— 成交量柱体自绘渲染视图（v1.4.9）
 *
 * 职责：提供 IPrimitivePaneRenderer，在 draw 回调中绘制成交量柱。
 * 绘制规格（与 pane1 K 线视觉完全一致）：
 *  - 柱宽 = optimalCandlestickWidth(barSpacing, dpr) / dpr（CSS 像素，
 *    与 pane1 Candlestick 内部同一函数、同一 barSpacing → 宽度/间隔绝对一致）；
 *  - 柱中心 = 同一逻辑索引的 logicalToCoordinate（与 pane1 柱位完全对齐）；
 *  - 上涨：背景色填充 + 红色边框（空心红柱）；下跌：绿色实心。
 *
 * 说明：v5 的 draw 接收 CanvasRenderingTarget2D（fancy-canvas），
 * useMediaCoordinateSpace 为回调式 API，scope 提供 context 与 mediaSize（CSS 像素）。
 */
import {
  type IPrimitivePaneView,
  type IPrimitivePaneRenderer,
  type Logical,
} from 'lightweight-charts'
import type { VolumeBarPrimitive } from './volumeBarPrimitive'
import { candlestickBarWidth } from './candlestickWidth'

/** 成交量主题颜色（与 K 线同源：background 用于空心填充，up/down 红绿） */
export interface VolumeThemeColors {
  /** 图表背景色（空心红柱的填充） */
  background: string
  /** 上涨色（红，空心红柱的边框） */
  upColor: string
  /** 下跌色（绿，实心填充） */
  downColor: string
}

export class VolumeBarPaneView implements IPrimitivePaneView {
  /** 所属 primitive（只读，提供数据与颜色来源） */
  private readonly source: VolumeBarPrimitive

  constructor(source: VolumeBarPrimitive) {
    this.source = source
  }

  /** 渲染器：自绘成交量柱（media 坐标系 = CSS 像素） */
  renderer(): IPrimitivePaneRenderer {
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
          // 柱宽 = 库源码原版 optimalCandlestickWidth + 奇偶修正（与 pane1 同一函数
          // 同一 barSpacing → 位图像素宽度绝对一致），转 CSS 像素
          const barWidthBitmap = candlestickBarWidth(barSpacing, pixelRatio)
          const barWidth = barWidthBitmap / pixelRatio
          const colors = this.source.getThemeColors()
          // 柱体底部 = Pane 底部（mediaSize.height，绝对贴底）。
          // 注意：不能用 priceToCoordinate(0)——Histogram base=0 的 autoScale
          // 范围从 0 起，0 会映射到 Pane 底部内边距处，底部留出缝隙。
          const yBase = mediaSize.height
          const bars = this.source.getBars()

          context.lineWidth = 1
          for (let index = fromIndex; index <= toIndex; index++) {
            const bar = bars[index]
            if (!bar) continue
            // 柱中心 = 同一逻辑索引坐标；按库 bitmap 取整对齐：
            // left = round(center×dpr) - floor(barWidthBitmap/2)，再转 CSS
            const centerX = timeScale.logicalToCoordinate(index as Logical)
            if (centerX === null) continue
            const centerBitmap = Math.round(centerX * pixelRatio)
            const leftBitmap = centerBitmap - Math.floor(barWidthBitmap / 2)
            const barX = leftBitmap / pixelRatio
            const yTop = seriesApi.priceToCoordinate(bar.volume)
            if (yTop === null) continue
            const barHeight = yBase - yTop
            if (barHeight <= 0) continue

            if (bar.close >= bar.open) {
              // 上涨：空心红柱（背景填充 + 红色边框，同 pane1 上涨柱）
              context.fillStyle = colors.background
              context.fillRect(barX, yTop, barWidth, barHeight)
              context.strokeStyle = colors.upColor
              // +0.5 对齐 CSS 像素网格，避免 1px 边框模糊
              context.strokeRect(barX + 0.5, yTop + 0.5, barWidth - 1, barHeight - 1)
            } else {
              // 下跌：绿色实心（同 pane1 下跌柱）
              context.fillStyle = colors.downColor
              context.fillRect(barX, yTop, barWidth, barHeight)
            }
          }
        })
      },
    }
  }
}
