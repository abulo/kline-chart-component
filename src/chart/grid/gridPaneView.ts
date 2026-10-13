/**
 * gridPaneView.ts —— 固定等分栅格自绘渲染视图（v1.4.22）
 *
 * 职责：提供 IPrimitivePaneRenderer，在 draw 回调中按 primitive 配置绘制
 * 等分栅格（竖 4 等分 + 横向按 pane 配置的等分数）。
 *
 * 绘制规格：
 *  - 等分线位置 = size × i / count（i = 1..count-1），避开首尾；
 *  - 1px 线 + 0.5 对齐 CSS 像素网格（避免模糊）；
 *  - 颜色 = 主题 grid（draw 时动态取色）；
 *  - mediaSize 为整个 Pane 尺寸；栅格固定于 Pane 本地坐标，数据平移 / 缩放不动。
 */
import {
  type IPrimitivePaneView,
  type IPrimitivePaneRenderer,
} from 'lightweight-charts'
import type { GridPrimitive } from './gridPrimitive'

export class GridPaneView implements IPrimitivePaneView {
  /** 所属 primitive（只读，提供栅格配置来源） */
  private readonly source: GridPrimitive

  constructor(source: GridPrimitive) {
    this.source = source
  }

  /** 渲染层级：bottom —— 栅格绘制在 series 数据（蜡烛 / 柱体）之下、背景之上 */
  zOrder(): 'bottom' {
    return 'bottom'
  }

  /** 渲染器：自绘等分栅格（media 坐标系 = CSS 像素） */
  renderer(): IPrimitivePaneRenderer {
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          const { width, height } = mediaSize
          const config = this.source.config
          // 横向等分数（动态，随指标开关变化）
          const hCount = config.getHorizontalCount()
          // 竖向等分数（默认 4，全图统一）
          const vCount = config.verticalCount ?? 4

          context.lineWidth = 1
          context.strokeStyle = config.getColor()
          context.beginPath()

          // 横线：i / hCount 处（i = 1..hCount-1），避开首尾
          for (let i = 1; i < hCount; i++) {
            const y = Math.round((height * i) / hCount) + 0.5
            context.moveTo(0.5, y)
            context.lineTo(width - 0.5, y)
          }

          // 竖线：i / vCount 处（i = 1..vCount-1），避开首尾
          for (let i = 1; i < vCount; i++) {
            const x = Math.round((width * i) / vCount) + 0.5
            context.moveTo(x, 0.5)
            context.lineTo(x, height - 0.5)
          }

          context.stroke()
        })
      },
    }
  }
}
