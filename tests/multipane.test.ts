/**
 * multipane.test.ts —— 布局常量与数据单测（v1.4.15）
 *
 * 覆盖：paneCount 常量、分组比例（main/volume/indicator = 60:20:20）、
 * calcPaneHeights 高度算法（固定空 Pane 24px、组比例、总和守恒）、
 * K 线与成交量数据合法性。
 */
import { describe, expect, it } from 'vitest'
import { paneCount, fixedPaneCount, topPaneHeight, groupRatios, calcPaneHeights } from '../src/chart/layout'
import { genMockBars } from '../src/chart/mock'

describe('布局常量', () => {
  it('Pane 总数为 6（空 Pane ×3 + K 线 + 成交量 + 指标）', () => {
    expect(paneCount).toBe(6)
  })

  it('固定空 Pane 数量为 3（pane0 / pane2 / pane4）', () => {
    expect(fixedPaneCount).toBe(3)
  })

  it('顶部空 Pane 固定高度 24px', () => {
    expect(topPaneHeight).toBe(24)
  })

  it('三组高度比例 60 : 20 : 20', () => {
    expect(groupRatios.main).toBe(0.6)
    expect(groupRatios.volume).toBe(0.2)
    expect(groupRatios.indicator).toBe(0.2)
  })
})

describe('calcPaneHeights（分组像素高度）', () => {
  it('空 Pane 高度已扣除后，内容 Pane 按 60:20:20 分配', () => {
    // 可用高度 600：固定 72，剩余 528
    // pane1 = 0.6×528 = 316.8、pane3 = 0.2×528 = 105.6、pane5 = 0.2×528 = 105.6
    const [pane0, pane1, pane2, pane3, pane4, pane5] = calcPaneHeights(600, 24)
    expect(pane0).toBe(24)
    expect(pane2).toBe(24)
    expect(pane4).toBe(24)
    expect(pane1).toBeCloseTo(0.6 * 528, 6)
    expect(pane3).toBeCloseTo(0.2 * 528, 6)
    expect(pane5).toBeCloseTo(0.2 * 528, 6)
    // 内容比例 main : volume = 3 : 1
    expect(pane1).toBeCloseTo(3 * pane3, 6)
    expect(pane3).toBeCloseTo(pane5, 6)
  })

  it('高度总和守恒（等于可用高度，完全铺满）', () => {
    for (const total of [400, 500, 570, 600, 777, 999]) {
      const heights = calcPaneHeights(total, 24)
      expect(heights.reduce((sum, height) => sum + height, 0)).toBeCloseTo(total, 6)
    }
  })

  it('时间轴开关：仅可用高度不同，组比例不变（传不同 total）', () => {
    // 模拟容器 600px：时间轴开 H = 600-28-5 = 567；关 H = 600-5 = 595
    const withAxis = calcPaneHeights(567, 24)
    const withoutAxis = calcPaneHeights(595, 24)
    for (const [axis, noAxis] of [
      [withAxis[0], withoutAxis[0]],
      [withAxis[2], withoutAxis[2]],
      [withAxis[4], withoutAxis[4]],
    ]) {
      expect(axis).toBe(noAxis) // 固定空 Pane 恒 24
    }
    // 内容比例均 60:20:20（pane1 : pane3 = 3 : 1，时间轴开关不变）
    const contentRatio = (heights: number[]): number => heights[1] / heights[3]
    expect(contentRatio(withAxis)).toBeCloseTo(3, 6)
    expect(contentRatio(withoutAxis)).toBeCloseTo(3, 6)
  })

  it('可用高度不足时兜底返回 1（避免负高度）', () => {
    const fallback = calcPaneHeights(40, 24)
    expect(fallback).toEqual([1, 1, 1, 1, 1, 1])
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
