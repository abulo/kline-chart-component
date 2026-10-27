// axisLabelPrimitive.ts —— 价格轴刻度标签自绘 primitive。
// 职责：通过 ISeriesPrimitive 挂载到内容 Pane 的 series 上，在价格轴（左刻度区）
// 自绘刻度标签 —— 标签位置与 Pane 内自绘栅格横线完全对齐（同一等分公式）。
//
// 文字设置统一（以十字星指示值为基准）：
//   原实现走 priceAxisViews（ISeriesPrimitiveAxisView），由库渲染 axis 标签，
//   库自带内边距 / 对齐细节，与自绘的十字星指示值（crosshairAxisLabelPaneView）
//   文字设置不一致；改为 priceAxisPaneViews + zOrder 'top' 自绘，
//   与指示值共用 drawAxisLabel 绘制函数（右对齐、右缘距 6px、背景左右 6px、
//   高 18px、12px chartFontFamily、textColor / background）——两处文字完全一致。
//
// 标签行数 = 等分数 + 1（含首尾内嵌）：
//  - 指标关：pane1 = 9 个值（8 等分）、pane3 = 3 个值（2 等分）；
//  - 指标开：pane1 = 7 个值（6 等分）、pane3 / pane5 = 3 个值（2 等分）。
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

/** 刻度标签 primitive 配置。 */
export interface AxisLabelConfig {
  /**
   * 所属 series（坐标反算用：coordinateToPrice 取当前价格）。
   * 支持函数：分时周期 pane1 动态切换 price 线 / K 线周期用 klineSeries。
   */
  series: ISeriesApi<SeriesType> | (() => ISeriesApi<SeriesType>)
  /** Pane 索引（高度获取用）。 */
  getPaneIndex: () => number
  /** 横向等分数（与 GridPrimitive 同一配置，保证标签与栅格横线对齐）。 */
  getHorizontalCount: () => number
  /** 标签文字颜色（主题 textColor）。 */
  getColor: () => string
  /** 标签背景颜色（主题 background）。 */
  getBackColor: () => string
  /** 全局字体（theme.chartFont：12px chartFontFamily，与指示值一致）。 */
  getFont: () => string
  /**
   * 数值格式化（按 pane 语义：K 线价格 / 成交量万·亿 / 指标值 /
   * 分时右刻度百分比）。
   */
  format: (price: number) => string
  /**
   * 标签对齐方向（可选）：'right' = 文字右对齐贴刻度区右缘（默认，左刻度）；
   * 'left' = 文字左对齐贴刻度区左缘（右刻度区专用——与左刻度右对齐
   * 形成对称：两区文字均"朝向数据区"，边距同为 AXIS_LABEL_PAD_X）。
   */
  align?: 'right' | 'left'
  /**
   * 标签启用开关（可选）：返回 false 时本次更新不生成任何标签
   * （updateAllViews 置空 labelViews，视图 draw 无输出）。
   * 右刻度专用：分时周期 true（百分比刻度），K 线周期 false（右刻度区保持空白）。
   */
  getEnabled?: () => boolean
  /**
   * 标签按值着色回调（可选）：返回该值应显示的文字颜色；
   * 返回 undefined 时使用 getColor（默认单色）。
   * 分时 pane1：价格 / 百分比 vs 首根 preClose 三态 —— 大于红 / 小于绿 / 等于平盘色。
   * 注意：仅文字着色，背景块颜色保持 getBackColor 不变（深浅系统一）。
   */
  getValueColor?: (value: number) => string | undefined
  /**
   * 外部价格回调（可选）：给定标签 y 坐标返回该处价格。
   * 右刻度专用：取左刻度同一 price scale 的 coordinateToPrice(y) →
   * 左右刻度在同一个 y 上显示同一价格（左 = 价格、右 = 百分比，值严格对齐）。
   * 返回 null / undefined 时回退 series.coordinateToPrice。
   */
  getPrice?: (y: number) => number | null | undefined
  /**
   * 中间刻度固定值获取器（可选）：返回 number 时中间刻度标签固定显示该值
   * （如 MACD 中间 = 0）；返回 undefined 时按 scale 中间值显示。
   * 动态获取使同一 pane 切换指标（MACD ⇄ 其他）无需重建刻度 primitive。
   */
  getFixedMiddleValue?: () => number | undefined
  /**
   * 首尾刻度固定值获取器（可选）：返回 { topValue, bottomValue } 时，
   * 首尾刻度（i = 0 / hCount）直接显示该值而不经 coordinateToPrice 反推。
   *
   * @remarks
   * 必要性（根因修复）：首尾刻度内嵌 AXIS_LABEL_PAD 像素，经库 coordinateToLogical
   * 反推时，顶 / 底内嵌偏移产生不同溢出率（对称值域 ±A + 对称 scaleMargins 下，
   * 顶部约 +0.151A、底部约 −0.163A，随 pane 高度变化）→ 显示刻度 |max| ≠ |min|
   * （如 0.27 / −0.28）。对要求刻度对称的 pane（如 MACD），直接固定显示 scale
   * 边界值（maxValue / minValue），|max| = |min| 严格成立、与平移无关。
   */
  getEdgeFixedValues?: () => { topValue: number; bottomValue: number } | undefined
  /**
   * 全序列固定值获取器（可选）：返回长度 = 等分数 + 1 的数值数组时，
   * 每个刻度直接显示该值（不做坐标反算）——用于要求严格等差数列 /
   * 对称刻度的场景（分时 pane1 左右刻度：中间 = 首根 preClose，上下 =
   * preClose ± k×step，首尾同样参与等差，显示值不随平移 / 缩放变化）。
   * 返回 null 时回退现有逻辑（首尾固定 / 中间固定 / 坐标反算）。
   * 数组元素为 undefined 的索引回退现有逻辑（与 fixedValue 语义一致）。
   */
  getFixedValues?: () => (number | undefined)[] | null
}

