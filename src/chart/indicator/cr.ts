/**
 * cr.ts —— 带状能量指标 CR（Pane2 附图指标）
 *
 * 东财算法（参数 26，均线 5/10/20）：
 *   UP = MAX(0, H - REF(C,1))
 *   DN = MAX(0, REF(C,1) - L)
 *   CR = SUM(UP, 26) / SUM(DN, 26) * 100
 *   CRMA1/2/3 = MA(CR, 5/10/20)
 * 返回四条线（下标 0=CR、1/2/3=MA5/MA10/MA20）。
 * 颜色见控制器 SUB_INDICATOR_META：
 *   CR #A0A0A0 / MA1 #F4AA0A / MA2 #FF1DFF / MA3 #007130。
 */
import type { IndicatorLine, K } from './types'
import { tdxSum, toLines } from './utils'

/** 计算 CR 四条线（CR / MA5 / MA10 / MA20） */
export const calcCR = (bars: K[]): IndicatorLine[][] => {
  const n = bars.length
  const times = bars.map((b) => b.time)
  const h = bars.map((b) => b.high!)
  const l = bars.map((b) => b.low!)
  const c = bars.map((b) => b.close!)
  const prevC = [c[0], ...c.slice(0, n - 1)] // REF(C,1)，首根取自身

  const up = h.map((hi, i) => Math.max(0, hi - prevC[i]))
  const dn = l.map((li, i) => Math.max(0, prevC[i] - li))
  const upSum = tdxSum(up, 26)
  const dnSum = tdxSum(dn, 26)
  const crv = upSum.map((u, i) => (dnSum[i] === 0 ? 0 : (u / dnSum[i]) * 100))

  const ma = (period: number): IndicatorLine[] => {
    const out: IndicatorLine[] = []
    let sum = 0
    for (let i = 0; i < n; i++) {
      sum += crv[i]
      if (i >= period - 1) {
        if (i >= period) sum -= crv[i - period] // 滑出窗口
        out.push({ time: times[i], value: sum / period })
      }
    }
    return out
  }

  return [toLines(times, crv), ma(5), ma(10), ma(20)]
}
