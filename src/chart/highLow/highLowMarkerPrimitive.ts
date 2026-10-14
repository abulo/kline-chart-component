/**
 * highLowMarkerPrimitive.ts —— K 线主图（pane1）最高价 / 最低价标注 primitive（v1.4.48）
 *
 * 职责：通过 ISeriesPrimitive 挂载到 pane1 的 klineSeries，在**可视区域内**
 * 标注最高价与最低价：
 *  - 最高价：可视范围内 high 最大的 bar，标注在该柱体**上方**（黄色 12px，
 *    黄色实线与柱体上边缘中间连接）；
 *  - 最低价：可视范围内 low 最小的 bar，标注在该柱体**下方**（蓝色 12px，
 *    蓝色实线与柱体下边缘中间连接）；
 *  - 随平移 / 缩放实时重算（每次绘制遍历当前可视逻辑范围）。
 *
 * 绘制委托给 HighLowMarkerPaneView（同目录独立文件）。
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
import type { ChartDataPoint } from '../../types/chart'
import { HighLowMarkerPaneView } from './highLowMarkerPaneView'

export interface HighLowMarkerConfig {
  /** 所属 series（价格反算用：priceToCoordinate 取柱顶 / 柱底 y） */
  series: ISeriesApi<SeriesType>
  /** K 线数据源（可视范围极值遍历用，随数据更新实时生效） */
  getBars: () => ChartDataPoint[]
  /** 最高价标注颜色（主题 highMarkerColor，深浅系区分） */
  getHighColor: () => string
  /** 最低价标注颜色（主题 lowMarkerColor，深浅系区分） */
  getLowColor: () => string
  /** 标注背景块颜色（主题 crosshairLabelBackground，深浅系区分） */
  getBackColor: () => string
}

export class HighLowMarkerPrimitive implements ISeriesPrimitive<Time> {
  /** 标注配置（只读） */
  public readonly config: HighLowMarkerConfig

  /** 挂载后的 chart 引用（attached 时注入；坐标转换用） */
  public chartApi: IChartApiBase<Time> | null = null

  /** 渲染视图（单例：构造时创建一次，paneViews 每次返回同一实例） */
  private readonly paneView: HighLowMarkerPaneView

  constructor(config: HighLowMarkerConfig) {
    this.config = config
    this.paneView = new HighLowMarkerPaneView(this)
  }

  /** primitive 挂载：保存 chart 引用 */
  attached(param: SeriesAttachedParameter<Time>): void {
    this.chartApi = param.chart
  }

  /** primitive 卸载：清空引用（防内存泄漏） */
  detached(): void {
    this.chartApi = null
  }

  /** 主图 Pane 视图：在 pane1 数据区 canvas 上绘制最高 / 最低价标注 */
  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView]
  }
}
