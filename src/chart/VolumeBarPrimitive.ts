/**
 * VolumeBarPrimitive.ts —— 成交量柱体自绘 primitive（v1.4.9）
 *
 * 职责：通过 ISeriesPrimitive 挂载到 pane3 成交量 series 上，自绘成交量柱。
 * 视觉与 pane1 K 线完全一致：
 *  - 上涨柱（close >= open）：**空心红柱**（背景色填充 + 红色边框，同 pane1 上涨柱）；
 *  - 下跌柱：绿色实心（同 pane1 下跌柱）；
 *  - 柱宽 = optimalCandlestickWidth(barSpacing, dpr)（与 pane1 同一函数），
 *    柱中心 = 同一逻辑索引的坐标 → 宽度 / 间隔与 pane1 **绝对一致**。
 *
 * 依赖：渲染逻辑委托给 VolumeBarPaneView（同目录独立文件）。
 * 注意：成交量 series 数据不可见（color = 背景色），仅用于建立 Y 轴
 * （volume 值域）的 scale 锚点。
 */
import {
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type SeriesAttachedParameter,
  type ISeriesApi,
  type IChartApiBase,
  type Time,
} from 'lightweight-charts'
import type { BasicBar } from './mock'
import type { VolumeThemeColors } from './VolumeBarPaneView'
import { VolumeBarPaneView } from './VolumeBarPaneView'

export class VolumeBarPrimitive implements ISeriesPrimitive<Time> {
  /** 成交量数据获取器（只读；每次 draw 现取，数据更新无需额外通知） */
  public readonly getBars: () => readonly BasicBar[]
  /** 主题颜色获取器（只读；draw 时动态取色，主题切换无需额外刷新） */
  public readonly getThemeColors: () => VolumeThemeColors

  /** 挂载后的 chart 引用（draw 时取 timeScale；attached 时注入） */
  public chartApi: IChartApiBase<Time> | null = null
  /** 挂载后的 series 引用（draw 时取 priceScale；attached 时注入） */
  public seriesApi: ISeriesApi<'Histogram'> | null = null

  constructor(getBars: () => readonly BasicBar[], getThemeColors: () => VolumeThemeColors) {
    this.getBars = getBars
    this.getThemeColors = getThemeColors
  }

  /** primitive 挂载：保存 chart / series 引用供 draw 使用 */
  attached(param: SeriesAttachedParameter<Time>): void {
    this.chartApi = param.chart
    this.seriesApi = param.series as ISeriesApi<'Histogram'>
  }

  /** primitive 卸载：清空引用（防内存泄漏） */
  detached(): void {
    this.chartApi = null
    this.seriesApi = null
  }

  /** 返回本 primitive 的 pane 视图（渲染器） */
  paneViews(): readonly IPrimitivePaneView[] {
    return [new VolumeBarPaneView(this)]
  }
}
