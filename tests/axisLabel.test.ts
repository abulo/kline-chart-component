/**
 * axisLabel.test.ts —— 分时左右刻度纯函数单测（v1.7.1）
 *
 * 覆盖：
 *  - formatPercent：涨跌幅百分比格式化（+/- 号、2 位小数、平盘 0.00% 无符号、
 *    preClose 非法返回 ''）；
 *  - resolveVsBaseColor：数值 vs 基准三态色（> 红 / < 绿 / = 平盘中色，
 *    深系 flatColor 白 / 浅系黑）。
 *
 * 语义前提（与实现一致）：
 *  - 分时 pane1 左刻度中间值 = 右刻度 0% = 首根 bar 的 preClose（栅格中间横线）；
 *  - 左右刻度同一 y 坐标显示同一价格（左 = 价格、右 = 百分比，值对齐）。
 */
import { describe, expect, it } from 'vitest'
import { formatPercent } from '../src/chart/util/format'
import { symmetricExpandRange, buildTimeshareScaleValues } from '../src/chart/util/timeshareScale'
import { resolveVsBaseColor, type BarPalette } from '../src/chart/core/resolveBarColors'

const darkPalette: BarPalette = {
  upColor: '#FF0000',
  downColor: '#008000',
  flatColor: '#FFFFFF',
  background: '#0E1113',
  borderColor: '#FF0000',
  wickColor: '#FF0000',
}

describe('formatPercent（分时右刻度百分比，v1.7.1）', () => {
  it('上涨带 + 号 2 位小数', () => {
    expect(formatPercent(10.12, 10)).toBe('+1.20%')
  })

  it('下跌带 - 号 2 位小数', () => {
    expect(formatPercent(9.912, 10)).toBe('-0.88%')
  })

  it('平盘显示 0.00% 无符号', () => {
    expect(formatPercent(10, 10)).toBe('0.00%')
    expect(formatPercent(10 + 1e-10, 10)).toBe('0.00%')
  })

  it('preClose 非法（0 / NaN）返回空串', () => {
    expect(formatPercent(10, 0)).toBe('')
    expect(formatPercent(10, Number.NaN)).toBe('')
    expect(formatPercent(Number.NaN, 10)).toBe('')
  })
})

describe('symmetricExpandRange（区间对称扩展，用户定版算法，v1.7.1）', () => {
  it('中间 10 / 最高 12 / 最低 6 → newMax 14 / newMid 10 / newMin 6（用户示例）', () => {
    const range = symmetricExpandRange(12, 10, 6)
    expect(range.expandDistance).toBe(4)
    expect(range.newMax).toBe(14)
    expect(range.newMid).toBe(10)
    expect(range.newMin).toBe(6)
  })

  it('上偏更大：最高 16 / 中间 10 / 最低 9 → 半幅 6 → 16 / 10 / 4', () => {
    const range = symmetricExpandRange(16, 10, 9)
    expect(range.expandDistance).toBe(6)
    expect(range.newMax).toBe(16)
    expect(range.newMin).toBe(4)
    expect(range.newMid).toBe(10)
  })

  it('下偏更大：最高 11 / 中间 10 / 最低 4 → 半幅 6 → 16 / 10 / 4', () => {
    const range = symmetricExpandRange(11, 10, 4)
    expect(range.expandDistance).toBe(6)
    expect(range.newMax).toBe(16)
    expect(range.newMin).toBe(4)
  })

  it('两侧距离相等：最高 14 / 中间 10 / 最低 6 → 半幅 4，无需额外扩展', () => {
    const range = symmetricExpandRange(14, 10, 6)
    expect(range.expandDistance).toBe(4)
    expect(range.newMax).toBe(14)
    expect(range.newMin).toBe(6)
  })
})

describe('buildTimeshareScaleValues（对称区间等分等差序列，v1.7.1）', () => {
  it('mid 10 / half 4 / 指标关 8 等分 → 14..6 等差 1', () => {
    const values = buildTimeshareScaleValues(10, 4, 8)
    expect(values).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6])
  })

  it('mid 10 / half 4 / 指标开 6 等分 → 14..6 等差 4/3（首尾/中间正确）', () => {
    const values = buildTimeshareScaleValues(10, 4, 6)
    expect(values).toHaveLength(7)
    expect(values[0]).toBeCloseTo(14, 10)
    expect(values[3]).toBeCloseTo(10, 10)
    expect(values[6]).toBeCloseTo(6, 10)
    // 等差性：相邻差值恒为 2×half/hCount
    for (let i = 1; i < values.length; i++) {
      expect(values[i - 1] - values[i]).toBeCloseTo((2 * 4) / 6, 10)
    }
  })

  it('中间值恒等于 mid（偶数 / 奇数等分均成立）', () => {
    const v8 = buildTimeshareScaleValues(50, 15, 8)
    expect(v8[4]).toBe(50)
    const v6 = buildTimeshareScaleValues(50, 15, 6)
    expect(v6[3]).toBe(50)
  })
})

describe('resolveVsBaseColor（分时刻度三态着色，v1.7.1）', () => {
  const base = 10

  it('大于基准 → upColor（红）', () => {
    expect(resolveVsBaseColor(10.5, base, darkPalette)).toBe('#FF0000')
  })

  it('小于基准 → downColor（绿）', () => {
    expect(resolveVsBaseColor(9.5, base, darkPalette)).toBe('#008000')
  })

  it('等于基准 → flatColor（平盘中色，深系白）', () => {
    expect(resolveVsBaseColor(10, base, darkPalette)).toBe('#FFFFFF')
  })
})
