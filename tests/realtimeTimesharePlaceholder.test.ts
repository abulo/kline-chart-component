/**
 * realtimeTimesharePlaceholder.test.ts —— 实时推送在分时末尾占位时的处理分支。
 *
 * @remarks
 * 分时渲染行按 dayPoints 给最后一个交易日补齐占位（盘中未满 → 右侧留白）。
 * 占位行时间落在"未来"，series.update 会报 Cannot update oldest data，
 * 因此实时管线检测到末尾占位时必须改为整段重排（onRebuildTimeshareSeries），
 * 本文件覆盖两条分支 + bars / barIndex 维护。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  RealtimePipeline,
  type RealtimePipelineDeps,
} from '../src/chart/core/realtimePipeline'
import type { ChartDataPoint } from '../src/types/chart'
import type { ISeriesApi } from 'lightweight-charts'

/** 构造分时数据点（price / avgPrice / volume 必填，pointType='timeshare'）。 */
const tsPoint = (time: number, price = 10.2): ChartDataPoint => ({
  time,
  tradeDate: '2026-11-10',
  preClose: 10,
  pointType: 'timeshare',
  price,
  avgPrice: 10.1,
  volume: 100,
})

/** 假 Line series：只关心 update / setData 是否被调用。 */
const makeLineSeries = () => ({
  update: vi.fn(),
  setData: vi.fn(),
})

/** 组装 pipeline（只有与本文件相关的 deps 需要真实实现，其余给最小桩）。 */
const buildPipeline = (params: {
  bars: ChartDataPoint[]
  trailingPlaceholder: boolean
  priceSeries: ReturnType<typeof makeLineSeries>
}) => {
  const barIndex = new Map<number, ChartDataPoint>()
  const onRebuildTimeshareSeries = vi.fn()
  const deps: RealtimePipelineDeps = {
    getChart: (() => ({ timeScale: () => ({ getVisibleLogicalRange: () => null }) })) as never,
    getBars: () => params.bars,
    getBarIndex: () => barIndex,
    getIsTimeshare: () => true,
    getTheme: () => 'light',
    getKlineSeries: () => undefined,
    getVolumeSeries: () => undefined,
    getTimesharePriceSeries: () => params.priceSeries as unknown as ISeriesApi<'Line'>,
    getTimeshareAvgSeries: () => undefined,
    getTimeshareRightAxisSeries: () => undefined,
    onRebuildIndicators: vi.fn(),
    getTimeshareTrailingPlaceholder: () => params.trailingPlaceholder,
    onRebuildTimeshareSeries,
  }
  return { pipeline: new RealtimePipeline(deps), barIndex, onRebuildTimeshareSeries }
}

describe('实时推送 · 分时末尾占位', () => {
  it('末尾存在占位：不走 series.update，改为整段重排，并维护 bars / barIndex', () => {
    const bars = Array.from({ length: 120 }, (_, i) => tsPoint(1_760_000_000 + i * 60))
    const priceSeries = makeLineSeries()
    const { pipeline, barIndex, onRebuildTimeshareSeries } = buildPipeline({
      bars,
      trailingPlaceholder: true,
      priceSeries,
    })

    pipeline.updateLastBar(tsPoint(1_760_000_000 + 120 * 60, 10.5))

    // 占位占住未来时间槽位 → update 会冲突，必须整段重排。
    expect(priceSeries.update).not.toHaveBeenCalled()
    expect(onRebuildTimeshareSeries).toHaveBeenCalledTimes(1)
    // bars 追加新分钟点（真实数据不含占位行）。
    expect(bars).toHaveLength(121)
    expect(bars[bars.length - 1].price).toBe(10.5)
    expect(barIndex.has(1_760_000_000 + 120 * 60)).toBe(true)
  })

  it('末尾无占位：走增量 update，不触发重排', () => {
    const bars = Array.from({ length: 241 }, (_, i) => tsPoint(1_760_000_000 + i * 60))
    const priceSeries = makeLineSeries()
    const { pipeline, onRebuildTimeshareSeries } = buildPipeline({
      bars,
      trailingPlaceholder: false,
      priceSeries,
    })

    // 刷新最后一根（time 与末点相同）：走 update 覆盖语义。
    const lastTime = bars[bars.length - 1].time as number
    pipeline.updateLastBar(tsPoint(lastTime, 10.8))

    expect(priceSeries.update).toHaveBeenCalledWith({
      time: lastTime,
      value: 10.8,
    })
    expect(onRebuildTimeshareSeries).not.toHaveBeenCalled()
    // 同 time = 覆盖末点（不追加）。
    expect(bars).toHaveLength(241)
    expect(bars[bars.length - 1].price).toBe(10.8)
  })
})
