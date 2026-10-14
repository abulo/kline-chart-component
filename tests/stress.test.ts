/**
 * stress.test.ts —— 数据极限压力测试（v1.4.93）
 *
 * 场景：10000 条日 K（genMockBars）下：
 *  1. 数据完整性：time 严格递增唯一 / tradeDate 格式 / OHLC 值域自洽；
 *  2. 全指标计算正确性：主图 5（MA×5 / EXPMA×2 / BOLL×3 / SAR / BBI）
 *     成交量 2（VOL MA5 / MA10）+ 附图 10（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR）
 *     全部线 value 有限（无 NaN / Infinity）、time 严格递增、长度 0 < n ≤ 数据数；
 *  3. 性能：10000 条 × 全部指标一次性计算耗时上限（宽松 3000ms，实为 O(n) 线性）；
 *  4. 缓存语义：每条线 time 唯一（构造 O(1) 查询 Map 的前提，无重复 / 无乱序）。
 *
 * 说明：纯数据 / 指标层压测（无 DOM，不运行图表）；渲染层性能需浏览器实测，
 * 但指标计算为渲染主路径的纯函数前置，其正确性与复杂度即渲染性能上限。
 */
import { describe, expect, it } from 'vitest'
import { genMockBars } from '../src/chart/core/mock'
import {
  calcMA,
  calcEXPMA,
  calcBOLL,
  calcSAR,
  calcBBI,
  calcVolMA,
  calcRSI,
  calcKDJ,
  calcMACD,
  calcWR,
  calcDMI,
  calcBIAS,
  calcOBV,
  calcCCI,
  calcROC,
  calcCR,
} from '../src/chart/indicator'
import type { IndicatorLine, K, SarPoint } from '../src/chart/indicator/types'

/** 压测数据量（极限：120 默认值的 83 倍） */
const BAR_COUNT = 10000

/** 断言指标线：value 有限 / time 严格递增 / 长度 0 < n ≤ BAR_COUNT */
const expectLineFinite = (lines: IndicatorLine[], label: string): void => {
  expect(lines.length, `${label} 长度`).toBeGreaterThan(0)
  expect(lines.length, `${label} 长度上限`).toBeLessThanOrEqual(BAR_COUNT)
  let prevTime = -Infinity
  for (const point of lines) {
    expect(Number.isFinite(point.value), `${label} value 有限`).toBe(true)
    expect(point.time, `${label} time 严格递增`).toBeGreaterThan(prevTime)
    prevTime = point.time
  }
}

