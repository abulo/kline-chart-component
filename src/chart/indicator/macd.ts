// macd.ts —— 指数平滑异同移动平均 MACD（附图指标）。
// 东财算法（参数 12,26,9）：
//   DIF  = EMA(C,12) - EMA(C,26)
//   DEA  = EMA(DIF, 9)
//   MACD = (DIF - DEA) * 2
// 返回三条线（下标 0/1/2 对应 DIF/DEA/MACD 柱值）。
// 颜色见主题 SUB_INDICATOR_META：DIF / DEA / MACD 柱
//（柱体由 macdBarPrimitive 插件绘制：红空心 / 绿实心，宽与 K 线柱一致）。
import type { IndicatorLine, K } from './types'
import { ema, toLines } from './utils'

/**
 * 计算 MACD 三条线（DIF/DEA/柱值）。
 *
 * @remarks
 * 公式：DIF = EMA(C,12) − EMA(C,26)，DEA = EMA(DIF,9)，
 * MACD 柱 = (DIF − DEA) × 2；EMA 从首根递推（见 utils.ema）。
 *
 * @param bars 升序 K 线数组。
 * @returns [DIF, DEA, MACD 柱值] 三条线。
 */
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
