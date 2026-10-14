/**
 * topPaneOverlayPaneView.ts —— 顶部空 Pane（pane0）顶层遮罩渲染视图（v1.4.36）
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
import type { TopPaneOverlayPrimitive } from './topPaneOverlayPrimitive'

export class TopPaneOverlayPaneView implements IPrimitivePaneView {
  /** 所属 primitive（只读，提供文字与颜色来源） */
  private readonly source: TopPaneOverlayPrimitive

  constructor(source: TopPaneOverlayPrimitive) {
    this.source = source
  }

  /** 绘制层级：'top' → pane 顶层 canvas（十字星线 / 标签之上），背景可遮住竖线 */
  zOrder(): PrimitivePaneViewZOrder {
    return 'top'
  }

  /** 渲染器：背景填充（遮住十字星竖线）+ 信息行整段文字（"股票名称 [代码] 时间"，距左 6px） */
  renderer(): IPrimitivePaneRenderer {
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          // 1. 不透明背景：覆盖 pane0 整块区域（与图表背景同色，视觉无变化，
          //    但遮挡住 pane0 底层的十字星竖线）
          context.fillStyle = this.source.getBackground()
          context.fillRect(0, 0, mediaSize.width, mediaSize.height)
          // 2. 信息行整段文字：股票名称 [代码] 时间；垂直居中、距左 6px。
          //    文字由 controller 动态生成（十字星命中时时间 = 命中 bar 日期，
          //    未命中时 = 最新 bar 日期），draw 时现取保证实时更新
          context.font = chartFont
          context.fillStyle = this.source.getColor()
          context.textBaseline = 'middle'
          context.textAlign = 'left'
          context.fillText(this.source.getLeftText(), 6, mediaSize.height / 2)
        })
      },
    }
  }
}
