/**
 * mergeBars.test.ts —— 历史前置合并纯函数测试（v1.5.2）
 *
 * 覆盖：前置插入 + 新增条数、time 去重（incoming 优先）、升序排序、
 * 重复页 added=0（无更早数据 → 停止触发）、空输入、
 * 全量替换（existing=[]，setKlineData 首载路径）的乱序修复与重复去重。
 */
import { describe, expect, it } from 'vitest'
import { mergeBars } from '../src/chart/core/mergeBars'
import type { ChartDataPoint } from '../src/types/chart'

/** 构造一条 K 线点 */
const bar = (time: number): ChartDataPoint => ({
  time,
  tradeDate: '2026-10-15',
  preClose: 10,
  pointType: 'kline',
  open: 10,
  high: 11,
  low: 9,
  close: 10.5,
  volume: 100,
})

describe('mergeBars（历史前置合并）', () => {
  it('更早页前置插入：added = incoming 条数，结果升序', () => {
    const existing = [bar(300), bar(301), bar(302)]
    const incoming = [bar(298), bar(299)]
    const result = mergeBars(existing, incoming)
    expect(result.added).toBe(2)
    expect(result.bars.map((b) => b.time)).toEqual([298, 299, 300, 301, 302])
  })

  it('time 去重：同 time 以 incoming 为准（分页覆盖语义）', () => {
    const existing = [bar(300), bar(301)]
    const incoming = [{ ...bar(300), close: 99 }, bar(299)]
    const result = mergeBars(existing, incoming)
    expect(result.added).toBe(1) // 299 新增，300 覆盖
    const overwritten = result.bars.find((b) => b.time === 300)
    expect(overwritten?.close).toBe(99)
    expect(result.bars.map((b) => b.time)).toEqual([299, 300, 301])
  })

  it('重复页（无新增）：added = 0（调用方据此停止触发）', () => {
    const existing = [bar(300), bar(301)]
    const incoming = [bar(300), bar(301)]
    const result = mergeBars(existing, incoming)
    expect(result.added).toBe(0)
    expect(result.bars).toHaveLength(2)
  })

  // setKlineData 首载走 mergeBars([], incoming)：数据源「时间戳不单调」时
  // lightweight-charts 会断言 data must be asc ordered by time，必须在此兜底成升序。
  it('全量替换：乱序 incoming 输出升序（修复 asc ordered 断言）', () => {
    // 还原线上现象：第 88 根为「交易日 23:59」，第 89 根为「次日 00:00 之前」
    const incoming = [bar(1794499200), bar(1794585540), bar(1794412800)]
    const result = mergeBars([], incoming)
    expect(result.bars.map((b) => b.time)).toEqual([1794412800, 1794499200, 1794585540])
    // 相邻 time 严格递增：库的 setData 断言条件
    for (let i = 1; i < result.bars.length; i += 1) {
      expect(result.bars[i].time).toBeGreaterThan(result.bars[i - 1].time)
    }
  })

  it('全量替换：同 time 重复保留后者（避免 duplicate time 丢数据）', () => {
    const result = mergeBars([], [bar(300), { ...bar(300), close: 88 }, bar(301)])
    expect(result.bars).toHaveLength(2)
    expect(result.bars.find((b) => b.time === 300)?.close).toBe(88)
    expect(result.bars.map((b) => b.time)).toEqual([300, 301])
  })

  it('空输入：existing 为空 / incoming 为空均安全', () => {
    expect(mergeBars([], [bar(100)]).added).toBe(1)
    expect(mergeBars([bar(100)], []).added).toBe(0)
    expect(mergeBars([], []).added).toBe(0)
  })
})
