/**
 * barColor.test.ts —— K 线 / 成交量柱三态色单测（v1.6.57）
 *
 * 覆盖：close vs preClose 三态（涨红 / 跌绿 / 平盘中色）、昨收缺失兜底。
 */
import { describe, expect, it } from 'vitest'
import { resolveBarColors, resolveTimeshareVolumeColor } from '../src/chart/core/resolveBarColors'
import type { ChartDataPoint } from '../src/types/chart'

const palette = { background: '#131722', upColor: '#FF0000', downColor: '#008000', flatColor: '#FFFFFF' }

const makeBar = (o: number, h: number, l: number, c: number, preClose?: number): ChartDataPoint => ({
  time: 1700000000,
  tradeDate: '2026-01-01',
  preClose,
  pointType: 'kline',
  open: o,
  high: h,
  low: l,
  close: c,
  volume: 1000,
})

describe('柱体三态色（对比昨收，v1.6.57）', () => {
  it('close > preClose：上涨——空心红柱（填充背景 + 边框影线红）', () => {
    // 一字涨停：open===close===涨停价 > 昨收 → 必须为红（旧逻辑 close>=open 也红，一致）
    const colors = resolveBarColors(makeBar(11, 11, 11, 11, 10), palette)
    expect(colors.color).toBe('#131722')
    expect(colors.borderColor).toBe('#FF0000')
    expect(colors.wickColor).toBe('#FF0000')
  })

  it('close < preClose：下跌——绿色实心', () => {
    // 一字跌停：open===close===跌停价 < 昨收 → 必须为绿（旧逻辑 close>=open 误判为红，本次修复核心）
    const colors = resolveBarColors(makeBar(9, 9, 9, 9, 10), palette)
    expect(colors.color).toBe('#008000')
    expect(colors.borderColor).toBe('#008000')
    expect(colors.wickColor).toBe('#008000')
  })

  it('close === preClose：平盘——中性色（深系白）', () => {
    const colors = resolveBarColors(makeBar(10, 10.2, 9.8, 10, 10), palette)
    expect(colors.color).toBe('#FFFFFF')
    expect(colors.borderColor).toBe('#FFFFFF')
    expect(colors.wickColor).toBe('#FFFFFF')
  })

  it('高开低走但收于昨收上方：按昨收判红（而非 close>=open）', () => {
    // open 10.5 > close 10.2，但 close > preClose 10 → 红（旧库逻辑 close<open 会画绿）
    const colors = resolveBarColors(makeBar(10.5, 10.6, 10.1, 10.2, 10), palette)
    expect(colors.color).toBe('#131722')
    expect(colors.borderColor).toBe('#FF0000')
  })

  it('低开走高但收于昨收下方：按昨收判绿', () => {
    // open 9.5 < close 9.8，但 close < preClose 10 → 绿（旧库逻辑 close>open 会画红）
    const colors = resolveBarColors(makeBar(9.5, 9.9, 9.4, 9.8, 10), palette)
    expect(colors.color).toBe('#008000')
    expect(colors.borderColor).toBe('#008000')
  })

  it('昨收缺失：以开盘价为基准兜底（close === open → 平盘）', () => {
    const colors = resolveBarColors(makeBar(10, 10, 10, 10), palette)
    expect(colors.color).toBe('#FFFFFF')
  })
})

/* ===================== 分时分钟成交量柱（v1.7.0） ===================== */

const makeTs = (price: number, preClose?: number, tradeDate = '2026-01-01'): ChartDataPoint => ({
  time: 1700000000,
  tradeDate,
  preClose,
  pointType: 'timeshare',
  price,
  avgPrice: price,
  volume: 1000,
})

describe('分时成交量柱颜色（resolveTimeshareVolumeColor，v1.7.0）', () => {
  it('交易日首根：对比昨收 preClose——高于昨收红', () => {
    const color = resolveTimeshareVolumeColor(makeTs(10.5, 10), undefined, palette)
    expect(color).toBe('#FF0000')
  })

  it('交易日首根：低于昨收绿 / 等于昨收平盘色', () => {
    expect(resolveTimeshareVolumeColor(makeTs(9.5, 10), undefined, palette)).toBe('#008000')
    expect(resolveTimeshareVolumeColor(makeTs(10, 10), undefined, palette)).toBe('#FFFFFF')
  })

  it('跨日首根（前一分钟为上一交易日）：仍对比该日昨收', () => {
    const prevDay = makeTs(11, 10, '2026-01-02')
    const nextDayFirst = makeTs(10.2, 10, '2026-01-03')
    expect(resolveTimeshareVolumeColor(nextDayFirst, prevDay, palette)).toBe('#FF0000')
  })

  it('非首根：对比上一分钟价格——高于上一分钟红', () => {
    expect(resolveTimeshareVolumeColor(makeTs(10.5, 10), makeTs(10.3, 10), palette)).toBe('#FF0000')
  })

  it('非首根：低于上一分钟绿 / 相等平盘色', () => {
    expect(resolveTimeshareVolumeColor(makeTs(10.1, 10), makeTs(10.3, 10), palette)).toBe('#008000')
    expect(resolveTimeshareVolumeColor(makeTs(10.3, 10), makeTs(10.3, 10), palette)).toBe('#FFFFFF')
  })

  it('同日内价格回落但高于昨收：按上一分钟对比判色（不回昨收基准）', () => {
    // 昨日收 10，今日 10.2 → 10.1：10.1 < 10.2 → 绿（与昨收无关）
    const color = resolveTimeshareVolumeColor(makeTs(10.1, 10), makeTs(10.2, 10), palette)
    expect(color).toBe('#008000')
  })
})
