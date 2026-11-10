/**
 * indicatorScaleRange.test.ts —— 附图指标 Y 轴值域单测（bug 修复回归）
 *
 * 修复背景：pane5 曾用全量 ±absMax 锚点固定 scale 值域，导致"先缩小再放大，
 * 指标层左刻度值不随可见数据变化"。改为按可见逻辑窗口内的指标极值计算。
 *
 * 覆盖 computeIndicatorScaleRange：
 *  - 窗口内取极值 + 索引越界裁剪（缩放语义：窗口变大 → 值域变大）；
 *  - 0 对称指标（MACD / CCI）对称化：[-absMax, +absMax]，|max| = |min|；
 *  - 非对称指标（RSI 等）按实际值域；
 *  - 多线（含 MACD 柱第三条）合并极值；
 *  - 空 / 全无效值兜底 [0, 0]；NaN 跳过。
 */
import { describe, expect, it } from 'vitest'
import { computeIndicatorScaleRange } from '../src/chart/indicator'
import type { IndicatorLine } from '../src/chart/indicator'

/** 把数值数组构造成一条指标线（time 递增 1，便于按索引取窗口）。 */
const makeLine = (values: number[]): IndicatorLine[] =>
  values.map((value, index) => ({ time: 1_700_000_000 + index, value }))

describe('computeIndicatorScaleRange（可见窗口值域）', () => {
  it('0 对称指标：窗口极值取绝对值最大者对称化', () => {
    // 窗口内 [1.2, -0.8] → absMax = 1.2 → [-1.2, +1.2]
    const lines = [makeLine([0, 1.2, -0.8, 0.5])]
    expect(computeIndicatorScaleRange(lines, 0, 3, true)).toEqual({
      minValue: -1.2,
      maxValue: 1.2,
    })
  })

  it('非对称指标：按窗口实际最小 / 最大值', () => {
    // RSI 类 0~100：窗口 [30, 70] → [30, 70]
    const lines = [makeLine([20, 30, 70, 90])]
    expect(computeIndicatorScaleRange(lines, 1, 2, false)).toEqual({
      minValue: 30,
      maxValue: 70,
    })
  })

  it('缩放语义：窗口越大值域越大（缩小 → 数值范围扩大，放大 → 收窄）', () => {
    const lines = [makeLine([0.2, 0.5, 1.6, -1.4, 0.3, 0.1])]
    const zoomedIn = computeIndicatorScaleRange(lines, 3, 5, true) // 放大后窄窗口 [−1.4, 0.3]
    const zoomedOut = computeIndicatorScaleRange(lines, 0, 5, true) // 缩小后全窗口 [−1.4, 1.6]
    expect(zoomedIn.maxValue).toBe(1.4)
    expect(zoomedOut.maxValue).toBe(1.6)
    // 放大（窗口更小）后值域不应大于缩小后的值域。
    expect(zoomedIn.maxValue).toBeLessThanOrEqual(zoomedOut.maxValue)
  })

  it('索引越界自动裁剪（from < 0 / to > 末点）', () => {
    const lines = [makeLine([1, 2, 3])]
    expect(computeIndicatorScaleRange(lines, -5, 99, false)).toEqual({
      minValue: 1,
      maxValue: 3,
    })
  })

  it('多线合并极值（含 MACD 柱第三条线）', () => {
    // DIF / DEA / 柱三条线：柱的 -2.5 与 DIF 的 1.8 共同决定窗口值域。
    const dif = makeLine([0, 1.8, 0.6])
    const dea = makeLine([0, 1.2, 0.8])
    const hist = makeLine([0, 0.9, -2.5])
    expect(computeIndicatorScaleRange([dif, dea, hist], 0, 2, true)).toEqual({
      minValue: -2.5,
      maxValue: 2.5,
    })
  })

  it('空数据 / 窗口无有效值兜底 [0, 0]', () => {
    expect(computeIndicatorScaleRange([], 0, 10, true)).toEqual({ minValue: 0, maxValue: 0 })
    expect(computeIndicatorScaleRange([makeLine([])], 0, 10, false)).toEqual({
      minValue: 0,
      maxValue: 0,
    })
  })

  it('NaN / Infinity 视为无效值跳过', () => {
    const lines = [makeLine([Number.NaN, 2, Number.POSITIVE_INFINITY, -1])]
    expect(computeIndicatorScaleRange(lines, 0, 3, false)).toEqual({
      minValue: -1,
      maxValue: 2,
    })
  })

  it('全同值窗口：min = max（库侧自行扩展非零值域）', () => {
    const lines = [makeLine([1.5, 1.5, 1.5])]
    expect(computeIndicatorScaleRange(lines, 0, 2, false)).toEqual({
      minValue: 1.5,
      maxValue: 1.5,
    })
  })
})
