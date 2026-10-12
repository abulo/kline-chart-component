/**
 * layout.ts —— 图表布局常量与高度算法（v1.4.15）
 *
 * 职责：集中管理 Pane 布局相关常量与纯函数，供控制器与单测引用。
 *
 * 布局（6 Pane 分 3 组）：
 *   main      组：pane0（空 Pane） + pane1（K 线）
 *   volume    组：pane2（空 Pane） + pane3（成交量）
 *   indicator 组：pane4（空 Pane） + pane5（指标）
 *
 * 高度分配（时间轴开 / 关一致）：
 *   库可用高度 H = 容器高度 - 时间轴高度（库默认 28px，关时为 0） - 分隔线总高
 *   固定空 Pane 总高 = 3 × topPaneHeight（pane0 / pane2 / pane4）
 *   剩余 R = H - 3×topPaneHeight，内容 Pane 按组比例分配：
 *     main 组内容 pane1 = 0.6×R（组 = pane0 24px + pane1）
 *     volume 组内容 pane3 = 0.2×R（组 = pane2 24px + pane3）
 *     indicator 组内容 pane5 = 0.2×R（组 = pane4 24px + pane5）
 *   总高度 = 3×fixed + R = H，完全铺满库可用高度。
 *
 * 像素因子方案（精确无舍入误差）：
 *   控制器把每个 pane 的 stretchFactor 直接设为目标**像素高度**，
 *   则库 totalStretch = Σ高度 = H → stretchPixels = H / Σ = 1，
 *   非最后 pane = round(factor×1) = factor（整数）精确，
 *   最后 pane（pane5）= 剩余 = 目标高度，同样精确。
 */

/** Pane 总数（pane0 空 + pane1 K 线 + pane2 空 + pane3 成交量 + pane4 空 + pane5 指标） */
export const paneCount = 6

/** 固定空 Pane 数量（pane0 / pane2 / pane4，全部与 topPaneHeight 一致） */
export const fixedPaneCount = 3

/** 空 Pane 固定高度（px，各组内顶部 / 底部一致） */
export const topPaneHeight = 24

/** 三组高度比例（main : volume : indicator = 60 : 20 : 20） */
export const groupRatios = {
  /** main 组（pane0 + pane1，K 线主图）占比 */
  main: 0.6,
  /** volume 组（pane2 + pane3，成交量）占比 */
  volume: 0.2,
  /** indicator 组（pane4 + pane5，指标）占比 */
  indicator: 0.2,
} as const

/**
 * 计算 6 个 Pane 的目标像素高度。
 *
 * 分配规则（时间轴开 / 关一致，仅 totalHeight 不同）：
 *   剩余 R = totalHeight - 3×fixedHeight（空 Pane 高度已扣除，不参与比例）
 *   内容 Pane 按组比例分配：pane1 = 0.6×R、pane3 = 0.2×R、pane5 = 0.2×R
 *   空 Pane 固定：pane0 / pane2 / pane4 = fixedHeight
 *   总高度 = 3×fixed + R = totalHeight（库可用高度，完全铺满）
 *
 * @param totalHeight 库实际可用总高度（已扣时间轴与分隔线）
 * @param fixedHeight 每个空 Pane 的目标高度
 * @param ratios      三组高度比例（默认 60:20:20）
 * @returns 六个 Pane 像素高度数组 [pane0..pane5]（剩余不足时全返 1 兜底）
 */
export const calcPaneHeights = (
  totalHeight: number,
  fixedHeight: number,
  ratios: { main: number; volume: number; indicator: number } = groupRatios,
): number[] => {
  const fixedTotal = fixedPaneCount * fixedHeight
  const remaining = totalHeight - fixedTotal
  if (remaining <= 0) {
    return [1, 1, 1, 1, 1, 1]
  }
  return [
    fixedHeight,
    remaining * ratios.main,
    fixedHeight,
    remaining * ratios.volume,
    fixedHeight,
    remaining * ratios.indicator,
  ]
}
