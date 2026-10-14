/**
 * cci.ts —— 顺势指标 CCI（Pane2 附图指标）
 *
 * 东财算法（参数 14）：
 *   TYP = (H + L + C) / 3
 *   MA  = MA(TYP, 14)
 *   CCI = (TYP - MA) / (0.015 * AVEDEV(TYP, 14))
 * 返回单条线（下标 0）。
 * 颜色见控制器 SUB_INDICATOR_META：CCI #666666。
 * 刻度特殊：中间值精确为 0（对称 ±max×1.1）。
 */
import type { ChartDataPoint } from '../../types/chart'
import type { IndicatorLine, K } from './types'
import { toKBars, avedev, toLines } from './utils'

/** 计算 CCI 单条线（14） */
export const calcCCI = (bars: K[]): IndicatorLine[][] => {
  const n = bars.length
  const times = bars.map((b) => b.time)
  const h = bars.map((b) => b.high!)
  const l = bars.map((b) => b.low!)
  const c = bars.map((b) => b.close!)

  const typ = h.map((hi, i) => (hi + l[i] + c[i]) / 3)

  // MA(TYP,14)：前 13 根不输出
  const ma = (() => {
    const out = new Array<number>(n).fill(NaN)
    let sum = 0
    for (let i = 0; i < n; i++) {
      sum += typ[i]
      if (i >= 14) sum -= typ[i - 14]
      if (i >= 13) out[i] = sum / 14
    }
    return out
  })()

  const dev = avedev(typ, 14)
  return [toLines(times, typ.map((t, i) => (dev[i] === 0 ? 0 : (t - ma[i]) / (0.015 * dev[i]))))]
}
/**
 * 计算分时 CCI 曲线。
 * 算法与 K 线版（calcCCI）完全一致（东财口径，无第二套公式），
 * 仅输入不同：分时点用 price 充当 OHLC（见 utils.ts toKBars），
 * 参数与颜色见控制器 TS_SUB_INDICATOR_META。
 * @param bars 升序分时点数组（pointType='timeshare'）
 */
export const calcTSCCI = (bars: ChartDataPoint[]): IndicatorLine[][] => calcCCI(toKBars(bars))

