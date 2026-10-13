/**
 * util.test.ts —— 通用格式化工具单测（v1.4.41）
 * 覆盖 src/chart/util/format.ts：
 *  - formatVolume（pane3 左刻度标签专用）；
 *  - formatPrice（pane1 K 线刻度 / 十字星指示值）；
 *  - formatAxisSmart（pane5 指标刻度大数缩写 / 小数自适应）。
 */
import { describe, it, expect } from 'vitest'
import { formatVolume, formatPrice, formatAxisSmart } from '../src/chart/util/format'

describe('formatVolume 成交量格式化（util/format.ts）', () => {
  it('亿级：两位小数 + 亿', () => {
    expect(formatVolume(1.5e8)).toBe('1.50亿')
    expect(formatVolume(3.26e8)).toBe('3.26亿')
  })

  it('万级：两位小数 + 万', () => {
    expect(formatVolume(1e4)).toBe('1.00万')
    expect(formatVolume(123456)).toBe('12.35万')
  })

  it('万以下：取整原样', () => {
    expect(formatVolume(0)).toBe('0')
    expect(formatVolume(999)).toBe('999')
    expect(formatVolume(1234)).toBe('1234')
  })

  it('边界与空值：9999 / 10000 临界；null / NaN 返回 --', () => {
    expect(formatVolume(9999)).toBe('9999')
    expect(formatVolume(10000)).toBe('1.00万')
    expect(formatVolume(null)).toBe('--')
    expect(formatVolume(Number.NaN)).toBe('--')
  })
})

describe('formatPrice 价格格式化（pane1 刻度 / 十字星指示值）', () => {
  it('两位小数默认位', () => {
    expect(formatPrice(10.123)).toBe('10.12')
    expect(formatPrice(9.5)).toBe('9.50')
    expect(formatPrice(0)).toBe('0.00')
  })

  it('自定义小数位', () => {
    expect(formatPrice(1.2346, 3)).toBe('1.235')
    expect(formatPrice(1.2, 0)).toBe('1')
  })

  it('空值 / NaN 返回 --', () => {
    expect(formatPrice(null)).toBe('--')
    expect(formatPrice(undefined)).toBe('--')
    expect(formatPrice(Number.NaN)).toBe('--')
  })
})

describe('formatAxisSmart 指标刻度缩写（pane5 指标刻度）', () => {
  it('亿级：1.23亿', () => {
    expect(formatAxisSmart(123456789)).toBe('1.23亿')
  })

  it('负值带负号：-5亿', () => {
    expect(formatAxisSmart(-500000000)).toBe('-5.00亿')
  })

  it('万级：1.23万', () => {
    expect(formatAxisSmart(12345)).toBe('1.23万')
  })

  it('普通值：两位小数', () => {
    expect(formatAxisSmart(1000)).toBe('1000.00')
    expect(formatAxisSmart(1)).toBe('1.00')
    expect(formatAxisSmart(0)).toBe('0.00')
  })

  it('极小值：自适应小数位（避免全部显示 0.00）', () => {
    // 0.123 → -log10 ≈ 0.9 → ceil(0.9)+1 = 2 → 两位
    expect(formatAxisSmart(0.123)).toBe('0.12')
    // 0.0123 → -log10 ≈ 1.9 → ceil(1.9)+1 = 3 → 三位
    expect(formatAxisSmart(0.0123)).toBe('0.012')
    // 0.00123 → -log10 ≈ 2.9 → ceil(2.9)+1 = 4 → 四位
    expect(formatAxisSmart(0.00123)).toBe('0.0012')
  })

  it('负极小值：保留负号', () => {
    expect(formatAxisSmart(-0.0123)).toBe('-0.012')
  })
})
