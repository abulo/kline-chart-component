/**
 * obv.ts —— 能量潮 OBV（Pane2 附图指标）
 *
 * 东财算法：
 *   OBV[0] = VOL[0]
 *   OBV[i] = C>REF(C,1) ? OBV+VOL : C<REF(C,1) ? OBV-VOL : OBV（累积）
 *   OBVMA  = MA(OBV, 30)（东财 OBV 副图含 OBV + OBVMA 两条线）
 * 返回两条线（下标 0=OBV、1=OBVMA）。
 * 颜色见控制器 SUB_INDICATOR_META：
 *   OBV #666666 / OBV_MA #F4AA0A。
 */
import type { IndicatorLine, K } from './types'
import { toLines } from './utils'

/** 计算 OBV 两条线（OBV / OBVMA30） */
export const calcOBV = (bars: K[]): IndicatorLine[][] => {
  const n = bars.length
  const times = bars.map((b) => b.time)
  const c = bars.map((b) => b.close!)
  const v = bars.map((b) => b.volume ?? 0)
  const prevC = [c[0], ...c.slice(0, n - 1)] // REF(C,1)，首根取自身

  const acc = new Array<number>(n)
  let s = v[0] ?? 0
  acc[0] = s
  for (let i = 1; i < n; i++) {
    if (c[i] > prevC[i]) s += v[i]
    else if (c[i] < prevC[i]) s -= v[i]
    acc[i] = s
  }

  // MA(OBV,30)：前 29 根不输出（与东财 OBVMA 起画位置一致）
  const mav = new Array<number>(n).fill(NaN)
  let sum = 0
  for (let i = 0; i < n; i++) {
    sum += acc[i]
    if (i >= 30) sum -= acc[i - 30]
    if (i >= 29) mav[i] = sum / 30
  }

  return [toLines(times, acc), toLines(times, mav)]
}
