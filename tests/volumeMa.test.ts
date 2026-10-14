/**
 * volumeMa.test.ts —— 成交量均量线 VOL MA（v1.4.64）
 * 覆盖 src/chart/indicator/volumeMa.ts 的 calcVolMA：
 *  - 滑动窗口累加（与价格 MA 同构）；
 *  - 前 N-1 根不输出；
 *  - time 与输入 bar 时间一一对应。
 */
import { describe, it, expect } from 'vitest'
import { calcVolMA } from '../src/chart/indicator/volumeMa'
import type { K } from '../src/chart/indicator/types'

/** 构造升序 K 线数组（只依赖 time / volume 字段） */
const buildBars = (volumes: number[]): K[] =>
  volumes.map((volume, index) => ({
    time: 1700000000 + index,
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume,
  }))

describe('calcVolMA 成交量均量线（indicator/volumeMa.ts）', () => {
  it('MA5：前 4 根不输出，第 5 根起为窗口均值', () => {
    const bars = buildBars([10, 20, 30, 40, 50, 60])
    const out = calcVolMA(bars, 5)
    // 第 5 根：(10+20+30+40+50)/5 = 30；第 6 根：(20+30+40+50+60)/5 = 40
    expect(out.length).toBe(2)
    expect(out[0]).toEqual({ time: bars[4].time, value: 30 })
    expect(out[1]).toEqual({ time: bars[5].time, value: 40 })
  })

  it('MA10：不足 10 根时无输出', () => {
    const bars = buildBars([1, 2, 3, 4, 5])
    expect(calcVolMA(bars, 10)).toEqual([])
  })

  it('MA3：滑动窗口逐根推进', () => {
    const bars = buildBars([1, 2, 3, 4, 5])
    const out = calcVolMA(bars, 3)
    // (1+2+3)/3=2、(2+3+4)/3=3、(3+4+5)/3=4
    expect(out.map((point) => point.value)).toEqual([2, 3, 4])
    expect(out.map((point) => point.time)).toEqual(bars.slice(2).map((bar) => bar.time))
  })
})
