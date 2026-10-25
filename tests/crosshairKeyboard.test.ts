/**
 * crosshairKeyboard.test.ts —— 键盘十字星移动目标索引（v1.7.1）
 *
 * 覆盖 viewport.computeCrosshairTargetIndex 纯函数：
 *  - 未激活（overlayTime null）：从最后 bar 起算（左键 → last-1，右键 → last clamp）；
 *  - 激活（overlayTime 命中）：以命中 bar 为基准 ±1；
 *  - clamp：左到 0 / 右到 lastIndex 停止，不越界；
 *  - 空数据：返回 null（调用方跳过）；
 *  - overlayTime 无对应 bar（数据已变 / 时间偏移）：回退最后 bar 起算。
 */
import { describe, expect, it } from 'vitest'
import { computeCrosshairTargetIndex } from '../src/chart/core/viewport'
import type { ChartDataPoint } from '../src/types/chart'

/** 构造最小 K 线点（time 秒级整数；仅用 time 字段即可测索引计算） */
const makeBar = (time: number): ChartDataPoint =>
  ({
    time,
    tradeDate: '2026-01-01',
    preClose: 10,
    pointType: 'kline',
    open: 10,
    high: 10.5,
    low: 9.5,
    close: 10.2,
    volume: 1000,
    amount: 10000,
  }) as ChartDataPoint

/** 400 根 bar（time = 1..400） */
const bars: ChartDataPoint[] = Array.from({ length: 400 }, (_, i) => makeBar(i + 1))

describe('computeCrosshairTargetIndex（键盘十字星移动目标）', () => {
  it('空数据返回 null', () => {
    expect(computeCrosshairTargetIndex([], null, -1)).toBeNull()
    expect(computeCrosshairTargetIndex([], null, 1)).toBeNull()
  })

  it('未激活（overlayTime null）从最后 bar 起算：左键 → last-1', () => {
    // 400 根 → lastIndex = 399
    expect(computeCrosshairTargetIndex(bars, null, -1)).toBe(398)
  })

  it('未激活从最后 bar 起算：右键 → clamp 到最后 bar（不越界）', () => {
    expect(computeCrosshairTargetIndex(bars, null, 1)).toBe(399)
  })

  it('激活（命中 bar time=100，索引 99）：左键 → 98', () => {
    expect(computeCrosshairTargetIndex(bars, 100, -1)).toBe(98)
  })

  it('激活（命中 bar time=100，索引 99）：右键 → 100', () => {
    expect(computeCrosshairTargetIndex(bars, 100, 1)).toBe(100)
  })

  it('首根 bar 上按左键 → clamp 到 0（不越界）', () => {
    expect(computeCrosshairTargetIndex(bars, 1, -1)).toBe(0)
    expect(computeCrosshairTargetIndex(bars, 1, -1)).toBeGreaterThanOrEqual(0)
  })

  it('最后 bar 上按右键 → clamp 到最后 bar（不越界）', () => {
    expect(computeCrosshairTargetIndex(bars, 400, 1)).toBe(399)
  })

  it('overlayTime 无对应 bar（数据已变）→ 回退最后 bar 起算', () => {
    // 999 不在 bars 中 → base 回退 lastIndex=399
    expect(computeCrosshairTargetIndex(bars, 999, -1)).toBe(398)
  })

  it('单根 bar：任意方向都 clamp 到 0', () => {
    const single = [makeBar(1)]
    expect(computeCrosshairTargetIndex(single, null, -1)).toBe(0)
    expect(computeCrosshairTargetIndex(single, 1, 1)).toBe(0)
  })
})
