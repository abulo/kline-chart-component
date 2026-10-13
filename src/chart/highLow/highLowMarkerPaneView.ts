/**
 * highLowMarkerPaneView.ts —— K 线主图（pane1）最高价 / 最低价标注渲染视图（v1.4.48）
 *
 * 职责：实现 IPrimitivePaneView，在 pane1 数据区 canvas 上绘制可视区域内的
 * 最高价 / 最低价标注：
 *  - 遍历当前**可视逻辑范围**内的 K 线，取 high 最大值与 low 最小值；
 *  - 最高价标注：黄色 12px 文字 + 背景块，绘制在对应柱体最高价位置**上方**，
 *    黄色实线从文字块边缘连到柱体上边缘中间（连接点 = 柱体中心 x / 柱顶 y）；
 *  - 最低价标注：蓝色 12px 文字 + 背景块，绘制在对应柱体最低价位置**下方**，
 *    蓝色实线从文字块边缘连到柱体下边缘中间（连接点 = 柱体中心 x / 柱底 y）；
 *  - 平移 / 缩放时库触发重绘 → 极值实时重算，标注始终反映可视区域；
 *  - 标注文字不超出 pane 左右边界（x 靠近边缘时自动内靠）。
 *
 * 坐标：x = timeScale().timeToCoordinate(bar.time)（柱体中心）；
 *      y = series.priceToCoordinate(high / low)（柱顶 / 柱底）。
 *
 * 依赖：HighLowMarkerPrimitive（同目录，提供配置与 chart / series 引用）。
 */
import { type IPrimitivePaneView, type IPrimitivePaneRenderer } from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { Time } from 'lightweight-charts'
import type { BasicBar } from '../core/mock'
import { chartFont } from '../core/theme'
import { formatPrice } from '../util/format'
import type { HighLowMarkerPrimitive } from './highLowMarkerPrimitive'

/** 标注文字与柱体的水平间距（px） */
const MARKER_GAP_X = 6
/** 标注文字块与柱顶 / 柱底的垂直间距（px） */
const MARKER_GAP_Y = 3
/** 标注文字背景块内边距（px，左右各） */
const MARKER_PAD_X = 4
/** 标注文字背景块高度（px） */
const MARKER_HEIGHT = 18
/** 连接线宽度（px，实线） */
const MARKER_LINE_WIDTH = 1

/** 极值标注结果（最高价与最低价各一个，可能同时存在） */
export interface HighLowExtremes {
  /** 可视区域内 high 最大的 bar（无数据时为 null） */
  high: BasicBar | null
  /** 可视区域内 low 最小的 bar（无数据时为 null） */
  low: BasicBar | null
}

/**
 * 在 bars 的 [from, to] 区间内同时查找最高价与最低价（纯函数，可单测）：
 *  - 最高价 = high 最大的 bar、最低价 = low 最小的 bar（各取第一个出现的极值）；
 *  - 最高价与最低价**互不抢占**：即使同根 bar 也分别返回（标注需要两者都显示）；
 *  - 区间为空或数据为空时返回 { high: null, low: null }。
 */
export const findExtremeBars = (bars: readonly BasicBar[], from: number, to: number): HighLowExtremes => {
  if (from > to || bars.length === 0) return { high: null, low: null }
  let highBar: BasicBar | null = null
  let lowBar: BasicBar | null = null
  for (let i = from; i <= to; i++) {
    const bar = bars[i]
    if (bar === undefined) continue
    if (highBar === null || bar.high > highBar.high) highBar = bar
    if (lowBar === null || bar.low < lowBar.low) lowBar = bar
  }
  return { high: highBar, low: lowBar }
}

/** 标注渲染器：真正执行 canvas 绘制 */
class HighLowMarkerRenderer implements IPrimitivePaneRenderer {
  /** 所属 primitive（只读） */
  private readonly source: HighLowMarkerPrimitive

  constructor(source: HighLowMarkerPrimitive) {
    this.source = source
  }

