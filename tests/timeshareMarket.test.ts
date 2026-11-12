/**
 * timeshareMarket.test.ts —— 分时市场口径单测（v1.7.20）
 *
 * 验证：市场 → 每天分时点数映射（A 股 241 / 港股 331 / 美股 391 / 日股 331 /
 * 韩股 391）；分时渲染行按每交易日固定槽位补齐（每天等宽、占位行不画价格）；
 * 竖线等分数按实际交易日数（1d 固定 4 等分）；时间轴天界 MM-DD 格式化。
 */
import { describe, expect, it } from 'vitest'
import {
  MARKET_PROFILES,
  DEFAULT_MARKET,
  getMarketDayPoints,
  type MarketProfile,
} from '../src/chart/market'
import { TimeshareManager } from '../src/chart/core/timeshareManager'
import { formatShortDate } from '../src/chart/util/format'
import type { ChartDataPoint } from '../src/types/chart'
import type { PeriodValueOrEmpty } from '../src/chart/periods'
import type { createChart } from 'lightweight-charts'

/** 假 chart（buildRenderRows / verticalCount 不使用价格轴，仅占位类型）。 */
const fakeChart = {} as ReturnType<typeof createChart>

/** 构造分时数据点：从 startTime 起每分钟 1 点。 */
const buildBars = (
  tradeDate: string,
  count: number,
  startTime: number,
  price = 10,
): ChartDataPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    time: startTime + i * 60,
    tradeDate,
    preClose: 10,
    pointType: 'timeshare',
    price: price + i * 0.01,
    avgPrice: price,
    volume: 100,
  }))

/** 构造 TimeshareManager（周期 / 市场可配，依赖全部惰性读取）。 */
const createManager = (bars: ChartDataPoint[], period: PeriodValueOrEmpty, market: MarketProfile) =>
  new TimeshareManager({
    chart: fakeChart,
    getPeriod: () => period,
    getBars: () => bars,
    getShowIndicator: () => false,
    getTheme: () => 'dark',
    getPriceSeries: () => null,
    getMarket: () => market,
  })

