/**
 * multipane.test.ts —— 布局常量与数据单测（v1.4.5）
 *
 * 覆盖：paneCount 常量（顶/底空 Pane + K 线）、calcFixedEdgeFactor 高度算法、
 * K 线数据时间序列合法性。
 */
import { describe, expect, it } from 'vitest'
import { paneCount, topPaneHeight, calcFixedEdgeFactor } from '../src/chart/layout'
import { genMockBars } from '../src/chart/mock'

describe('布局常量', () => {
  it('Pane 总数为 3（顶部空 Pane + K 线 + 底部空 Pane）', () => {
    expect(paneCount).toBe(3)
  })

  it('顶部空 Pane 固定高度 24px', () => {
    expect(topPaneHeight).toBe(24)
  })
})

describe('calcFixedEdgeFactor（顶/底双固定 Pane stretchFactor）', () => {
  it('600px 可用高度下每个固定 Pane 占 24px（factor = 24/552）', () => {
    const factor = calcFixedEdgeFactor(600, 24)
    expect(factor).toBeCloseTo(24 / 552, 6)
    // 验证实际占比：f/(2f+1) = 24/600
    expect(factor / (2 * factor + 1)).toBeCloseTo(24 / 600, 6)
  })

  it('可用高度不足时兜底返回 1（避免除零）', () => {
    expect(calcFixedEdgeFactor(40, 24)).toBe(1)
    expect(calcFixedEdgeFactor(10, 24)).toBe(1)
  })

  it('固定高度增大 → factor 增大（更高占比）', () => {
    const factor24 = calcFixedEdgeFactor(600, 24)
    const factor48 = calcFixedEdgeFactor(600, 48)
    expect(factor48).toBeGreaterThan(factor24)
  })

  it('库分配模拟：e = fixed/(H-2fixed) 时 pane0 与 pane2 高度绝对相等', () => {
    // 模拟 lightweight-charts _adjustSizeImpl：非最后 pane 用 round(f×S)，
    // 最后一个 pane = 剩余（吸收舍入误差）。数学恒等保证 pane0 === pane2。
    const simulate = (total: number, fixed: number): [number, number, number] => {
      const edgeFactor = calcFixedEdgeFactor(total, fixed)
      const stretchPixels = total / (2 * edgeFactor + 1)
      const pane0 = Math.round(edgeFactor * stretchPixels)
      const pane1 = Math.round(stretchPixels)
      const pane2 = total - pane0 - pane1
      return [pane0, pane1, pane2]
    }
    // 覆盖时间轴开/关与多种容器高度
    for (const total of [400, 500, 570, 598, 601, 777, 999]) {
      const [pane0, , pane2] = simulate(total, 24)
      expect(pane0).toBe(pane2)
    }
    // 且固定 Pane 恰好等于目标 24px
    const [pane0] = simulate(570, 24)
    expect(pane0).toBe(24)
  })
})

describe('K 线数据', () => {
  it('时间严格递增且不重复', () => {
    const bars = genMockBars(120)
    expect(bars.length).toBe(120)
    for (let index = 1; index < bars.length; index++) {
      expect(bars[index].time).toBeGreaterThan(bars[index - 1].time)
    }
  })

  it('OHLC 合法：high >= max(open,close)，low <= min(open,close)', () => {
    const bars = genMockBars(200)
    for (const bar of bars) {
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close))
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close))
    }
  })
})
