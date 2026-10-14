/**
 * crosshairLineCapPrimitive.ts —— 十字星竖线底部补齐 primitive（v1.4.90）
 *
 * 背景：库 CrosshairRenderer 的竖线为 LargeDashed 虚线（[6, 6] 物理像素），
 * 从 pane 顶部画到底部。当 pane 高度（物理像素）不是 12 的整数倍时，
 * 虚线最后一段是空白段 → 竖线视觉上"距 pane 底部还有 0~6 CSS px 缺口"；
 * 不同 pane 高度 / 窗口尺寸变化 → 相位随机 → "有些地方能到底、
 * 有些地方不能到底"。
 *
 * 修复：在 top 层（库十字星竖线绘制之后）补画最后一段虚线长度的实线
 * （6 / devicePixelRatio CSS px，与虚线段等长）：
 *  - 无缺口（余数 ≤ 6 物理 px）：补的实线与最后一段实线重叠，无视觉变化；
 *  - 有缺口（余数 > 6 物理 px）：恰好填满最后空白段，竖线到底。
 * 虚线主体观感不变（仍为 LargeDashed），仅底部补齐。
 *
 * 每个内容 / 信息 Pane（pane1/2/3/4/5）各挂一个实例；
 * pane0 不挂（其顶部信息行由 TopPaneOverlayPrimitive 不透明背景遮住竖线）。
 */
import type { ISeriesPrimitive, ITimeScaleApi, Time } from 'lightweight-charts'
import { CrosshairLineCapPaneView } from './crosshairLineCapPaneView'

/** 竖线补齐 primitive 数据源（draw 时现取；依赖注入避免构造顺序问题） */
export interface CrosshairLineCapDataSource {
  /** 十字星当前命中时间（null = 未命中 → 不补齐；CrosshairManager 提供） */
  getOverlayTime: () => number | null
  /** x 坐标转换 timeScale（chart.timeScale()） */
  getTimeScale: () => ITimeScaleApi<Time>
  /** 竖线颜色（theme.crosshairLineColor，深浅系区分；主题切换动态取） */
  getLineColor: () => string
}

/** 十字星竖线底部补齐 primitive（attach 到各 pane 的 series） */
export class CrosshairLineCapPrimitive implements ISeriesPrimitive<Time> {
  /** 数据源（构造注入，只读） */
  private readonly source: CrosshairLineCapDataSource

  /** 渲染视图（top 层：库十字星竖线之后绘制） */
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
