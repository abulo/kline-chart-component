/**
 * timeshare.test.ts —— 分时周期测试（v1.7.0）
 *
 * 覆盖：
 *  - periods：isTimesharePeriod（1d~5d true，K 线周期 false）、timeshareVerticalCount
 *    （1d=4 / 2d=2 / 3d=3 / 4d=4 / 5d=5，非分时回退 4）；
 *  - 分时情绪形态（v1.7.0）：timesharePatternPath 8 种形态路径特性（一字涨/跌停封死、
 *    半日 120 条、天地天/地天地 含涨跌停、厂字板开板回落、连板涨/跌尾盘封板）；
 *  - MockChartDataService.fetchHistory 分时分支：按交易日分组取最近 N 日
 *    （每日条数随形态变化：半日 120 / 最新日 241 / 久远日 240）；
 *  - 分时点字段齐全：time 严格递增 / tradeDate / preClose / pointType='timeshare' /
 *    price / avgPrice / volume。
 */
import { describe, expect, it } from 'vitest'
import { MockChartDataService, timesharePatternPath } from '../src/services/chartDataService'
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

/** 确定性随机源（固定种子，路径可复现） */
const makeRand = (): (() => number) => {
  let s = 987654321
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

/** 完整交易分钟（241：09:30 开盘点 + 09:31~15:00） */
const fullMinutes = (): number[] => {
  const out: number[] = []
  for (let m = 9 * 60 + 30; m <= 11 * 60 + 30; m++) out.push(m)
  for (let m = 13 * 60 + 1; m <= 15 * 60; m++) out.push(m)
  return out
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
  it('1d：取最新交易日分时点（240/241 或半日 120 条，条数随形态）', async () => {
    const service = createService()
    const points = await service.fetchHistory({ symbol: '600000.SH', period: '1d', limit: 300 })
    expect([120, 240, 241]).toContain(points.length)
    expectStrictAscending(points)
    points.forEach(expectTimesharePoint)
    // 全部同属一个交易日
    expect(new Set(points.map((p) => p.tradeDate)).size).toBe(1)
  })

  it('2d：两个交易日合并（条数 = 两日之和，≥ 240）', async () => {
    const service = createService()
    const points = await service.fetchHistory({ symbol: '600000.SH', period: '2d', limit: 600 })
    expect(points.length).toBeGreaterThanOrEqual(240)
    expectStrictAscending(points)
    points.forEach(expectTimesharePoint)
    const tradeDates = [...new Set(points.map((p) => p.tradeDate))]
    expect(tradeDates.length).toBe(2)
  })

  it('5d：五个交易日合并，time 严格递增', async () => {
    const service = createService()
    const points = await service.fetchHistory({ symbol: '600000.SH', period: '5d', limit: 1500 })
    expect(points.length).toBeGreaterThan(240)
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

describe('分时情绪形态路径（v1.7.0）', () => {
  const preClose = 10
  const up = +Math.round(10 * 1.1 * 100) / 100 // 11.00
  const down = +Math.round(10 * 0.9 * 100) / 100 // 9.00
  const minutes = fullMinutes()

  it('一字板涨停：全天封死涨停价（缩量）', () => {
    const path = timesharePatternPath('limit-up', preClose, minutes, makeRand())
    expect(path.length).toBe(241)
    expect(path[0].price).toBe(up)
    expect(path[240].price).toBe(up)
    // 全部 = 涨停价（价格与昨收对比恒红）
    expect(path.every((p) => p.price === up)).toBe(true)
  })

  it('一字板跌停：全天封死跌停价', () => {
    const path = timesharePatternPath('limit-down', preClose, minutes, makeRand())
    expect(path.every((p) => p.price === down)).toBe(true)
  })

  it('半日数据：09:31~11:30 共 120 条，无 09:30 开盘点', () => {
    const path = timesharePatternPath('half-day', preClose, fullMinutes().slice(1, 121), makeRand())
    expect(path.length).toBe(120)
    expect(path[0].minute).toBe(9 * 60 + 31)
    expect(path[119].minute).toBe(11 * 60 + 30)
    expect(path.every((p) => p.price > 0)).toBe(true)
  })

  it('厂字板：涨停一字开盘 → 盘中开板回落 → 尾盘回封涨停', () => {
    const path = timesharePatternPath('factory-up', preClose, minutes, makeRand())
    // 开盘段封涨停（09:30~09:45 全为涨停价）
    expect(path[0].price).toBe(up)
    expect(path[15].price).toBe(up) // 09:45
    // 开板后存在低于涨停价的价格
    expect(path.some((p) => p.price < up)).toBe(true)
    // 尾盘回封：最后一根 = 涨停价
    expect(path[240].price).toBe(up)
  })

  it('天地天：涨停开盘 → 砸至跌停 → 尾盘拉回涨停', () => {
    const path = timesharePatternPath('sky-ground-sky', preClose, minutes, makeRand())
    expect(path[0].price).toBe(up)
    expect(path[240].price).toBe(up)
    expect(path.some((p) => p.price === down)).toBe(true)
  })

  it('地天地：跌停开盘 → 拉至涨停 → 尾盘砸回跌停', () => {
    const path = timesharePatternPath('ground-sky-ground', preClose, minutes, makeRand())
    expect(path[0].price).toBe(down)
    expect(path[240].price).toBe(down)
    expect(path.some((p) => p.price === up)).toBe(true)
  })

  it('连板涨：高开 +3% → 尾盘封涨停', () => {
    const path = timesharePatternPath('streak-up', preClose, minutes, makeRand())
    const open = +Math.max(10 * 1.03, 0.01).toFixed(2)
    expect(path[0].price).toBe(open)
    expect(path[240].price).toBe(up)
  })

  it('连板跌：高开 +1% → 尾盘封跌停', () => {
    const path = timesharePatternPath('streak-down', preClose, minutes, makeRand())
    const open = +Math.max(10 * 1.01, 0.01).toFixed(2)
    expect(path[0].price).toBe(open)
    expect(path[240].price).toBe(down)
  })
})
