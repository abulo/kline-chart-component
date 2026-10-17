/**
 * axisLabelView.ts —— 刻度标签数据类（v1.4.42）
 *
 * 职责：代表价格轴（左 / 右刻度区）上的一条刻度标签的**数据**：
 *  - coordinate：标签在价格轴内的固定 y 坐标（与栅格横线对齐，含首尾内嵌）；
 *  - value()：动态求值 —— fixedValue 优先显示固定值（如 MACD 中间刻度 = 0）；
 *    否则 getPrice(y) 外部回调（右刻度复用左刻度同坐标价格）→
 *    coordinateToPrice(y) 反算当前价格（随数据平移 / 缩放实时变化）；
 *  - text()：value() 格式化后的标签文字（渲染层绘制用）。
 *
 * v1.4.42 变更：自绘渲染后不再实现库的 ISeriesPrimitiveAxisView 接口
 * （该接口由库渲染 axis 标签，内边距等文字设置与自绘指示值不一致）；
 * 本类退化为纯数据载体，绘制由 AxisLabelPaneView 统一执行
 * （与十字星指示值共用 drawAxisLabel，文字设置完全一致）。
 *
 * v1.7.1 变更：新增 value()（供渲染层按值着色：分时左刻度价格 / 右刻度
 * 百分比 vs preClose 三态红绿）+ getPrice 外部价格回调（右刻度对齐用）。
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

  /** 标签文字：value() 格式化（实时，随数据移动变化） */
  text = (): string  => {
    const value = this.value()
    if (value === null) return ''
    return this.primitive.config.format(value)
  }

  /** 标签数值（供渲染层按值着色，v1.7.1）：fixedValue → getPrice(y) →
   *  series.coordinateToPrice(y)（依次优先，取第一个非空值） */
  value = (): number | null  => {
    if (this.fixedValue !== undefined) return this.fixedValue
    // 外部价格回调优先（右刻度：取左刻度同坐标价格 → 左右值对齐）
    const external = this.primitive.config.getPrice?.(this.coordinate)
    if (external !== null && external !== undefined) return external
    // series 支持函数（动态取数：分时周期 pane1 切换 price 线 / K 线周期用 klineSeries，
    // v1.7.0）——刻度永远以"当前有数据的 series"为坐标反算源
    const series =
      typeof this.primitive.config.series === 'function'
        ? this.primitive.config.series()
        : this.primitive.config.series
    const price = series.coordinateToPrice(this.coordinate)
    if (price === null) return null
    return price
  }
}
