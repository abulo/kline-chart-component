/**
 * paneLayout / viewport 拆分模块单测（v1.7.1）
 *
 * 覆盖：
 *  - paneLayout.calcPaneTop：前序 Pane 高度累加（tooltip 定位）
 *  - viewport.refreshKlineColors：K 线逐根三态配色重设（时间归一化 + 非法条过滤 +
 *    空数据清空）
 */
import { describe, expect, it } from 'vitest'
import { calcPaneTop } from '../src/chart/core/paneLayout'
import { refreshKlineColors } from '../src/chart/core/viewport'
import type { ChartDataPoint } from '../src/types/chart'

describe('paneLayout.calcPaneTop（拆分模块，v1.7.1）', () => {
  it('pane0 顶部 = 0（无前序）', () => {
    expect(calcPaneTop([120, 480, 40, 200, 40], 0)).toBe(0)
  })

  it('pane3 顶部 = pane0..pane2 高度累加', () => {
    // 指标开布局：pane0=40 / pane1=420 / pane2=40 / pane3=140 / pane4=40 / pane5=140
    const heights = [40, 420, 40, 140, 40, 140]
    expect(calcPaneTop(heights, 3)).toBe(40 + 420 + 40) // 500
  })

  it('越界 index 返回全部高度和', () => {
    expect(calcPaneTop([40, 200], 9)).toBe(240)
  })

  it('空高度数组返回 0', () => {
    expect(calcPaneTop([], 1)).toBe(0)
  })

  it('未定义高度按 0 处理', () => {
    expect(calcPaneTop([40, undefined as unknown as number], 2)).toBe(40)
  })
})

describe('viewport.refreshKlineColors（拆分模块，v1.7.1）', () => {
  /** 简易 CandlestickSeries 桩：仅记录最后一次 setData 入参 */
  const createSeriesStub = () => {
    let last: unknown = 'NOT_SET'
    return {
      setData: (points: unknown): void => {
        last = points
      },
      getLastData: () => last,
    } as unknown as Parameters<typeof refreshKlineColors>[1]
  }

  it('逐根三态色：上涨空心(背景填充+红框) / 下跌绿实心 / 平盘中性色', () => {
    const palette = {
      background: '#000000',
      upColor: '#FF0000',
      downColor: '#00AA00',
      flatColor: '#FFFFFF',
    }
    const bars: ChartDataPoint[] = [
      // 上涨（close 11 > preClose 10）：color=背景(空心) + border/wick=upColor
      { time: 1, preClose: 10, pointType: 'kline', open: 10, high: 12, low: 9, close: 11, volume: 100 },
      // 下跌（close 9 < preClose 10）：color=downColor
      { time: 2, preClose: 10, pointType: 'kline', open: 10, high: 10, low: 8, close: 9, volume: 200 },
      // 平盘（close === preClose）：color=flatColor
      { time: 3, preClose: 10, pointType: 'kline', open: 10, high: 10, low: 10, close: 10, volume: 300 },
    ]
    const stub = createSeriesStub()
    refreshKlineColors(bars, stub, palette as never)
    const points = (stub.getLastData() as Array<Record<string, unknown>>)
    expect(points).toHaveLength(3)
    expect(points[0]).toMatchObject({ time: 1, close: 11, color: '#000000', borderColor: '#FF0000', wickColor: '#FF0000' })
    expect(points[1]).toMatchObject({ time: 2, close: 9, color: '#00AA00' })
    expect(points[2]).toMatchObject({ time: 3, close: 10, color: '#FFFFFF' })
  })

  it('非法时间条过滤（null 归一化），剩余条保持顺序', () => {
    const palette = { background: '#000000', upColor: '#FF0000', downColor: '#00AA00', flatColor: '#FFFFFF' }
    const bars: ChartDataPoint[] = [
      { time: Number.NaN, preClose: 10, pointType: 'kline', open: 10, high: 11, low: 9, close: 12, volume: 1 },
      // time=NaN → normalizeChartTime 返回 null → 过滤
      { time: 1, preClose: 10, pointType: 'kline', open: 10, high: 11, low: 9, close: 8, volume: 1 },
    ]
    const stub = createSeriesStub()
    refreshKlineColors(bars, stub, palette as never)
    const points = stub.getLastData() as Array<Record<string, unknown>>
    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({ time: 1, close: 8 })
  })

  it('空数据 → setData([])（清空 series）', () => {
    const stub = createSeriesStub()
    refreshKlineColors([], stub, { background: '#000000', upColor: '#FF0000', downColor: '#00AA00', flatColor: '#FFFFFF' } as never)
    expect(stub.getLastData()).toEqual([])
  })
})
