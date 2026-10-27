// volumeMa.ts —— 成交量均量线 VOLMA（成交量副图指标）。
// 东财成交量副图默认 MA5 / MA10：基于 volume 字段计算，
// 与成交量柱共用左侧量刻度。前 N-1 根不输出。
// 颜色见 theme.ts（volMa5 / volMa10）。
import type { IndicatorLine, K } from './types'

/**
 * 成交量均量线（滑动窗口累加，与价格 MA 同构）。
 *
 * @remarks
 * 公式：VOLMA(N) = Σ(volume[i-N+1 .. i]) / N；窗口滑动"加新减旧"。
 * 前 N-1 根不输出（与东财起画位置一致）。
 *
 * @param bars 升序 K 线数组。
 * @param period 周期 N（如 5 / 10）。
 * @returns 与 bars 等长的 VOLMA 线（前 N-1 根缺失）。
 */
export const calcVolMA = (bars: K[], period: number): IndicatorLine[] => {
  const out: IndicatorLine[] = []
  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].volume ?? 0
    if (i >= period - 1) {
      if (i >= period) sum -= bars[i - period].volume ?? 0 // 滑出窗口
      out.push({ time: bars[i].time, value: sum / period })
    }
  }
  return out
}
