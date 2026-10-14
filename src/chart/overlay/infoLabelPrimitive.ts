/**
 * infoLabelPrimitive.ts —— 信息行文字 primitive（无背景填充，v1.4.64）
 *
 * 职责：通过 ISeriesPrimitive 挂载到信息行 Pane（如 pane2 成交量信息行）的
 * 空 series 上，用 topPaneViews() 在 top canvas 绘制**分段文字**（各段不同色）。
 *
 * 与 TopPaneOverlayPrimitive 的区别：
 *  - TopPaneOverlayPrimitive：先填不透明背景再画字（用于 pane0 —— 借背景遮住
 *    十字星竖线，实现"十字星不贯穿 pane0"）；
 *  - InfoLabelPrimitive：**不填充背景**，只画分段文字（用于 pane2 / 未来信息行 ——
 *    十字星竖线需贯穿该 Pane，不能被背景遮挡）。
 *
 * 依赖：渲染逻辑委托给 InfoLabelPaneView（同目录独立文件）；
 *       分段结构 TextSegment 由 topPaneOverlayPrimitive.ts 导出。
 */
import {
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type Time,
} from 'lightweight-charts'
import { type TextSegment } from './topPaneOverlayPrimitive'
import { InfoLabelPaneView } from './infoLabelPaneView'

export class InfoLabelPrimitive implements ISeriesPrimitive<Time> {
  /** 信息行分段文字获取器（只读，draw 时现取 —— 数值随十字星命中 bar、颜色随主题） */
  public readonly getSegments: () => TextSegment[]

  /** 渲染视图（单例：构造时创建一次，paneViews 每次返回同一实例，避免每帧重复创建对象） */
  private readonly paneView: InfoLabelPaneView

  constructor(getSegments: () => TextSegment[]) {
    this.getSegments = getSegments
    this.paneView = new InfoLabelPaneView(this)
  }

  /** pane 视图（zOrder 'top' → 绘制在 pane 顶层 canvas；单例复用） */
  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView]
  }
}
