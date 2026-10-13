/**
 * macd.test.ts —— MACD 指标计算单测（v1.4.56，东财指标库）
 *
 * 覆盖：ema（utils，东方财富算法）、calcMACD 三线输出
 * （DIF / DEA / 柱值 = 2×(DIF−DEA)、首值 = 0、长度对齐、单调序列下 DIF 符号合理）。
 */
import { describe, expect, it } from 'vitest'
import { ema } from '../src/chart/indicator/utils'
import { calcMACD } from '../src/chart/indicator/macd'

/** 构造 MACD 输入 K 线（calcMACD 只用 close；补齐 OHLC 满足 K 类型） */
const makeBar = (index: number, close: number) => ({
  time: 1700000000 + index * 86400,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1000,
})

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

describe('calcMACD（DIF / DEA / 柱值三线，东财口径）', () => {
  const bars = Array.from({ length: 40 }, (_, index) => makeBar(index, 10 + index * 0.1)) // 单调递增收盘

  it('返回 [DIF, DEA, 柱值] 三线，长度与 bars 逐根对齐', () => {
    const [difLine, deaLine, histLine] = calcMACD(bars)
    expect(difLine.length).toBe(bars.length)
    expect(deaLine.length).toBe(bars.length)
    expect(histLine.length).toBe(bars.length)
    expect(difLine[39].time).toBe(bars[39].time)
  })

  it('首值：DIF = DEA = 柱值 = 0（EMA 初值 = 首收盘）', () => {
    const [difLine, deaLine, histLine] = calcMACD(bars)
    expect(difLine[0].value).toBeCloseTo(0, 9)
    expect(deaLine[0].value).toBeCloseTo(0, 9)
    expect(histLine[0].value).toBeCloseTo(0, 9)
  })

  it('柱值 = 2 × (DIF - DEA) 恒成立', () => {
    const [difLine, deaLine, histLine] = calcMACD(bars)
    for (let i = 0; i < difLine.length; i++) {
      expect(histLine[i].value).toBeCloseTo(2 * (difLine[i].value - deaLine[i].value), 9)
    }
  })

  it('单调递增收盘下 DIF > 0（EMA12 领先于 EMA26）', () => {
    const [difLine] = calcMACD(bars)
    for (let index = 3; index < difLine.length; index++) {
      expect(difLine[index].value).toBeGreaterThan(0)
    }
  })
})
