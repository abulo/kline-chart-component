/**
 * highLow.test.ts —— 最高价 / 最低价标注极值查找纯函数单测（v1.4.49）
 */
import { describe, expect, it } from 'vitest'
import type { ChartDataPoint } from '../src/types/chart'
import { findExtremeBars } from '../src/chart/highLow/highLowMarkerPaneView'

/** 构造单根 K 线（统一数据点类型：pointType='kline'，标注需要 high / low 字段） */
const makeBar = (index: number, high: number, low: number): ChartDataPoint => ({
  time: 1_700_000_000 + index * 86_400,
  tradeDate: '2026-01-05',
  preClose: (high + low) / 2,
  pointType: 'kline',
  open: (high + low) / 2,
  high,
  low,
  close: (high + low) / 2,
  volume: 1000,
})

describe('findExtremeBars（可视区域最高价 / 最低价标注，两者同时返回）', () => {
  it('在区间内同时返回最高价与最低价 bar', () => {
    const bars = [
      makeBar(0, 12, 11), // 高 12 / 低 11
      makeBar(1, 13, 10.5), // 高 13（最高）/ 低 10.5（最低）
      makeBar(2, 11.5, 11.2),
    ]
    const { high, low } = findExtremeBars(bars, 0, 2)
    expect(high).not.toBeNull()
    expect(high?.high).toBe(13)
    expect(low?.low).toBe(10.5)
    // 最高与最低互不抢占（即使同根也各自返回）
    const same = findExtremeBars(bars, 0, 0)
    expect(same.high?.high).toBe(12)
    expect(same.low?.low).toBe(11)
  })

  it('子区间查找：仅在该区间内取极值（平移可视范围模拟）', () => {
    const bars = [
      makeBar(0, 10, 9),
      makeBar(1, 20, 8), // 全局最高 / 最低都在此根
      makeBar(2, 15, 14),
      makeBar(3, 18, 17),
    ]
    // 只看 [2, 3]：最高 = 18（index 3）、最低 = 14（index 2）
    const later = findExtremeBars(bars, 2, 3)
    expect(later.high?.high).toBe(18)
    expect(later.low?.low).toBe(14)
    // 只看 [0, 1]：最高 = 20、最低 = 8（同根也各自返回）
    const early = findExtremeBars(bars, 0, 1)
    expect(early.high?.high).toBe(20)
    expect(early.low?.low).toBe(8)
  })

  it('空区间 / 空数据返回双 null；区间含无效索引时跳过并取有效极值', () => {
    expect(findExtremeBars([], 0, 0)).toEqual({ high: null, low: null })
    const bars = [makeBar(0, 12, 11)]
    expect(findExtremeBars(bars, 5, 3)).toEqual({ high: null, low: null }) // from > to
    // 区间超出数据右端：无效索引被跳过，返回有效数据内的极值（健壮容错）
    const overflow = findExtremeBars(bars, 0, 1)
    expect(overflow.high?.high).toBe(12)
    expect(overflow.low?.low).toBe(11)
  })
})
