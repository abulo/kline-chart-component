/**
 * expma.ts —— 指数移动平均 EXPMA（Pane0 主图指标之一）
 *
 * 东财 EXPMA 口径（与普通 EMA 等价，默认参数 12/50）：
 *   EMA[0] = close[0]；
 *   EMA[i] = close[i] * k + EMA[i-1] * (1 - k)，k = 2 / (N + 1)。
 * 从首根即输出（与 MA 不同，无预热期）。
 * 颜色见 theme.ts（expma12 #666666 / expma50 #DD9900）。
 */
import type { IndicatorLine, K } from './types'

/**
 * 指数移动平均。
 * @param bars    升序 K 线数组
 * @param period  周期 N（如 12 / 50）
 */
export const calcEXPMA = (bars: K[], period: number): IndicatorLine[] => {
  const k = 2 / (period + 1)
  const out: IndicatorLine[] = []
  let ema = bars[0]?.close ?? 0
  for (let i = 0; i < bars.length; i++) {
    ema = bars[i].close! * k + ema * (1 - k)
    out.push({ time: bars[i].time, value: ema })
  }
  return out
}
