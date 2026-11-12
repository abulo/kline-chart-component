/**
 * chartDataBridge.test.ts —— 周期切换时"先 history、后 latest"的调用顺序。
 *
 * @remarks
 * 现象：切换周期时网络里先出现旧周期的 /latest 轮询、后出现新周期 history。
 * 原因：旧实时订阅只在 init 成功后（startRealtime）才退订，防抖 + history 耗时期间
 * 旧 poll 仍在轮询。修复：init 开头与 setPeriod / setSymbol 立即退订。
 * 本文件覆盖 init 的三条顺序 / 生命周期约束。
 */
import { describe, expect, it, vi } from 'vitest'
import { ChartDataBridge } from '../src/chart/core/chartDataBridge'
import type { ChartDataService } from '../src/services/chartDataService'
import type { ChartDataPoint } from '../src/types/chart'

const PAGE: ChartDataPoint[] = [
  { time: 1_760_000_000, pointType: 'kline', open: 10, high: 11, low: 9, close: 10.5 },
]

/** 假服务：按调用记录 history / realtime / unsubscribe 的先后顺序。 */
const makeService = (params: {
  calls: string[]
  /** 为 true 时 fetchHistory 挂起，直到 release() 才返回（观察"未返回前不订阅"）。 */
  deferred?: boolean
  /** 为 true 时 fetchHistory 抛错（观察失败路径不订阅）。 */
  fail?: boolean
}) => {
  let release: (() => void) | null = null
  const gate = params.deferred
    ? new Promise<void>(resolve => {
        release = resolve
      })
    : Promise.resolve()
  const service = {
    fetchLimit: 10,
    fetchHistory: vi.fn(async (): Promise<ChartDataPoint[]> => {
      params.calls.push('history')
      await gate
      if (params.fail) throw new Error('boom')
      return PAGE
    }),
    subscribeRealtime: vi.fn((_symbol: string, period: string) => {
      params.calls.push(`realtime:${period}`)
      return () => params.calls.push(`unsubscribe:${period}`)
    }),
  }
  return {
    service: service as unknown as ChartDataService,
    release: () => release?.(),
  }
}

const createBridge = (service: ChartDataService, periodRef: { value: string }) => {
  const statuses: string[] = []
  const bridge = new ChartDataBridge({
    getSymbol: () => '300750',
    getPeriod: () => periodRef.value as never,
    getService: () => service,
    onStatus: status => statuses.push(status),
    onHistory: () => undefined,
    onPrepend: () => 0,
    onEarliest: () => undefined,
    onRealtimePoint: () => undefined,
  })
  return { bridge, statuses }
}

describe('ChartDataBridge · 周期切换调用顺序', () => {
  it('切换周期：先退订旧实时订阅，再拉新周期 history，最后订阅新周期', async () => {
    const calls: string[] = []
    const { service } = makeService({ calls })
    const periodRef = { value: 'day' }
    const { bridge } = createBridge(service, periodRef)

    await bridge.init()
    calls.push('|switch|')
    periodRef.value = 'week'
    await bridge.init()

    const order = calls.join(' ')
    // 首次：history → realtime:day。
    expect(order.startsWith('history realtime:day')).toBe(true)
    // 切换：先退订旧订阅（不再有 day 的 /latest 轮询），再 history:week，再订阅 week。
    const afterSwitch = order.split('|switch|')[1].trim()
    expect(afterSwitch).toBe('unsubscribe:day history realtime:week')
  })

  it('history 未返回前不建立实时订阅（latest 不会抢跑）', async () => {
    const calls: string[] = []
    const { service, release } = makeService({ calls, deferred: true })
    const periodRef = { value: 'day' }
    const { bridge } = createBridge(service, periodRef)

    const pending = bridge.init()
    // 历史请求在途：尚未订阅实时。
    expect(calls).toEqual(['history'])
    release()
    await pending
    expect(calls).toEqual(['history', 'realtime:day'])
  })

  it('init 失败不建立实时订阅（状态 error）', async () => {
    const calls: string[] = []
    const { service } = makeService({ calls, fail: true })
    const periodRef = { value: 'day' }
    const { bridge, statuses } = createBridge(service, periodRef)

    await bridge.init()
    expect(calls).toEqual(['history'])
    expect(statuses.at(-1)).toBe('error')
  })
})
