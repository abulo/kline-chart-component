/**
 * types.ts —— 图表核心公共类型（v1.4.73 拆分自 KLineChartController.ts）
 *
 * 集中定义控制器 / 管理器共享的选项与数据结构：
 *  - KLineChartOptions：控制器构造选项；
 *  - MainIndicatorName：主图指标互斥名称；
 *  - IndicatorLineSpec：指标线规格（颜色 + 升序数据点，top 层自绘数据源）；
 *  - CrosshairPrimitiveRegistry：十字星指示值 primitive 注册表接口
 *    （CrosshairManager 提供，pane1 / pane3 由控制器注册、pane5 由附图指标管理器注册）；
 *  - IndicatorValueMap：信息行指标值缓存项（label + 线色 + time→value Map）。
 */
import type { CrosshairAxisLabelPrimitive } from '../crosshair/crosshairAxisLabelPrimitive'

/** 控制器选项 */
export interface KLineChartOptions {
  /** 图表挂载容器（需有确定宽高） */
  container: HTMLElement
  /** 时间格式模板（v1.6.9 透传 KLineChart.vue format）：如 'YYYY-MM-DD' / 'YYYY-MM-DD HH:mm'；
   *  提供时 pane0 信息行时间按模板显示；缺省按周期自动（日/周/月 → YYYY-MM-DD；
   *  分时 → HH:mm；分钟 K → YYYY-MM-DD HH:mm） */
  format?: string
  /** 股票名称（pane0 顶部信息行显示：名称 [代码]） */
  name?: string
  /** 股票代码（pane0 顶部信息行显示：名称 [代码]） */
  symbol?: string
  /** 内置演示数据条数（默认 120；极限压测可传 10000） */
  /** 每页获取条数（v1.6.12 由 dataCount 更名；默认 120；压测可传 10000） */
  pageSize?: number
  /**
   * 平移左滑到最左边缘回调（v1.5.2）：
   * 可视逻辑范围左边界 ≤ 0 时触发，由调用方（组件）经 service 拉取更早历史页，
   * 再调用 controller.prependHistory 前置插入；未注入则不做边缘加载。
   */
  onNeedEarlierData?: () => void
}

/**
 * 主图指标名称（pane1 叠加线；互斥，同一时刻仅一个）：
 *  MA / EXPMA / BOLL / SAR / BBI，null = 关闭
 */
export type MainIndicatorName = 'ma' | 'expma' | 'boll' | 'sar' | 'bbi'

/**
 * 指标线规格（颜色 + 升序数据点）。
 * 由 IndicatorLinePrimitive 在 top canvas（十字星之上）自绘，
 * 因此不再创建 LineSeries（库 LineSeries 会被十字星横线压住）。
 */
export interface IndicatorLineSpec {
  /** 指标线颜色（主图取 mainIndicatorColors、附图取 subIndicatorColors） */
  color: string
  /** 升序数据点（time 单调递增） */
  points: { time: number; value: number }[]
}

/** 十字星指示值 primitive 管理接口（CrosshairManager 提供） */
export interface CrosshairPrimitiveRegistry {
  /** 注册（pane1 / pane3 由控制器注册，pane5 由附图指标管理器注册） */
  registerPrimitive: (primitive: CrosshairAxisLabelPrimitive) => void
  /** 按 pane 下标移除（指标层关闭时移除 pane5 的指示值 primitive） */
  removeByPaneIndex: (paneIndex: number) => void
}

/** 信息行指标值缓存项（label + 线色 + time→value Map，现取 O(1)） */
export interface IndicatorValueMap {
  /** 指标线名（如 MA5 / DIF / RSI6） */
  label: string
  /** 指标线颜色（分段文字着色） */
  color: string
  /** time → 指标值 */
  values: Map<number, number>
}
