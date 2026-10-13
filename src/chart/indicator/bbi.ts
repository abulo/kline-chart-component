/**
 * bbi.ts —— 多空指标 BBI（Pane0 主图指标之一）
 *
 * 东财口径：
 *   BBI = (MA(3) + MA(6) + MA(12) + MA(24)) / 4
 * 各 MA 为简单移动平均（复用 ma.ts 的 calcMA）；因周期不同起始下标不同，
 * 按 time 对齐后计算；前 23 根不输出（受最长周期 MA24 限制）。
 * 颜色见 theme.ts（bbi #B0BEC5）。
 */
import type { IndicatorLine, K } from './types'
import { calcMA } from './ma'

/** 多空指标 BBI */
export const calcBBI = (bars: K[]): IndicatorLine[] => {
  const ma3 = calcMA(bars, 3)
  const ma6 = calcMA(bars, 6)
  const ma12 = calcMA(bars, 12)
  const ma24 = calcMA(bars, 24)

  // 以最长的 MA24 为基准，其余周期按 time 建立映射
  const byTime = (lines: IndicatorLine[]) => new Map(lines.map((l) => [l.time, l.value]))
  const m3 = byTime(ma3)
  const m6 = byTime(ma6)
  const m12 = byTime(ma12)

  const out: IndicatorLine[] = []
  for (const l of ma24) {
    const a = m3.get(l.time)
    const b = m6.get(l.time)
    const c = m12.get(l.time)
    if (a === undefined || b === undefined || c === undefined) continue
    out.push({ time: l.time, value: (a + b + c + l.value) / 4 })
  }
  return out
}
