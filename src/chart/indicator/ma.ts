// ma.ts —— 简单移动平均 MA（Pane0 主图指标之一）。
// 参数 5/10/20/30/60（东财标准五线）；前 N-1 根不输出
//（东财从第 N 根起画线），首值 = 前 N 根收盘均值。
// 颜色见 theme.ts（ma5 #666666 / ma10 #DD9900 / ma20 #FF00FF /
// ma30 #007130 / ma60 #0079D5）。
import type { IndicatorLine, K } from './types'

/**
 * 简单移动平均（滑动窗口累加，O(n)）。
 *
 * @remarks
 * 公式：MA(N) = Σ(close[i-N+1 .. i]) / N；窗口滑动采用"加新减旧"，
 * 每根仅一次加减运算，避免每根重建窗口求和。
 * 东财口径：前 N-1 根不输出（从第 N 根起画线）。
 *
 * @param bars 升序 K 线数组。
 * @param period 周期 N（如 5）。
 * @returns 与 bars 等长的 MA 线（前 N-1 根缺失）。
 */
export const calcMA = (bars: K[], period: number): IndicatorLine[] => {
  const out: IndicatorLine[] = []
  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close!
    if (i >= period - 1) {
      if (i >= period) sum -= bars[i - period].close! // 滑出窗口
      out.push({ time: bars[i].time, value: sum / period })
    }
  }
  return out
}
