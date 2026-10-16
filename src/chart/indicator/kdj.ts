/**
 * kdj.ts —— 随机指标 KDJ（Pane2 附图指标）
 *
 * 东财算法（通达信公式内核，参数 9,3,3）：
 *   RSV = (C - LLV(L,9)) / (HHV(H,9) - LLV(L,9)) * 100
 *   K   = SMA(RSV, 3, 1)
 *   D   = SMA(K, 3, 1)
 *   J   = 3 * K - 2 * D
 * 返回三条线（下标 0/1/2 对应 K/D/J）。
 * 颜色见控制器 SUB_INDICATOR_META：
 *   K #666666 / D #F4AA0A / J #FF1DFF。
 */
import type { IndicatorLine, K } from './types'
import { runningMax, runningMin, tdxSMA, toLines } from './utils'

/** 计算 KDJ 三条线（K/D/J） */
export const calcKDJ = (bars: K[]): IndicatorLine[][] => {
  const times = bars.map((b) => b.time)
  const c = bars.map((b) => b.close!)
  const h = bars.map((b) => b.high!)
  const l = bars.map((b) => b.low!)

  const hh = runningMax(h, 9)
  const ll = runningMin(l, 9)
  const rsv = c.map((ci, i) => (hh[i] === ll[i] ? 0 : ((ci - ll[i]) / (hh[i] - ll[i])) * 100))
  const k = tdxSMA(rsv, 3, 1)
  const d = tdxSMA(k, 3, 1)
  const j = k.map((ki, i) => 3 * ki - 2 * d[i])
  return [toLines(times, k), toLines(times, d), toLines(times, j)]
}
