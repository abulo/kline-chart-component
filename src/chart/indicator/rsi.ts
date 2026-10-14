/**
 * rsi.ts —— 相对强弱指标 RSI（Pane2 附图指标）
 *
 * 东财算法（通达信公式内核）：
 *   RSI(N) = SMA(MAX(C-LC,0),N,1) * 100 / SMA(ABS(C-LC),N,1)
 * 其中 LC=REF(C,1)（首根取自身，涨/跌为 0）；SMA 为通达信递推平滑。
 * 默认参数 6/12/24，返回三条线（下标 0/1/2）。
 * 颜色见控制器 SUB_INDICATOR_META：
 *   RSI6 #666666 / RSI12 #F4AA0A / RSI24 #FF1DFF。
 */
import type { ChartDataPoint } from '../../types/chart'
import type { IndicatorLine, K } from './types'
import { toKBars, tdxSMA, toLines } from './utils'

/**
 * 计算 RSI 三条线（6/12/24）。
 * @param bars 升序 K 线数组
 */
export const calcRSI = (bars: K[]): IndicatorLine[][] => {
  const n = bars.length
  const times = bars.map((b) => b.time)
  const c = bars.map((b) => b.close!)
  const prevC = [c[0], ...c.slice(0, n - 1)] // REF(C,1)，首根取自身

  const rsi = (period: number): IndicatorLine[] => {
    const up = c.map((ci, i) => Math.max(ci - prevC[i], 0))
    const dn = c.map((ci, i) => Math.abs(ci - prevC[i]))
    const smaUp = tdxSMA(up, period, 1)
    const smaDn = tdxSMA(dn, period, 1)
    return toLines(times, smaUp.map((u, i) => (smaDn[i] === 0 ? 0 : (u * 100) / smaDn[i])))
  }

  return [rsi(6), rsi(12), rsi(24)]
}
/**
 * 计算分时 RSI 曲线。
 * 算法与 K 线版（calcRSI）完全一致（东财口径，无第二套公式），
 * 仅输入不同：分时点用 price 充当 OHLC（见 utils.ts toKBars），
 * 参数与颜色见控制器 TS_SUB_INDICATOR_META。
 * @param bars 升序分时点数组（pointType='timeshare'）
 */
export const calcTSRSI = (bars: ChartDataPoint[]): IndicatorLine[][] => calcRSI(toKBars(bars))

