// scaleRange.ts —— 附图指标 Y 轴值域计算（可见窗口极值 + 0 对称化）。
// 修复背景：pane5 曾用"全量数据 ±absMax 交替锚点 series"固定 scale 值域，
// 导致缩放（缩小 / 放大）时价格轴值域恒定、左刻度值不随可见数据变化；
// 改为按**可见逻辑范围**内指标极值计算，缩放即重算（见 SubIndicatorPaneManager）。
import type { IndicatorLine } from './types'

/**
 * 附图指标 Y 轴值域（价格轴上下界，对应左刻度首尾值）。
 */
export interface IndicatorScaleRange {
  /** 值域下界（对应底部刻度）。 */
  minValue: number
  /** 值域上界（对应顶部刻度）。 */
  maxValue: number
}

/**
 * 计算指定索引窗口内的附图指标值域。
 *
 * @remarks
 * 单趟扫描窗口内全部指标线的值取极值（O(窗口点数 × 线数)，分时 241 点 /
 * K 线 ~400 点，重绘级调用可忽略）；`zeroCentered` 为 true 时按绝对值最大者
 * 对称化（[-absMax, +absMax]，保证 0 轴居中、|max| = |min|）。
 * 窗口索引越界自动裁剪；无有效值返回 [0, 0]。
 *
 * @param lines 指标线数组（每线升序点序列，time 与图表时间轴一一对应）。
 * @param fromIndex 窗口起始索引（含，越界自动裁剪到 0）。
 * @param toIndex 窗口结束索引（含，越界自动裁剪到末点）。
 * @param zeroCentered 是否 0 对称（MACD / CCI 为 true）。
 * @returns 窗口值域（minValue / maxValue）。
 */
export const computeIndicatorScaleRange = (
  lines: readonly (readonly IndicatorLine[])[],
  fromIndex: number,
  toIndex: number,
  zeroCentered: boolean,
): IndicatorScaleRange => {
  let maxValue = -Infinity
  let minValue = Infinity
  for (const points of lines) {
    const start = Math.max(0, fromIndex)
    const end = Math.min(points.length - 1, toIndex)
    for (let i = start; i <= end; i++) {
      const value = points[i].value
      // NaN / Infinity 视为无效值跳过（指标预热段可能产生非有限值）。
      if (!Number.isFinite(value)) continue
      if (value > maxValue) maxValue = value
      if (value < minValue) minValue = value
    }
  }
  if (!Number.isFinite(maxValue) || !Number.isFinite(minValue)) {
    return { minValue: 0, maxValue: 0 }
  }
  if (zeroCentered) {
    const absMax = Math.max(Math.abs(maxValue), Math.abs(minValue), 0)
    return { minValue: -absMax, maxValue: absMax }
  }
  return { minValue, maxValue }
}
