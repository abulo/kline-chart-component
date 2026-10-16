/**
 * gridPrimitive.ts —— 固定等分栅格自绘 primitive（v1.4.22）
 *
 * 职责：通过 ISeriesPrimitive 挂载到内容 Pane 的 series 上，自绘等分栅格。
 * 等分规则（固定等分，不随数据平移 / 缩放变化）：
 *  - 竖线：4 等分（3 条竖线，位于 1/4、1/2、3/4 处）；
 *  - 横线：按 pane 动态配置（getHorizontalCount）：
 *      pane1（K 线）：指标关 8 等分（7 条） / 指标开 6 等分（5 条）；
 *      pane3（成交量）：2 等分（1 条，中间）；
 *      pane5（指标）：2 等分（1 条，中间）。
 *  等分线避开首尾（不画 0 / 全长位置）。
 *
 * 视觉：
 *  - 1px 线（CSS 像素网格对齐 +0.5，避免模糊）；
 *  - 颜色取自主题 grid（深浅系区分），draw 时动态取色；
 *  - 栅格固定在 Pane 本地坐标系（media 空间），平移 / 缩放数据时位置不变。
 *
 * 依赖：渲染逻辑委托给 GridPaneView（同目录独立文件）。
 */
import {
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type SeriesAttachedParameter,
  type IChartApiBase,
  type Time,
} from 'lightweight-charts'
import { GridPaneView } from './gridPaneView'

export interface GridConfig {
  /** 栅格线颜色获取器（draw 时动态取色，主题切换无需额外刷新） */
  getColor: () => string
  /** 当前 Pane 的横向等分数（如 8 / 6 / 2），随指标开关动态变化 */
  getHorizontalCount: () => number
  /** 竖向等分数（默认 4，全图统一） */
  verticalCount?: number
}

export class GridPrimitive implements ISeriesPrimitive<Time> {
  /** 栅格配置（只读） */
  public readonly config: GridConfig

  /** 挂载后的 chart 引用（预留；attached 时注入） */
  public chartApi: IChartApiBase<Time> | null = null

  /** 渲染视图（单例：构造时创建一次，paneViews 每次返回同一实例，避免每帧重复创建对象） */
  private readonly paneView: GridPaneView

  constructor(config: GridConfig) {
    this.config = config
    this.paneView = new GridPaneView(this)
  }

  /** primitive 挂载：保存 chart 引用供 draw 使用 */
  attached = (param: SeriesAttachedParameter<Time>): void  => {
    this.chartApi = param.chart
  }

  /** primitive 卸载：清空引用（防内存泄漏） */
  detached = (): void  => {
    this.chartApi = null
  }

  /** 返回本 primitive 的 pane 视图（渲染器；单例复用，避免每帧 new 对象） */
  paneViews = (): readonly IPrimitivePaneView[]  => {
    return [this.paneView]
  }
}
