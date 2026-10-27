/**
 * chartDataService.ts —— 图表数据服务接口层（仅接口定义，实现见同目录实现文件）
 *
 * 本文件只声明数据访问契约，不包含任何实现：
 *  - MockChartDataService（mockChartDataService.ts）：本地模拟实现（默认注入）；
 *  - HttpChartDataService（httpChartDataService.ts）：HTTP / SSE / WS 接入真实行情。
 *
 * 接入真实行情时实现本接口替换 Mock 即可，组件与控制器无需改动。
 */
import type { ChartDataPoint } from '../types/chart'

/* ============================== 接口定义 ============================== */

/**
 * 历史数据查询参数（fetchHistory 的入参）。
 */
export interface HistoryQuery {
  /** 证券代码，如 '600000.SH'（后端标识） */
  symbol: string
  /**
   * 周期标识：'day'（日线）/ 'week' / 'month' / '60min' / '30min' / '15min' /
   * '5min' / '1min'（分钟 K）；分时周期 '1d'~'5d'。
   */
  period: string
  /**
   * 拉取锚点：取该时间戳（秒）**之前**的数据（向左分页加载更早历史时使用）；
   * 不传则取最新一页。
   */
  before?: number
  /** 每页条数（服务实例级 fetchLimit 同值） */
  limit: number
  /**
   * 当前已持有的数据条数（可选，供后端增量 / 续传 / 进度判断）。
   * **HttpChartDataService 会自动计算**：未传时由服务层推导——
   * 取「该 symbol|period 累计拉取并去重后的数据条数」与「后端上次返回的 total 字段」
   * 的较大值，**包含已被缓存（LRU）淘汰的数据**；计算值以 `total=<n>` 附加到请求 URL。
   * 调用方也可显式传入以覆盖自动值。
   */
  total?: number
}

/**
 * 实时数据回调（subscribeRealtime 的出参，每收到一个实时点调用一次）。
 * @param point 实时数据点：`time` 与最后一根相同 = 刷新该根；`time` 更大 = 追加新 K 线
 */
export type RealtimeHandler = (point: ChartDataPoint) => void

/**
 * 图表数据服务统一接口（历史分页拉取 + 实时订阅）。
 * 组件 / 控制器只依赖本接口，不感知具体实现（Mock / HTTP）。
 */
export interface ChartDataService {
  /** 每页拉取条数（服务实例级配置：构造时必填传入） */
  readonly fetchLimit: number

  /**
   * 拉取历史数据。
   * @param query 查询入参（symbol / period / before / limit / total，见 HistoryQuery）
   * @returns 按 time 升序的数据点数组；**返回条数 < limit 时表示已无更早数据**
   *          （组件据此停止向左分页）
   */
  fetchHistory(query: HistoryQuery): Promise<ChartDataPoint[]>

  /**
   * 订阅实时数据（K 线 tick / 分时每分钟刷新推送）。
   * @param symbol 证券代码
   * @param period 周期标识
   * @param handler 实时回调（见 RealtimeHandler）
   * @returns 取消订阅函数——调用后停止推送并清理定时器 / 连接（防内存泄漏）
   */
  subscribeRealtime(symbol: string, period: string, handler: RealtimeHandler): () => void
}