  /** 库在主图绘制时调用：绘制最高价 / 最低价标注（文字 + 连接线，两者同时显示） */
  draw(target: CanvasRenderingTarget2D): void {
    const chartApi = this.source.chartApi
    if (chartApi === null) return
    const bars = this.source.config.getBars()
    if (bars.length === 0) return
    // 当前可视逻辑范围（bar 索引区间）；无可视范围（如未布局）时跳过
    const logicalRange = chartApi.timeScale().getVisibleLogicalRange()
    if (logicalRange === null) return
    const from = Math.max(0, Math.floor(logicalRange.from))
    const to = Math.min(bars.length - 1, Math.ceil(logicalRange.to))
    const extremes = findExtremeBars(bars, from, to)

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      // 最高价标注（黄色，柱顶上方）
      if (extremes.high !== null) {
        const x = chartApi.timeScale().timeToCoordinate(extremes.high.time as Time)
        const y = this.source.config.series.priceToCoordinate(extremes.high.high)
        if (x !== null && y !== null) {
          this.drawMarker(
            ctx,
            mediaSize.width,
            x,
            y,
            `${formatPrice(extremes.high.high)}`,
            this.source.config.getHighColor(),
            this.source.config.getBackColor(),
            true,
          )
        }
      }
      // 最低价标注（蓝色，柱底下方）
      if (extremes.low !== null) {
        const x = chartApi.timeScale().timeToCoordinate(extremes.low.time as Time)
        const y = this.source.config.series.priceToCoordinate(extremes.low.low)
        if (x !== null && y !== null) {
          this.drawMarker(
            ctx,
            mediaSize.width,
            x,
            y,
            `${formatPrice(extremes.low.low)}`,
            this.source.config.getLowColor(),
            this.source.config.getBackColor(),
            false,
          )
        }
      }
    })
  }

  /**
   * 绘制单个标注：
   *  - 背景块 + 12px 文字（最高价在柱顶上方、最低价在柱底下方）；
   *  - 实线连接：从文字块朝向柱体一侧的边缘中点，连到柱体上 / 下边缘中间
   *    （连接点 = 柱体中心 x 与柱顶 / 柱底 y，即柱体的上主体 / 下主体中间）。
   */
  private drawMarker = (
    context: CanvasRenderingContext2D,
    paneWidth: number,
    barCenterX: number,
    barY: number,
    text: string,
    color: string,
    backColor: string,
    isHigh: boolean,
  ): void => {
    context.font = chartFont
    context.textBaseline = 'middle'
    const textWidth = context.measureText(text).width
    const blockWidth = textWidth + MARKER_PAD_X * 2
    // 水平对齐：默认柱体右侧；靠近右边界时内靠到柱体左侧，保证不越界
    let left = barCenterX + MARKER_GAP_X
    if (left + blockWidth > paneWidth) {
      left = barCenterX - MARKER_GAP_X - blockWidth
      if (left < 0) left = 0 // 极端窄图下贴左缘（仍完整可见）
    }
    // 垂直位置：最高价在柱顶上方、最低价在柱底下方
    const top = isHigh ? barY - MARKER_GAP_Y - MARKER_HEIGHT : barY + MARKER_GAP_Y
    // 背景块
    context.fillStyle = backColor
    context.fillRect(left, top, blockWidth, MARKER_HEIGHT)
    // 文字（垂直居中于背景块）
    context.fillStyle = color
    context.textAlign = 'left'
    context.fillText(text, left + MARKER_PAD_X, top + MARKER_HEIGHT / 2)
    // 连接线：文字块朝向柱体一侧的边缘中点 → 柱体上 / 下边缘中间（实线）
    const blockOnRight = left > barCenterX
    const connectX = blockOnRight ? left : left + blockWidth
    const blockEdgeY = isHigh ? top + MARKER_HEIGHT : top
    context.strokeStyle = color
    context.lineWidth = MARKER_LINE_WIDTH
    context.beginPath()
    context.moveTo(connectX, blockEdgeY)
    context.lineTo(barCenterX, barY)
    context.stroke()
  }
}

/** 最高 / 最低价标注 Pane 视图（主图默认层，绘制在 K 线数据之上） */
export class HighLowMarkerPaneView implements IPrimitivePaneView {
  /** 所属 primitive（只读） */
  private readonly source: HighLowMarkerPrimitive

  /** 渲染器（单例复用，避免重复创建与内存泄漏） */
  private readonly rendererImpl: HighLowMarkerRenderer

  constructor(source: HighLowMarkerPrimitive) {
    this.source = source
    this.rendererImpl = new HighLowMarkerRenderer(source)
  }

  /** 返回渲染器实例 */
  renderer(): IPrimitivePaneRenderer {
    return this.rendererImpl
  }
}
