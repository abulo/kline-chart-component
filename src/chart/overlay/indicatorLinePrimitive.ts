// indicatorLinePrimitive.ts —— 指标折线 primitive（top 层自绘）。
// 背景（库渲染层级，已从 dist 源码确认 PaneWidget._internal_paint）：
//  - bottom canvas：背景 → bottomPaneViews → 栅格 → series（含其 normal 层
//    primitive）→ labelPaneViews；
//  - top canvas：清屏 → 十字星（drawCrosshair）→ topPaneViews → labelPaneViews。
// 因此普通 series / normal primitive 永远画在十字星之下 —— 十字星横线穿过
// 指标线时会把指标线盖住"一部分看不见"。
//
// 本 primitive 用 zOrder 'top'（topPaneViews）自绘指标折线：
// 绘制在十字星之上 → 指标线完整可见，满足"指标绘图 → 十字星 → K线/成交量"
// 的叠加顺序（用户要求）。
//
// 坐标转换：
//  - x = timeScale.timeToCoordinate(time)（锚点 series 关联的 timeScale）；
//  - y = anchorSeries.priceToCoordinate(value)（同 pane 同 scale 的任意 series，
//    如 pane1 klineSeries / pane3 volumeSeries）。
//  top canvas 与 bottom canvas 尺寸一致，media 坐标可直接互用。
//
// 性能：绘制前按 timeScale.getVisibleRange() 裁剪可视点区间（数据升序线性扫描），
// 只对可视点做坐标转换与连线。
import {
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type Time,
  type SeriesType,
  type ISeriesApi,
  type ITimeScaleApi,
} from 'lightweight-charts'
import { type IndicatorLine } from '../indicator'
import { IndicatorLinePaneView } from './indicatorLinePaneView'

/** 指标线数据源（draw 时现取；颜色 = 指标线颜色，points = 升序数据点）。 */
export interface IndicatorLineSet {
  /** 各条指标线（颜色 + 数据点）。 */
  lines: { color: string; points: IndicatorLine[] }[]
  /** x 坐标转换 timeScale（chart.timeScale()；ISeriesApi 无公开 timeScale 方法）。 */
  getTimeScale: () => ITimeScaleApi<Time>
  /** price → y 坐标转换锚点 series（同 pane 同 priceScale 的任意 series）。 */
  anchorSeries: () => ISeriesApi<SeriesType>
}

/** 指标线 primitive 构造选项（可选）。 */
export interface IndicatorLinePrimitiveOptions {
  /**
   * 绘制层级获取器（可选，默认 'top'）：
   *  - 'top'：绘制在 top canvas（十字星之上）——主图（pane1）/ 成交量（pane3）/
   *    附图指标（pane5）均用此默认：指标线完整可见、不被十字星横线遮挡；
   *  - 'normal'：绘制在数据层（十字星之下、K 线/柱之上）——预留分支
   *    （若需"十字星盖住指标线"的场景可传此值）。
   */
  getZOrder?: () => 'top' | 'normal'
}

/**
 * 指标折线 primitive（top 层自绘）。
 *
 * @remarks
 * 绘制在十字星之上 → 指标线完整可见（不被十字星横线遮挡）；
 * 按可视时间范围裁剪后只对可视点做坐标转换与连线（长数据下性能优化）。
 */
export class IndicatorLinePrimitive implements ISeriesPrimitive<Time> {
  /** 指标线数据源获取器（只读，draw 时现取 —— 切换指标 / 换数据后自动跟随）。 */
  public readonly getSource: () => IndicatorLineSet

  /** 渲染视图（单例：构造时创建一次，paneViews 每次返回同一实例，避免每帧重复创建对象）。 */
  private readonly paneView: IndicatorLinePaneView

  constructor(
    getSource: () => IndicatorLineSet,
    options?: IndicatorLinePrimitiveOptions,
  ) {
    this.getSource = getSource
    this.paneView = new IndicatorLinePaneView(this, options?.getZOrder ?? (() => 'top'))
  }

  /** pane 视图（层级由构造选项决定，见 IndicatorLinePrimitiveOptions）。 */
  paneViews = (): readonly IPrimitivePaneView[]  => {
    return [this.paneView]
  }
}
