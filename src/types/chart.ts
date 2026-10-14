/**
 * types/chart.ts —— 通用数据点类型定义（统一数据源）
 *
 * 说明：图表组件（KLineChartController）直接使用本类型作为 K 线数据源
 * （mock.genMockBars 返回 ChartDataPoint[]，pointType='kline'），
 * 不再使用内部 BasicBar；接入真实后端或扩展分时/指标时在此扩展。
 */

/** 数据点类型标记：K 线 / 分时 / 集合竞价 */
export type PointType = 'kline' | 'timeshare' | 'auction'

/**
 * 统一数据点结构（用户指定的后端返回格式）。
 * 三种数据类型合并为同一数组，通过 pointType 字段做类型守卫区分。
 */
export interface ChartDataPoint {
  // ========== 公共必选字段 ==========
  /** 秒级时间戳（lightweight-charts 标准时间格式） */
  time: number
  /** 交易日期字符串 YYYY-MM-DD */
  tradeDate: string
  /** 昨收价，用于计算涨跌幅 */
  preClose: number
  /** 数据点类型标记，用于类型守卫 */
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
  /** 成交量（手/股） */
  volume?: number
  /** 成交额 */
  amount?: number
  /** 涨跌额（相对昨收） */
  risePrice?: number
  /** 涨跌幅 %（相对昨收） */
  riseRate?: number

  // ========== 分时专属字段（pointType = 'timeshare'） ==========
  /** 当前成交价 */
  price?: number
  /** 平均成交价 */
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

  /** 扩展字段预留 */
  [key: string]: any
}
