/**
 * layout.ts —— 图表布局常量与高度算法（v1.4.4）
 *
 * 职责：集中管理 Pane 布局相关常量与纯函数，供控制器与单测引用。
 *  - paneCount：Pane 总数（pane0 / pane1 顶部/底部空 Pane + pane1 K 线）
 *  - topPaneHeight：空 Pane 固定高度（px，顶部与底部一致）
 *  - timeAxisHeight：底部时间轴高度（px，lightweight-charts v5 固定值 25px）
 *  - calcFixedEdgeFactor：顶部与底部双固定 Pane 的 stretchFactor 计算
 */

/** Pane 总数（pane0 顶部空 Pane + pane1 K 线 + pane2 底部空 Pane） */
export const paneCount = 3

/** 空 Pane 固定高度（px，顶部 / 底部一致） */
export const topPaneHeight = 24

/** 底部时间轴高度（px）：lightweight-charts v5 时间轴 cell 高度固定 25px
 * （无公开 API，按库源码常量取值），时间轴显示时从可用总高度中扣除 */
export const timeAxisHeight = 28

/**
 * 计算顶部 / 底部双固定 Pane 的 stretchFactor（中间 Pane 的 stretchFactor 固定为 1）。
 * 使每个固定 Pane 实际高度 ≈ fixedHeight：
 *   factor / (2 × factor + 1) × total = fixedHeight
 * @param totalHeight 可用总高度（已扣除时间轴）
 * @param fixedHeight 每个固定 Pane 的目标高度
 * @returns 固定 Pane 的 stretchFactor（<=0 时返回 1 兜底，避免除零）
 */
export const calcFixedEdgeFactor = (totalHeight: number, fixedHeight: number): number => {
  const remainingHeight = totalHeight - 2 * fixedHeight
  return remainingHeight > 0 ? fixedHeight / remainingHeight : 1
}
