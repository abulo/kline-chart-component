/**
 * crosshairLineCapPrimitive.ts —— 十字星竖线细虚线 primitive（v1.4.99）
 *
 * 背景：
 *  1. 库 CrosshairRenderer 竖线为 LargeDashed 虚线（[6, 6] 物理像素），线宽仅支持
 *     整数（1 已最细）→ 视觉偏粗；且当 pane 高度（物理像素）非 12 整数倍时，
 *     虚线最后一段是空白段 → 竖线"距 pane 底部还有 0~6 CSS px 缺口"；
 *     不同 pane 高度 / 窗口尺寸变化 → 相位随机 → "有些地方能到底、有些地方不能到底"。
 *
 * 修复（top 层库竖线之后重绘）：
 *  - 整条细虚线竖线：线宽 0.75 CSS px（亚像素抗锯齿 → 视觉细于库 1px），
 *    虚线周期 [1, 1] 物理 px（最密） → 覆盖库竖线本体（同色无缝），
 *    库竖线仅保留其时间轴时间 label（库绘制）；
 *  - 底部补齐实线（同宽）：无缺口时与最后实线段重叠、有缺口时恰好填满空白段，
 *    竖线视觉到底。
 *
 * 每个内容 / 信息 Pane（pane1/2/3/4/5）各挂一个实例；
 * pane0 不挂（其顶部信息行由 TopPaneOverlayPrimitive 不透明背景遮住竖线）。
 */
import type { ISeriesPrimitive, ITimeScaleApi, Time } from 'lightweight-charts'
import { CrosshairLineCapPaneView } from './crosshairLineCapPaneView'

/** 竖线补齐 primitive 数据源（draw 时现取；依赖注入避免构造顺序问题） */
export interface CrosshairLineCapDataSource {
  /** 十字星当前命中时间（null = 未命中 → 不绘制；CrosshairManager 提供） */
  getOverlayTime: () => number | null
  /** x 坐标转换 timeScale（chart.timeScale()） */
  getTimeScale: () => ITimeScaleApi<Time>
  /** 竖线颜色（theme.crosshairLineColor，深浅系区分；主题切换动态取） */
  getLineColor: () => string
}

/** 十字星竖线细虚线 primitive（attach 到各 pane 的 series） */
export class CrosshairLineCapPrimitive implements ISeriesPrimitive<Time> {
  /** 数据源（构造注入，只读） */
  private readonly source: CrosshairLineCapDataSource

  /** 渲染视图（top 层：库十字星竖线之后重绘细线 + 底部补齐） */
  private readonly paneView: CrosshairLineCapPaneView

  constructor(source: CrosshairLineCapDataSource) {
    this.source = source
    this.paneView = new CrosshairLineCapPaneView(this.source)
  }

  /** 挂载视图：仅挂到本 series 所在 pane 的 top canvas */
  paneViews(): readonly CrosshairLineCapPaneView[] {
    return [this.paneView]
  }
}
