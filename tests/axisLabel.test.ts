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
