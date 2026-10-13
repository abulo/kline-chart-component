/**
 * theme.test.ts —— 主题色配置单测（v1.2.1）
 */
import { describe, expect, it } from 'vitest'
import { chartThemes, themeColors, defaultTheme } from '../src/chart/core/theme'

describe('主题配置', () => {
  it('深系 / 浅系都存在且默认深系', () => {
    expect(chartThemes.dark).toBeDefined()
    expect(chartThemes.light).toBeDefined()
    expect(defaultTheme).toBe('dark')
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
    const themeColorSet = themeColors('dark')
    expect(themeColorSet.background).toBe('#131722')
    expect(themeColorSet.upColor).toBe('#FF0000')
    expect(themeColorSet.downColor).toBe('#008000')
  })

  it('内容 Pane 边框色：深浅系区分且各自存在', () => {
    const d = themeColors('dark')
    const l = themeColors('light')
    expect(d.paneBorder).toBe('#2A2E39')
    expect(l.paneBorder).toBe('#D4D8DE')
    expect(d.paneBorder).not.toBe(l.paneBorder)
  })

  it('栅格线色：深浅系区分且各自存在', () => {
    const d = themeColors('dark')
    const l = themeColors('light')
    expect(d.grid).toBe('#1E222D')
    expect(l.grid).toBe('#E6E8EC')
    expect(d.grid).not.toBe(l.grid)
  })

  it('十字星指示值标签色：深浅系区分、与图表背景可见区分', () => {
    const d = themeColors('dark')
    const l = themeColors('light')
    // 背景块需与图表背景可区分（深系块 ≠ 背景、浅系块 ≠ 白底）
    expect(d.crosshairLabelBackground).toBe('#2A2E39')
    expect(l.crosshairLabelBackground).toBe('#F0F2F5')
    expect(d.crosshairLabelBackground).not.toBe(d.background)
    expect(l.crosshairLabelBackground).not.toBe(l.background)
    // 文字颜色深浅系各自定义且互不相同
    expect(d.crosshairLabelText).toBe('#D1D4DC')
    expect(l.crosshairLabelText).toBe('#33373E')
    expect(d.crosshairLabelText).not.toBe(l.crosshairLabelText)
  })

  it('最高 / 最低价标注色：深浅系区分且各自存在', () => {
    const d = themeColors('dark')
    const l = themeColors('light')
    // 最高价黄色系（深系亮黄 / 浅系深金黄保证白底可读）
    expect(d.highMarkerColor).toBe('#F4AA0A')
    expect(l.highMarkerColor).toBe('#B8860B')
    // 最低价蓝色系（深系亮蓝 / 浅系深蓝保证白底可读）
    expect(d.lowMarkerColor).toBe('#2962FF')
    expect(l.lowMarkerColor).toBe('#2452CC')
    expect(d.highMarkerColor).not.toBe(l.highMarkerColor)
    expect(d.lowMarkerColor).not.toBe(l.lowMarkerColor)
  })

  it('清理后无 separatorColor / CHART_FONT 残留', () => {
    // v1.2.1 清理验证：单 Pane 无分隔线 + 栅格关闭，这些字段/常量不应存在
    expect('separatorColor' in chartThemes.dark).toBe(false)
  })
})
