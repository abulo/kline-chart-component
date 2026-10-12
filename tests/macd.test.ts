/**
 * macd.test.ts —— MACD 指标计算单测（v1.4.14）
 *
 * 覆盖：EMA（东方财富算法）、DIF / DEA / MACD 的边界与性质
 * （首值 = 0、MACD = 2×(DIF-DEA)、长度对齐、单调序列下 DIF 符号合理）。
 */
import { describe, expect, it } from 'vitest'
import { ema, calcMacd } from '../src/chart/indicators/macd'

describe('ema（指数移动平均，东方财富算法）', () => {
  it('period=2 时 alpha=2/3，逐项手算一致', () => {
    // EMA[0]=1；EMA[1]=2/3×2+1/3×1=5/3；EMA[2]=2/3×3+1/3×(5/3)=23/9
    const result = ema([1, 2, 3], 2)
    expect(result[0]).toBeCloseTo(1, 9)
    expect(result[1]).toBeCloseTo(5 / 3, 9)
    expect(result[2]).toBeCloseTo(23 / 9, 9)
  })

  it('空序列返回空数组', () => {
    expect(ema([], 12)).toEqual([])
  })

  it('长度与输入一致', () => {
    expect(ema([1, 2, 3, 4, 5], 12).length).toBe(5)
  })
})

describe('calcMacd（DIF / DEA / MACD）', () => {
  const bars = Array.from({ length: 40 }, (_, index) => ({
    time: 1700000000 + index * 86400,
    close: 10 + index * 0.1, // 单调递增收盘
  }))

  it('长度与 bars 逐根对齐', () => {
    const points = calcMacd(bars)
    expect(points.length).toBe(bars.length)
    expect(points[39].time).toBe(bars[39].time)
  })

  it('首值：DIF = DEA = MACD = 0（EMA 初值 = 首收盘）', () => {
    const points = calcMacd(bars)
    expect(points[0].dif).toBeCloseTo(0, 9)
    expect(points[0].dea).toBeCloseTo(0, 9)
    expect(points[0].macd).toBeCloseTo(0, 9)
  })

  it('MACD = 2 × (DIF - DEA) 恒成立', () => {
    const points = calcMacd(bars)
    for (const point of points) {
      expect(point.macd).toBeCloseTo(2 * (point.dif - point.dea), 9)
    }
  })

  it('单调递增收盘下 DIF > 0（EMA12 领先于 EMA26）', () => {
    const points = calcMacd(bars)
    for (let index = 3; index < points.length; index++) {
      expect(points[index].dif).toBeGreaterThan(0)
    }
  })
})
