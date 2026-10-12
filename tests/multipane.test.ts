/**
 * multipane.test.ts —— 布局常量与数据单测（v1.4.17）
 *
 * 覆盖：paneCount 常量、分组比例（指标开 60:20:20 / 指标关 80:20）、
 * calcPaneHeights 高度算法（固定空 Pane 24px、组比例、总和守恒、数量守恒）、
 * K 线与成交量数据合法性。
 */
import { describe, expect, it } from 'vitest'
import {
  paneCount,
  paneCountWithoutIndicator,
  fixedPaneCount,
  fixedPaneCountWithoutIndicator,
  topPaneHeight,
  groupRatios,
  groupRatiosWithoutIndicator,
  calcPaneHeights,
} from '../src/chart/layout'
import { genMockBars } from '../src/chart/mock'

describe('布局常量', () => {
  it('指标开 Pane 总数为 6（空 Pane ×3 + K 线 + 成交量 + 指标）', () => {
    expect(paneCount).toBe(6)
  })

  it('指标关 Pane 总数为 4（空 Pane ×2 + K 线 + 成交量）', () => {
    expect(paneCountWithoutIndicator).toBe(4)
  })

  it('固定空 Pane 数量：指标开 3 / 指标关 2', () => {
    expect(fixedPaneCount).toBe(3)
    expect(fixedPaneCountWithoutIndicator).toBe(2)
  })

  it('顶部空 Pane 固定高度 22px（用户指定）', () => {
    expect(topPaneHeight).toBe(22)
  })

  it('指标开组比例 60 : 20 : 20 / 指标关 80 : 20', () => {
    expect(groupRatios.main).toBe(0.6)
    expect(groupRatios.volume).toBe(0.2)
    expect(groupRatios.indicator).toBe(0.2)
    expect(groupRatiosWithoutIndicator.main).toBe(0.8)
    expect(groupRatiosWithoutIndicator.volume).toBe(0.2)
    expect(groupRatiosWithoutIndicator.indicator).toBe(0)
  })
})

describe('calcPaneHeights（分组像素高度）', () => {
  it('指标开：空 Pane 高度已扣除后，内容 Pane 按 60:20:20 分配（6 项）', () => {
    // 可用高度 600：固定 72，剩余 528
    // pane1 = 0.6×528 = 316.8、pane3 = 0.2×528 = 105.6、pane5 = 0.2×528 = 105.6
    const heights = calcPaneHeights(600, 24, fixedPaneCount, groupRatios)
    expect(heights).toHaveLength(6)
    expect(heights[0]).toBe(24)
    expect(heights[2]).toBe(24)
    expect(heights[4]).toBe(24)
    expect(heights[1]).toBeCloseTo(0.6 * 528, 6)
    expect(heights[3]).toBeCloseTo(0.2 * 528, 6)
    expect(heights[5]).toBeCloseTo(0.2 * 528, 6)
    // 内容比例 main : volume = 3 : 1
    expect(heights[1]).toBeCloseTo(3 * heights[3], 6)
    expect(heights[3]).toBeCloseTo(heights[5], 6)
  })

  it('指标关：空 Pane 高度已扣除后，内容 Pane 按 80:20 分配（4 项）', () => {
    // 可用高度 600：固定 48，剩余 552
    // pane1 = 0.8×552 = 441.6、pane3 = 0.2×552 = 110.4
    const heights = calcPaneHeights(600, 24, fixedPaneCountWithoutIndicator, groupRatiosWithoutIndicator)
    expect(heights).toHaveLength(4)
    expect(heights[0]).toBe(24)
    expect(heights[2]).toBe(24)
    expect(heights[1]).toBeCloseTo(0.8 * 552, 6)
    expect(heights[3]).toBeCloseTo(0.2 * 552, 6)
    // 内容比例 main : volume = 4 : 1
    expect(heights[1]).toBeCloseTo(4 * heights[3], 6)
  })

  it('高度总和守恒（等于可用高度，完全铺满）——指标开 / 关', () => {
    for (const total of [400, 500, 570, 600, 777, 999]) {
      const withIndicator = calcPaneHeights(total, 24, fixedPaneCount, groupRatios)
      const withoutIndicator = calcPaneHeights(total, 24, fixedPaneCountWithoutIndicator, groupRatiosWithoutIndicator)
      expect(withIndicator.reduce((sum, height) => sum + height, 0)).toBeCloseTo(total, 6)
      expect(withoutIndicator.reduce((sum, height) => sum + height, 0)).toBeCloseTo(total, 6)
    }
  })

  it('时间轴开关：仅可用高度不同，内容比例不变（传不同 total）', () => {
    // 模拟容器 600px：时间轴开 H = 600-28-5 = 567；关 H = 600-5 = 595
    const withAxis = calcPaneHeights(567, 24, fixedPaneCount, groupRatios)
    const withoutAxis = calcPaneHeights(595, 24, fixedPaneCount, groupRatios)
    for (const index of [0, 2, 4]) {
      expect(withAxis[index]).toBe(withoutAxis[index]) // 固定空 Pane 恒 24
    }
    // 内容比例均 60:20:20（pane1 : pane3 = 3 : 1，时间轴开关不变）
    const contentRatio = (heights: number[]): number => heights[1] / heights[3]
    expect(contentRatio(withAxis)).toBeCloseTo(3, 6)
    expect(contentRatio(withoutAxis)).toBeCloseTo(3, 6)
  })

  it('可用高度不足时兜底返回 1（避免负高度）', () => {
    const fallback = calcPaneHeights(40, 24, fixedPaneCount, groupRatios)
    expect(fallback).toEqual([1, 1, 1, 1, 1, 1])
    const fallbackOff = calcPaneHeights(40, 24, fixedPaneCountWithoutIndicator, groupRatiosWithoutIndicator)
    expect(fallbackOff).toEqual([1, 1, 1, 1])
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
