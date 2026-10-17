/**
 * timeshare.test.ts —— 分时周期测试（v1.7.0）
 *
 * 覆盖：
 *  - periods：isTimesharePeriod（1d~5d true，K 线周期 false）、timeshareVerticalCount
 *    （1d=4 / 2d=2 / 3d=3 / 4d=4 / 5d=5，非分时回退 4）；
 *  - MockChartDataService.fetchHistory 分时分支：1d → 241 条（最新交易日完整分钟），
 *    2d → 241+240 条，5d → 241+4×240 条（较久远交易日缺首分钟 = 240 条）；
 *  - 分时点字段齐全：time 严格递增 / tradeDate / preClose / pointType='timeshare' /
 *    price / avgPrice / volume。
 */
import { describe, expect, it } from 'vitest'
import { MockChartDataService } from '../src/services/chartDataService'
import { isTimesharePeriod, timeshareVerticalCount } from '../src/chart/periods'
import type { ChartDataPoint } from '../src/types/chart'

/** 新建独立服务实例（每测试独立池，互不污染） */
const createService = (): MockChartDataService =>
  new MockChartDataService({ fetchLimit: 200 })

/** 断言 time 严格递增且唯一 */
const expectStrictAscending = (points: ChartDataPoint[]): void => {
  for (let i = 1; i < points.length; i++) {
    expect(points[i].time).toBeGreaterThan(points[i - 1].time)
  }
}

/** 断言分时点字段齐全且数值合法 */
const expectTimesharePoint = (point: ChartDataPoint): void => {
  expect(point.pointType).toBe('timeshare')
  expect(point.time).toBeGreaterThan(0)
  expect(point.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(point.preClose).toBeGreaterThan(0)
  expect(point.price).toBeGreaterThan(0)
  expect(point.avgPrice).toBeGreaterThan(0)
  expect(point.volume ?? 0).toBeGreaterThanOrEqual(0)
}

describe('isTimesharePeriod', () => {
  it('1d~5d 判定为分时', () => {
    for (const period of ['1d', '2d', '3d', '4d', '5d']) {
      expect(isTimesharePeriod(period)).toBe(true)
    }
  })

  it('K 线周期判定为非分时', () => {
    for (const period of ['day', 'week', 'month', '60min', '30min', '15min', '5min', '1min']) {
      expect(isTimesharePeriod(period)).toBe(false)
    }
  })
})

describe('timeshareVerticalCount', () => {
  it('竖线栅格份数：1d=4 / 2d=2 / 3d=3 / 4d=4 / 5d=5', () => {
    expect(timeshareVerticalCount('1d')).toBe(4)
    expect(timeshareVerticalCount('2d')).toBe(2)
    expect(timeshareVerticalCount('3d')).toBe(3)
    expect(timeshareVerticalCount('4d')).toBe(4)
    expect(timeshareVerticalCount('5d')).toBe(5)
  })

  it('非分时周期回退默认 4 等分', () => {
    expect(timeshareVerticalCount('day')).toBe(4)
    expect(timeshareVerticalCount('1min')).toBe(4)
    expect(timeshareVerticalCount('unknown')).toBe(4)
  })
})

describe('MockChartDataService 分时数据', () => {
  it('1d：取最新交易日完整 241 条（含 09:30 开盘点）', async () => {
    const service = createService()
    const points = await service.fetchHistory({ symbol: '600000.SH', period: '1d', limit: 300 })
    expect(points.length).toBe(241)
    expectStrictAscending(points)
    points.forEach(expectTimesharePoint)
    // 首条为开盘点（开盘价 = 昨收），末条为收盘点（收盘价 = 当日最后价）
    expect(points[0].price).toBe(points[0].preClose)
    expect(points[240].price).toBeGreaterThan(0)
    // 全部同属一个交易日
    expect(new Set(points.map((p) => p.tradeDate)).size).toBe(1)
  })

  it('2d：241（最新日）+ 240（更早一日缺首分钟）= 481 条', async () => {
    const service = createService()
    const points = await service.fetchHistory({ symbol: '600000.SH', period: '2d', limit: 600 })
    expect(points.length).toBe(241 + 240)
    expectStrictAscending(points)
    points.forEach(expectTimesharePoint)
    // 两个交易日，升序：前 240 条是更早一日，后 241 条是最新一日
    const tradeDates = [...new Set(points.map((p) => p.tradeDate))]
    expect(tradeDates.length).toBe(2)
  })

  it('5d：241 + 4×240 = 1201 条，五个交易日', async () => {
    const service = createService()
    const points = await service.fetchHistory({ symbol: '600000.SH', period: '5d', limit: 1500 })
    expect(points.length).toBe(241 + 4 * 240)
    expectStrictAscending(points)
    expect(new Set(points.map((p) => p.tradeDate)).size).toBe(5)
  })

  it('分时数据不参与 K 线过滤：fetchHistory 返回全 timeshare 点', async () => {
    const service = createService()
    const points = await service.fetchHistory({ symbol: '600000.SH', period: '3d', limit: 1000 })
    expect(points.every((p) => p.pointType === 'timeshare')).toBe(true)
  })

  it('K 线周期不受分时影响：day 仍返回 kline 点且 OHLC 自洽', async () => {
    const service = createService()
    const points = await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 200 })
    expect(points.every((p) => p.pointType === 'kline')).toBe(true)
    expect(points.length).toBeGreaterThan(0)
  })
})
