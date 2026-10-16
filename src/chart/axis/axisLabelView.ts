/**
 * axisLabelView.ts —— 刻度标签数据类（v1.4.42）
 *
 * 职责：代表价格轴（左刻度区）上的一条刻度标签的**数据**：
 *  - coordinate：标签在价格轴内的固定 y 坐标（与栅格横线对齐，含首尾内嵌）；
 *  - text()：动态求值 —— fixedValue 优先显示固定值（如 MACD 中间刻度 = 0）；
 *    否则 coordinateToPrice(y) 反算当前价格并格式化（随数据平移 / 缩放实时变化）。
 *
 * v1.4.42 变更：自绘渲染后不再实现库的 ISeriesPrimitiveAxisView 接口
 * （该接口由库渲染 axis 标签，内边距等文字设置与自绘指示值不一致）；
 * 本类退化为纯数据载体，绘制由 AxisLabelPaneView 统一执行
 * （与十字星指示值共用 drawAxisLabel，文字设置完全一致）。
 */
import type { AxisLabelPrimitive } from './axisLabelPrimitive'

export interface AxisLabelViewOptions {
  /** 所属 primitive（提供 chart / 配置 / 格式化函数） */
  primitive: AxisLabelPrimitive
  /** 标签在价格轴内的固定 y 坐标（与栅格横线对齐） */
  coordinate: number
  /** 固定值（可选）：设置后标签直接显示该值（如 MACD 中间刻度 = 0） */
  fixedValue?: number
}

export class AxisLabelView {
  /** 所属 primitive（只读） */
  private readonly primitive: AxisLabelPrimitive
  /** 标签固定 y 坐标（像素，距价格轴顶部） */
  public readonly coordinate: number
  /** 固定显示值（undefined 时按坐标反算价格） */
  private readonly fixedValue?: number

  constructor(options: AxisLabelViewOptions) {
    this.primitive = options.primitive
    this.coordinate = options.coordinate
    this.fixedValue = options.fixedValue
  }

  /** 标签文字：优先显示固定值；否则反算该 y 处的当前价格并格式化（实时，随数据移动变化） */
  text = (): string  => {
    if (this.fixedValue !== undefined) {
      return this.primitive.config.format(this.fixedValue)
    }
    const price = this.primitive.config.series.coordinateToPrice(this.coordinate)
    if (price === null) return ''
    return this.primitive.config.format(price)
  }
}
