/**
 * mockRealistic.test.ts —— Mock 各周期 K 线"像日 K"真实化形态测试（v1.6.34）
 *
 * 覆盖：各周期 OHLC 自洽、数量量级、日 K 趋势波段（状态机）、分钟 K 与日 K 跨周期自洽。
 */
import { describe, expect, it } from 'vitest'
import { MockChartDataService } from '../src/services/mockChartDataService'

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

  it('A股情绪形态：日 K 池出现一字板 / 连板 / 尾盘板 / 天地板（v1.6.56）', async () => {
    const service = createService()
    const day = await service.fetchHistory({ symbol: '600000.SH', period: 'day', limit: 100000 })
    let upRun = 0
    let downRun = 0
    let hasOneUp = false
    let hasOneDown = false
    let hasFactory = false // 厂字板：O=C=涨停且 L 明显跌破涨停（盘中开板）
    let hasTailUp = false // 尾盘上板：C=涨停且 O 明显低于涨停
    let hasTailDown = false // 尾盘下板：C=跌停且 O 明显高于跌停
    let hasGroundSky = false // 地天板：O=跌停、C=涨停
    let hasSkyGround = false // 天底板：O=涨停、C=跌停
    let hasSkyGroundSky = false // 天地天板：O=C=涨停且 L=跌停
    let hasGroundSkyGround = false // 地天地板：O=C=跌停且 H=涨停
    for (let i = 1; i < day.length; i++) {
      const b = day[i]
      const pre = day[i - 1].close!
      const up = +Math.round(pre * 1.1 * 100) / 100
      const down = +Math.round(pre * 0.9 * 100) / 100
      const oneUp = b.open === up && b.high === up && b.low === up && b.close === up
      const oneDown = b.open === down && b.high === down && b.low === down && b.close === down
      if (oneUp) { upRun++; downRun = 0; hasOneUp = true }
      else if (oneDown) { downRun++; upRun = 0; hasOneDown = true }
      else { upRun = 0; downRun = 0 }
      if (b.open === up && b.close === up && b.low < up * 0.98) hasFactory = true
      if (b.close === up && b.open < up * 0.98) hasTailUp = true
      if (b.close === down && b.open > down * 1.02) hasTailDown = true
      if (b.open === down && b.close === up) hasGroundSky = true
      if (b.open === up && b.close === down) hasSkyGround = true
      if (b.open === up && b.close === up && b.low === down) hasSkyGroundSky = true
      if (b.open === down && b.close === down && b.high === up) hasGroundSkyGround = true
    }
    // 连板：相邻两根均为一字板且第二根价 = 第一根 ×1.10 / ×0.90（涨/跌连板）
    let hasMultiBoard = false
    for (let i = 2; i < day.length; i++) {
      const b = day[i - 1]
      const c = day[i]
      const bOne = b.open === b.high && b.high === b.low && b.low === b.close
      const cOne = c.open === c.high && c.high === c.low && c.low === c.close
      if (bOne && cOne && c.close === +Math.round(b.close! * 1.1 * 100) / 100) hasMultiBoard = true
      if (bOne && cOne && c.close === +Math.round(b.close! * 0.9 * 100) / 100) hasMultiBoard = true
    }
    expect(hasOneUp).toBe(true)
    expect(hasOneDown).toBe(true)
    expect(hasFactory).toBe(true)
    expect(hasTailUp).toBe(true)
    expect(hasTailDown).toBe(true)
    expect(hasGroundSky).toBe(true)
    expect(hasSkyGround).toBe(true)
    expect(hasSkyGroundSky).toBe(true)
    expect(hasGroundSkyGround).toBe(true)
    expect(hasMultiBoard).toBe(true)
  }, 30000)
})
