/**
 * timeshareTodayPoints.test.ts —— 分时测试数据准备单测（v1.7.20）
 *
 * 验证 MockChartDataService 的 `todayPoints` 配置：分时最新交易日按指定条数
 * 截断（模拟盘中），用于验证「1 日分时 / dayPoints 240 / 当日已有 120 条」
 * 场景下最后交易日不补齐、竖线按交易日分界渲染；K 线数据不受影响。
 */
import { describe, expect, it } from 'vitest'
import { MockChartDataService } from '../src/services/mockChartDataService'
import { TimeshareManager } from '../src/chart/core/timeshareManager'
import type { ChartDataPoint } from '../src/types/chart'
import type { createChart } from 'lightweight-charts'

/** 假 chart（渲染行计算不使用价格轴，仅占位类型）。 */
const fakeChart = {} as ReturnType<typeof createChart>

const fetchTimeshare = (service: MockChartDataService, period = '1d'): Promise<ChartDataPoint[]> =>
  service.fetchHistory({ symbol: '300750', period, limit: 200 })

/** 取最后一个交易日的数据点。 */
const lastDayBars = (bars: ChartDataPoint[]): ChartDataPoint[] => {
  const lastDate = bars[bars.length - 1].tradeDate
  return bars.filter(bar => bar.tradeDate === lastDate)
}

/** 构造 TimeshareManager（复用 mock 数据，dayPoints 可配）。 */
const createManager = (bars: ChartDataPoint[], period: '1d' | '2d', dayPoints: number) =>
  new TimeshareManager({
    chart: fakeChart,
    getPeriod: () => period,
    getBars: () => bars,
    getShowIndicator: () => false,
    getTheme: () => 'dark',
    getPriceSeries: () => null,
    getDayPoints: () => dayPoints,
  })

describe('分时测试数据：当日已有点数', () => {
  it('todayPoints=120：1d 分时当日仅 120 条（前 120 分钟 09:30~11:29 连续）', async () => {
    const bars = await fetchTimeshare(
      new MockChartDataService({ fetchLimit: 200, todayPoints: 120 }),
    )
    const today = lastDayBars(bars)
    expect(today).toHaveLength(120)
    // 上午 09:30~11:29 每分钟连续：首末点相差 119 分钟（无午休跨段）。
    expect(today[119].time - today[0].time).toBe(119 * 60)
    // time 为「北京时间对应的 UTC 时刻」（+8h 还原北京时间 → 11:29）。
    const bt = new Date((today[119].time + 8 * 3600) * 1000)
    expect(bt.getUTCHours()).toBe(11)
    expect(bt.getUTCMinutes()).toBe(29)
  })

  it('未配置 todayPoints：当日为完整 241 条', async () => {
    const bars = await fetchTimeshare(new MockChartDataService({ fetchLimit: 200 }))
    expect(lastDayBars(bars)).toHaveLength(241)
  })

  it('todayPoints 非法（0 / 241 / 300 / NaN）→ 回退完整 241 条', async () => {
    for (const todayPoints of [0, 241, 300, Number.NaN]) {
      const bars = await fetchTimeshare(
        new MockChartDataService({ fetchLimit: 200, todayPoints }),
      )
      expect(lastDayBars(bars)).toHaveLength(241)
    }
  })

  it('1d / dayPoints 240 / 当日 120 条：补齐到 240 槽位，数据占 120/240 宽度', async () => {
    const bars = await fetchTimeshare(
      new MockChartDataService({ fetchLimit: 200, todayPoints: 120 }),
    )
    const manager = createManager(bars, '1d', 240)
    const rows = manager.renderRows
    // 当天同样补齐：120 真实 + 120 占位 = 240 槽位（右侧半窗留白）。
    expect(rows).toHaveLength(240)
    expect(rows.filter(row => row.bar !== null)).toHaveLength(120)
    expect(rows.filter(row => row.bar === null)).toHaveLength(120)
    // 末尾存在占位 → 实时管线走整段重排（update 会与占位时间冲突）。
    expect(manager.hasTrailingPlaceholder).toBe(true)
    // 单日分时竖线回退 4 等分（不做天界比例）。
    expect(manager.verticalCount).toBe(4)
    expect(manager.verticalRatios).toBeNull()
  })

  it('2d / dayPoints 240 / 当日 120 条：每天都补齐到 240，竖线落在天界', async () => {
    const bars = await fetchTimeshare(
      new MockChartDataService({ fetchLimit: 200, todayPoints: 120 }),
      '2d',
    )
    const manager = createManager(bars, '2d', 240)
    const rows = manager.renderRows
    // 每天严格 240 槽位（前一日 80 真实 + 160 占位，当日 120 真实 + 120 占位）。
    expect(rows).toHaveLength(240 * 2)
    expect(manager.dayCount).toBe(2)
    expect(manager.verticalRatios).toEqual([240 / (rows.length - 1)])
    expect(manager.hasTrailingPlaceholder).toBe(true)
  })

  it('K 线数据不受 todayPoints 影响：day 周期仍返回 min(limit, 池大小)', async () => {
    const withToday = new MockChartDataService({ fetchLimit: 200, todayPoints: 120 })
    const plain = new MockChartDataService({ fetchLimit: 200 })
    const [a, b] = await Promise.all([
      withToday.fetchHistory({ symbol: '300750', period: 'day', limit: 200 }),
      plain.fetchHistory({ symbol: '300750', period: 'day', limit: 200 }),
    ])
    expect(a).toHaveLength(b.length)
    expect(a[a.length - 1].tradeDate).toBe(b[b.length - 1].tradeDate)
  })
})
