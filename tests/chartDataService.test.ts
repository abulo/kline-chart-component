/**
 * chartDataService.test.ts —— 数据服务层测试（MockChartDataService）
 *
 * 覆盖：
 *  - fetchHistory：日 K / 周 K / 月 K / 分时（1d）各周期数据形态与约束
 *    （time 升序唯一、OHLC 自洽、条数 = min(limit, 池大小)、before 分页语义）；
 *  - 同 symbol 同周期两次拉取数据一致（seed 稳定）；
 *  - subscribeRealtime：fake timers 推进 → 回调收到增量点；退订后不再回调。
 *
 * 不覆盖 HttpChartDataService（依赖 fetch / WebSocket / EventSource 网络环境）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MockChartDataService } from '../src/services/chartDataService'
import type { ChartDataPoint } from '../src/types/chart'

/** 新建独立服务实例（每测试独立池，互不污染） */
const createService = (): MockChartDataService => new MockChartDataService()

/** 断言 K 线点字段齐全且数值合法 */
const expectKlineBar = (point: ChartDataPoint): void => {
  expect(point.pointType).toBe('kline')
  expect(point.time).toBeGreaterThan(0)
  expect(point.open).toBeGreaterThan(0)
  expect(point.high).toBeGreaterThan(0)
  expect(point.low).toBeGreaterThan(0)
  expect(point.close).toBeGreaterThan(0)
  expect(point.volume ?? 0).toBeGreaterThan(0)
  expect(point.high!).toBeGreaterThanOrEqual(Math.max(point.open!, point.close!))
  expect(point.low!).toBeLessThanOrEqual(Math.min(point.open!, point.close!))
  expect(point.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
}

/** 断言 time 严格递增且唯一 */
const expectStrictAscending = (points: ChartDataPoint[]): void => {
  for (let i = 1; i < points.length; i++) {
    expect(points[i].time).toBeGreaterThan(points[i - 1].time)
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('MockChartDataService.fetchHistory（日 K）', () => {
  it('返回条数 = min(limit, 池大小)，time 升序唯一、OHLC 自洽', async () => {
    const service = createService()
    const points = await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 120 })
    expect(points.length).toBe(120)
    expectStrictAscending(points)
    points.forEach(expectKlineBar)
  })

  it('limit 超过池大小时返回池全部（压测语义：10000 → 800 根）', async () => {
    const service = createService()
    const points = await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 10000 })
    expect(points.length).toBe(800)
    expectStrictAscending(points)
  })

  it('同 symbol 同周期两次拉取数据一致（seed 稳定，缓存复用）', async () => {
    const service = createService()
    const first = await service.fetchHistory({ symbol: '000001.SZ', period: 'day', limit: 100 })
    const second = await service.fetchHistory({ symbol: '000001.SZ', period: 'day', limit: 100 })
    expect(second).toEqual(first)
  })
})

describe('MockChartDataService.fetchHistory（周 / 月 K 聚合）', () => {
  it('周 K：time 单调递增、OHLC 自洽、条数 < 日 K 池', async () => {
    const service = createService()
    const weekly = await service.fetchHistory({ symbol: '600000.SH', period: 'week', limit: 500 })
    const daily = await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 800 })
    expect(weekly.length).toBeLessThan(daily.length)
    expectStrictAscending(weekly)
    weekly.forEach(expectKlineBar)
  })

  it('月 K：time 单调递增、OHLC 自洽', async () => {
    const service = createService()
    const monthly = await service.fetchHistory({ symbol: '600000.SH', period: 'month', limit: 500 })
    expect(monthly.length).toBeGreaterThan(0)
    expectStrictAscending(monthly)
    monthly.forEach(expectKlineBar)
  })
})

describe('MockChartDataService.fetchHistory（分时 / 分页）', () => {
  it('1d 分时：返回 241 个分钟点，timeshare 字段齐全', async () => {
    const service = createService()
    const points = await service.fetchHistory({ symbol: '600000.SH', period: '1d', limit: 300 })
    expect(points.length).toBe(241)
    expectStrictAscending(points)
    points.forEach((point) => {
      expect(point.pointType).toBe('timeshare')
      expect(point.price).toBeGreaterThan(0)
      expect(point.avgPrice).toBeGreaterThan(0)
    })
  })

  it('before 分页：返回 time < before 的最近 limit 根（升序）', async () => {
    const service = createService()
    const latest = await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 200 })
    const before = latest[100].time
    const older = await service.fetchHistory({ symbol: '600000.SH', period: 'day', before, limit: 50 })
    expect(older.length).toBe(50)
    expect(older[older.length - 1].time).toBeLessThan(before)
    expectStrictAscending(older)
  })
})

describe('MockChartDataService.subscribeRealtime', () => {
  it('订阅后按间隔收到增量点（同 time 刷新 / 追加）；退订后不再回调', () => {
    vi.useFakeTimers()
    const service = createService()
    const received: ChartDataPoint[] = []
    const unsubscribe = service.subscribeRealtime('600000.SH', 'day', (point) => {
      received.push(point)
    })

    // 推进 1.5 个实时间隔：应至少收到 1 次回调
    vi.advanceTimersByTime(1300)
    expect(received.length).toBeGreaterThan(0)
    received.forEach((point) => {
      expect(point.pointType).toBe('kline')
      expect(point.time).toBeGreaterThan(0)
    })

    // 退订后继续推进：不再收到回调
    const countAfterUnsubscribe = received.length
    unsubscribe()
    vi.advanceTimersByTime(3000)
    expect(received.length).toBe(countAfterUnsubscribe)
  })

  it('分时周期订阅：回调点 pointType=timeshare', () => {
    vi.useFakeTimers()
    const service = createService()
    const received: ChartDataPoint[] = []
    const unsubscribe = service.subscribeRealtime('600000.SH', '1d', (point) => {
      received.push(point)
    })

    vi.advanceTimersByTime(1300)
    expect(received.length).toBeGreaterThan(0)
    received.forEach((point) => {
      expect(point.pointType).toBe('timeshare')
      expect(point.price).toBeGreaterThan(0)
    })
    unsubscribe()
  })
})
