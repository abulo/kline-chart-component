/**
 * crosshairLineCapPaneView.ts —— 十字星竖线细虚线渲染视图（v1.4.99）
 *
 * top 层（zOrder 'top'）：在库十字星竖线（LargeDashed 1px，先画）之后，
 * **整条重新自绘更细的虚线竖线**（线宽 0.75 CSS px，亚像素抗锯齿 → 视觉更细），
 * 并补画最后一段虚线长度的实线，使竖线视觉上"到底"。
 *
 * 设计说明：
 *  - 库 crosshair 线宽仅支持整数（1 已最细），无法再细 → top 层用同一颜色 /
 *    同一虚线周期（[1, 1] 物理 px，最密）覆盖重绘，观感 = 细虚线；
 *  - 库竖线保留（其时间轴时间 label 依赖库绘制），本体被本视图覆盖，无双重阴影；
 *  - 线宽 0.75 CSS px = 0.75 × dpr 物理 px（canvas 支持亚像素，抗锯齿更细）；
 *  - 底部补齐实线（同宽）：无缺口时与最后实线段重叠、有缺口时恰好填空白段。
 */
import {
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type Time,
} from 'lightweight-charts'
import type { CrosshairLineCapDataSource } from './crosshairLineCapPrimitive'

/** 自绘竖线线宽（CSS px，亚像素 → 视觉细于库 1px） */
const FINE_LINE_WIDTH_CSS = 1

/** 库 LargeDashed 虚线段长（物理 px），自绘与之对齐避免相位错位（v1.4.101 起改 1） */
const DASH_LENGTH_PHYSICAL = 1

export class CrosshairLineCapPaneView implements IPrimitivePaneView {
  /** 数据源（十字星时间 / timeScale / 竖线颜色） */
  private readonly source: CrosshairLineCapDataSource

  constructor(source: CrosshairLineCapDataSource) {
    this.source = source
  }

  /** 层级：top（库十字星竖线之后绘制，覆盖为细线并填缺口） */
  zOrder = (): 'top'  => {
    return 'top'
  }

  /** 渲染器：整条细虚线竖线 + 底部最后一段实线补齐 */
  renderer = (): IPrimitivePaneRenderer  => {
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          const time = this.source.getOverlayTime()
          if (time === null) return
          const x = this.source.getTimeScale().timeToCoordinate(time as Time)
          if (x === null) return

          // 物理 / CSS 换算：devicePixelRatio（亚像素线宽 = FINE_LINE_WIDTH_CSS × dpr 物理 px）
          const dpr = window.devicePixelRatio || 1
          const dashLengthCss = DASH_LENGTH_PHYSICAL / dpr
          context.strokeStyle = this.source.getLineColor()
          context.lineWidth = FINE_LINE_WIDTH_CSS

          // 1) 整条细虚线竖线（周期 [1, 1] 物理 px：最密）
          context.setLineDash([dashLengthCss, dashLengthCss])
          context.beginPath()
          context.moveTo(x, 0)
          context.lineTo(x, mediaSize.height)
          context.stroke()

          // 2) 底部补齐：最后一段虚线段长度的实线
          //    （无缺口时与最后实线段重叠、有缺口时恰好填空白段 → 竖线到底）
          context.setLineDash([])
          context.beginPath()
          context.moveTo(x, mediaSize.height - dashLengthCss)
          context.lineTo(x, mediaSize.height)
          context.stroke()
        })
      },
    }
  }
}
