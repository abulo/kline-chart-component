/**
 * priceLinePaneView.ts —— 最后价线自绘渲染视图（v1.7.1）
 *
 * 职责：提供 IPrimitivePaneRenderer，在 draw 回调中绘制：
 *  1. 横贯主图全宽的 2px 虚线（价格 = 真实最后 bar close，y 由 priceToCoordinate
 *     反算；颜色 = 原生涨跌色——最后 bar close vs preClose：红涨 / 绿跌 /
 *     平盘深系白·浅系黑）；
 *  2. 右缘内侧价格标签（线色背景 + 自动黑白对比文字，样式与库 priceLine 标签一致）。
 *
 * 每次 draw 现取最后 close / 主题色：实时更新、周期切换、主题切换均自动刷新，
 * 无需额外 invalidate。
 */
import {
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
} from 'lightweight-charts'
import { chartFont } from '../core/theme'
import { formatPrice } from '../util/format'
import type { PriceLinePrimitive } from './priceLinePrimitive'

export class PriceLinePaneView implements IPrimitivePaneView {
  /** 所属 primitive（只读，提供最后价 / 颜色 / series 引用） */
  private readonly source: PriceLinePrimitive

  constructor(source: PriceLinePrimitive) {
    this.source = source
  }

  /** 渲染器：横贯全宽虚线 + 右缘价格标签 */
  renderer = (): IPrimitivePaneRenderer => {
    return {
      draw: (target) => {
        // v1.7.1：参数控制显隐（priceLineVisible 关闭时整条线 + 标签不绘制）
        if (!this.source.visible) return
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          const { width, height } = mediaSize
          const { getLastClose, getColor, series } = this.source.config
          const lastClose = getLastClose()
          if (lastClose === null || lastClose === undefined || !isFinite(lastClose)) return
          // 价格 → 像素坐标（库对超出视口值域的价格返回屏幕外坐标，如左移看历史时
          // 最新价远高于历史视口 → 负值；无值域时返回 null）
          const rawY = series.priceToCoordinate(lastClose)
          if (rawY === null) return
          // 钳制到主图可视边缘：超出视口（上/下）时线画在边缘、标签仍显示真实最新价，
          // 保证"左移看历史 + 实时更新"任何视口位置价格线都持续可见（东财风格）
          const y = Math.max(1, Math.min(height - 1, rawY))

          const color = getColor()
          // 1. 横贯全宽虚线（模拟库 priceLine dashed 风格：6px 线 / 4px 空；
          //     1px 与库原生价格线粗细一致，避免过粗抢眼）
          context.save()
          context.strokeStyle = color
          context.lineWidth = 1
          context.setLineDash([6, 4])
          context.beginPath()
          context.moveTo(0, y)
          context.lineTo(width, y)
          context.stroke()
          context.restore()

          // 2. 右缘内侧价格标签（线色背景 + 自动黑白对比文字，与库 priceLine 标签同级）
          const text = formatPrice(lastClose)
          context.font = chartFont
          context.textBaseline = 'middle'
          const textWidth = context.measureText(text).width
          const padX = 6 // 文字左右内边距
          const padY = 3 // 文字上下内边距
          const labelHeight = 12 + padY * 2
          const labelX = width - textWidth - padX * 2 - 2 // 距右缘 2px
          const labelY = y - labelHeight / 2
          // 背景：线色实心块（轻微圆角，视觉与库标签一致）
          context.fillStyle = color
          context.beginPath()
          context.roundRect(labelX, labelY, textWidth + padX * 2, labelHeight, 2)
          context.fill()
          // 文字：按背景亮度自动取黑白（保证深浅系标签内文字可读）
          const r = parseInt(color.slice(1, 3), 16)
          const g = parseInt(color.slice(3, 5), 16)
          const b = parseInt(color.slice(5, 7), 16)
          const luma = 0.299 * r + 0.587 * g + 0.114 * b
          context.fillStyle = luma > 150 ? '#131722' : '#FFFFFF'
          context.textAlign = 'left'
          context.fillText(text, labelX + padX, y)
        })
      },
    }
  }
}
