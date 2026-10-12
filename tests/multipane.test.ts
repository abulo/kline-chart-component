/**
 * multipane.test.ts —— 布局常量与数据单测（v1.4.8）
 *
 * 覆盖：paneCount 常量（顶/底空 Pane + K 线 + 成交量）、calcPaneFactors 高度算法
 * （pane0/pane2 绝对相等）、K 线与成交量数据合法性。
 */
import { describe, expect, it } from 'vitest'
import { paneCount, topPaneHeight, volumeRatio, calcPaneFactors } from '../src/chart/layout'
import { genMockBars } from '../src/chart/mock'

describe('布局常量', () => {
  it('Pane 总数为 4（顶部空 Pane + K 线 + 底部空 Pane + 成交量）', () => {
    expect(paneCount).toBe(4)
  })

  it('顶部空 Pane 固定高度 24px', () => {
    expect(topPaneHeight).toBe(24)
  })

  it('成交量 Pane 高度为 K 线的 0.25（1:4）', () => {
    expect(volumeRatio).toBe(0.25)
  })
})

describe('calcPaneFactors（顶/底固定 + K 线 + 成交量 stretchFactor）', () => {
  it('600px 可用高度下固定 Pane 占 24px（factor = 24×(1+0.25)/552）', () => {
    const { fixedFactor, klineFactor, volumeFactor } = calcPaneFactors(600, 24, 0.25)
    expect(fixedFactor).toBeCloseTo((24 * 1.25) / 552, 6)
    expect(klineFactor).toBe(1)
    expect(volumeFactor).toBe(0.25)
    // 验证实际占比：fixed/(2×fixed + kline + volume) = 24/600
    expect(fixedFactor / (2 * fixedFactor + klineFactor + volumeFactor)).toBeCloseTo(24 / 600, 6)
  })

  it('可用高度不足时兜底返回 1（避免除零）', () => {
    const fallback = calcPaneFactors(40, 24, 0.25)
    expect(fallback.fixedFactor).toBe(1)
    expect(fallback.klineFactor).toBe(1)
    expect(fallback.volumeFactor).toBe(1)
  })

  it('固定高度增大 → fixedFactor 增大（更高占比）', () => {
    const factor24 = calcPaneFactors(600, 24, 0.25).fixedFactor
    const factor48 = calcPaneFactors(600, 48, 0.25).fixedFactor
    expect(factor48).toBeGreaterThan(factor24)
  })

  it('库分配模拟：pane0 与 pane2 高度绝对相等且恰为 24px', () => {
    // 模拟 lightweight-charts _adjustSizeImpl：非最后 pane 用 round(f×S)，
    // 最后一个 pane（成交量）= 剩余（吸收舍入误差）。
    // 数学恒等：fixedFactor×S = fixed，故 pane0 = pane2 = fixed 精确。
    const simulate = (total: number, fixed: number, ratio: number): number[] => {
      const { fixedFactor, klineFactor, volumeFactor } = calcPaneFactors(total, fixed, ratio)
      const stretchPixels = total / (2 * fixedFactor + klineFactor + volumeFactor)
      const pane0 = Math.round(fixedFactor * stretchPixels)
      const pane1 = Math.round(klineFactor * stretchPixels)
      const pane2 = Math.round(fixedFactor * stretchPixels)
      const pane3 = total - pane0 - pane1 - pane2
      return [pane0, pane1, pane2, pane3]
    }
    // 覆盖时间轴开/关与多种容器高度
    for (const total of [400, 500, 570, 598, 601, 777, 999]) {
      const [pane0, , pane2] = simulate(total, 24, 0.25)
      expect(pane0).toBe(pane2)
      expect(pane0).toBe(24)
    }
    // 成交量 pane 为最后 pane（剩余），总和守恒
    const [pane0, pane1, pane2, pane3] = simulate(570, 24, 0.25)
    expect(pane0 + pane1 + pane2 + pane3).toBe(570)
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

  it('成交量合法：volume 为正整数', () => {
    const bars = genMockBars(200)
    for (const bar of bars) {
      expect(bar.volume).toBeGreaterThan(0)
      expect(Number.isInteger(bar.volume)).toBe(true)
    }
  })
})
