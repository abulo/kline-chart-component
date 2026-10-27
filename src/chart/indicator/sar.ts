// sar.ts —— 抛物线转向 SAR（Pane0 主图指标之一）。
// SAR 在东财等行情软件中显示为 K 线上方/下方的圆点：
//  - 多头趋势：圆点在 K 线下方（支撑位）；
//  - 空头趋势：圆点在 K 线上方（压力位）。
// 算法为 Wilder 经典 SAR，参数对齐东财（步长 0.02 / 极限 0.2）：
//
//  - 初始趋势：首根收盘 ≥ 开盘 → 多头，否则空头；
//  - 初始极值：多头取前 initBars 根的最低价、空头取最高价（东财取前 4 根）；
//  - 多头：SAR = SAR_prev + af × (EP − SAR_prev)，EP 为区间最高价；
//    SAR 不得超过前两根最低价（跳空保护）；当最低价跌破 SAR → 反转空头，
//    起始 SAR = 原 EP（最高价），af 重置为 step；
//  - 空头对称：EP 为区间最低价，SAR 不低于前两根最高价；最高价突破 SAR → 反转多头；
//  - 新高/新低时 EP 更新且 af 每次累加 step，封顶 maxStep。
//
// 圆点颜色：上涨=K线上涨色、下跌=K线下跌色（见 theme.ts sarUp/sarDown），
// 由 SarMarkerPrimitive 插件按 trend 着色绘制。
import type { K, SarPoint } from './types'

/** re-export：SarPoint 定义在 types.ts（供 index.ts / primitive 统一导入）。 */
export type { SarPoint } from './types'

/** SAR 算法参数（均有东财默认值）。 */
export interface SarOptions {
  /** 加速因子步长，默认 0.02（东财）。 */
  step?: number
  /** 加速因子极限，默认 0.2（东财）。 */
  maxStep?: number
  /** 初始极值取样根数，默认 4（东财取前 4 根高低点）。 */
  initBars?: number
}

/**
 * 抛物线转向（SAR）。
 *
 * @remarks
 * 公式：多头 SAR = SAR_prev + af × (EP − SAR_prev)，EP 为区间最高价，
 * 新高后 af 累加 step（封顶 maxStep）；SAR 不得超过前两根最低价（跳空保护），
 * 最低价跌破 SAR 反转空头（SAR 重置为原 EP）。空头对称。
 * 返回的 value 即该根 K 线对应的 SAR 点位（多头在 K 线下方、空头在上方），
 * trend 为该根计算完成后的方向（供圆点按涨跌着色）。
 *
 * @param bars 升序 K 线数组。
 * @param opts 算法参数（step / maxStep / initBars，均有东财默认值）。
 * @returns 每根 K 线对应的 SAR 点（value + trend）。
 */
export const calcSAR = (bars: K[], opts: SarOptions = {}): SarPoint[] => {
  const { step = 0.02, maxStep = 0.2, initBars = 4 } = opts
  const n = bars.length
  if (n === 0) return []

  const out: SarPoint[] = new Array(n)
  const look = Math.min(initBars, n)

  // 初始趋势与初始极值。
  const first = bars[0]
  let trend = first.close! >= first.open! ? 1 : -1
  let ep: number
  let sar: number
  if (trend === 1) {
    let lo = Infinity
    for (let i = 0; i < look; i++) lo = Math.min(lo, bars[i].low!)
    sar = lo
    ep = first.high!
  } else {
    let hi = -Infinity
    for (let i = 0; i < look; i++) hi = Math.max(hi, bars[i].high!)
    sar = hi
    ep = first.low!
  }
  let af = step

  out[0] = { time: first.time, value: sar, trend: trend as 1 | -1 }

  for (let i = 1; i < n; i++) {
    const bar = bars[i]

    if (trend === 1) {
      // —— 多头：SAR 向上追赶 EP ——
      sar = sar + af * (ep - sar)
      // 跳空保护：SAR 不得超过前两根的最低价。
      if (i >= 2) sar = Math.min(sar, bars[i - 1].low!, bars[i - 2].low!)
      else sar = Math.min(sar, bars[i - 1].low!)

      if (bar.low! < sar) {
        // 反转空头：起始 SAR = 原 EP（区间最高价）。
        trend = -1
        sar = ep
        ep = bar.low!
        af = step
      } else {
        // 继续多头：创新高则抬升 EP、加速因子 +step。
        if (bar.high! > ep) {
          ep = bar.high!
          af = Math.min(af + step, maxStep)
        }
      }
    } else {
      // —— 空头：SAR 向下追赶 EP ——
      sar = sar + af * (ep - sar)
      // 跳空保护：SAR 不得低于前两根的最高价。
      if (i >= 2) sar = Math.max(sar, bars[i - 1].high!, bars[i - 2].high!)
      else sar = Math.max(sar, bars[i - 1].high!)

      if (bar.high! > sar) {
        // 反转多头：起始 SAR = 原 EP（区间最低价）。
        trend = 1
        sar = ep
        ep = bar.high!
        af = step
      } else {
        // 继续空头：创新低则下移 EP、加速因子 +step。
        if (bar.low! < ep) {
          ep = bar.low!
          af = Math.min(af + step, maxStep)
        }
      }
    }

    out[i] = { time: bar.time, value: sar, trend: trend as 1 | -1 }
  }

  return out
}
