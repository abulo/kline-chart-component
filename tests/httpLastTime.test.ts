/**
 * httpLastTime.test.ts —— HttpChartDataService 的 lasttime 查询参数测试
 *
 * 覆盖：
 *  - 首次请求（尚未持有数据）不携带 lasttime；
 *  - 自动推导：请求成功后记录最后一根 time，下次请求自动附加 lasttime；
 *  - 显式传入 query.lastTime 覆盖自动值；
 *  - 更早分页（before）请求同时携带 before 与 lasttime。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpChartDataService } from '../src/services/httpChartDataService'

const HISTORY_URL = 'http://localhost/api/kline/history'

// fetch stub：返回固定 data，同时记录每次请求 URL 供断言。
const stubFetch = (points: Array<{ time: number }>): string[] => {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ code: 200, data: points }), { status: 200 })
    })
  )
  return urls
}

// 不入缓存：每次 fetchHistory 都真实走网络，便于观察 URL 参数。
const createService = (): HttpChartDataService =>
  new HttpChartDataService({ fetchLimit: 3, historyUrl: HISTORY_URL, cache: false })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HttpChartDataService.lasttime', () => {
  it('首次请求不携带 lasttime', async () => {
    const urls = stubFetch([{ time: 1000 }, { time: 2000 }, { time: 3000 }])
    const service = createService()
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    expect(urls[0]).not.toContain('lasttime=')
  })

  it('自动推导：第二次请求携带已持有的最后一根时间', async () => {
    const urls = stubFetch([{ time: 1000 }, { time: 2000 }, { time: 3000 }])
    const service = createService()
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    expect(urls[1]).toContain('lasttime=3000')
  })

  it('显式传入 lastTime 覆盖自动值', async () => {
    const urls = stubFetch([{ time: 1000 }, { time: 2000 }, { time: 3000 }])
    const service = createService()
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', lastTime: 1500, limit: 3 })
    expect(urls[1]).toContain('lasttime=1500')
  })

  it('更早分页同时携带 before 与 lasttime', async () => {
    const urls = stubFetch([{ time: 1000 }, { time: 2000 }, { time: 3000 }])
    const service = createService()
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', before: 1000, limit: 3 })
    expect(urls[1]).toContain('before=1000')
    expect(urls[1]).toContain('lasttime=3000')
  })

  it('不同 symbol / period 互不影响', async () => {
    const urls = stubFetch([{ time: 1000 }, { time: 2000 }, { time: 3000 }])
    const service = createService()
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    await service.fetchHistory({ symbol: '600000.SZ', period: 'day', limit: 3 })
    expect(urls[1]).not.toContain('lasttime=')
  })
})
