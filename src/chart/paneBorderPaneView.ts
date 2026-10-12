/**
 * paneBorderPaneView.ts —— 内容 Pane 边框自绘渲染视图（v1.4.19）
 *
 * 职责：提供 IPrimitivePaneRenderer，在 draw 回调中绘制内容 Pane 的 1px 边框。
 * 绘制规格：
 *  - 直角矩形，strokeRect(0.5, 0.5, w-1, h-1)：+0.5 对齐 CSS 像素网格，
 *    避免 1px 线条模糊；
 *  - 颜色 = 主题 paneBorder（深浅系区分，draw 时动态取色）；
 *  - mediaSize 为整个 Pane 尺寸（含刻度区），边框即 Pane 完整外框。
 *
 * 说明：v5 的 draw 接收 CanvasRenderingTarget2D（fancy-canvas），
 * useMediaCoordinateSpace 为回调式 API，scope 提供 context 与 mediaSize（CSS 像素）。
 */
import {
  type IPrimitivePaneView,
  type IPrimitivePaneRenderer,
} from 'lightweight-charts'
import type { PaneBorderPrimitive } from './paneBorderPrimitive'

export class PaneBorderPaneView implements IPrimitivePaneView {
  /** 所属 primitive（只读，提供边框颜色来源） */
  private readonly source: PaneBorderPrimitive

  constructor(source: PaneBorderPrimitive) {
    this.source = source
  }

  /** 渲染器：自绘 1px 矩形边框（media 坐标系 = CSS 像素） */
  renderer(): IPrimitivePaneRenderer {
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          context.lineWidth = 1
          context.strokeStyle = this.source.getColor()
          // +0.5 对齐 CSS 像素网格：整数坐标会落在像素边界导致 1px 线模糊，
          // 偏移 0.5 后线条恰好覆盖单个像素列 / 行
          context.strokeRect(0.5, 0.5, mediaSize.width - 1, mediaSize.height - 1)
        })
      },
    }
  }
}
