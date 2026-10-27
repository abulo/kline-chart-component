// bias.ts —— 乖离率 BIAS（附图指标）。
// 东财算法：
//   BIAS(N) = (C - MA(C,N)) / MA(C,N) * 100
// MA 前 N-1 根不输出（东财 BIAS 从第 N 根起画）。
// 默认参数 6/12/24，返回三条线（下标 0/1/2）。
// 颜色见主题 SUB_INDICATOR_META：BIAS6 / BIAS12 / BIAS24。
import type { IndicatorLine, K } from './types'

/**
 * 计算 BIAS 三条线（6/12/24）。
 *
 * @remarks
 * 公式：BIAS(N) = (C − MA(C,N)) / MA(C,N) × 100；
 * MA 前 N-1 根不输出（东财从第 N 根起画）。
 *
 * @param bars 升序 K 线数组。
 * @returns [BIAS6, BIAS12, BIAS24] 三条线。
 */
export const calcBIAS = (bars: K[]): IndicatorLine[][] => {
  const n = bars.length
  const times = bars.map((b) => b.time)
  const c = bars.map((b) => b.close!)

  const bias = (period: number): IndicatorLine[] => {
    const out: IndicatorLine[] = []
    let sum = 0
    for (let i = 0; i < n; i++) {
      sum += c[i]
      if (i >= period - 1) {
        if (i >= period) sum -= c[i - period] // 滑出窗口
        const ma = sum / period
        out.push({ time: times[i], value: ((c[i] - ma) / ma) * 100 })
      }
    }
    return out
  }

  return [bias(6), bias(12), bias(24)]
}
