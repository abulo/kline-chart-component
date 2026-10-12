/**
 * theme.test.ts —— 主题色配置单测（v1.2.1）
 */
import { describe, expect, it } from 'vitest'
import { chartThemes, themeColors, DEFAULT_THEME } from '../src/chart/theme'

describe('主题配置', () => {
  it('深系 / 浅系都存在且默认深系', () => {
    expect(chartThemes.dark).toBeDefined()
    expect(chartThemes.light).toBeDefined()
    expect(DEFAULT_THEME).toBe('dark')
  })

  it('涨跌颜色锁定红涨绿跌（A 股习惯）', () => {
    expect(chartThemes.dark.upColor).toBe('#FF0000')
    expect(chartThemes.dark.downColor).toBe('#008000')
    expect(chartThemes.light.upColor).toBe('#FF0000')
    expect(chartThemes.light.downColor).toBe('#008000')
  })

  it('两套主题背景 / 文字互不相同', () => {
    const d = themeColors('dark')
    const l = themeColors('light')
    expect(d.background).not.toBe(l.background)
    expect(d.textColor).not.toBe(l.textColor)
  })

  it('关键色值口径（深系）', () => {
    const c = themeColors('dark')
    expect(c.background).toBe('#131722')
    expect(c.upColor).toBe('#FF0000')
    expect(c.downColor).toBe('#008000')
  })

  it('清理后无 separatorColor / CHART_FONT 残留', () => {
    // v1.2.1 清理验证：单 Pane 无分隔线 + 栅格关闭，这些字段/常量不应存在
    expect('separatorColor' in chartThemes.dark).toBe(false)
  })
})