describe('分时市场口径', () => {
  it('市场 → 每天分时点数映射（A 股 241 / 港股 331 / 美股 391 / 日股 331 / 韩股 391）', () => {
    expect(MARKET_PROFILES.cn.dayPoints).toBe(241)
    expect(MARKET_PROFILES.hk.dayPoints).toBe(331)
    expect(MARKET_PROFILES.us.dayPoints).toBe(391)
    expect(MARKET_PROFILES.jp.dayPoints).toBe(331)
    expect(MARKET_PROFILES.kr.dayPoints).toBe(391)
    expect(DEFAULT_MARKET).toBe('cn')
  })

  it('getMarketDayPoints：已知市场取值，未知 / 空值回退 A 股 241', () => {
    expect(getMarketDayPoints('hk')).toBe(331)
    expect(getMarketDayPoints('us')).toBe(391)
    expect(getMarketDayPoints(undefined)).toBe(241)
    expect(getMarketDayPoints('unknown')).toBe(241)
  })

  it('dayPoints / dayCount：按市场与 tradeDate 分组统计', () => {
    const bars = [
      ...buildBars('2026-11-10', 241, 1_760_000_000),
      ...buildBars('2026-11-11', 241, 1_760_086_400),
    ]
    const manager = createManager(bars, '2d', 'hk')
    expect(manager.dayPoints).toBe(331)
    expect(manager.dayCount).toBe(2)
  })

  it('完整交易日（241 点）不补占位：渲染行数 = 原始点数', () => {
    const bars = buildBars('2026-11-10', 241, 1_760_000_000)
    const rows = createManager(bars, '1d', 'cn').buildRenderRows()
    expect(rows).toHaveLength(241)
    expect(rows.every(row => row.bar !== null)).toBe(true)
    expect(rows.map(row => row.time)).toEqual(bars.map(bar => bar.time))
  })

  it('历史交易日不足一天（240 点）补齐到 241：占位行时间 = 末点 + 1 分钟，且不带价格', () => {
    const day1 = buildBars('2026-11-10', 240, 1_760_000_000)
    const day2 = buildBars('2026-11-11', 1, day1[day1.length - 1].time + 3600)
    const rows = createManager([...day1, ...day2], '2d', 'cn').buildRenderRows()
    // day1 补齐 1 行 → 241；day2 是最后交易日（盘中最新日）不补齐 → 1。
    expect(rows).toHaveLength(242)
    const placeholder = rows[240]
    expect(placeholder.bar).toBeNull()
    expect(placeholder.time).toBe(day1[day1.length - 1].time + 60)
  })

  it('最后交易日（盘中最新日）不补齐：避免占用实时 update 槽位', () => {
    const bars = buildBars('2026-11-10', 100, 1_760_000_000)
    const rows = createManager(bars, '1d', 'cn').buildRenderRows()
    expect(rows).toHaveLength(100)
    expect(rows.every(row => row.bar !== null)).toBe(true)
  })

  it('多日分时：每天补齐后严格等宽（rows / 天数 = dayPoints）', () => {
    const bars = [
      ...buildBars('2026-11-10', 200, 1_760_000_000),
      ...buildBars('2026-11-11', 241, 1_760_086_400),
    ]
    const rows = createManager(bars, '2d', 'cn').buildRenderRows()
    expect(rows).toHaveLength(241 * 2)
    expect(rows.filter(row => row.bar === null)).toHaveLength(41)
  })

  it('补齐与次日首点时间冲突时停止（保持严格递增，不覆盖真实数据）', () => {
    const day1 = buildBars('2026-11-10', 240, 1_760_000_000)
    const day2 = buildBars('2026-11-11', 1, day1[day1.length - 1].time + 60)
    const rows = createManager([...day1, ...day2], '2d', 'cn').buildRenderRows()
    // day1 占位时间 = 末点 + 60 = 次日首点 → 冲突，不补；day2 为最后交易日不补。
    expect(rows).toHaveLength(241)
    expect(rows.every(row => row.bar !== null)).toBe(true)
  })

  it('竖线等分数：1d 固定 4；多日按实际交易日数（周期 5d 但仅 3 天 → 3）', () => {
    const twoDays = [
      ...buildBars('2026-11-10', 241, 1_760_000_000),
      ...buildBars('2026-11-11', 241, 1_760_086_400),
    ]
    expect(createManager(twoDays, '1d', 'cn').verticalCount).toBe(4)
    expect(createManager(twoDays, '2d', 'cn').verticalCount).toBe(2)
    const threeDays = [...twoDays, ...buildBars('2026-11-12', 241, 1_760_172_800)]
    expect(createManager(threeDays, '5d', 'cn').verticalCount).toBe(3)
    expect(createManager([], '5d', 'cn').verticalCount).toBe(1)
  })

  it('非分时周期不产生渲染行（K 线保持原渲染路径）', () => {
    const bars = buildBars('2026-11-10', 241, 1_760_000_000)
    expect(createManager(bars, 'day', 'cn').buildRenderRows()).toEqual([])
  })

  it('多日分时竖线按真实交易日分界：比例 = 天界行索引 / (行数 - 1)', () => {
    const day1 = buildBars('2026-11-10', 241, 1_760_000_000)
    const day2 = buildBars('2026-11-11', 241, 1_760_086_400)
    const day3 = buildBars('2026-11-12', 100, 1_760_172_800) // 最后一日盘中未满
    const manager = createManager([...day1, ...day2, ...day3], '3d', 'cn')
    const rows = manager.renderRows
    const ratios = manager.verticalRatios
    expect(rows).toHaveLength(241 + 241 + 100)
    expect(ratios).not.toBeNull()
    expect(ratios).toEqual([241 / (rows.length - 1), 482 / (rows.length - 1)])
  })

  it('单日分时不做天界比例（返回 null，回退 4 等分）', () => {
    const bars = buildBars('2026-11-10', 241, 1_760_000_000)
    expect(createManager(bars, '1d', 'cn').verticalRatios).toBeNull()
  })

  it('renderRows 带缓存：数据未变化时返回同一引用', () => {
    const bars = [
      ...buildBars('2026-11-10', 241, 1_760_000_000),
      ...buildBars('2026-11-11', 241, 1_760_086_400),
    ]
    const manager = createManager(bars, '2d', 'cn')
    const first = manager.renderRows
    expect(manager.renderRows).toBe(first)
    // 数据追加（末点时间变化）→ 缓存失效重算。
    bars.push({ ...bars[bars.length - 1], time: bars[bars.length - 1].time + 60, tradeDate: '2026-11-11' })
    expect(manager.renderRows).not.toBe(first)
  })

  it('市场口径不同：A 股 241 点数据在港股口径下每天补齐到 331', () => {
    const bars = [
      ...buildBars('2026-11-10', 241, 1_760_000_000),
      ...buildBars('2026-11-11', 50, 1_760_086_400),
    ]
    const rows = createManager(bars, '2d', 'hk').renderRows
    // day1 补齐 90；day2 为最后交易日不补 → 241 + 90 + 50。
    expect(rows).toHaveLength(241 + 90 + 50)
    expect(rows.filter(row => row.bar === null)).toHaveLength(90)
  })

  it('formatShortDate：多日分时时间轴天界标签 MM-DD', () => {
    expect(formatShortDate(1_760_000_000)).toMatch(/^\d{2}-\d{2}$/)
    expect(formatShortDate(undefined)).toBe('--')
  })
})
