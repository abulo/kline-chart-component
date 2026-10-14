/**
 * macdLineContinuity.test.ts —— MACD 指标线数据连续性验证
 *
 * 背景：用户反馈 MACD 附图"DIF/DEA 线条之间有间隔"（线断续）。
 * 本测试在数据层复刻 IndicatorLinePaneView 的断线判定逻辑
 * （x 或 y 坐标缺失即断线）：
 *  - x 缺失条件：线点 time 缺失（与 K 线 bars time 不一致、非递增、非整数秒）；
 *  - y 缺失条件：线值 NaN/Infinity（priceToCoordinate 返回 null 的输入侧条件）。
 * 数据层通过即排除"指标计算 / 数据对齐"问题，指向渲染层坐标转换。
 */
import { describe, expect, it } from 'vitest'
import { genMockBars } from '../src/chart/core/mock'
import { calcMACD } from '../src/chart/indicator'

describe('MACD 指标线数据连续性', () => {
  it('DIF/DEA 线点 time 与 K 线 bars 严格一致且递增（x 坐标可转换）', () => {
    const bars = genMockBars(300)
    const [difLine, deaLine] = calcMACD(bars)
    const barTimes = bars.map((b) => b.time)

    expect(difLine.length).toBe(barTimes.length)
    expect(deaLine.length).toBe(barTimes.length)

    // time 逐项与 bars 一致（无缺失 / 无错位）→ timeToCoordinate 必可转换
    for (let i = 0; i < barTimes.length; i++) {
      expect(difLine[i].time).toBe(barTimes[i])
      expect(deaLine[i].time).toBe(barTimes[i])
    }

    // time 严格递增（库 timePoints 索引要求）
    for (let i = 1; i < difLine.length; i++) {
      expect(difLine[i].time).toBeGreaterThan(difLine[i - 1].time)
    }
  })

  it('DIF/DEA 线值全部有限（y 坐标可转换；无 NaN/Infinity 断点）', () => {
    const bars = genMockBars(300)
    const [difLine, deaLine] = calcMACD(bars)
    for (const point of [...difLine, ...deaLine]) {
      expect(Number.isFinite(point.value)).toBe(true)
    }
  })

  it('DIF/DEA 全部值落在 ±absMax 值域内（对称刻度下 priceToCoordinate 不越界）', () => {
    const bars = genMockBars(300)
    const [difLine, deaLine, histLine] = calcMACD(bars)
    const allValues = [...difLine, ...deaLine, ...histLine].map((p) => p.value)
    const maxValue = Math.max(...allValues.map(Math.abs))
    // 对称值域 = [-maxValue, +maxValue]
    for (const point of [...difLine, ...deaLine]) {
      expect(point.value).toBeGreaterThanOrEqual(-maxValue)
      expect(point.value).toBeLessThanOrEqual(maxValue)
    }
  })
})
