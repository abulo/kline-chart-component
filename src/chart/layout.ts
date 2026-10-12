/**
 * layout.ts —— 图表布局常量与高度算法（v1.4.8）
 *
 * 职责：集中管理 Pane 布局相关常量与纯函数，供控制器与单测引用。
 *  - paneCount：Pane 总数（pane0 顶部空 Pane + pane1 K 线 + pane2 底部空 Pane
 *    + pane3 成交量）
 *  - topPaneHeight：空 Pane 固定高度（px，顶部与底部一致）
 *  - volumeRatio：成交量 Pane 高度 / K 线 Pane 高度
 *  - calcPaneFactors：四 Pane 的 stretchFactor 计算（pane0/pane2 固定、
 *    pane1 K 线、pane3 成交量按比例）
 *
 * 说明：时间轴采用库系统默认高度（28px，控制器私有常量 LIBRARY_TIME_AXIS_HEIGHT），
 * 本模块不持有时间轴高度参数；pane 高度计算基于库实际可用高度
 * （容器 - 时间轴 - 分隔线）。
 */

/** Pane 总数（pane0 顶部空 Pane + pane1 K 线 + pane2 底部空 Pane + pane3 成交量） */
export const paneCount = 4

/** 空 Pane 固定高度（px，顶部 / 底部一致） */
export const topPaneHeight = 24

/** 成交量 Pane 高度 / K 线 Pane 高度（0.25 = 量 : K 线 = 1 : 4） */
export const volumeRatio = 0.25

/**
 * 计算四 Pane 的 stretchFactor：
 *   pane0 / pane2（空 Pane）= fixedHeight（两两同 factor，绝对相等）
 *   pane1（K 线）          = 1
 *   pane3（成交量）         = volumeRatio（相对 K 线）
 *
 * 数学依据（库 _adjustSizeImpl：非最后 Pane 用 round(f×S)，最后 Pane = 剩余）：
 *   stretchPixels S = (total - 2×fixed) / (1 + ratio)
 *   fixedFactor = fixed / S → fixedFactor × S = fixed 精确；
 *   pane0 = round(fixed) = fixed、pane2 = round(fixed) = fixed → 绝对相等；
 *   中间 Pane（K 线）round 误差由最后 Pane（成交量）吸收。
 *
 * @param totalHeight 库实际可用总高度（已扣时间轴与分隔线）
 * @param fixedHeight 每个空 Pane 的目标高度
 * @param ratio       成交量 Pane 相对 K 线 Pane 的高度比
 * @returns 三个 stretchFactor（S <= 0 时全部返回 1 兜底，避免除零）
 */
export const calcPaneFactors = (
  totalHeight: number,
  fixedHeight: number,
  ratio: number,
): { fixedFactor: number; klineFactor: number; volumeFactor: number } => {
  const stretchPixels = (totalHeight - 2 * fixedHeight) / (1 + ratio)
  if (stretchPixels <= 0) {
    return { fixedFactor: 1, klineFactor: 1, volumeFactor: 1 }
  }
  return {
    fixedFactor: fixedHeight / stretchPixels,
    klineFactor: 1,
    volumeFactor: ratio,
  }
}
