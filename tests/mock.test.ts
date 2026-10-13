/**
 * mock.test.ts —— mock 数据单测（v1.1.0）
 */
import { describe, expect, it } from 'vitest'
import { genMockBars } from '../src/chart/core/mock'

describe('genMockBars', () => {
  it('生成指定数量且 time 严格递增', () => {
    const bars = genMockBars(120)
    expect(bars).toHaveLength(120)
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].time).toBeGreaterThan(bars[i - 1].time)
    }
  })

  it('不含周末（周六周日）', () => {
    const bars = genMockBars(500)
    for (const b of bars) {
      const dow = new Date(b.time * 1000).getDay()
      expect(dow).not.toBe(0)
      expect(dow).not.toBe(6)
    }
  })

  it('OHLC 关系合法：high >= max(open,close)，low <= min(open,close)', () => {
    const bars = genMockBars(200)
    for (const b of bars) {
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close))
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close))
    }
  })

  it('preClose：首根 = open，其余 = 前一根 close', () => {
    const bars = genMockBars(50)
    expect(bars[0].preClose).toBe(bars[0].open)
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].preClose).toBe(bars[i - 1].close)
    }
  })

  it('边界：0 根 / 1 根', () => {
    expect(genMockBars(0)).toHaveLength(0)
    expect(genMockBars(1)).toHaveLength(1)
  })
})
