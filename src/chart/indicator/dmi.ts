// dmi.ts —— 动向指标 DMI（附图指标）。
// 东财算法（通达信公式内核，参数 14,6）：
//   TR   = MAX(H-L, ABS(H-REF(C,1)), ABS(REF(C,1)-L))
//   MTR  = SUM(TR, 14)
//   HD   = H - REF(H,1)；LD = REF(L,1) - L
//   DMP  = SUM(HD>0 && HD>LD ? HD : 0, 14)
//   DMM  = SUM(LD>0 && LD>HD ? LD : 0, 14)
//   PDI  = DMP * 100 / MTR；MDI = DMM * 100 / MTR
//   DX   = ABS(MDI-PDI) / (PDI+MDI) * 100
//   ADX  = MA(DX, 6)（前 5 根不输出）
//   ADXR = (ADX + REF(ADX,6)) / 2
// 返回四条线（下标 0/1/2/3 对应 PDI/MDI/ADX/ADXR）。
// 颜色见主题 SUB_INDICATOR_META：PDI / MDI / ADX / ADXR。
import type { IndicatorLine, K } from './types'
import { tdxSum, toLines } from './utils'

/**
 * 计算 DMI 四条线（PDI/MDI/ADX/ADXR）。
 *
 * @remarks
 * 公式：TR = MAX(H−L, |H−REF(C,1)|, |REF(C,1)−L|)，MTR = SUM(TR,14)；
 * DMP/DMM 分别为正向/负向动向的 14 日累加；PDI = DMP×100/MTR、
 * MDI = DMM×100/MTR；DX = |MDI−PDI| / (PDI+MDI) × 100；
 * ADX = MA(DX,6)（前 5 根不输出）；ADXR = (ADX + REF(ADX,6)) / 2。
 *
 * @param bars 升序 K 线数组。
 * @returns [PDI, MDI, ADX, ADXR] 四条线。
 */
export const calcDMI = (bars: K[]): IndicatorLine[][] => {
  const n = bars.length
  const times = bars.map((b) => b.time)
  const c = bars.map((b) => b.close!)
  const h = bars.map((b) => b.high!)
  const l = bars.map((b) => b.low!)
  const prevC = [c[0], ...c.slice(0, n - 1)] // REF(C,1)，首根取自身
  const prevH = [h[0], ...h.slice(0, n - 1)]
  const prevL = [l[0], ...l.slice(0, n - 1)]

  const mtr = tdxSum(
    h.map((hi, i) => Math.max(hi - l[i], Math.abs(hi - prevC[i]), Math.abs(prevC[i] - l[i]))),
    14,
  )
  const hd = h.map((hi, i) => hi - prevH[i])
  const ld = l.map((li, i) => prevL[i] - li)
  const dmp = tdxSum(hd.map((x, i) => (x > 0 && x > ld[i] ? x : 0)), 14)
  const dmm = tdxSum(ld.map((x, i) => (x > 0 && x > hd[i] ? x : 0)), 14)
  const pdi = mtr.map((m, i) => (m === 0 ? 0 : (dmp[i] * 100) / m))
  const mdi = mtr.map((m, i) => (m === 0 ? 0 : (dmm[i] * 100) / m))
  const dx = pdi.map((p, i) => (p + mdi[i] === 0 ? 0 : (Math.abs(mdi[i] - p) / (p + mdi[i])) * 100))

  // MA(DX,6)：前 5 根不输出（与东财 ADX 一致）。
  const adx = (() => {
    const out = new Array<number>(n).fill(NaN)
    let sum = 0
    for (let i = 0; i < n; i++) {
      sum += dx[i]
      if (i >= 6) sum -= dx[i - 6]
      if (i >= 5) out[i] = sum / 6
    }
    return out
  })()

  const adxr = adx.map((a, i) => (i >= 6 && Number.isFinite(a) ? (a + adx[i - 6]) / 2 : NaN))
  return [toLines(times, pdi), toLines(times, mdi), toLines(times, adx), toLines(times, adxr)]
}
