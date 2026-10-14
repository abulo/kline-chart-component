/**
 * indicatorLinePaneView.ts —— 指标折线渲染视图（top 层，v1.4.65）
 *
 * 在 top canvas（十字星之上）逐条绘制指标折线：
 *  - 按 timeScale.getVisibleRange() 裁剪可视点区间（数据升序，线性扫描首尾）；
 *  - x = timeToCoordinate(time)、y = anchorSeries.priceToCoordinate(value)；
 *  - 相邻有效点连线（中间出现 null 坐标则断开路径），线宽 1、颜色 = 指标线颜色。
 */
import {
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type Time,
} from 'lightweight-charts'
import { type IndicatorLinePrimitive } from './indicatorLinePrimitive'

export class IndicatorLinePaneView implements IPrimitivePaneView {
  /** 所属 primitive（取指标线数据源） */
  private readonly source: IndicatorLinePrimitive

  constructor(source: IndicatorLinePrimitive) {
    this.source = source
  }

  /** zOrder 'top' → 绘制在 top canvas（十字星之上，指标线不被十字星遮挡） */
  zOrder(): 'top' {
    return 'top'
  }

  /** 渲染器：逐条绘制指标折线 */
  renderer(): IPrimitivePaneRenderer {
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context }) => {
          const data = this.source.getSource()
          const timeScale = data.getTimeScale()
          const seriesApi = data.anchorSeries()
          // 可视时间范围（裁剪：只绘制可视区间的点，长数据下避免全量坐标转换）
          const visible = timeScale.getVisibleRange()
          if (visible === null) return
          const from = visible.from as number
          const to = visible.to as number
          // 绘制前统一设置，减少状态切换
          context.lineWidth = 1
          for (const line of data.lines) {
            if (line.points.length === 0) continue
            // 升序数据：线性扫描可视首尾索引
            let start = 0
            while (start < line.points.length && line.points[start].time < from) start++
            let end = line.points.length
            while (end > start && line.points[end - 1].time > to) end--
            context.strokeStyle = line.color
            context.beginPath()
            let started = false
            for (let i = start; i < end; i++) {
              const point = line.points[i]
              const x = timeScale.timeToCoordinate(point.time as Time)
              const y = seriesApi.priceToCoordinate(point.value)
              if (x === null || y === null) {
                // 坐标缺失（如缩放到区间外）：断开当前路径，避免跨空白区连线
                started = false
                continue
              }
              if (!started) {
                context.moveTo(x, y)
                started = true
              } else {
                context.lineTo(x, y)
              }
            }
            context.stroke()
          }
        })
      },
    }
  }
}
