/**
 * wr.ts —— 威廉指标 WR（Pane2 附图指标）
 *
 * 东财算法（通达信公式内核）：
 *   WR(N) = 100 * (HHV(H,N) - C) / (HHV(H,N) - LLV(L,N))
 * 默认参数 10/6，返回两条线（下标 0=WR10、1=WR6，顺序与东财副图一致）。
 * 颜色见控制器 SUB_INDICATOR_META：
 *   WR10 #666666 / WR6 #F4AA0A。
 */
import type { ChartDataPoint } from '../../types/chart'
import type { IndicatorLine, K } from './types'
import { toKBars, runningMax, runningMin, toLines } from './utils'

/** 计算 WR 两条线（10/6） */
export const calcWR = (bars: K[]): IndicatorLine[][] => {
  const times = bars.map((b) => b.time)
  const c = bars.map((b) => b.close!)
  const h = bars.map((b) => b.high!)
  const l = bars.map((b) => b.low!)

  const wr = (period: number): IndicatorLine[] => {
    const hh = runningMax(h, period)
    const ll = runningMin(l, period)
    return toLines(
      times,
      hh.map((hi, i) => (hi === ll[i] ? 0 : ((hi - c[i]) / (hi - ll[i])) * 100)),
    )
  }

  return [wr(10), wr(6)]
}
/**
 * 计算分时 WR 曲线。
 * 算法与 K 线版（calcWR）完全一致（东财口径，无第二套公式），
 * 仅输入不同：分时点用 price 充当 OHLC（见 utils.ts toKBars），
 * 参数与颜色见控制器 TS_SUB_INDICATOR_META。
 * @param bars 升序分时点数组（pointType='timeshare'）
 */
export const calcTSWR = (bars: ChartDataPoint[]): IndicatorLine[][] => calcWR(toKBars(bars))

