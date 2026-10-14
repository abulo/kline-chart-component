/**
 * indicatorLinePaneView.ts —— 指标折线渲染视图（top 层，v1.4.65）
 *
 * 在 top canvas（十字星之上）逐条绘制指标折线：
 *  - 按 timeScale.getVisibleRange() 裁剪可视点区间（数据升序，线性扫描首尾）；
 *  - x = timeToCoordinate(time)、y = anchorSeries.priceToCoordinate(value)；
 *  - **值越界（priceToCoordinate 返回 null）时贴边绘制而非断线**：BOLL 上下轨 /
 *    部分指标的极值会超出可视价格值域（如窄幅横盘时 2σ 带宽大于 K 线高低），
 *    旧逻辑遇 null 直接断开路径 → 曲线出现"断点 / 间隔"（v1.4.87 修复）；
 *    贴边后线连续（从 pane 上 / 下边缘进出），与主流行情软件一致。
 */
import {
  type Coordinate,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type Time,
} from 'lightweight-charts'
import { type IndicatorLinePrimitive } from './indicatorLinePrimitive'

export class IndicatorLinePaneView implements IPrimitivePaneView {
  /** 所属 primitive（取指标线数据源） */
  private readonly source: IndicatorLinePrimitive

  /** 绘制层级获取器（'top' 默认；pane5 附图指标传 'normal' → 十字星之下） */
  private readonly getZOrder: () => 'top' | 'normal'

  constructor(source: IndicatorLinePrimitive, getZOrder: () => 'top' | 'normal') {
    this.source = source
    this.getZOrder = getZOrder
  }

  /** 层级：'top'（十字星之上，主图 / 成交量线默认）或 'normal'（十字星之下，附图指标） */
  zOrder(): 'top' | 'normal' {
    return this.getZOrder()
  }

  /** 渲染器：逐条绘制指标折线 */
  renderer(): IPrimitivePaneRenderer {
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          const data = this.source.getSource()
          const timeScale = data.getTimeScale()
          const seriesApi = data.anchorSeries()
          // 可视时间范围（裁剪：只绘制可视区间的点，长数据下避免全量坐标转换）
          const visible = timeScale.getVisibleRange()
          if (visible === null) return
          const from = visible.from as number
          const to = visible.to as number
          // 可视值域边界价格（用于越界贴边判断：coordinateToPrice(0) = 顶部价格、
          // coordinateToPrice(mediaSize.height - 1) = 底部价格；scale 倒置时方向相反，
          // 用数值比较而非假定上下，value 大于顶价则贴顶、小于底价则贴底）。
          // 注意：coordinateToPrice 属 ISeriesApi（IPriceScaleApi 5.x 无此方法）
          const topPrice = seriesApi.coordinateToPrice(0)
          const bottomPrice = seriesApi.coordinateToPrice(mediaSize.height - 1)
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
              if (x === null) {
                // x 缺失（理论上仅发生在可视裁剪边界外）：断开当前路径，避免跨空白区连线
                started = false
                continue
              }
              let y = seriesApi.priceToCoordinate(point.value)
              if (y === null) {
                // 值越界：贴边绘制保持连续（topPrice / bottomPrice 可能为 null，
                // 此时保守贴底部，避免整条线消失）
                const value = point.value
                if (topPrice !== null && bottomPrice !== null) {
                  y = (value > topPrice ? 0 : mediaSize.height - 1) as Coordinate
                } else {
                  y = (mediaSize.height - 1) as Coordinate
                }
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
