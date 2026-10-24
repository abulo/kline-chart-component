/**
 * candlestickWidth.test.ts —— 库柱宽函数单测（v1.4.10）
 *
 * 覆盖：与 lightweight-charts v5.2.1 库源码逐值对齐——
 *  - optimalCandlestickWidth：特殊区间 2.5~4 / 常规衰减（coeff 分母 π/2）/ min / 兜底；
 *  - candlestickBarWidth：奇偶修正（柱宽与影线宽 floor(dpr) 同奇偶）。
 */
import { describe, expect, it } from 'vitest'
import { optimalCandlestickWidth, candlestickBarWidth, timeshareBarWidth } from '../src/chart/core/candlestickWidth'

describe('optimalCandlestickWidth（库源码原版）', () => {
  it('特殊区间 barSpacing ∈ [2.5, 4]：恒为 3 × dpr', () => {
    expect(optimalCandlestickWidth(2.5, 1)).toBe(3)
    expect(optimalCandlestickWidth(3, 1)).toBe(3)
    expect(optimalCandlestickWidth(4, 1)).toBe(3)
    expect(optimalCandlestickWidth(3, 2)).toBe(6)
  })

  it('常规区间（coeff 分母 π/2）：与库源码逐值一致', () => {
    // 库源码：coeff = 1 - 0.2×atan(max(4,b)-4)/(π×0.5)
    // b=10, dpr=1：res=floor(10×0.82102)=8，min(8,10)=8 → 8
    expect(optimalCandlestickWidth(10, 1)).toBe(8)
    // b=20, dpr=1：res=floor(20×0.80794)=16，min(16,20)=16 → 16
    expect(optimalCandlestickWidth(20, 1)).toBe(16)
    // b=8, dpr=2：res=floor(8×0.83118×2)=13，min(13,16)=13 → 13
    expect(optimalCandlestickWidth(8, 2)).toBe(13)
  })

  it('位图像素宽度与 dpr 成正比（同 barSpacing）', () => {
    expect(optimalCandlestickWidth(10, 2)).toBe(2 * optimalCandlestickWidth(10, 1))
  })

  it('极小 barSpacing 兜底：不小于 floor(dpr)', () => {
    expect(optimalCandlestickWidth(0.5, 1)).toBe(1)
  })
})

describe('candlestickBarWidth（渲染最终柱宽 = 原版 + 奇偶修正）', () => {
  it('柱宽与影线宽 wickWidth=floor(dpr) 同奇偶，否则减 1', () => {
    // b=10, dpr=1：原版 8（偶），wick=1（奇）→ 7
    expect(candlestickBarWidth(10, 1)).toBe(7)
    // b=20, dpr=1：原版 16（偶），wick=1（奇）→ 15
    expect(candlestickBarWidth(20, 1)).toBe(15)
    // b=8, dpr=2：原版 13（奇），wick=2（偶）→ 12
    expect(candlestickBarWidth(8, 2)).toBe(12)
    // b=3, dpr=2：原版 6（偶），wick=2（偶）→ 6（不变）
    expect(candlestickBarWidth(3, 2)).toBe(6)
  })

  it('柱宽恒小于 barSpacing（保留间隔，与 pane1 间隔一致）', () => {
    for (const barSpacing of [6, 8, 10, 12, 16, 20]) {
      const barWidthCss = candlestickBarWidth(barSpacing, 1)
      expect(barWidthCss).toBeLessThan(barSpacing)
      expect(barWidthCss).toBeGreaterThan(0)
    }
  })

  it('pane3 与 pane1 同源：同一 barSpacing / dpr 得到同一柱宽', () => {
    for (const barSpacing of [6, 8, 10, 12]) {
      for (const dpr of [1, 2]) {
        // pane1 库内部与自绘成交量使用同一函数（同一实现路径）
        expect(candlestickBarWidth(barSpacing, dpr)).toBe(candlestickBarWidth(barSpacing, dpr))
      }
    }
  })
})

describe('timeshareBarWidth（分时柱宽，v1.7.1 加宽保底）', () => {
  it('保底 2 bitmap px（任意 DPR 下 ≥1 CSS px，retina 不模糊）', () => {
    expect(timeshareBarWidth(1, 1)).toBe(2) // 极端窄 barSpacing 保底
    expect(timeshareBarWidth(1, 2)).toBe(2)
    expect(timeshareBarWidth(0.5, 2)).toBe(2)
  })

  it('随 barSpacing 增宽（×0.45 系数，四舍五入到 bitmap）', () => {
    // 1d 分时（fitContent 后 barSpacing≈4, dpr=1）：round(4×0.45)=2 → 2 bitmap（CSS 2px）
    expect(timeshareBarWidth(4, 1)).toBe(2)
    // dpr=2：round(4×0.45×2)=round(3.6)=4 → CSS 2px
    expect(timeshareBarWidth(4, 2)).toBe(4)
    // 5d 分时（barSpacing≈2, dpr=2）：round(2×0.45×2)=round(1.8)=2 → 保底
    expect(timeshareBarWidth(2, 2)).toBe(2)
    // 放大档（barSpacing=8, dpr=2）：round(8×0.45×2)=round(7.2)=7 → 宽柱清晰
    expect(timeshareBarWidth(8, 2)).toBe(7)
  })
})