describe(`数据极限压力测试（${BAR_COUNT} 条）`, () => {
  /** 10000 条 K 线（一次生成，全组复用；指标计算不修改入参） */
  const bars = genMockBars(BAR_COUNT)
  /** 指标库入参：K 线点结构兼容 K（time/open/high/low/close/volume），直接复用 */
  const k = bars as K[]

  it('数据完整性：长度 / time 严格递增唯一 / tradeDate 格式 / OHLC 值域自洽', () => {
    expect(bars).toHaveLength(BAR_COUNT)
    let prevTime = -Infinity
    const timeSet = new Set<number>()
    for (const bar of bars) {
      // time 严格递增（全局唯一）——库断言基础
      expect(bar.time, 'time 严格递增').toBeGreaterThan(prevTime)
      expect(timeSet.has(bar.time), 'time 不重复').toBe(false)
      timeSet.add(bar.time)
      prevTime = bar.time
      // tradeDate 格式 YYYY-MM-DD（pane0 信息行展示）
      expect(bar.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // OHLC 值域自洽：high ≥ max(open, close) 且 low ≤ min(open, close)，close ≥ 1
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close!))
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close!))
      expect(bar.close!).toBeGreaterThanOrEqual(1)
      // 成交量为正（成交量 Pane 锚点 / 均量线输入）
      expect(bar.volume!).toBeGreaterThan(0)
    }
  })

  it('主图指标：MA×5 / EXPMA×2 / BOLL×3 / SAR / BBI 全量计算无 NaN', () => {
    // MA5/10/20/30/60 五条窗口线
    ;[5, 10, 20, 30, 60].forEach((period, index) => {
      expectLineFinite(calcMA(k, period), `MA${period}`)
    })
    // EXPMA12/50
    expectLineFinite(calcEXPMA(k, 12), 'EXPMA12')
    expectLineFinite(calcEXPMA(k, 50), 'EXPMA50')
    // BOLL 上 / 中 / 下三轨（20 周期 2 倍标准差）
    const [up, mid, down] = calcBOLL(k)
    expectLineFinite(up, 'BOLL 上轨')
    expectLineFinite(mid, 'BOLL 中轨')
    expectLineFinite(down, 'BOLL 下轨')
    // SAR 抛物点（多头红 / 空头绿，SarPoint 需 value 有限 + trend 合法）
    const sar = calcSAR(k)
    expect(sar.length).toBeGreaterThan(0)
    let prevSarTime = -Infinity
    for (const point of sar) {
      expect(Number.isFinite(point.value), 'SAR value 有限').toBe(true)
      expect(point.trend === 1 || point.trend === -1, 'SAR trend 合法').toBe(true)
      expect(point.time, 'SAR time 严格递增').toBeGreaterThan(prevSarTime)
      prevSarTime = point.time
    }
    // BBI 单线
    expectLineFinite(calcBBI(k), 'BBI')
  })

  it('成交量均量线：VOL MA5 / MA10 全量计算无 NaN', () => {
    expectLineFinite(calcVolMA(k, 5), 'VOL MA5')
    expectLineFinite(calcVolMA(k, 10), 'VOL MA10')
  })

  it('附图指标十种：RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR 全量计算无 NaN', () => {
    // 每个指标返回多线数组：逐条断言 value 有限 / time 递增 / 长度合法
    const multiLineSets: { lines: IndicatorLine[][]; label: string }[] = [
      { lines: calcRSI(k), label: 'RSI' },
      { lines: calcKDJ(k), label: 'KDJ' },
      { lines: calcMACD(k), label: 'MACD' },
      { lines: calcWR(k), label: 'WR' },
      { lines: calcDMI(k), label: 'DMI' },
      { lines: calcBIAS(k), label: 'BIAS' },
      { lines: calcOBV(k), label: 'OBV' },
      { lines: calcCCI(k), label: 'CCI' },
      { lines: calcROC(k), label: 'ROC' },
      { lines: calcCR(k), label: 'CR' },
    ]
    for (const { lines, label } of multiLineSets) {
      expect(lines.length, `${label} 线数`).toBeGreaterThan(0)
      lines.forEach((line, lineIndex) => expectLineFinite(line, `${label}#${lineIndex + 1}`))
    }
  })

  it('缓存语义：每条线 time 唯一（O(1) 查询 Map 前提，无重复 / 无乱序）', () => {
    // 以 MACD 三条线（最常用的信息行缓存来源）验证：
    // 每线可构造 time→value Map 且容量 = 线长度（time 唯一 → 无覆盖）
    const macdLines = calcMACD(k)
    for (const line of macdLines) {
      const map = new Map<number, number>(line.map((p) => [p.time, p.value]))
      expect(map.size).toBe(line.length)
    }
  })

  it('性能：10000 条 × 全部指标一次性计算耗时 < 3000ms（O(n) 线性）', () => {
    const start = performance.now()
    // 主图（含 SAR / BBI / BOLL）
    ;[5, 10, 20, 30, 60].forEach((period) => calcMA(k, period))
    calcEXPMA(k, 12)
    calcEXPMA(k, 50)
    calcBOLL(k)
    calcSAR(k)
    calcBBI(k)
    // 成交量均量
    calcVolMA(k, 5)
    calcVolMA(k, 10)
    // 附图十种
    calcRSI(k)
    calcKDJ(k)
    calcMACD(k)
    calcWR(k)
    calcDMI(k)
    calcBIAS(k)
    calcOBV(k)
    calcCCI(k)
    calcROC(k)
    calcCR(k)
    const elapsedMs = performance.now() - start
    expect(elapsedMs, `全指标计算耗时 ${elapsedMs.toFixed(1)}ms`).toBeLessThan(3000)
  })
})
