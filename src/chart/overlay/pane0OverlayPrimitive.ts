/**
 * pane0OverlayPrimitive.ts —— pane0 顶层遮罩 primitive（v1.4.36）
 *
 * 职责：通过 ISeriesPrimitive 挂载到 pane0 的空 series 上，用 **topPaneViews()**
 * 在 pane0 的 top canvas 绘制不透明背景 + "测试"文字。
 *
 * 为什么用 topPaneViews：
 *  库渲染层级（已从 dist 源码确认）——
 *   - 每个 PaneWidget 分 bottom / top 两层 canvas；
 *   - bottom canvas：背景 → 栅格 → 系列 → **十字星线**（CrosshairPaneView 属
 *     pane 级视图，画在各 pane 的 bottom canvas 上）→ 刻度标签；
 *   - top canvas：十字星标签 → **topPaneViews**（库 9637 行：
 *     `pane._internal_drawAdditionalSources(topTarget, sourceTopPaneViews)`）。
 *  因此 topPaneViews 绘制的内容永远在十字星**之上** —— pane0 借此遮住十字星
 *  竖线（竖线在 pane0 区域被背景色覆盖），实现"十字星不贯穿 pane0"。
 *
 * 背景色与文字色每次 draw 动态获取（跟随主题，深浅系切换无需额外刷新）。
 *
 * 依赖：渲染逻辑委托给 Pane0OverlayPaneView（同目录独立文件）。
 */
import {
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type Time,
} from 'lightweight-charts'
import { Pane0OverlayPaneView } from './pane0OverlayPaneView'

export class Pane0OverlayPrimitive implements ISeriesPrimitive<Time> {
  /** 待绘制文字（只读，构造时注入） */
  public readonly text: string
  /** 背景色获取器（只读，draw 时动态调用以跟随主题） */
  public readonly getBackground: () => string
  /** 文字颜色获取器（只读，draw 时动态调用以跟随主题） */
  public readonly getColor: () => string

  constructor(text: string, getBackground: () => string, getColor: () => string) {
    this.text = text
    this.getBackground = getBackground
    this.getColor = getColor
  }

  /** pane 视图（zOrder 'top' → 绘制在 pane 顶层 canvas，位于十字星之上） */
  paneViews(): readonly IPrimitivePaneView[] {
    return [new Pane0OverlayPaneView(this)]
  }
}
