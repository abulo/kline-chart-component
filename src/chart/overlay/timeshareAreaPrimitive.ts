// timeshareAreaPrimitive.ts —— 分时价格曲线下方的渐变背景（自绘 primitive）。
// 需求：分时模式下以 price 为顶，向下铺一块"到底边"的渐变背景，颜色由底部（深）
// 到顶部（浅）过渡，深浅两套主题各配一对颜色（theme.timeshareAreaTop / Bottom）。
//
// 层级：zOrder 'bottom'（pane 主 canvas 最底层）→ 位于栅格（normal 层 primitive）、
// 价格线 / 均价线（series 层）之下，因此背景只做"底色"，不会盖住栅格线与线体，
// 也不会干扰自绘十字星（top 层）与 tooltip。
//
// 数据：取 timeshareManager.renderRows 中带 bar 的真实分时点 —— 占位行（bar = null）
// 不参与，否则面积会提前铺进未来的空白槽位（1 日分时开盘前尤其明显）。
import {
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type ITimeScaleApi,
  type Time,
} from 'lightweight-charts'
import type { TimeshareRenderRow } from '../core/timeshareManager'
import { TimeshareAreaPaneView } from './timeshareAreaPaneView'

/** 分时渐变背景配置。 */
export interface TimeshareAreaPrimitiveConfig {
  /** 可见判定（仅分时周期绘制；K 线周期直接跳过，draw 现取）。 */
  getVisible: () => boolean
  /** 渲染行（含占位行；draw 内只取带 bar 的真实点）。 */
  getRows: () => TimeshareRenderRow[]
  /** 渐变顶部颜色（贴价格线，最淡；draw 现取 → 主题切换自动跟随）。 */
  getTopColor: () => string
  /** 渐变底部颜色（pane 底边，最深；draw 现取 → 主题切换自动跟随）。 */
  getBottomColor: () => string
  /** 所属 series（priceToCoordinate 反算价格 y）。 */
  series: ISeriesApi<'Line'>
  /** x 坐标转换 timeScale（chart.timeScale()；ISeriesApi 无公开 timeScale 方法）。 */
  getTimeScale: () => ITimeScaleApi<Time>
}

/**
 * 把分时价格点（已转换为像素坐标）整理成面积多边形顶点。
 *
 * @remarks
 * 抽成纯函数便于单元测试（见 tests/timeshareArea.test.ts）：
 *  1. 剔除非法坐标与视口外（x ∉ [0, width]）的点 —— 分时为整窗固定视口，正常不越界，
 *     缩放 / 像素补偿的边界情况剔除即可，不影响面积形状；
 *  2. y 钳制到 [0, height]：价格高于 pane 顶部时面积顶到屏幕顶，反之贴底边；
 *  3. 顶点顺序 = 价格折线（从左到右）→ 右下角 → 左下角，形成闭合区域；
 *     有效点少于 2 个（无法成面）时返回 null。
 *
 * @param points 价格折线的像素坐标（顺序 = 时间升序）。
 * @param width pane 宽度（像素）。
 * @param height pane 高度（像素）。
 * @returns 闭合多边形顶点；点数不足时返回 null。
 */
export const buildTimeshareAreaPolygon = (
  points: ReadonlyArray<{ x: number; y: number }>,
  width: number,
  height: number,
): ReadonlyArray<{ x: number; y: number }> | null => {
  const inside: { x: number; y: number }[] = []
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    if (point.x < 0 || point.x > width) continue
    inside.push({ x: point.x, y: Math.max(0, Math.min(height, point.y)) })
  }
  if (inside.length < 2) return null
  const first = inside[0]
  const last = inside[inside.length - 1]
  return [...inside, { x: last.x, y: height }, { x: first.x, y: height }]
}

/**
 * 分时价格区渐变背景 primitive。
 *
 * @remarks
 * 以价格曲线为顶、pane 底边为底铺一层自上而下"淡 → 浓"的渐变（东财风格）；
 * 仅分时周期绘制，颜色 / 数据每次 draw 现取 —— 实时追加、周期切换、主题切换均自动跟随。
 */
export class TimeshareAreaPrimitive implements ISeriesPrimitive<Time> {
  /** 自绘配置（只读）。 */
  public readonly config: TimeshareAreaPrimitiveConfig

  /** 渲染视图（单例：构造时创建一次，paneViews 每次返回同一实例，避免每帧重复创建对象）。 */
  private readonly paneView: TimeshareAreaPaneView

  constructor(config: TimeshareAreaPrimitiveConfig) {
    this.config = config
    this.paneView = new TimeshareAreaPaneView(this)
  }

  /** pane 视图（zOrder 'bottom'：绘制在栅格与各 series 之下）。 */
  paneViews = (): readonly IPrimitivePaneView[] => {
    return [this.paneView]
  }
}
