/**
 * types.ts —— 图表核心公共类型（v1.4.73 拆分自 KLineChartController.ts）
 *
 * 集中定义控制器 / 管理器共享的选项与数据结构：
 *  - KLineChartOptions：控制器构造选项；
 *  - IndicatorLineSpec：指标线规格（颜色 + 升序数据点，top 层自绘数据源）；
 *  - CrosshairPrimitiveRegistry：十字星指示值 primitive 注册表接口
 *    （CrosshairManager 提供，pane1 / pane3 由控制器注册、pane5 由附图指标管理器注册）；
 *  - IndicatorValueMap：信息行指标值缓存项（label + 线色 + time→value Map）。
 * 注：主图/附图指标类型（MainIndicatorType / SubIndicatorType）统一在
 *  ../indicator/types.ts 定义（指标公共类型单一来源）。
 */
import type { CrosshairAxisLabelPrimitive } from '../crosshair/crosshairAxisLabelPrimitive'
import type { CrosshairLinePrimitive } from '../crosshair/crosshairLinePrimitive'
import type { ChartDataPoint } from '../../types/chart'
import type { ChartDataService } from '../../services/chartDataService'
import type { PeriodValueOrEmpty } from '../periods'

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
  /** 数据服务（必填语义：init / loadEarlier 经其拉取历史与订阅实时；
   *  组件构造时透传 props.service ?? defaultService） */
  service?: ChartDataService
  /** 外部自定义数据（v1.6.28）：构造传入后直接渲染，跳过 service 拉取 / 分页 / 实时；
   *  适用于无 mock / http 环境的纯前端直通场景 */
  initialBars?: ChartDataPoint[]
  /** 加载状态回调（v1.6.17 init 统一管理：'loading' | 'ready' | 'error'） */
  onStatusChange?: (status: ChartLoadStatus) => void
  /** 初始周期（v1.7.1）：组件透传 props.period；缺省**不设置**（'' = 周期未设置，
   *  init 不发起请求，等周期就位后重新 init）。构造即生效（分时判定 / 数据过滤
   *  按此），避免默认周期为分时时 controller 仍按 K 线处理（此前构造硬编码 'day'） */
  period?: PeriodValueOrEmpty
  /** 最后价线显隐（v1.7.1）：默认 true 显示（K 线主图自绘 priceLine）；
   *  传 false 隐藏。可通过 controller.setPriceLineVisible 运行时切换 */
  priceLineVisible?: boolean
  /** 成交量组显隐（v1.7.2）：默认 true（pane2 成交量信息行 + pane3 成交量图）；
   *  传 false 隐藏（仿 pane4/5 移除式：销毁整组 + 布局重算）。
   *  可通过 controller.setVolumeVisible 运行时切换 */
  volumeVisible?: boolean
  /** 分时均价线显隐（v1.7.4）：默认 true（渲染）；传 false 时均价线不渲染，
   *  且 pane0 信息行 / tooltip 同步隐藏均价。K 线周期无均价线，开关仅分时生效。
   *  可通过 controller.setAvgLineVisible 运行时切换 */
  avgLineVisible?: boolean
}

/** 加载状态（controller 统一管理：init 拉最新页 → 'loading'；左滑分页 → 'loading-older'；
 *  两者成功均 → 'ready'，失败 → 'error'） */
export type ChartLoadStatus = 'idle' | 'loading' | 'loading-older' | 'ready' | 'error'

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
  /** v1.7.6：自绘十字星竖线 primitive 注册（pane1/2/3 由 paneFactory，pane4/5 由指标管理器） */
  registerLinePrimitive: (primitive: CrosshairLinePrimitive) => void
  /** v1.7.6：自绘十字星竖线 primitive 注销（指标层 / 成交量组关闭移除 pane 时） */
  unregisterLinePrimitive: (primitive: CrosshairLinePrimitive) => void
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