/**
 * 价格轴刻度标签自绘 primitive。
 *
 * @remarks
 * 挂载到内容 Pane 的 series，价格轴 top canvas 自绘刻度标签；
 * 标签位置与栅格横线同一等分公式，文字规格与十字星指示值共用
 * drawAxisLabel，保证两处完全一致。
 */
export class AxisLabelPrimitive implements ISeriesPrimitive<Time> {
  /** 刻度标签配置（只读）。 */
  public readonly config: AxisLabelConfig

  /** 挂载后的 chart 引用（attached 时注入；标签求值时使用）。 */
  public chartApi: IChartApiBase<Time> | null = null

  /** 当前刻度标签集合（updateAllViews 时按栅格横线重建）。 */
  private labelViews: AxisLabelView[] = []

  /** 渲染视图（单例：构造时创建一次，priceAxisPaneViews 每次返回同一实例）。 */
  private readonly paneView: AxisLabelPaneView

  constructor(config: AxisLabelConfig) {
    this.config = config
    this.paneView = new AxisLabelPaneView(this)
  }

  /** primitive 挂载：保存 chart 引用并立即构建标签。 */
  attached = (param: SeriesAttachedParameter<Time>): void  => {
    this.chartApi = param.chart
  }

  /** primitive 卸载：清空引用与标签（防内存泄漏）。 */
  detached = (): void  => {
    this.chartApi = null
    this.labelViews = []
  }

  /**
   * 每次图表更新：按当前栅格等分数重建标签集合（位置与横线一致）；
   * getEnabled === false 时置空（右刻度 K 线周期保持空白）。
   */
  updateAllViews = (): void  => {
    this.labelViews = this.config.getEnabled?.() === false ? [] : this.buildLabelViews()
  }

  /** 读取当前刻度标签数据（渲染视图绘制用）。 */
  getLabels = (): readonly AxisLabelView[]  => {
    return this.labelViews
  }

  /** 价格轴 Pane 视图（zOrder 'top'，自绘，与十字星指示值同一层）。 */
  priceAxisPaneViews = (): readonly IPrimitivePaneView[]  => {
    return [this.paneView]
  }

  // 构建标签：在每条等分刻度处生成一个标签（值 = 该处价格，实时反算）。
  // 刻度行数 = 等分数 + 1（含首尾）：
  //  - 指标关：pane1 = 8 等分 → 9 个值；pane3 = 2 等分 → 3 个值；
  //  - 指标开：pane1 = 6 等分 → 7 个值；pane3 / pane5 = 2 等分 → 3 个值。
  // 中间刻度与栅格横线同一等分公式（i = 1..count-1）；
  // 首尾刻度（i = 0 / count）内嵌 AXIS_LABEL_PAD 像素，保证文字完整可见。
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
      // 首尾内嵌（避免标签块 / 文字被价格轴边缘裁切）。
      const y =
        i === 0
          ? AXIS_LABEL_PAD
          : i === hCount
            ? paneHeight - AXIS_LABEL_PAD
            : Math.round((paneHeight * i) / hCount)
      // 首尾固定值（如 MACD 直接显示 ±absMax，保证 |max| = |min| 且不随平移变化）；
      // 中间固定值（如 MACD 中间 = 0）；全序列固定值（分时左右刻度等差序列）优先——
      // 固定值取 fixedValues[i]，undefined 回退下方现有逻辑。
      const fixedValues = this.config.getFixedValues?.()
      const edgeValues = this.config.getEdgeFixedValues?.()
      views.push(
        new AxisLabelView({
          primitive: this,
          coordinate: y,
          fixedValue:
            fixedValues !== null && fixedValues !== undefined
              ? fixedValues[i]
              : i === 0
                ? edgeValues?.topValue
                : i === hCount
                  ? edgeValues?.bottomValue
                  : i === Math.floor(hCount / 2)
                    ? this.config.getFixedMiddleValue?.()
                    : undefined,
        }),
      )
    }
    return views
  }
}

/** 首尾刻度内嵌偏移（px）：12px 字体下保证标签完整可见、不与轴边缘贴边。 */
const AXIS_LABEL_PAD = 8
