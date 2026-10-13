/**
 * roc.ts —— 变动率指标 ROC（Pane2 附图指标）
 *
 * 东财算法（参数 12,6）：
 *   ROC = (C - REF(C,12)) / REF(C,12) * 100（前 12 根不输出）
 *   ROCMA = MA(ROC, 6)
 * 返回两条线（下标 0=ROC、1=ROCMA）。
 * 颜色见控制器 SUB_INDICATOR_META：
 *   ROC #A0A0A0 / ROC_MA #F4AA0A。
 */
import type { ChartDataPoint } from '../../types/chart'
import type { IndicatorLine, K } from './types'
import { toKBars, toLines } from './utils'

/** 计算 ROC 两条线（ROC / ROCMA6） */
export const calcROC = (bars: K[]): IndicatorLine[][] => {
  const n = bars.length
  const times = bars.map((b) => b.time)
  const c = bars.map((b) => b.close!)

  // ROC 从第 13 根起有值（i>=12）
  const vals = new Array<number>(n).fill(NaN)
  for (let i = 12; i < n; i++) {
    vals[i] = c[i - 12] === 0 ? 0 : ((c[i] - c[i - 12]) / c[i - 12]) * 100
  }

  // MA(ROC,6)：ROC 从第 13 根起有值，MA 需 6 根有效 → 从第 18 根起
  const mav = new Array<number>(n).fill(NaN)
  for (let i = 17; i < n; i++) {
    let sum = 0
    for (let j = i - 5; j <= i; j++) sum += vals[j]
    mav[i] = sum / 6
  }

  return [toLines(times, vals), toLines(times, mav)]
}
/**
 * 计算分时 ROC 曲线。
 * 算法与 K 线版（calcROC）完全一致（东财口径，无第二套公式），
 * 仅输入不同：分时点用 price 充当 OHLC（见 utils.ts toKBars），
 * 参数与颜色见控制器 TS_SUB_INDICATOR_META。
 * @param bars 升序分时点数组（pointType='timeshare'）
 */
export const calcTSROC = (bars: ChartDataPoint[]): IndicatorLine[][] => calcROC(toKBars(bars))

