/**
 * axisLabelPrimitive.ts —— 价格轴刻度标签自绘 primitive（v1.4.27）
 *
 * 职责：通过 ISeriesPrimitive 挂载到内容 Pane 的 series 上，在价格轴（左刻度区）
 * 自绘刻度标签 —— 标签位置与 Pane 内自绘栅格横线**完全对齐**（同一等分公式）。
 *
 * 背景：库 priceScale 的刻度标签位置由库按"nice ticks"自动计算，与自绘等分栅格
 * 不对齐。本 primitive 关闭库标签（series priceFormat formatter 返回 ''）后，
 * 通过 ISeriesPrimitiveAxisView 的 fixedCoordinate 在栅格横线 y 处绘制标签，
 * 标签值 = 该 y 坐标对应的当前价格（coordinateToPrice 反算），随数据平移 / 缩放
 * 实时变化、位置固定。
 *
 * 标签行数 = 等分数 + 1（含首尾内嵌）：
 *  - 指标关：pane1 = 9 个值（8 等分）、pane3 = 3 个值（2 等分）；
 *  - 指标开：pane1 = 7 个值（6 等分）、pane3 / pane5 = 3 个值（2 等分）。
 *
 * 依赖：标签对象 AxisLabelView（同目录独立文件，实现 ISeriesPrimitiveAxisView）。
 */
import {
  type ISeriesPrimitive,
  type ISeriesPrimitiveAxisView,
  type SeriesAttachedParameter,
  type IChartApiBase,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from 'lightweight-charts'
import { AxisLabelView } from './axisLabelView'

export interface AxisLabelConfig {
  /** 所属 series（坐标反算用：coordinateToPrice 取当前价格） */
  series: ISeriesApi<SeriesType>
  /** Pane 索引（高度获取用） */
  getPaneIndex: () => number
  /** 横向等分数（与 GridPrimitive 同一配置，保证标签与栅格横线对齐） */
  getHorizontalCount: () => number
  /** 标签文字颜色（主题 textColor） */
  getColor: () => string
  /** 标签背景颜色（主题 background） */
  getBackColor: () => string
  /** 数值格式化（按 pane 语义：K 线价格 / 成交量万·亿 / 指标值） */
  format: (price: number) => string
  /** 中间刻度固定值（可选）：设置后中间刻度标签固定显示该值（如 MACD 中间 = 0） */
  fixedMiddleValue?: number
}

export class AxisLabelPrimitive implements ISeriesPrimitive<Time> {
  /** 刻度标签配置（只读） */
  public readonly config: AxisLabelConfig

  /** 挂载后的 chart 引用（attached 时注入；draw / 标签求值时使用） */
  public chartApi: IChartApiBase<Time> | null = null

  /** 当前刻度标签集合（updateAllViews 时按栅格横线重建） */
  private labelViews: AxisLabelView[] = []

  constructor(config: AxisLabelConfig) {
    this.config = config
  }

  /** primitive 挂载：保存 chart 引用并立即构建标签 */
  attached(param: SeriesAttachedParameter<Time>): void {
    this.chartApi = param.chart
  }

  /** primitive 卸载：清空引用与标签（防内存泄漏） */
  detached(): void {
    this.chartApi = null
    this.labelViews = []
  }

  /** 每次图表更新：按当前栅格等分数重建标签集合（位置与横线一致） */
  updateAllViews(): void {
    this.labelViews = this.buildLabelViews()
  }

  /** 价格轴标签视图（库自动渲染背景块 + 文字；fixedCoordinate 强制对齐栅格横线） */
  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this.labelViews
  }

  /** 构建标签：在每条等分刻度处生成一个标签（值 = 该处价格，实时反算）
   * 刻度行数 = 等分数 + 1（含首尾）：
   *  - 指标关：pane1 = 8 等分 → 9 个值；pane3 = 2 等分 → 3 个值；
   *  - 指标开：pane1 = 6 等分 → 7 个值；pane3 / pane5 = 2 等分 → 3 个值。
   * 中间刻度与栅格横线同一等分公式（i = 1..count-1）；
   * 首尾刻度（i = 0 / count）内嵌 AXIS_LABEL_PAD 像素，保证文字完整可见。 */
  private buildLabelViews = (): AxisLabelView[] => {
    const chartApi = this.chartApi
    if (chartApi === null) return []
    const paneIndex = this.config.getPaneIndex()
    const panes = chartApi.panes()
    if (paneIndex < 0 || paneIndex >= panes.length) return []
    const paneHeight = panes[paneIndex].getHeight()
    const hCount = this.config.getHorizontalCount()
    const views: AxisLabelView[] = []
    for (let i = 0; i <= hCount; i++) {
      // 首尾内嵌（避免库渲染的背景块 / 文字被价格轴边缘裁切）
      const y =
        i === 0
          ? AXIS_LABEL_PAD
          : i === hCount
            ? paneHeight - AXIS_LABEL_PAD
            : Math.round((paneHeight * i) / hCount)
      views.push(
        new AxisLabelView({
          primitive: this,
          coordinate: y,
          // 中间刻度固定值（如 MACD 中间刻度 = 0，不受 scale 中间值影响）
          fixedValue:
            i === Math.floor(hCount / 2) ? this.config.fixedMiddleValue : undefined,
        }),
      )
    }
    return views
  }
}

/** 首尾刻度内嵌偏移（px）：12px 字体下保证标签完整可见、不与轴边缘贴边 */
const AXIS_LABEL_PAD = 8
