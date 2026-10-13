/**
 * indicators.test.ts —— 主图指标（MA / EXPMA / BOLL / SAR / BBI）纯函数单测（v1.4.56）
 *
 * 基于 src/chart/indicator/ 东财指标库（统一出口 index.ts）：
 *  - MA：滑动窗口均值与前 N-1 根跳过；
 *  - EXPMA：指数平滑递推（α = 2/(N+1)，首值 = 首根收盘）；
 *  - BOLL：中轨 = MA(N)、上/下轨 = 中轨 ± 2σ（总体标准差分母 N）；
 *  - SAR：前 4 根取初始极值、趋势判定、跌破/升破反转（含 trend 字段）；
 *  - BBI：(MA3 + MA6 + MA12 + MA24) / 4。
 */
import { describe, expect, it } from 'vitest'
import type { BasicBar } from '../src/chart/core/mock'
import { calcMA } from '../src/chart/indicator/ma'
import { calcEXPMA } from '../src/chart/indicator/expma'
import { calcBOLL } from '../src/chart/indicator/boll'
import { calcSAR } from '../src/chart/indicator/sar'
import { calcBBI } from '../src/chart/indicator/bbi'

/** 构造单根 K 线（指标计算只用 time / open / high / low / close / volume） */
const makeBar = (index: number, close: number, high?: number, low?: number): BasicBar => {
  const h = high ?? close
  const l = low ?? close
  return {
    time: 1_700_000_000 + index * 86_400,
    open: close,
    high: h,
    low: l,
    close,
    volume: 1000,
  }
}

describe('MA（简单移动平均）', () => {
  it('滑动窗口均值正确，前 N-1 根跳过', () => {
    const bars = [makeBar(0, 1), makeBar(1, 2), makeBar(2, 3), makeBar(3, 4), makeBar(4, 5)]
    const ma3 = calcMA(bars, 3)
    // MA3：第 3 根起 = (1+2+3)/3=2、(2+3+4)/3=3、(3+4+5)/3=4
    expect(ma3.map((p) => p.value)).toEqual([2, 3, 4])
    expect(ma3[0].time).toBe(bars[2].time)
    // MA5：仅第 5 根 = (1+2+3+4+5)/5=3
    const ma5 = calcMA(bars, 5)
    expect(ma5.map((p) => p.value)).toEqual([3])
  })

  it('周期大于数据量返回空；非法周期输出 NaN 点（库行为，不抛错）', () => {
    const bars = [makeBar(0, 1), makeBar(1, 2)]
    expect(calcMA(bars, 5)).toEqual([])
    // period = 0：无合法均值，库输出 NaN 值点（toLines 消费时会过滤 NaN）
    const invalid = calcMA(bars, 0)
    expect(invalid.length).toBe(bars.length)
    expect(invalid.every((p) => Number.isNaN(p.value))).toBe(true)
  })
})

describe('EXPMA（指数平滑移动平均）', () => {
  it('EMA 递推正确（α = 2/(N+1)，首值 = 首根收盘）', () => {
    const bars = [makeBar(0, 1), makeBar(1, 2), makeBar(2, 3)]
    const points = calcEXPMA(bars, 2) // α = 2/3
    // EMA0 = 1；EMA1 = 1 + (2-1)*2/3 = 5/3；EMA2 = 5/3 + (3-5/3)*2/3 = 23/9
    expect(points[0].value).toBeCloseTo(1, 4)
    expect(points[1].value).toBeCloseTo(5 / 3, 4)
    expect(points[2].value).toBeCloseTo(23 / 9, 4)
    expect(points.length).toBe(bars.length)
  })
})

describe('BOLL（布林带）', () => {
  it('中轨 = MA(N)、上下轨 = 中轨 ± 2σ（总体标准差分母 N）', () => {
    // 5 根：[2, 4, 4, 4, 6]；N=5：均值 = 4；σ² = ((2-4)²+0+0+0+(6-4)²)/5 = 8/5 = 1.6
    const bars = [makeBar(0, 2), makeBar(1, 4), makeBar(2, 4), makeBar(3, 4), makeBar(4, 6)]
    const [upper, mid, lower] = calcBOLL(bars, 5, 2)
    expect(mid).toHaveLength(1)
    expect(mid[0].value).toBeCloseTo(4, 4)
    const sigma = Math.sqrt(1.6)
    expect(upper[0].value).toBeCloseTo(4 + 2 * sigma, 4)
    expect(lower[0].value).toBeCloseTo(4 - 2 * sigma, 4)
    // 上轨 >= 中轨 >= 下轨
    expect(upper[0].value).toBeGreaterThan(mid[0].value)
    expect(mid[0].value).toBeGreaterThan(lower[0].value)
  })
})

describe('SAR（抛物线转向，东财口径）', () => {
  it('多头趋势：初始 SAR = 前 4 根最低价，逐根递推上升，trend = 1', () => {
    // 单调上升（close = open，close 递增）：首根 close >= open → 多头；
    // 初始极值取前 4 根最低价 = 1
    const bars = Array.from({ length: 10 }, (_, i) => makeBar(i, i + 2, i + 3, i + 1))
    const points = calcSAR(bars)
    // 每根都有 SAR 点（含趋势字段）
    expect(points).toHaveLength(bars.length)
    expect(points[0].value).toBe(1) // 前 4 根最低价
    expect(points[0].trend).toBe(1)
    // 单调上升不反转：SAR 整体上升
    expect(points[points.length - 1].value).toBeGreaterThan(points[0].value)
    expect(points.every((p) => p.trend === 1)).toBe(true)
  })

  it('价格跌破 SAR 时趋势反转（trend 变 -1、SAR 贴向原极值高点）', () => {
    // 先涨后大跌：首根 close >= open → 多头；第 5 根（index 4）大跌跌破 SAR → 反转
    const bars = [
      makeBar(0, 10, 11, 9),
      makeBar(1, 11, 12, 10),
      makeBar(2, 12, 13, 11),
      makeBar(3, 12.5, 13, 12),
      makeBar(4, 8, 8.5, 7), // 大跌：low=7 < SAR → 反转空头
      makeBar(5, 8.5, 9, 8),
    ]
    const points = calcSAR(bars)
    expect(points).toHaveLength(6)
    // 反转发生在 index 4：trend = -1，SAR = 原 EP（高点 13）
    expect(points[4].trend).toBe(-1)
    expect(points[4].value).toBe(13)
    // 反转后 index 5 维持空头，SAR 不高于前两根最高价（保护钳制）
    expect(points[5].trend).toBe(-1)
    expect(points[5].value).toBeLessThanOrEqual(points[4].value)
  })
})

describe('BBI（多空指标）', () => {
  it('= (MA3 + MA6 + MA12 + MA24) / 4，前 23 根跳过', () => {
    // 恒定收盘价 10：四条 MA 均为 10 → BBI = 10
    const bars = Array.from({ length: 30 }, (_, i) => makeBar(i, 10))
    const points = calcBBI(bars)
    expect(points).toHaveLength(30 - 23)
    expect(points[0].time).toBe(bars[23].time)
    expect(points.every((p) => Math.abs(p.value - 10) < 1e-9)).toBe(true)
  })
})
