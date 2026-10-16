/**
 * axisLabelPaneView.ts —— 左刻度标签自绘 Pane 视图（v1.4.42）
 *
 * 职责：实现 IPrimitivePaneView（zOrder = 'top'），在价格轴 top canvas 上
 * 自绘普通刻度标签（与栅格横线对齐的位置）。
 *
 * 文字设置（v1.4.42 统一，以**十字星左刻度指示值**为基准）：
 *   刻度值与指示值共用同一套绘制规格（本文件导出的 AXIS_LABEL_PAD_X /
 *   AXIS_LABEL_HEIGHT / drawAxisLabel），两处文字设置完全一致：
 *   - 字体：12px chartFontFamily（theme.chartFont）；
 *   - 对齐：textAlign = 'right'，文字右缘 = 价格轴右缘 - 6px；
 *   - 背景块：包裹文字，左右内边距各 4px、高 18px、垂直居中；
 *   - 颜色：文字 = 主题 textColor、背景 = 主题 background（跟随深浅系）。
 *
 * 坐标：与 CrosshairAxisLabelPaneView 相同 —— 价格轴 canvas 与所属 Pane 数据区
 * 共享垂直坐标系，标签 y = 栅格横线等分位置（含首尾内嵌），
 * 值 = series.coordinateToPrice(y) 实时反算（随平移 / 缩放一致变化）。
 *
 * 依赖：AxisLabelPrimitive（同目录，提供标签数据与格式化）。
 */
import { type IPrimitivePaneView, type IPrimitivePaneRenderer } from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { AxisLabelPrimitive } from './axisLabelPrimitive'

/** 标签与价格轴右边缘的间距（px，文字右缘 = 价格轴右缘 - 6px，避免贴边 / 覆盖刻度边框） */
export const AXIS_LABEL_PAD_X = 6
/** 标签高度（px，文字垂直居中于标签块） */
export const AXIS_LABEL_HEIGHT = 18

/**
 * 公共标签绘制函数（指示值与刻度值共用，保证文字设置完全一致）：
 * 在价格轴内绘制"背景块 + 右对齐文字"，垂直居中于 y。
 * @param context   canvas 2d 上下文（media 坐标空间）
 * @param text      标签文字
 * @param textRight 文字右缘 x（一般传 mediaSize.width - AXIS_LABEL_PAD_X）
 * @param y         标签垂直中心 y
 * @param font      字体（12px chartFontFamily）
 * @param textColor 文字颜色（主题 textColor）
 * @param backColor 背景块颜色（主题 background）
 */
export const drawAxisLabel = (
  context: CanvasRenderingContext2D,
  text: string,
  textRight: number,
  y: number,
  font: string,
  textColor: string,
  backColor: string,
): void => {
  context.font = font
  context.textBaseline = 'middle'
  context.textAlign = 'right'
  const textWidth = context.measureText(text).width
  // 背景块：包裹文字并留左右内边距，垂直居中在 y 处
  const blockLeft = textRight - AXIS_LABEL_PAD_X - textWidth - AXIS_LABEL_PAD_X
  const blockRight = textRight + AXIS_LABEL_PAD_X
  const top = y - AXIS_LABEL_HEIGHT / 2
  context.fillStyle = backColor
  context.fillRect(blockLeft, top, blockRight - blockLeft, AXIS_LABEL_HEIGHT)
  // 文字：右对齐，垂直居中
  context.fillStyle = textColor
  context.fillText(text, textRight, y)
}

/** 刻度标签渲染器：真正执行 canvas 绘制 */
class AxisLabelRenderer implements IPrimitivePaneRenderer {
  /** 所属 primitive（只读） */
  private readonly source: AxisLabelPrimitive

  constructor(source: AxisLabelPrimitive) {
    this.source = source
  }

  /** 库在价格轴绘制时调用：绘制全部刻度标签（target 为价格轴 canvas） */
  draw = (target: CanvasRenderingTarget2D): void  => {
    const labels = this.source.getLabels()
    if (labels.length === 0) return
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const font = this.source.config.getFont()
      const textColor = this.source.config.getColor()
      const backColor = this.source.config.getBackColor()
      const textRight = mediaSize.width - AXIS_LABEL_PAD_X
      for (const label of labels) {
        const text = label.text()
        if (text === '') continue
        drawAxisLabel(ctx, text, textRight, label.coordinate, font, textColor, backColor)
      }
    })
  }
}

/** 刻度标签 Pane 视图：zOrder 'top'（与指示值同一层级，文字设置一致） */
export class AxisLabelPaneView implements IPrimitivePaneView {
  /** 渲染器（单例复用，避免重复创建与内存泄漏；闭包持有 primitive 引用） */
  private readonly rendererImpl: AxisLabelRenderer

  constructor(source: AxisLabelPrimitive) {
    this.rendererImpl = new AxisLabelRenderer(source)
  }

  /** 顶层：价格轴 top canvas 绘制（与十字星指示值同一层） */
  zOrder = (): 'top'  => {
    return 'top'
  }

  /** 返回渲染器实例 */
  renderer = (): IPrimitivePaneRenderer  => {
    return this.rendererImpl
  }
}
