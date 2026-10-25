/**
 * priceLine.test.ts —— 最后价线取值纯函数 + primitive 显隐开关单元测试（v1.7.1）
 *
 * 覆盖 findLastKlineBar：
 *  - 空数组 / 全分时点 → undefined（分时模式不绘制价格线）；
 *  - 全 kline 点 → 取最后一个（真实最后 bar close / preClose）；
 *  - 尾部混有分时点 → 逆序跳过取最后一个 kline 点；
 *  - close 缺失 → 视为无效 kline 点跳过。
 * 覆盖 PriceLinePrimitive.setVisible / visible（priceLineVisible 参数控制显隐）：
 *  - 默认可见；setVisible(false) → visible = false（draw 跳过，整条线不渲染）；
 *  - 再次 setVisible(true) 恢复。
 */
import { describe, expect, it } from 'vitest'
import type { ISeriesApi } from 'lightweight-charts'
import type { ChartDataPoint } from '../src/types/chart'
import {
  findLastKlineBar,
  PriceLinePrimitive,
} from '../src/chart/overlay/priceLinePrimitive'

/** mock series（仅 priceToCoordinate 参与价格线绘制，固定坐标即可） */
const mockSeries = {
  priceToCoordinate: () => 100,
} as unknown as ISeriesApi<'Candlestick'>

/** 构造 PriceLinePrimitive（固定取值，便于测显隐开关） */
const makePrimitive = (): PriceLinePrimitive =>
  new PriceLinePrimitive({
    series: mockSeries,
    getLastClose: () => 45.5,
    getColor: () => '#FF0000',
  })

/** 构造 K 线点（close 可注入缺失场景） */
const makeKline = (
  time: number,
  close: number | undefined,
  preClose = 10,
): ChartDataPoint => ({
  time,
  tradeDate: '2026-10-01',
  preClose,
  pointType: 'kline',
  open: preClose,
  high: Math.max(preClose, close ?? preClose),
  low: Math.min(preClose, close ?? preClose),
  close,
  volume: 100,
})

/** 构造分时点 */
const makeTimeshare = (time: number): ChartDataPoint => ({
  time,
  tradeDate: '2026-10-01',
  preClose: 10,
  pointType: 'timeshare',
  price: 10.5,
  avgPrice: 10.4,
  volume: 10,
})

describe('findLastKlineBar（最后价线取数）', () => {
  it('空数组 → undefined（无数据不绘制）', () => {
    expect(findLastKlineBar([])).toBeUndefined()
  })

  it('全部为分时点 → undefined（分时模式不绘制 K 线价格线）', () => {
    const bars = [makeTimeshare(1), makeTimeshare(2), makeTimeshare(3)]
    expect(findLastKlineBar(bars)).toBeUndefined()
  })

  it('全 kline 点 → 取真实最后 bar（close + preClose）', () => {
    const bars = [makeKline(1, 11, 10), makeKline(2, 12, 11), makeKline(3, 13, 12)]
    expect(findLastKlineBar(bars)).toEqual({ close: 13, preClose: 12 })
  })

  it('尾部混有分时点 → 逆序跳过，取最后一个 kline 点', () => {
    const bars = [makeKline(1, 11, 10), makeKline(2, 12, 11), makeTimeshare(3)]
    expect(findLastKlineBar(bars)).toEqual({ close: 12, preClose: 11 })
  })

  it('最后 kline 点 close 缺失 → 视为无效跳过，取更早的有效 kline 点', () => {
    const bars = [makeKline(1, 11, 10), makeKline(2, 12, 11), makeKline(3, undefined, 13)]
    expect(findLastKlineBar(bars)).toEqual({ close: 12, preClose: 11 })
  })
})

describe('PriceLinePrimitive 显隐开关（priceLineVisible 参数控制）', () => {
  it('默认可见', () => {
    expect(makePrimitive().visible).toBe(true)
  })

  it('setVisible(false) → visible = false（draw 首行跳过，整条线不渲染）', () => {
    const p = makePrimitive()
    p.setVisible(false)
    expect(p.visible).toBe(false)
  })

  it('setVisible(false) 后再 setVisible(true) → 恢复可见', () => {
    const p = makePrimitive()
    p.setVisible(false)
    p.setVisible(true)
    expect(p.visible).toBe(true)
  })
})
