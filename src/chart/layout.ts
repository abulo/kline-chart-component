/**
 * layout.ts —— 图表布局常量与高度算法（v1.4.3）
 *
 * 职责：集中管理 Pane 布局相关常量与纯函数，供控制器与单测引用。
 *  - paneCount：Pane 总数（pane0 顶部空 Pane + pane1 K 线）
 *  - topPaneHeight：顶部空 Pane 固定高度（px）
 *  - timeAxisHeight：底部时间轴高度（px，lightweight-charts v5 固定值）
 *  - calcFixedTopFactor：顶部固定高度 Pane 的 stretchFactor 计算
 */

/** Pane 总数（pane0 顶部空 Pane + pane1 K 线） */
export const paneCount = 2

/** 顶部空 Pane 固定高度（px） */
export const topPaneHeight = 24

/** 底部时间轴高度（px）：lightweight-charts v5 时间轴高度固定（无公开 API），
 *  时间轴显示时从可用总高度中扣除 */
export const timeAxisHeight = 28

/**
 * 计算顶部固定高度 Pane 的 stretchFactor（下方 Pane 的 stretchFactor 固定为 1）。
 * 使 pane0 实际高度 ≈ topHeight：factor / (factor + 1) × total = topHeight。
 * @param totalHeight 可用总高度（已扣除时间轴）
 * @param topHeight 顶部 Pane 目标高度
 * @returns pane0 的 stretchFactor（<=0 时返回 1 兜底，避免除零）
 */
export const calcFixedTopFactor = (totalHeight: number, topHeight: number): number => {
  const remainingHeight = totalHeight - topHeight
  return remainingHeight > 0 ? topHeight / remainingHeight : 1
}
