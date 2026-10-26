/**
 * paneLayout.ts —— Pane 高度分配工具（v1.7.1 自 KLineChartController.ts 拆分）
 *
 * 纯计算 + chart API 操作，无 controller 状态读写（高度结果经回调回写）：
 *  - applyPaneStretchFactors：固定空 Pane（pane0/2/4）设同一像素因子 topPaneHeight
 *    （绝对相等），内容 Pane 按组比例分配剩余高度（指标开 60:20:20 / 关 80:20）
 *  - calcPaneTop：所在 pane 顶部 y（相对图表 canvas）= 前序 Pane 像素高度累加
 *    （十字星 tooltip 定位）
 */
import { LIBRARY_TIME_AXIS_HEIGHT } from './constants'
import {
  fixedPaneCount,
  fixedPaneCountWithoutIndicator,
  topPaneHeight,
  groupRatios,
  groupRatiosWithoutIndicator,
  groupRatiosWithoutVolume,
  groupRatiosKlineOnly,
  calcPaneHeights,
} from './layout'

/** applyPaneStretchFactors 依赖（controller 注入） */
export interface PaneStretchDeps {
  chart: ReturnType<typeof import('lightweight-charts').createChart>
  /** 图表容器（可用高度 = 容器高 − 时间轴高） */
  container: HTMLElement
  /** 成交量组是否开启（pane2/3；关时组比例 80:20 / 仅 K 线 100%）
   *  v1.7.2：与指标开关组合出四态布局 */
  getShowVolume: () => boolean
  /** 附图指标层是否开启（固定 Pane 数 3/2、组比例 60:20:20 / 80:20） */
  getShowIndicator: () => boolean
  /** 高度结果回写（controller 保存 paneHeights，供 getPaneTop / tooltip 定位） */
  onHeights: (heights: number[]) => void
}

/** 高度分配：固定空 Pane 设同一像素因子（绝对相等），内容 Pane 按组比例分配剩余高度 */
export const applyPaneStretchFactors = (deps: PaneStretchDeps): void => {
  const { chart, container, getShowVolume, getShowIndicator, onHeights } = deps
  const panes = chart.panes()
  if (panes.length < 2) return
  // 库实际可用高度 = 容器高度 - 时间轴高度（显隐按库当前状态）。
  // Pane 之间无间隔：库分隔线高度已通过 patch（node_modules dist
  // SeparatorConstants.SeparatorHeight: 1 → 0）置零，pane 紧贴、无 1px 预留。
  const timeAxisHeight = chart.timeScale().options().visible
    ? LIBRARY_TIME_AXIS_HEIGHT
    : 0
  const usableHeight = container.clientHeight - timeAxisHeight
  // 四态布局（v1.7.2，成交量开关 × 指标开关）：
  //  vol开+ind开：3 固定 Pane、60:20:20（6 Pane）
  //  vol开+ind关：2 固定 Pane、80:20（4 Pane：main + volume）
  //  vol关+ind开：2 固定 Pane、80:20（4 Pane：main + indicator，与 ind 关 80:20 对称）
  //  vol关+ind关：1 固定 Pane、100%（2 Pane：仅 K 线）
  const showVolume = getShowVolume()
  const showIndicator = getShowIndicator()
  const fixedCount =
    showVolume && showIndicator
      ? fixedPaneCount
      : showVolume || showIndicator
        ? fixedPaneCountWithoutIndicator
        : 1
  const ratios = showVolume && showIndicator
    ? groupRatios
    : showVolume
      ? groupRatiosWithoutIndicator
      : showIndicator
        ? groupRatiosWithoutVolume
        : groupRatiosKlineOnly
  const paneHeights = calcPaneHeights(usableHeight, topPaneHeight, fixedCount, ratios)
  panes.forEach((pane, index) => pane.setStretchFactor(paneHeights[index]))
  // v1.6.35：记录各 Pane 像素高度（十字星 tooltip 定位：paneTop = 前序 Pane 高度累加）
  onHeights(paneHeights)
}

/** 所在 pane 顶部 y（相对图表 canvas）：前序 Pane 像素高度累加（v1.6.35 tooltip 定位） */
export const calcPaneTop = (heights: number[], paneIndex: number): number => {
  let top = 0
  for (let i = 0; i < paneIndex; i++) top += heights[i] ?? 0
  return top
}
