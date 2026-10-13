/**
 * pane0OverlayPaneView.ts —— pane0 顶层遮罩渲染视图（v1.4.36）
 *
 * 职责：提供 IPrimitivePaneRenderer，在 draw 回调中：
 *  1. 用主题背景色填充整个 pane0 区域（不透明覆盖 → 遮住底层十字星竖线）；
 *  2. 绘制"测试"文字（垂直居中、距左 6px、主题 textColor）。
 *
 * 说明：v5 的 draw 接收 CanvasRenderingTarget2D（fancy-canvas），
 * useMediaCoordinateSpace 为回调式 API，scope 提供 context 与 mediaSize（CSS 像素）。
 */
import {
  type IPrimitivePaneView,
  type IPrimitivePaneRenderer,
  type PrimitivePaneViewZOrder,
} from 'lightweight-charts'
import { chartFont } from '../core/theme'
import type { Pane0OverlayPrimitive } from './pane0OverlayPrimitive'

export class Pane0OverlayPaneView implements IPrimitivePaneView {
  /** 所属 primitive（只读，提供文字与颜色来源） */
  private readonly source: Pane0OverlayPrimitive

  constructor(source: Pane0OverlayPrimitive) {
    this.source = source
  }

  /** 绘制层级：'top' → pane 顶层 canvas（十字星线 / 标签之上），背景可遮住竖线 */
  zOrder(): PrimitivePaneViewZOrder {
    return 'top'
  }

  /** 渲染器：背景填充（遮住十字星竖线）+ 文字垂直居中、距左 6px */
  renderer(): IPrimitivePaneRenderer {
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          // 1. 不透明背景：覆盖 pane0 整块区域（与图表背景同色，视觉无变化，
          //    但遮挡住 pane0 底层的十字星竖线）
          context.fillStyle = this.source.getBackground()
          context.fillRect(0, 0, mediaSize.width, mediaSize.height)
          // 2. "测试"文字：垂直居中、距左 6px（与 TestLabelPaneView 规格一致）
          context.font = chartFont
          context.fillStyle = this.source.getColor()
          context.textBaseline = 'middle'
          context.fillText(this.source.text, 6, mediaSize.height / 2)
        })
      },
    }
  }
}
