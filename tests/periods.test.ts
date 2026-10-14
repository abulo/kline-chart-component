/**
 * Periods.test.ts —— 周期配置单测（v1.4.94）
 *
 * 验证：清单完整（13 项）/ value 全局唯一 / label 非空 /
 * periodMap 与 Periods 完全一致（O(1) 查询表）/ getPeriodLabel 命中与容错。
 */
import { describe, expect, it } from 'vitest'
import { Periods, periodMap, getPeriodLabel, type PeriodValue } from '../src/chart/Periods'

describe('周期配置 Periods', () => {
  it('清单完整：13 项（分时 5 + 日周月 3 + 分钟 5）', () => {
    expect(Periods).toHaveLength(13)
    // 分时 1~5 日
    expect(Periods[0]).toEqual({ label: '1日分时', value: '1d' })
    expect(Periods[4]).toEqual({ label: '5日分时', value: '5d' })
    // 日 / 周 / 月 K
    expect(Periods[5]).toEqual({ label: '日K', value: 'day' })
    expect(Periods[6]).toEqual({ label: '周K', value: 'week' })
    expect(Periods[7]).toEqual({ label: '月K', value: 'month' })
    // 分钟 K（60 / 30 / 15 / 5 / 1）
    expect(Periods[8]).toEqual({ label: '60分K', value: '60min' })
    expect(Periods[12]).toEqual({ label: '1分K', value: '1min' })
  })

  it('value 全局唯一（作为周期标识 / Map 键，不可重复）', () => {
    const values = Periods.map((period) => period.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('label 与 value 均非空', () => {
    for (const period of Periods) {
      expect(period.label.length).toBeGreaterThan(0)
      expect(period.value.length).toBeGreaterThan(0)
    }
  })

  it('periodMap：value → 配置项，与 Periods 完全一致（O(1) 查询表）', () => {
    expect(periodMap.size).toBe(Periods.length)
    for (const period of Periods) {
      expect(periodMap.get(period.value)).toEqual(period)
    }
  })

  it('getPeriodLabel：命中返回 label，未知周期容错返回原值', () => {
    expect(getPeriodLabel('day')).toBe('日K')
    expect(getPeriodLabel('1min')).toBe('1分K')
    expect(getPeriodLabel('unknown-period')).toBe('unknown-period')
  })

  it('PeriodValue 联合类型：编译期覆盖全部 value（运行时抽检）', () => {
    const sample: PeriodValue[] = ['1d', '5d', 'month', '60min', '1min']
    expect(sample.length).toBe(5)
    for (const value of sample) {
      expect(Periods.some((period) => period.value === value)).toBe(true)
    }
  })
})
