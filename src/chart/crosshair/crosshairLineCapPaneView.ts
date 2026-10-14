/**
 * crosshairLineCapPaneView.ts —— 十字星竖线底部补齐渲染视图（v1.4.90）
 *
 * top 层（zOrder 'top'）：在库十字星竖线（LargeDashed，先画）之后，
 * 补画最后一段虚线长度的实线，使竖线视觉上"到底"（见 primitive 头注释）。
 * 只补竖线所在 x 的底部 capLengthCss 像素，不触碰虚线主体。
 */
import {
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type Time,
} from 'lightweight-charts'
import type { CrosshairLineCapDataSource } from './crosshairLineCapPrimitive'

export class CrosshairLineCapPaneView implements IPrimitivePaneView {
  /** 数据源（十字星时间 / timeScale / 竖线颜色） */
  private readonly source: CrosshairLineCapDataSource

  constructor(source: CrosshairLineCapDataSource) {
    this.source = source
  }

  /** 层级：top（库十字星竖线之后绘制，盖住缺口） */
  zOrder(): 'top' {
    return 'top'
  }

  /** 渲染器：竖线 x 处补画最后一段虚线段长度（6 物理 px）的实线 */
  renderer(): IPrimitivePaneRenderer {
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          const time = this.source.getOverlayTime()
          if (time === null) return
          const x = this.source.getTimeScale().timeToCoordinate(time as Time)
          if (x === null) return
          // 虚线段长 6 物理像素 → CSS 像素 = 6 / dpr；
          // 补 [h - cap, h] 实线：无缺口时与最后实线段重叠、有缺口时恰好填空白段
          const dpr = window.devicePixelRatio || 1
          const capLengthCss = 6 / dpr
          context.strokeStyle = this.source.getLineColor()
          context.lineWidth = 1
          context.setLineDash([])
          context.beginPath()
          context.moveTo(x, mediaSize.height - capLengthCss)
          context.lineTo(x, mediaSize.height)
          context.stroke()
        })
      },
    }
  }
}
