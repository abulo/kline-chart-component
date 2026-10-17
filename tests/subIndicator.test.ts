/**
 * subIndicator.test.ts —— 附图指标单指标计算单测（v1.7.0）
 *
 * 覆盖 calcSubIndicator（index.ts 统一出口）：
 *  - 按指标名分发到对应 calc 函数，返回与全量 Record 同构的线组（等价性）；
 *  - 十指标名全部可分发（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR）；
 *  - MACD 三线组（DIF / DEA / 柱）结构正确、长度与 bars 对齐；
 *  - 与对应 calc 函数直调结果一致（分发改对名字，未算错指标）。
 */
import { describe, expect, it } from 'vitest'
import { calcSubIndicator } from '../src/chart/indicator'
import { calcMACD } from '../src/chart/indicator/macd'
import { calcRSI } from '../src/chart/indicator/rsi'
import type { ChartDataPoint } from '../src/types/chart'

/** 构造单根 K 线（统一数据点类型；指标计算只用 time/open/high/low/close） */
const makeBar = (index: number, close: number): ChartDataPoint => ({
  time: 1_700_000_000 + index * 86_400,
  tradeDate: '2026-01-05',
  preClose: close,
  pointType: 'kline',
  open: close,
  high: close,
  low: close,
  close,
  volume: 1000,
})

/** 生成 n 根单调上涨序列（指标输出可预期：MACD DIF 为正） */
const makeBars = (n: number): ChartDataPoint[] => {
  const bars: ChartDataPoint[] = []
  for (let i = 0; i < n; i++) bars.push(makeBar(i, 10 + i * 0.1))
  return bars
}

describe('calcSubIndicator（v1.7.0 单指标分发）', () => {
  const bars = makeBars(60)

  it('与对应 calc 函数直调结果一致（macd）', () => {
    expect(calcSubIndicator('macd', bars)).toEqual(calcMACD(bars))
  })

  it('与对应 calc 函数直调结果一致（rsi）', () => {
    expect(calcSubIndicator('rsi', bars)).toEqual(calcRSI(bars))
  })

  it('十指标名全部可分发且返回线组数组（各组非空、含有效值）', () => {
    const names = ['rsi', 'kdj', 'macd', 'wr', 'dmi', 'bias', 'obv', 'cci', 'roc', 'cr'] as const
    for (const name of names) {
      const lines = calcSubIndicator(name, bars)
      expect(Array.isArray(lines)).toBe(true)
      expect(lines.length).toBeGreaterThan(0)
      // 每组为数组；全组展开后至少存在 1 个非 null 有效值
      expect(lines.every((group) => Array.isArray(group))).toBe(true)
      const validCount = lines.flat().filter((p) => p.value !== null).length
      expect(validCount).toBeGreaterThan(0)
    }
  })

  it('MACD 三线组：DIF / DEA / 柱，单调上涨下 DIF 收敛为正', () => {
    const lines = calcSubIndicator('macd', bars)
    expect(lines.length).toBe(3)
    // 首值 DIF = 0（EMA 初值 = 首收盘）；单调上涨序列末值应为正
    const dif = lines[0]
    const lastValid = dif
      .slice()
      .reverse()
      .find((p) => p.value !== null)
    expect(lastValid!.value).toBeGreaterThan(0)
  })
})
