/**
 * types/chart.ts —— 统一数据点类型定义（全项目数据源契约）
 *
 * 图表组件（KLineChartController）直接使用本类型作为 K 线 / 分时 / 集合竞价数据源
 * （mock 返回 ChartDataPoint[]，pointType='kline'），不再使用内部 BasicBar；
 * 接入真实后端时，后端返回结构须与本类型一致（见 services/chartDataService.ts）。
 */

/** 数据点类型标记：K 线 / 分时 / 集合竞价（类型守卫依据） */
export type PointType = 'kline' | 'timeshare' | 'auction'

/**
 * 统一数据点结构（后端返回格式契约）。
 * 三种数据类型合并为同一数组，通过 pointType 字段做类型守卫区分。
 */
export interface ChartDataPoint {
  // ========== 公共必选字段（三种数据类型均须提供） ==========

  /** 秒级时间戳（lightweight-charts 标准时间格式，须严格递增） */
  time: number

  /** 交易日期字符串，格式 'YYYY-MM-DD' */
  tradeDate: string

  /**
   * 昨收价。
   * 用途：涨跌幅计算基准、分时 pane1 左右刻度中值（栅格中间横线 = 首根 preClose）、
   * 涨跌着色（close/price vs preClose 红 / 绿 / 平盘）。
   */
  preClose: number

  /** 数据点类型标记，用于类型守卫（kline / timeshare / auction） */
  pointType: PointType

  // ========== K 线专属字段（pointType = 'kline'） ==========

  /** 开盘价 */
  open?: number
  /** 最高价 */
  high?: number
  /** 最低价 */
  low?: number
  /** 收盘价 */
  close?: number
  /** 成交量（手 / 股，pane3 成交量图锚点） */
  volume?: number
  /** 成交额（pane2 信息行 / tooltip 显示） */
  amount?: number
  /** 涨跌额（相对昨收，信息行显示） */
  risePrice?: number
  /** 涨跌幅 %（相对昨收，信息行显示） */
  riseRate?: number

  // ========== 分时专属字段（pointType = 'timeshare'） ==========

  /** 当前成交价（分时 pane1 价格线锚点） */
  price?: number
  /** 平均成交价（分时 pane1 均价线锚点） */
  avgPrice?: number

  // ========== 集合竞价专属字段（pointType = 'auction'） ==========

  /** 已匹配量 */
  matched?: number
  /** 未匹配量 */
  unMatched?: number
  /** 买卖方向：-1=卖多(绿色)  1=买多(红色) */
  matchType?: number
  /** 是否为集合竞价时段 */
  isAuction?: boolean

  /** 扩展字段预留（后端额外字段透传） */
  [key: string]: any
}
