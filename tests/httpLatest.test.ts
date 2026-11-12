/**
 * httpLatest.test.ts —— HttpChartDataService 的 latest 参数与实时更新测试
 *
 * 覆盖：
 *  - 历史：首次请求不携带 latest；拉取后自动推导并在下次请求携带；显式传入覆盖；
 *    更早分页（before）与 latest 共存；不同 symbol / period 隔离；
 *  - 实时 poll：轮询请求携带已持有 latest；轮询返回新点后 latest 更新（后续历史请求携带）；
 *  - 实时 ws：推送点到达后 latest 更新（后续历史请求携带）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpChartDataService } from '../src/services/httpChartDataService'

const HISTORY_URL = 'http://localhost/api/kline/history'
const POLL_URL = 'http://localhost/api/kline/latest'
const WS_URL = 'ws://localhost/api/kline/live'

const PAGE = [{ time: 1000 }, { time: 2000 }, { time: 3000 }]

// fetch stub：按调用次序返回不同 data（最后一页复用），同时记录每次请求 URL。
const stubFetch = (pages: Array<Array<{ time: number }>>): string[] => {
  const urls: string[] = []
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input))
      const data = pages[Math.min(call, pages.length - 1)]
      call += 1
      return new Response(JSON.stringify({ code: 200, data }), { status: 200 })
    })
  )
  return urls
}

// 不入缓存：每次 fetchHistory 都真实走网络，便于观察 URL 参数。
const createService = (mode?: 'poll' | 'ws'): HttpChartDataService =>
  new HttpChartDataService({
    fetchLimit: 3,
    historyUrl: HISTORY_URL,
    cache: false,
    ...(mode === 'poll'
      ? { realtimeTransport: 'poll' as const, pollUrl: POLL_URL, pollIntervalMs: 60_000 }
      : {}),
    ...(mode === 'ws' ? { wsUrl: WS_URL } : {}),
  })

// 极简 WebSocket 替身：记录实例并允许手动推送消息。
class MockWebSocket {
  static instance: MockWebSocket | null = null
  url: string
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  constructor(url: string) {
    this.url = url
    MockWebSocket.instance = this
  }
  close(): void {}
  emit(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HttpChartDataService.latest（历史）', () => {
  it('首次请求不携带 latest', async () => {
    const urls = stubFetch([PAGE])
    const service = createService()
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    expect(urls[0]).not.toContain('latest=')
  })

  it('自动推导：第二次请求携带已持有的最后一根时间', async () => {
    const urls = stubFetch([PAGE])
    const service = createService()
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    expect(urls[1]).toContain('latest=3000')
  })

  it('显式传入 latest 覆盖自动值', async () => {
    const urls = stubFetch([PAGE])
    const service = createService()
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', latest: 1500, limit: 3 })
    expect(urls[1]).toContain('latest=1500')
  })

  it('更早分页同时携带 before 与 latest', async () => {
    const urls = stubFetch([PAGE])
    const service = createService()
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', before: 1000, limit: 3 })
    expect(urls[1]).toContain('before=1000')
    expect(urls[1]).toContain('latest=3000')
  })

  it('不同 symbol / period 互不影响', async () => {
    const urls = stubFetch([PAGE])
    const service = createService()
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    await service.fetchHistory({ symbol: '600000.SZ', period: 'day', limit: 3 })
    expect(urls[1]).not.toContain('latest=')
  })

  it('resetLatest：清空指定 key 的游标后，history 重新全量（不携带 latest）', async () => {
    const urls = stubFetch([PAGE, [{ time: 9000 }]])
    const service = createService()
    await service.fetchHistory({ symbol: '600000', period: 'day', limit: 3 })
    await service.fetchHistory({ symbol: '600000', period: 'day', limit: 3 })
    expect(urls[1]).toContain('latest=3000')
    // 模拟周期 / 标的切换：图表已清空 → 丢弃游标，下一次 history 必须全量。
    service.resetLatest('600000', 'day')
    await service.fetchHistory({ symbol: '600000', period: 'day', limit: 3 })
    expect(urls[2]).not.toContain('latest=')
    // 全量拉回后重新记录最后一根时间，后续请求恢复携带。
    await service.fetchHistory({ symbol: '600000', period: 'day', limit: 3 })
    expect(urls[3]).toContain('latest=9000')
  })

  it('resetLatest：只清指定 key，其它 symbol / period 的游标保留', async () => {
    const urls = stubFetch([PAGE])
    const service = createService()
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    await service.fetchHistory({ symbol: '600000.SZ', period: 'week', limit: 3 })
    service.resetLatest('600000.SH', 'day')
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    expect(urls[2]).not.toContain('latest=')
    await service.fetchHistory({ symbol: '600000.SZ', period: 'week', limit: 3 })
    expect(urls[3]).toContain('latest=3000')
  })
})

describe('HttpChartDataService.latest（实时）', () => {
  it('poll 请求携带已持有 latest；拉回新点后 latest 更新并进入后续历史请求', async () => {
    // 第 1 次（历史首拉）→ 3000；第 2 次（轮询）→ 增量 4000。
    const urls = stubFetch([PAGE, [{ time: 3000 }, { time: 4000 }]])
    const service = createService('poll')
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })

    const received: number[] = []
    const unsubscribe = service.subscribeRealtime('600000.SH', 'day', p => received.push(p.time))
    await vi.waitFor(() => {
      expect(urls.some(u => u.startsWith(POLL_URL))).toBe(true)
      // 轮询 tick 的解析 / 回调在 fetch resolve 之后，一起等到位再断言。
      expect(received.length).toBe(2)
    })
    const pollRequest = urls.find(u => u.startsWith(POLL_URL))!
    expect(pollRequest).toContain('latest=3000')
    expect(received).toEqual([3000, 4000])

    // 轮询更新 latest 后，下一次历史请求携带新值（4000）
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    expect(urls[urls.length - 1]).toContain('latest=4000')
    unsubscribe()
  })

  it('ws 推送点到达后 latest 更新（后续历史请求携带）', async () => {
    const urls = stubFetch([PAGE])
    vi.stubGlobal('WebSocket', MockWebSocket)
    const service = createService('ws')
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })

    const received: number[] = []
    service.subscribeRealtime('600000.SH', 'day', p => received.push(p.time))
    MockWebSocket.instance!.emit({ time: 5000, close: 10, high: 12, low: 9, open: 9.5 })

    expect(received).toEqual([5000])
    await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 3 })
    expect(urls[urls.length - 1]).toContain('latest=5000')
  })
})
