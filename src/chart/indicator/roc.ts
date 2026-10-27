// roc.ts —— 变动率指标 ROC（附图指标）。
// 东财算法（参数 12,6）：
//   ROC = (C - REF(C,12)) / REF(C,12) * 100（前 12 根不输出）
//   ROCMA = MA(ROC, 6)
// 返回两条线（下标 0=ROC、1=ROCMA）。
// 颜色见主题 SUB_INDICATOR_META：ROC / ROC_MA。
import type { IndicatorLine, K } from './types'
import { toLines } from './utils'

/**
 * 计算 ROC 两条线（ROC / ROCMA6）。
 *
 * @remarks
 * 公式：ROC = (C − REF(C,12)) / REF(C,12) × 100（前 12 根不输出）；
 * ROCMA = MA(ROC,6)（ROC 从第 13 根起有值，MA 需 6 根有效 → 从第 18 根起）。
 *
 * @param bars 升序 K 线数组。
 * @returns [ROC, ROCMA6] 两条线。
 */
export const calcROC = (bars: K[]): IndicatorLine[][] => {
  const n = bars.length
  const times = bars.map((b) => b.time)
  const c = bars.map((b) => b.close!)

  // ROC 从第 13 根起有值（i>=12）。
  const vals = new Array<number>(n).fill(NaN)
  for (let i = 12; i < n; i++) {
    vals[i] = c[i - 12] === 0 ? 0 : ((c[i] - c[i - 12]) / c[i - 12]) * 100
  }

  // MA(ROC,6)：ROC 从第 13 根起有值，MA 需 6 根有效 → 从第 18 根起。
  const mav = new Array<number>(n).fill(NaN)
  for (let i = 17; i < n; i++) {
    let sum = 0
    for (let j = i - 5; j <= i; j++) sum += vals[j]
    mav[i] = sum / 6
  }

  return [toLines(times, vals), toLines(times, mav)]
}
