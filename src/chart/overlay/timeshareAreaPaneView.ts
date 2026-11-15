// timeshareAreaPaneView.ts —— 分时价格区渐变背景的渲染视图。
// 职责：在 draw 回调中绘制"以价格曲线为顶、pane 底边为底"的渐变填充：
//  1. 逐点坐标转换（x = timeScale.timeToCoordinate，y = series.priceToCoordinate）；
//  2. 整理成闭合多边形（buildTimeshareAreaPolygon，纯函数、可单测）；
//  3. 用 createLinearGradient(0, 面积最高点 → 0, pane 底边) 填充，顶部浅、底部深。
// zOrder 'bottom'：画在栅格（normal 层）与价格线（series 层）之下，只当底色。
import {
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type PrimitivePaneViewZOrder,
  type Time,
} from 'lightweight-charts'
import { buildTimeshareAreaPolygon } from './timeshareAreaPrimitive'
import type { TimeshareAreaPrimitive } from './timeshareAreaPrimitive'

/**
 * 分时价格区渐变背景渲染视图。
 *
 * @remarks
 * 价格点、颜色、可见性每次 draw 现取 → 实时追加 / 周期切换 / 主题切换均自动刷新；
 * 非分时周期由 getVisible 直接跳过（K 线模式下不产生任何绘制）。
 */
export class TimeshareAreaPaneView implements IPrimitivePaneView {
  /** 所属 primitive（只读，提供数据 / 颜色 / 坐标转换）。 */
  private readonly source: TimeshareAreaPrimitive

  constructor(source: TimeshareAreaPrimitive) {
    this.source = source
  }

  /** zOrder 'bottom'：pane 主 canvas 最底层（栅格与 series 都在其上）。 */
  zOrder = (): PrimitivePaneViewZOrder => {
    return 'bottom'
  }

  /** 渲染器：价格折线到底边的渐变填充。 */
  renderer = (): IPrimitivePaneRenderer => {
    return {
      draw: (target) => {
        const config = this.source.config
        // 仅分时周期绘制（K 线周期直接返回，避免残留淡色块）。
        if (!config.getVisible()) return
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          const { width, height } = mediaSize
          if (width <= 0 || height <= 0) return
          const timeScale = config.getTimeScale()
          // 分时点 → 像素坐标：占位行（bar = null）跳过，只铺真实数据区域。
          const coords: { x: number; y: number }[] = []
          for (const row of config.getRows()) {
            const price = row.bar?.price
            if (typeof price !== 'number' || !Number.isFinite(price)) continue
            const x = timeScale.timeToCoordinate(row.time as Time)
            if (x === null) continue
            const y = config.series.priceToCoordinate(price)
            if (y === null) continue
            coords.push({ x, y })
          }
          const polygon = buildTimeshareAreaPolygon(coords, width, height)
          if (polygon === null) return
          // 渐变起点 = 面积最高点（贴价格曲线），终点 = pane 底边 → 顶部淡、底部浓。
          let topY = height
          for (const point of polygon) {
            if (point.y < topY) topY = point.y
          }
          context.save()
          const gradient = context.createLinearGradient(0, topY, 0, height)
          gradient.addColorStop(0, config.getTopColor())
          gradient.addColorStop(1, config.getBottomColor())
          context.fillStyle = gradient
          context.beginPath()
          for (let i = 0; i < polygon.length; i += 1) {
            const point = polygon[i]
            if (i === 0) context.moveTo(point.x, point.y)
            else context.lineTo(point.x, point.y)
          }
          context.closePath()
          context.fill()
          context.restore()
        })
      },
    }
  }
}
