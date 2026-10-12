/**
 * multipane.test.ts —— 布局常量与数据单测（v1.4.0）
 *
 * 覆盖：PANE_COUNT 常量（顶部空 Pane + K 线）、calcFixedTopFactor 高度算法、
 * K 线数据时间序列合法性。
 */
import { describe, expect, it } from 'vitest'
import { PANE_COUNT, TOP_PANE_HEIGHT, calcFixedTopFactor } from '../src/chart/KLineChartController'
import { genMockBars } from '../src/chart/mock'

describe('布局常量', () => {
  it('Pane 总数为 2（顶部空 Pane + K 线主图）', () => {
    expect(PANE_COUNT).toBe(2)
  })

  it('顶部空 Pane 固定高度 24px', () => {
    expect(TOP_PANE_HEIGHT).toBe(24)
  })
})

describe('calcFixedTopFactor（顶部固定高度 stretchFactor）', () => {
  it('600px 可用高度下顶部占 24px（factor = 24/576）', () => {
    const f = calcFixedTopFactor(600, 24)
    expect(f).toBeCloseTo(24 / 576, 6)
    // 验证实际占比：f/(f+1) = 24/600
    expect(f / (f + 1)).toBeCloseTo(24 / 600, 6)
  })

  it('可用高度等于顶部高度时兜底返回 1（避免除零）', () => {
    expect(calcFixedTopFactor(24, 24)).toBe(1)
    expect(calcFixedTopFactor(10, 24)).toBe(1)
  })

  it('顶部高度增大 → factor 增大（更高占比）', () => {
    const f24 = calcFixedTopFactor(600, 24)
    const f48 = calcFixedTopFactor(600, 48)
    expect(f48).toBeGreaterThan(f24)
  })
})

describe('K 线数据', () => {
  it('时间严格递增且不重复', () => {
    const bars = genMockBars(120)
    expect(bars.length).toBe(120)
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].time).toBeGreaterThan(bars[i - 1].time)
    }
  })

  it('OHLC 合法：high >= max(open,close)，low <= min(open,close)', () => {
    const bars = genMockBars(200)
    for (const b of bars) {
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close))
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close))
    }
  })
})
