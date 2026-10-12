/**
 * multipane.test.ts —— 布局常量与数据单测（v1.2.0）
 *
 * 覆盖：PANE_COUNT 常量（单 Pane K 线）、K 线数据时间序列合法性。
 */
import { describe, expect, it } from 'vitest'
import { PANE_COUNT } from '../src/chart/KLineChartController'
import { genMockBars } from '../src/chart/mock'

describe('布局常量', () => {
  it('Pane 总数为 1（仅 K 线主图）', () => {
    expect(PANE_COUNT).toBe(1)
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
