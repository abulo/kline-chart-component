// boll.ts —— 布林带 BOLL（Pane0 主图指标之一）。
// 东财口径（周期 20、倍数 2）：
//   MID = MA(close, N)
//   UP  = MID + 倍数 × std（总体标准差，分母 N）
//   LOW = MID − 倍数 × std
// 前 N-1 根不输出；返回 [上轨, 中轨, 下轨] 三条线。
// 颜色见 theme.ts（bollUp #FFD54F / bollMid #FFFFFF / bollLow #F06292）。
import type { IndicatorLine, K } from './types'

/**
 * 布林带。
 *
 * @remarks
 * 公式：MID = MA(close, N)；UP/LOW = MID ± mult × std，
 * 其中 std 为总体标准差（分母 N，东财口径）。前 N-1 根不输出。
 *
 * @param bars 升序 K 线数组。
 * @param period 周期 N，默认 20。
 * @param mult 标准差倍数，默认 2。
 * @returns [上轨, 中轨, 下轨] 三条线。
 */
export const calcBOLL = (
  bars: K[],
  period = 20,
  mult = 2,
): [IndicatorLine[], IndicatorLine[], IndicatorLine[]] => {
  const up: IndicatorLine[] = []
  const mid: IndicatorLine[] = []
  const low: IndicatorLine[] = []

  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close!
    const mean = sum / period

    // 总体标准差（分母 N，东财口径）。
    let sq = 0
    for (let j = i - period + 1; j <= i; j++) sq += (bars[j].close! - mean) ** 2
    const std = Math.sqrt(sq / period)

    const t = bars[i].time
    mid.push({ time: t, value: mean })
    up.push({ time: t, value: mean + mult * std })
    low.push({ time: t, value: mean - mult * std })
  }
  return [up, mid, low]
}
