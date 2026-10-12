/**
 * layout.ts —— 图表布局常量与高度算法（v1.4.6）
 *
 * 职责：集中管理 Pane 布局相关常量与纯函数，供控制器与单测引用。
 *  - paneCount：Pane 总数（pane0 / pane1 顶部/底部空 Pane + pane1 K 线）
 *  - topPaneHeight：空 Pane 固定高度（px，顶部与底部一致）
 *  - calcFixedEdgeFactor：顶部与底部双固定 Pane 的 stretchFactor 计算
 *
 * 说明：时间轴采用库系统默认高度，本模块不再持有 timeAxisHeight 参数，
 * pane 高度计算直接基于容器高度。
 */

/** Pane 总数（pane0 顶部空 Pane + pane1 K 线 + pane2 底部空 Pane） */
export const paneCount = 3

/** 空 Pane 固定高度（px，顶部 / 底部一致） */
export const topPaneHeight = 24

/**
 * 计算顶部 / 底部双固定 Pane 的 stretchFactor（中间 Pane 的 stretchFactor 固定为 1）。
 * 使每个固定 Pane 实际高度 ≈ fixedHeight：
 *   factor / (2 × factor + 1) × total = fixedHeight
 * @param totalHeight 容器总高度（时间轴由库内部占位）
 * @param fixedHeight 每个固定 Pane 的目标高度
 * @returns 固定 Pane 的 stretchFactor（<=0 时返回 1 兜底，避免除零）
 */
export const calcFixedEdgeFactor = (totalHeight: number, fixedHeight: number): number => {
  const remainingHeight = totalHeight - 2 * fixedHeight
  return remainingHeight > 0 ? fixedHeight / remainingHeight : 1
}
