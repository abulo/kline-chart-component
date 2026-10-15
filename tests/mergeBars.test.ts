/**
 * mergeBars.test.ts —— 历史前置合并纯函数测试（v1.5.2）
 *
 * 覆盖：前置插入 + 新增条数、time 去重（incoming 优先）、升序排序、
 * 重复页 added=0（无更早数据 → 停止触发）、空输入。
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

  it('空输入：existing 为空 / incoming 为空均安全', () => {
    expect(mergeBars([], [bar(100)]).added).toBe(1)
    expect(mergeBars([bar(100)], []).added).toBe(0)
    expect(mergeBars([], []).added).toBe(0)
  })
})
