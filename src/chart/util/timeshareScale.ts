// timeshareScale.ts —— 分时 pane1 对称区间刻度计算（v1.7.1 用户定版算法）。
//
// 用户给出的算法（symmetricExpandRange）：对原始 最大值 / 中间值 / 最小值
// 做**区间对称扩展**，中间值保持不变：
//  - expandDistance = max(|maxVal − midVal|, |midVal − minVal|)（取较大单侧偏离）；
//  - newMax = midVal + expandDistance、newMid = midVal、newMin = midVal − expandDistance。
//
// 示例（用户给出）：中间 10、最高 12、最低 6 → expandDistance = max(2, 4) = 4
// → newMax = 14、newMid = 10、newMin = 6（刻度 14 / 10 / 6）。
//
// 刻度序列：在 [newMin, newMax] 内按固定等分数等分（像素等分 ↔ 线性价格 →
// 严格等差；首尾恰好 = newMax / newMin，中间 = mid），不随平移 / 缩放变化。

/** 区间对称扩展结果。 */
export interface SymmetricRange {
  /** 扩展后半幅（expandDistance = max(上偏, 下偏)）。 */
  expandDistance: number
  /** 新的最大值（mid + expandDistance）。 */
  newMax: number
  /** 中间值（保持原始 midVal 不变）。 */
  newMid: number
  /** 新的最小值（mid − expandDistance）。 */
  newMin: number
}

/**
 * 区间对称扩展（用户定版算法 symmetricExpandRange）。
 *
 * @remarks
 * 半幅取"上偏 / 下偏较大者"，中间值保持不变 → 新范围恰好包住原始区间且对称。
 *
 * @param maxVal 原始最大值（当天最高价）。
 * @param midVal 原始中间值（首根 preClose）。
 * @param minVal 原始最小值（当天最低价）。
 * @returns 对称扩展后的 newMax / newMid / newMin。
 */
export const symmetricExpandRange = (
  maxVal: number,
  midVal: number,
  minVal: number,
): SymmetricRange => {
  const distMaxMid = Math.abs(maxVal - midVal)
  const distMidMin = Math.abs(midVal - minVal)
  // 两边距离取较大者；相等时无需额外扩展（直接用该距离）。
  const expandDistance = Math.max(distMaxMid, distMidMin)
  return {
    expandDistance,
    newMax: midVal + expandDistance,
    newMid: midVal,
    newMin: midVal - expandDistance,
  }
}

/**
 * 生成分时 pane1 等差刻度序列。
 *
 * @remarks
 * 在对称区间 [mid−half, mid+half] 内等分（hCount 等分 → hCount + 1 个值，
 * 严格等差，首尾 = newMax / newMin，中间 = mid）；
 * 值由公式直接计算（确定性，不依赖坐标反算）。
 *
 * @param mid 中间值（首根 preClose）。
 * @param half 对称半幅（symmetricExpandRange.expandDistance）。
 * @param hCount 横向等分数（指标开 6 / 指标关 8）。
 * @returns 从 newMax 到 newMin 的等差序列（长度 hCount + 1）。
 */
export const buildTimeshareScaleValues = (
  mid: number,
  half: number,
  hCount: number,
): number[] => {
  const values: number[] = []
  for (let i = 0; i <= hCount; i++) {
    // 值 = mid + half × (1 − 2i / hCount)：i=0 → newMax；i=hCount/2 → mid；i=hCount → newMin。
    values.push(mid + half * (1 - (2 * i) / hCount))
  }
  return values
}
