/**
 * axisLabelView.ts —— 价格轴刻度标签对象（v1.4.27）
 *
 * 职责：实现 ISeriesPrimitiveAxisView，代表价格轴（左刻度区）上的一条刻度标签：
 *  - fixedCoordinate：强制标签绘制在栅格横线 y 处（防库自动移动导致错位）；
 *  - text：动态求值 —— coordinateToPrice(y) 反算当前价格并格式化
 *    （随数据平移 / 缩放实时变化）；
 *  - textColor / backColor：取主题文字色 / 背景色（深浅系区分）。
 */
import { type ISeriesPrimitiveAxisView } from 'lightweight-charts'
import type { AxisLabelPrimitive } from './axisLabelPrimitive'

export interface AxisLabelViewOptions {
  /** 所属 primitive（提供 chart / 配置 / 格式化函数） */
  primitive: AxisLabelPrimitive
  /** 标签在价格轴内的固定 y 坐标（与栅格横线对齐） */
  coordinate: number
  /** 固定值（可选）：设置后标签直接显示该值（如 MACD 中间刻度 = 0） */
  fixedValue?: number
}

export class AxisLabelView implements ISeriesPrimitiveAxisView {
  /** 所属 primitive（只读） */
  private readonly primitive: AxisLabelPrimitive
  /** 标签固定 y 坐标（像素，距价格轴顶部） */
  private readonly labelCoordinate: number
  /** 固定显示值（undefined 时按坐标反算价格） */
  private readonly fixedValue?: number

  constructor(options: AxisLabelViewOptions) {
    this.primitive = options.primitive
    this.labelCoordinate = options.coordinate
    this.fixedValue = options.fixedValue
  }

  /** 普通坐标：返回极大负值，避免库为 fixedCoordinate 标签预留空白位置 */
  coordinate(): number {
    return -1e9
  }

  /** 固定坐标：强制绘制在栅格横线 y 处（保证与横线对齐，不被自动防重叠移动） */
  fixedCoordinate(): number {
    return this.labelCoordinate
  }

  /** 标签文字：优先显示固定值；否则反算该 y 处的当前价格并格式化（实时，随数据移动变化） */
  text(): string {
    if (this.fixedValue !== undefined) {
      return this.primitive.config.format(this.fixedValue)
    }
    const price = this.primitive.config.series.coordinateToPrice(this.labelCoordinate)
    if (price === null) return ''
    return this.primitive.config.format(price)
  }

  /** 标签文字颜色（主题 textColor） */
  textColor(): string {
    return this.primitive.config.getColor()
  }

  /** 标签背景颜色（主题 background，覆盖库默认标签底色） */
  backColor(): string {
    return this.primitive.config.getBackColor()
  }
}
