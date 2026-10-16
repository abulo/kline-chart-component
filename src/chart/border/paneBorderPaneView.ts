/**
 * paneBorderPaneView.ts —— 内容 Pane 边框自绘渲染视图（v1.4.19 / v1.4.67）
 *
 * 职责：提供 IPrimitivePaneRenderer，在 draw 回调中绘制内容 Pane 的 1px 边框。
 * 绘制规格：
 *  - **useBitmapCoordinateSpace（物理像素）**：bitmapSize 为 canvas 物理像素尺寸，
 *    边框覆盖物理最右 / 最下列 [W-1, W) —— 窗口缩放时不受 CSS 像素取整影响，
 *    始终贴住 canvas 最右边缘，无 subpixel 缝隙；
 *  - 直角矩形 strokeRect(0.5, 0.5, W-1, H-1)：+0.5 对齐物理像素网格，线条不模糊；
 *  - 颜色 = 主题 paneBorder（深浅系区分，draw 时动态取色）；
 *  - bitmapSize 为整个 Pane 物理尺寸（含刻度区），边框即 Pane 完整外框。
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

  /** 渲染器：自绘 1px 矩形边框（bitmap 坐标系 = 物理像素） */
  renderer = (): IPrimitivePaneRenderer  => {
    return {
      draw: (target) => {
        target.useBitmapCoordinateSpace(({ context, bitmapSize }) => {
          context.lineWidth = 1
          context.strokeStyle = this.source.getColor()
          // +0.5 对齐物理像素网格：整数坐标会落在像素边界导致 1px 线模糊，
          // 偏移 0.5 后线条恰好覆盖单个物理像素列 / 行；右 / 下边缘取
          // bitmapSize - 1 → 边框覆盖 canvas 物理最边缘，无缩放缝隙
          context.strokeRect(0.5, 0.5, bitmapSize.width - 1, bitmapSize.height - 1)
        })
      },
    }
  }
}
