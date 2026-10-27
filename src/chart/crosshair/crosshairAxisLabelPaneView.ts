// crosshairAxisLabelPaneView.ts —— 十字星左刻度指示值 Pane 视图。
// 职责：实现 IPrimitivePaneView（zOrder = 'top'），在价格轴 top canvas 上
// 绘制十字星横线对应的数值指示标签。
//
// 为什么选 priceAxisPaneViews + zOrder 'top'（而不是 priceAxisViews 的 axis 标签）：
//  库 PriceAxisWidget 的 top canvas 在 Cursor 级 invalidation（十字星移动）时
//  也会重绘，而 main canvas（含 backLabels 的 axis 标签路径）只在非 Cursor 级
//  重绘 —— 用 axis 标签会导致指示值刷新迟钝（pane1 卡顿的根因）。
//  priceAxisPaneViews + 'top' 可让指示值标签跟随十字星每帧流畅刷新。
//
// 文字设置统一：绘制改用 axisLabelPaneView 导出的公共 drawAxisLabel
//（右对齐、右缘距 6px、背景左右 6px、高 18px、theme.chartFont），
// 与普通刻度标签（AxisLabelPaneView）共用同一绘制规格 —— 两处文字完全一致。
//
// 坐标说明：
//  价格轴 canvas 与所属 Pane 数据区共享垂直坐标系（二者同高、同顶部 y），
//  因此注入的十字星横线 y（相对 Pane 顶部的本地坐标，即库 MouseEventParams.point
//  的 y）可直接作为标签的绘制 y，无需 priceScale 反算；标签值 = series
//  .coordinateToPrice(y) 实时反算（随平移 / 缩放一致变化）。
import { type IPrimitivePaneRenderer, type IPrimitivePaneView } from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { CrosshairAxisLabelPrimitive } from './crosshairAxisLabelPrimitive'
import { AXIS_LABEL_HEIGHT, AXIS_LABEL_PAD_X, drawAxisLabel } from '../axis/axisLabelPaneView'

// 指示值标签渲染器：真正执行 canvas 绘制。
class CrosshairAxisLabelRenderer implements IPrimitivePaneRenderer {
  /** 所属 primitive（只读）。 */
  private readonly source: CrosshairAxisLabelPrimitive

  constructor(source: CrosshairAxisLabelPrimitive) {
    this.source = source
  }

  /** 库在价格轴绘制时调用：绘制十字星指示值标签（target 为价格轴 canvas）。 */
  draw = (target: CanvasRenderingTarget2D): void  => {
    // 渲染开关：分时右刻度区指示值仅在分时下绘制（K 线周期右刻度区保持空白）。
    if (this.source.config.getEnabled !== undefined && !this.source.config.getEnabled()) return
    const y = this.source.getCrosshairY()
    if (y === null) return
    // series 支持函数（动态取数：分时周期 pane1 用 price 线 / K 线周期用 klineSeries）。
    const series =
      typeof this.source.config.series === 'function'
        ? this.source.config.series()
        : this.source.config.series
    const price = series.coordinateToPrice(y)
    if (price === null) return
    const text = this.source.config.format(price)

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      // 钳制 y：标签块（高 AXIS_LABEL_HEIGHT，垂直居中于横线）必须完整位于
      // 当前 pane（价格轴 canvas）内 —— 十字星靠近 pane 顶部 / 底部时，
      // 标签不越界到 pane 外面。
      const labelHalf = AXIS_LABEL_HEIGHT / 2
      if (mediaSize.height < AXIS_LABEL_HEIGHT) return // 高度不足时跳过（防异常）
      const yClamped = Math.min(Math.max(y, labelHalf), mediaSize.height - labelHalf)
      // 对齐：'left' 左对齐贴区左缘（右刻度区，与右刻度标签同侧）；
      // 默认 'right' 右对齐贴区右缘（左刻度区，与左刻度标签一致）。
      if (this.source.config.align === 'left') {
        drawAxisLabel(
          ctx,
          text,
          AXIS_LABEL_PAD_X,
          yClamped,
          this.source.config.getFont(),
          this.source.config.getColor(),
          this.source.config.getBackColor(),
          'left',
        )
        return
      }
      // 与刻度标签共用同一绘制规格（字体 / 对齐 / 内边距 / 高度完全一致）。
      drawAxisLabel(
        ctx,
        text,
        mediaSize.width - AXIS_LABEL_PAD_X,
        yClamped,
        this.source.config.getFont(),
        this.source.config.getColor(),
        this.source.config.getBackColor(),
      )
    })
  }
}

/**
 * 指示值标签 Pane 视图：zOrder 'top'（随十字星移动逐帧重绘）。
 */
export class CrosshairAxisLabelPaneView implements IPrimitivePaneView {
  /** 渲染器（单例复用，避免重复创建与内存泄漏；闭包持有 primitive 引用）。 */
  private readonly rendererImpl: CrosshairAxisLabelRenderer

  constructor(source: CrosshairAxisLabelPrimitive) {
    this.rendererImpl = new CrosshairAxisLabelRenderer(source)
  }

  /** 顶层：价格轴 top canvas 绘制（Cursor 级重绘，十字星移动时流畅刷新）。 */
  zOrder = (): 'top'  => {
    return 'top'
  }

  /** 返回渲染器实例。 */
  renderer = (): IPrimitivePaneRenderer  => {
    return this.rendererImpl
  }
}
