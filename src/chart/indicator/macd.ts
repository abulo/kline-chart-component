/**
 * macd.ts —— 指数平滑异同移动平均 MACD（Pane2 附图指标）
 *
 * 东财算法（参数 12,26,9）：
 *   DIF  = EMA(C,12) - EMA(C,26)
 *   DEA  = EMA(DIF, 9)
 *   MACD = (DIF - DEA) * 2
 * 返回三条线（下标 0/1/2 对应 DIF/DEA/MACD 柱值）。
 * 颜色见控制器 SUB_INDICATOR_META：
 *   DIF #A0A0A0 / DEA #F4AA0A / MACD 柱 #FF1DFF
 * （柱体由 macdBarPrimitive 插件绘制：红空心 / 绿实心，宽与 K 线柱一致）。
 */
import type { ChartDataPoint } from '../../types/chart'
import type { IndicatorLine, K } from './types'
import { toKBars, ema, toLines } from './utils'

/** 计算 MACD 三条线（DIF/DEA/柱值） */
export const calcMACD = (bars: K[]): IndicatorLine[][] => {
  const times = bars.map((b) => b.time)
  const c = bars.map((b) => b.close!)

  const e12 = ema(c, 12)
  const e26 = ema(c, 26)
  const dif = e12.map((v12, i) => v12 - e26[i])
  const dea = ema(dif, 9)
  const hist = dif.map((d1, i) => (d1 - dea[i]) * 2)
  return [toLines(times, dif), toLines(times, dea), toLines(times, hist)]
}
/**
 * 计算分时 MACD 曲线。
 * 算法与 K 线版（calcMACD）完全一致（东财口径，无第二套公式），
 * 仅输入不同：分时点用 price 充当 OHLC（见 utils.ts toKBars），
 * 参数与颜色见控制器 TS_SUB_INDICATOR_META。
 * @param bars 升序分时点数组（pointType='timeshare'）
 */
export const calcTSMACD = (bars: ChartDataPoint[]): IndicatorLine[][] => calcMACD(toKBars(bars))

