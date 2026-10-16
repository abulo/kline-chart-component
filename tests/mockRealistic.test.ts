/**
 * mockRealistic.test.ts —— Mock 各周期 K 线"像日 K"真实化形态测试（v1.6.34）
 *
 * 覆盖：各周期 OHLC 自洽、数量量级、日 K 趋势波段（状态机）、分钟 K 与日 K 跨周期自洽。
 */
import { describe, expect, it } from 'vitest'
import { MockChartDataService } from '../src/services/chartDataService'

const createService = (): MockChartDataService => new MockChartDataService({ fetchLimit: 200 })

describe('Mock 真实化（v1.6.34）', () => {
  it('各周期抽样：OHLC 自洽 + time 升序 + volume>0', async () => {
    const service = createService()
    for (const period of ['day', 'week', 'month', '60min', '30min', '15min', '5min', '1min']) {
      const points = await service.fetchHistory({ symbol: '600000.SH', period, limit: 200 })
      expect(points.length).toBeGreaterThan(0)
      for (let i = 0; i < points.length; i++) {
        const b = points[i]
        if (i > 0) expect(b.time).toBeGreaterThan(points[i - 1].time)
        expect(b.high!).toBeGreaterThanOrEqual(Math.max(b.open!, b.close!))
        expect(b.low!).toBeLessThanOrEqual(Math.min(b.open!, b.close!))
        expect(b.high!).toBeGreaterThan(0)
        expect(b.low!).toBeGreaterThan(0)
        expect(b.volume ?? 0).toBeGreaterThan(0)
      }
    }
  }, 30000)

  it('数量量级：day=800 / week<day / month<week / 60min≈1000 / 1min=250×241', async () => {
    const service = createService()
    const day = await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 100000 })
    const week = await service.fetchHistory({ symbol: '600000.SH', period: 'week', limit: 100000 })
    const month = await service.fetchHistory({ symbol: '600000.SH', period: 'month', limit: 100000 })
    const m60 = await service.fetchHistory({ symbol: '600000.SH', period: '60min', limit: 100000 })
    const m1 = await service.fetchHistory({ symbol: '600000.SH', period: '1min', limit: 100000 })
    expect(day.length).toBe(800)
    expect(week.length).toBeLessThan(day.length)
    expect(month.length).toBeLessThan(week.length)
    expect(m60.length).toBeGreaterThan(900)
    expect(m1.length).toBe(250 * 241)
  }, 30000)

  it('日 K 存在连续同向波段（趋势状态机生效）', async () => {
    const service = createService()
    const day = await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 100000 })
    let upRun = 0
    let downRun = 0
    let hasUp = false
    let hasDown = false
    for (let i = 1; i < day.length; i++) {
      if (day[i].close! > day[i - 1].close!) {
        upRun++
        downRun = 0
        if (upRun >= 3) hasUp = true
      } else {
        downRun++
        upRun = 0
        if (downRun >= 3) hasDown = true
      }
    }
    expect(hasUp).toBe(true)
    expect(hasDown).toBe(true)
  }, 30000)

  it('分钟 K 与日 K 自洽：1min 每日末根 close == 对应日 close', async () => {
    const service = createService()
    const day = await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 100000 })
    const m1 = await service.fetchHistory({ symbol: '600000.SH', period: '1min', limit: 100000 })
    const byDay = new Map<number, typeof m1>()
    for (const p of m1) {
      const d = new Date(p.time * 1000)
      const utc0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000
      if (!byDay.has(utc0)) byDay.set(utc0, [])
      byDay.get(utc0)!.push(p)
    }
    let checked = 0
    for (let i = day.length - 10; i < day.length; i++) {
      const utc0 = Math.floor(day[i].time / 86400) * 86400
      const lastMin = byDay.get(utc0)?.slice(-1)[0]
      if (!lastMin) continue
      expect(Math.abs(lastMin.close! - day[i].close!)).toBeLessThanOrEqual(0.02)
      checked++
    }
    expect(checked).toBeGreaterThan(5)
  }, 30000)
})
