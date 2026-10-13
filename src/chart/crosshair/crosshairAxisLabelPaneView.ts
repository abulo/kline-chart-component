/**
 * crosshairAxisLabelPaneView.ts —— 十字星左刻度指示值 Pane 视图（v1.4.40）
 *
 * 职责：实现 IPrimitivePaneView（zOrder = 'top'），在**价格轴 top canvas** 上
 * 绘制十字星横线对应的数值指示标签。
 *
 * 为什么选 priceAxisPaneViews + zOrder 'top'（而不是 priceAxisViews 的 axis 标签）：
 *   库 PriceAxisWidget 的 top canvas 在 **Cursor 级 invalidation（十字星移动）时
 *   也会重绘**，而 main canvas（含 backLabels 的 axis 标签路径）只在非 Cursor 级
 *   重绘 —— 用 axis 标签（v1.4.39）会导致指示值刷新迟钝（pane1 卡顿的根因）。
 *   priceAxisPaneViews + 'top' 可让指示值标签跟随十字星每帧流畅刷新。
 *
 * 坐标说明：
 *   价格轴 canvas 与所属 Pane 数据区**共享垂直坐标系**（二者同高、同顶部 y），
 *   因此注入的十字星横线 y（相对 Pane 顶部的本地坐标，即库 MouseEventParams.point
 *   的 y）可直接作为标签的绘制 y，无需 priceScale 反算；标签值 = series
 *   .coordinateToPrice(y) 实时反算（随平移 / 缩放一致变化）。
 *
 * 绘制流程（renderer.draw，库以 target + drawingUtils 调用）：
 *   1. 取注入的十字星 y（null 则不绘制）；
 *   2. series.coordinateToPrice(y) 反算横线价格，格式化文本；
 *   3. 在价格轴内绘制背景块 + 右对齐文字（主题色，跟随深浅系切换）。
 *
 * 依赖：CrosshairAxisLabelPrimitive（同目录，提供配置与注入的 y）。
 */
import { type IPrimitivePaneRenderer, type IPrimitivePaneView } from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { CrosshairAxisLabelPrimitive } from './crosshairAxisLabelPrimitive'

/** 标签与价格轴右边缘的间距（px，避免贴边 / 覆盖刻度边框） */
const LABEL_PAD_X = 4
/** 标签高度（px） */
const LABEL_HEIGHT = 18

/** 指示值标签渲染器：真正执行 canvas 绘制 */
class CrosshairAxisLabelRenderer implements IPrimitivePaneRenderer {
  /** 所属 primitive（只读） */
  private readonly source: CrosshairAxisLabelPrimitive

  constructor(source: CrosshairAxisLabelPrimitive) {
    this.source = source
  }

  /** 库在价格轴绘制时调用：绘制十字星指示值标签（target 为价格轴 canvas） */
  draw(target: CanvasRenderingTarget2D): void {
    const y = this.source.getCrosshairY()
    if (y === null) return
    const price = this.source.config.series.coordinateToPrice(y)
    if (price === null) return
    const text = this.source.config.format(price)

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      // 主题字体（全局统一）
      ctx.font = this.source.config.getFont()
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'right'
      const textWidth = ctx.measureText(text).width
      // 文字右对齐到价格轴右缘内侧（左轴标签惯例）
      const textRight = mediaSize.width - LABEL_PAD_X
      // 背景块：包裹文字并留左右内边距，垂直居中在十字星横线处
      const blockLeft = textRight - LABEL_PAD_X - textWidth - LABEL_PAD_X
      const blockRight = textRight + LABEL_PAD_X
      const top = y - LABEL_HEIGHT / 2
      ctx.fillStyle = this.source.config.getBackColor()
      ctx.fillRect(blockLeft, top, blockRight - blockLeft, LABEL_HEIGHT)
      // 文字：右对齐，垂直居中
      ctx.fillStyle = this.source.config.getColor()
      ctx.fillText(text, textRight, y)
    })
  }
}

/** 指示值标签 Pane 视图：zOrder 'top'（随十字星移动逐帧重绘） */
export class CrosshairAxisLabelPaneView implements IPrimitivePaneView {
  /** 所属 primitive（只读） */
  private readonly source: CrosshairAxisLabelPrimitive

  /** 渲染器（单例复用，避免重复创建与内存泄漏） */
  private readonly rendererImpl: CrosshairAxisLabelRenderer

  constructor(source: CrosshairAxisLabelPrimitive) {
    this.source = source
    this.rendererImpl = new CrosshairAxisLabelRenderer(source)
  }

  /** 顶层：价格轴 top canvas 绘制（Cursor 级重绘，十字星移动时流畅刷新） */
  zOrder(): 'top' {
    return 'top'
  }

  /** 返回渲染器实例 */
  renderer(): IPrimitivePaneRenderer {
    return this.rendererImpl
  }
}
