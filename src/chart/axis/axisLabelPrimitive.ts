/**
 * axisLabelPrimitive.ts —— 价格轴刻度标签自绘 primitive（v1.4.42）
 *
 * 职责：通过 ISeriesPrimitive 挂载到内容 Pane 的 series 上，在价格轴（左刻度区）
 * 自绘刻度标签 —— 标签位置与 Pane 内自绘栅格横线**完全对齐**（同一等分公式）。
 *
 * v1.4.42 变更（文字设置统一，以十字星指示值为基准）：
 *   原实现走 priceAxisViews（ISeriesPrimitiveAxisView），由库渲染 axis 标签，
 *   库自带内边距 / 对齐细节，与自绘的十字星指示值（crosshairAxisLabelPaneView）
 *   文字设置不一致；改为 priceAxisPaneViews + zOrder 'top' 自绘，
 *   与指示值共用 drawAxisLabel 绘制函数（右对齐、右缘距 6px、背景左右 6px、
 *   高 18px、12px chartFontFamily、textColor / background）——两处文字完全一致。
 *
 * 标签行数 = 等分数 + 1（含首尾内嵌）：
 *  - 指标关：pane1 = 9 个值（8 等分）、pane3 = 3 个值（2 等分）；
 *  - 指标开：pane1 = 7 个值（6 等分）、pane3 / pane5 = 3 个值（2 等分）。
 *
 * 依赖：标签数据 AxisLabelView + 渲染视图 AxisLabelPaneView（同目录独立文件）。
 */
import {
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type SeriesAttachedParameter,
  type IChartApiBase,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from 'lightweight-charts'
import { AxisLabelView } from './axisLabelView'
import { AxisLabelPaneView } from './axisLabelPaneView'

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
  /** 全局字体（theme.chartFont：12px chartFontFamily，与指示值一致） */
  getFont: () => string
  /** 数值格式化（按 pane 语义：K 线价格 / 成交量万·亿 / 指标值） */
  format: (price: number) => string
  /**
   * 中间刻度固定值获取器（可选）：返回 number 时中间刻度标签固定显示该值
   * （如 MACD 中间 = 0）；返回 undefined 时按 scale 中间值显示。
   * 动态获取使同一 pane 切换指标（MACD ⇄ 其他）无需重建刻度 primitive。
   */
  getFixedMiddleValue?: () => number | undefined
}

export class AxisLabelPrimitive implements ISeriesPrimitive<Time> {
  /** 刻度标签配置（只读） */
  public readonly config: AxisLabelConfig

  /** 挂载后的 chart 引用（attached 时注入；标签求值时使用） */
  public chartApi: IChartApiBase<Time> | null = null

  /** 当前刻度标签集合（updateAllViews 时按栅格横线重建） */
  private labelViews: AxisLabelView[] = []

  /** 渲染视图（单例：构造时创建一次，priceAxisPaneViews 每次返回同一实例） */
  private readonly paneView: AxisLabelPaneView

  constructor(config: AxisLabelConfig) {
    this.config = config
    this.paneView = new AxisLabelPaneView(this)
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

  /** 读取当前刻度标签数据（渲染视图绘制用） */
  getLabels(): readonly AxisLabelView[] {
    return this.labelViews
  }

  /** 价格轴 Pane 视图（zOrder 'top'，自绘，与十字星指示值同一层） */
  priceAxisPaneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView]
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
      // 首尾内嵌（避免标签块 / 文字被价格轴边缘裁切）
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
            i === Math.floor(hCount / 2) ? this.config.getFixedMiddleValue?.() : undefined,
        }),
      )
    }
    return views
  }
}

/** 首尾刻度内嵌偏移（px）：12px 字体下保证标签完整可见、不与轴边缘贴边 */
const AXIS_LABEL_PAD = 8
