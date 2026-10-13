/**
 * testLabelPaneView.ts —— 空 Pane"测试"文字渲染视图（v1.4.3）
 *
 * 职责：提供 IPrimitivePaneRenderer，在 draw 回调中绘制"测试"文字。
 * 绘制规格：垂直居中、距左 6px、颜色取 primitive.getColor()（跟随主题）。
 *
 * 说明：v5 的 draw 接收 CanvasRenderingTarget2D（fancy-canvas），
 * useMediaCoordinateSpace 为回调式 API，scope 提供 context 与 mediaSize。
 */
import { type IPrimitivePaneView, type IPrimitivePaneRenderer } from 'lightweight-charts'
import { chartFont } from '../core/theme'
import type { TestLabelPrimitive } from './testLabelPrimitive'

export class TestLabelPaneView implements IPrimitivePaneView {
  /** 所属 primitive（只读，提供文字与颜色来源） */
  private readonly source: TestLabelPrimitive

  constructor(source: TestLabelPrimitive) {
    this.source = source
  }

  /** 渲染器：文字垂直居中、距左 6px（media 坐标系 = CSS 像素） */
  renderer(): IPrimitivePaneRenderer {
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          context.font = chartFont
          context.fillStyle = this.source.getColor()
          context.textBaseline = 'middle'
          context.fillText(this.source.text, 6, mediaSize.height / 2)
        })
      },
    }
  }
}
