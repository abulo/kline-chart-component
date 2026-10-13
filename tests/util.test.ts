/**
 * util.test.ts —— 通用格式化工具单测（v1.4.26）
 * 覆盖 src/chart/util/format.ts 的成交量格式化（pane3 左刻度标签专用）。
 */
import { describe, it, expect } from 'vitest'
import { formatVolume } from '../src/chart/util/format'

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
