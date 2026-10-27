// layout.ts —— 图表布局常量与高度算法。
// 职责：集中管理 Pane 布局相关常量与纯函数，供控制器与单测引用。
//
// 布局（指标开：6 Pane 分 3 组；指标关：4 Pane 分 2 组）：
//   main    组：pane0（空 Pane） + pane1（K 线）
//   volume  组：pane2（空 Pane） + pane3（成交量）
//   indicator 组（仅指标开）：pane4（空 Pane） + pane5（指标）
//
// 高度分配（时间轴开 / 关一致，仅库可用高度不同）：
//   库可用高度 H = 容器高度 - 时间轴高度（库默认 28px，关时为 0） - 分隔线总高
//   固定空 Pane 总高 = 固定 Pane 数量 × topPaneHeight
//   剩余 R = H - 固定空 Pane 总高（空 Pane 高度已扣除，不参与比例）
//   内容 Pane 按组比例分配：
//     指标开：pane1 = 0.6R、pane3 = 0.2R、pane5 = 0.2R（60:20:20）
//     指标关：pane1 = 0.8R、pane3 = 0.2R（80:20）
//   空 Pane 固定 topPaneHeight；总高度 = 固定 + R = H，完全铺满。
//
// 像素因子方案（精确无舍入误差）：
//   控制器把每个 pane 的 stretchFactor 直接设为目标像素高度，
//   则库 totalStretch = Σ高度 = H → stretchPixels = H / Σ = 1，
//   非最后 pane = round(factor×1) = factor（整数）精确，
//   最后 pane = 剩余 = 目标高度，同样精确。

/** 指标开启时的 Pane 总数（pane0 空 + pane1 K 线 + pane2 空 + pane3 成交量 + pane4 空 + pane5 指标）。 */
export const paneCount = 6

/** 指标关闭时的 Pane 总数（pane0 空 + pane1 K 线 + pane2 空 + pane3 成交量）。 */
export const paneCountWithoutIndicator = 4

/** 指标开启时的固定空 Pane 数量（pane0 / pane2 / pane4）。 */
export const fixedPaneCount = 3

/** 指标关闭时的固定空 Pane 数量（pane0 / pane2）。 */
export const fixedPaneCountWithoutIndicator = 2

/** 空 Pane 固定高度（px，各组内顶部 / 底部一致）。 */
export const topPaneHeight = 22

/** 组高度比例（指标开启）：main : volume : indicator = 60 : 20 : 20。 */
export const groupRatios = {
  /** main 组（pane0 + pane1，K 线主图）占比。 */
  main: 0.6,
  /** volume 组（pane2 + pane3，成交量）占比。 */
  volume: 0.2,
  /** indicator 组（pane4 + pane5，指标）占比。 */
  indicator: 0.2,
} as const

/** 组高度比例（指标关闭）：main : volume = 80 : 20（indicator 恒 0，不创建）。 */
export const groupRatiosWithoutIndicator = {
  /** main 组（pane0 + pane1，K 线主图）占比。 */
  main: 0.8,
  /** volume 组（pane2 + pane3，成交量）占比。 */
  volume: 0.2,
  /** indicator 组：恒 0（未创建，仅作类型对齐占位）。 */
  indicator: 0,
} as const

/**
 * 组高度比例（成交量关闭 + 指标开启）：main : indicator = 80 : 20。
 *
 * @remarks
 * 与 indicator 关闭时的 main : volume = 80 : 20 对称——主图占比恒定 80，
 * 附图组 / 成交量组占 20（60:40 → 80:20 调整）。
 */
export const groupRatiosWithoutVolume = {
  /** main 组（pane0 + pane1，K 线主图）占比。 */
  main: 0.8,
  /** volume 组：恒 0（未创建，仅作类型对齐占位）。 */
  volume: 0,
  /** indicator 组（pane4 + pane5，指标）占比。 */
  indicator: 0.2,
} as const

/** 组高度比例（成交量关闭 + 指标关闭）：仅 main = 100%（2 Pane：pane0 + pane1）。 */
export const groupRatiosKlineOnly = {
  /** main 组（pane0 + pane1，K 线主图）占比。 */
  main: 1,
  /** volume 组：恒 0（未创建）。 */
  volume: 0,
  /** indicator 组：恒 0（未创建）。 */
  indicator: 0,
} as const

/** 组比例结构（main / volume / indicator）。 */
export interface GroupRatios {
  /** main 组占比。 */
  main: number
  /** volume 组占比。 */
  volume: number
  /** indicator 组占比（0 表示指标关闭，不创建 indicator 组）。 */
  indicator: number
}

/**
 * 计算各 Pane 的目标像素高度（指标开返回 6 个，指标关返回 4 个）。
 *
 * @remarks
 * 分配规则（时间轴开 / 关一致，仅 totalHeight 不同）：
 *   剩余 R = totalHeight - fixedCount×fixedHeight（空 Pane 高度已扣除，不参与比例）
 *   内容 Pane 按组比例分配；空 Pane 固定 fixedHeight；
 *   总高度 = fixedCount×fixedHeight + R = totalHeight（库可用高度，完全铺满）。
 *
 * @param totalHeight 库实际可用总高度（已扣时间轴与分隔线）。
 * @param fixedHeight 每个空 Pane 的目标高度。
 * @param fixedCount 固定空 Pane 数量（指标开 3 / 指标关 2）。
 * @param ratios 组高度比例（指标开 60:20:20 / 指标关 80:20）。
 * @returns Pane 像素高度数组（指标开 6 项 / 指标关 4 项；剩余不足时全返 1 兜底）。
 */
export const calcPaneHeights = (
  totalHeight: number,
  fixedHeight: number,
  fixedCount: number,
  ratios: GroupRatios,
): number[] => {
  const fixedTotal = fixedCount * fixedHeight
  const remaining = totalHeight - fixedTotal
  if (remaining <= 0) {
    return new Array<number>(fixedCount * 2).fill(1)
  }
  const paneHeights: number[] = [fixedHeight, remaining * ratios.main]
  // 成交量开启（volume > 0）时追加 volume 组的空 Pane + 内容 Pane。
  if (ratios.volume > 0) {
    paneHeights.push(fixedHeight, remaining * ratios.volume)
  }
  // 指标开启（indicator > 0）时追加 indicator 组的空 Pane + 内容 Pane。
  if (ratios.indicator > 0) {
    paneHeights.push(fixedHeight, remaining * ratios.indicator)
  }
  return paneHeights
}
