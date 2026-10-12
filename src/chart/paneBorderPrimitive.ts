/**
 * paneBorderPrimitive.ts —— 内容 Pane 边框自绘 primitive（v1.4.19）
 *
 * 职责：通过 ISeriesPrimitive 挂载到内容 Pane 的 series 上，自绘 1px 矩形边框。
 * 挂载范围（仅内容 Pane，空 Pane 不加边框）：
 *  - pane1（K 线）→ 挂 klineSeries；
 *  - pane3（成交量）→ 挂 volumeSeries；
 *  - pane5（指标）→ 挂 indicatorsBarSeries（指标开启时随 pane 创建）。
 *
 * 视觉：
 *  - 1px 直角矩形边框（CSS 像素网格对齐 +0.5，避免模糊）；
 *  - 颜色取自主题 paneBorder（深系 / 浅系区分）；
 *  - 主题切换时 draw 动态取色，applyOptions 触发重绘即自动更新。
 *
 * 依赖：渲染逻辑委托给 PaneBorderPaneView（同目录独立文件）。
 */
import {
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type SeriesAttachedParameter,
  type IChartApiBase,
  type Time,
} from 'lightweight-charts'
import { PaneBorderPaneView } from './paneBorderPaneView'

export class PaneBorderPrimitive implements ISeriesPrimitive<Time> {
  /** 边框颜色获取器（只读；draw 时动态取色，主题切换无需额外刷新） */
  public readonly getColor: () => string

  /** 挂载后的 chart 引用（draw 时取 timeScale；attached 时注入） */
  public chartApi: IChartApiBase<Time> | null = null

  constructor(getColor: () => string) {
    this.getColor = getColor
  }

  /** primitive 挂载：保存 chart 引用供 draw 使用 */
  attached(param: SeriesAttachedParameter<Time>): void {
    this.chartApi = param.chart
  }

  /** primitive 卸载：清空引用（防内存泄漏） */
  detached(): void {
    this.chartApi = null
  }

  /** 返回本 primitive 的 pane 视图（渲染器） */
  paneViews(): readonly IPrimitivePaneView[] {
    return [new PaneBorderPaneView(this)]
  }
}
