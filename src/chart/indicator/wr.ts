// wr.ts —— 威廉指标 WR（附图指标）。
// 东财算法（通达信公式内核）：
//   WR(N) = 100 * (HHV(H,N) - C) / (HHV(H,N) - LLV(L,N))
// 默认参数 10/6，返回两条线（下标 0=WR10、1=WR6，顺序与东财副图一致）。
// 颜色见主题 SUB_INDICATOR_META：WR10 / WR6。
import type { IndicatorLine, K } from './types'
import { runningMax, runningMin, toLines } from './utils'

/**
 * 计算 WR 两条线（10/6）。
 *
 * @remarks
 * 公式：WR(N) = 100 × (HHV(H,N) − C) / (HHV(H,N) − LLV(L,N))；
 * HHV/LLV 为滚动窗口最值（见 utils.runningMax / runningMin）。
 *
 * @param bars 升序 K 线数组。
 * @returns [WR10, WR6] 两条线。
 */
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
