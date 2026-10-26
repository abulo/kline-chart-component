/**
 * 图表数据服务接口层（v1.7.16：仅保留接口定义，Mock 实现迁出）
 *
 * - ChartDataService：统一的数据访问接口（历史分页拉取 + 实时订阅）。
 *   接入真实行情（HTTP 接口 / WebSocket）时，实现该接口替换 Mock 即可，
 *   组件与控制器无需改动。
 *
 * 实现（同目录）：
 *  - MockChartDataService（mockDataGenerator.ts）：本地模拟实现，内置约 3 年
 *    日线数据池 + 分时（1d~5d）241 分钟点 / 交易日 + 分钟 / 周 / 月 K 派生 +
 *    A股情绪形态注入（一字板连板 / 厂字板 / 天地天 / 地天地等，主板 ±10%）；
 *  - HttpChartDataService（httpChartDataService.ts）：HTTP / SSE / WS 接入真实行情。
 */
import type { ChartDataPoint } from '../types/chart'

/* ============================== 接口定义 ============================== */

/** 历史数据查询参数 */
export interface HistoryQuery {
  /** 证券代码，如 '600000.SH' */
  symbol: string
  /** 周期：'1d' 日线 / '1m' 1分钟 / '5m' / '15m' / '60m' ... */
  period: string
  /** 拉取该时间戳（秒）之前的数据；不传则取最新一页 */
  before?: number
  /** 每页条数 */
  limit: number
  /**
   * 当前已持有的数据条数（可选）。
   * **服务实现会自动计算**（HttpChartDataService）：未传时由服务层自动推导——
   * 取「该 symbol|period 累计拉取并去重后的数据条数」与「后端上次返回的 total 字段」的较大值，
   * **包含已被缓存（LRU）淘汰的数据**；计算出的值会以 `total=<n>` 附加到请求 URL，
   * 供后端做增量 / 续传 / 进度判断；调用方也可显式传入以覆盖自动值。
   */
  total?: number
}

/** 实时数据回调 */
export type RealtimeHandler = (point: ChartDataPoint) => void

/**
 * 图表数据服务统一接口
 */
export interface ChartDataService {
  /** 每页拉取条数（服务实例级配置：构造时必填传入） */
  readonly fetchLimit: number

  /**
   * 拉取历史数据（按 time 升序返回）
   * 返回条数 < limit 时表示已无更早数据
   */
  fetchHistory(query: HistoryQuery): Promise<ChartDataPoint[]>

  /**
   * 订阅实时数据
   * @returns 取消订阅函数
   */
  subscribeRealtime(symbol: string, period: string, handler: RealtimeHandler): () => void
}
