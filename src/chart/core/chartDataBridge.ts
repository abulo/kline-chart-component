/**
 * chartDataBridge.ts —— 数据 IO 桥（v1.7.2 自 KLineChartController.ts 拆分）
 *
 * 职责边界：只负责"数据获取"这一侧——
 *  - 历史首载（init）：拉最新一页历史 → 回调 onHistory 交还 controller 回填；
 *  - 更早历史翻页（loadEarlier）：before 锚点拉更早页 → 回调 onPrepend 前置插入；
 *  - 实时订阅生命周期（startRealtime / unsubscribe / dispose）：先退订旧订阅
 *    保证唯一，回调 onRealtimePoint 入队节流消费；
 *  - 加载状态（onStatus）与竞态守卫（loadSeq 代际）。
 *
 * 与数据处理解耦：controller 不感知请求细节，本类不感知 series / 缓存 / 渲染。
 * 拉到的数据一律经 deps 回调交还 controller（setKlineData / prependHistory /
 * enqueueRealtimePoint / getEarliestTime），保证拆分后行为与单文件时代完全一致。
 */
import type { ChartDataPoint } from '../../types/chart'
import type { ChartDataService } from '../../services/chartDataService'
import { RequestTimeoutError } from '../../services/httpChartDataService'
import type { PeriodValueOrEmpty } from '../periods'
import type { ChartLoadStatus } from './types'

/** ChartDataBridge 依赖（controller 注入回调，惰性 getter 取最新值——周期 / 标的切换后无需重建桥） */
export interface ChartDataBridgeDeps {
  /** 当前股票代码（fetchHistory / subscribeRealtime 参数） */
  getSymbol: () => string
  /** 当前周期（fetchHistory / subscribeRealtime 参数） */
  getPeriod: () => PeriodValueOrEmpty
  /** 当前数据服务（组件注入；undefined = 未注入，init 直接 error） */
  getService: () => ChartDataService | undefined
  /** 加载状态回调（controller 原 setStatus 逻辑：透传 onStatusChange） */
  onStatus: (status: ChartLoadStatus) => void
  /** 历史页数据回填（controller.setKlineData：过滤周期点 → 重建 series / 指标缓存 → 视口） */
  onHistory: (points: ChartDataPoint[]) => void
  /** 更早历史前置插入（controller.prependHistory；返回实际新增条数，0 = 无更早数据） */
  onPrepend: (points: ChartDataPoint[]) => number
  /** 当前最早一根 time（controller.getEarliestTime；翻页 before 锚点，无数据时 undefined） */
  onEarliest: () => number | undefined
  /** 实时单点入队（controller.enqueueRealtimePoint：REALTIME_FLUSH_MS 窗口批量消费） */
  onRealtimePoint: (point: ChartDataPoint) => void
}

/** 数据 IO 桥：历史首载 / 更早翻页 / 实时订阅生命周期 / 加载状态。
 *  竞态守卫（loadSeq 代际）与退订清理均在类内，controller 只做数据处理与渲染。 */
export class ChartDataBridge {
  /** 加载代际（init 递增；过期异步响应据此丢弃：期间切换周期 / 标的 / dispose） */
  private loadSeq = 0
  /** 是否还有更早历史（首载返回满页 = 有；供左滑边缘触发翻页） */
  private hasMoreHistory = true
  /** 更早历史加载中标志（防抖：一次只允许一个在途请求） */
  private loadingEarlier = false
  /** 实时订阅退订函数（先退订旧订阅保证唯一；dispose 时清除） */
  private realtimeUnsubscribe: (() => void) | null = null

  constructor(private readonly deps: ChartDataBridgeDeps) {}

  /**
   * 首次初始化（v1.6.17 由组件统一调用，替代原组件 loadData + setupRealtime）：
   * 拉取最新一页历史 → onHistory 全量重绘 + fitContent → 订阅实时推送。
   * 竞态保护：loadSeq 代际丢弃过期响应；失败 → status='error' 不抛异常。
   * 状态：'loading'（首载）→ 'ready' / 'error'。
   */
  init = async (): Promise<void> => {
    // v1.7.1 修复：symbol / period 未就绪（父组件异步加载代码 / 暂未传入）时不发起请求——
    // 组件 onMounted 创建 controller 后立即 init，构造快照 symbol / period 可能为空
    // （symbol='' → 第一次请求出现 `symbol=` 空参数；period='' → 空周期无意义请求）。
    // 之后就位 → props watch → setSymbol / setPeriod + debouncedInit → 重新拉取。
    // 这里直接跳过，避免无效请求；状态保持 idle 等待后续 init。
    const { symbol, period } = this.currentParams()
    if (!symbol || !period) return
    this.deps.onStatus('loading')
    const seq = ++this.loadSeq
    const service = this.deps.getService()
    if (!service) {
      console.error('[KLineChart] init: 未注入 ChartDataService（组件构造时传 service）')
      this.deps.onStatus('error')
      return
    }
    try {
      const points = await this.fetchHistoryWithRetry(seq)
      if (seq !== this.loadSeq) return // 期间又切换了周期 / 标的 → 丢弃过期响应
      // 返回满页说明还有更早数据，允许后续左滑边缘自动加载
      this.hasMoreHistory = points.length >= service.fetchLimit
      this.deps.onHistory(points)
      this.deps.onStatus('ready')
      this.startRealtime()
    } catch (error) {
      if (seq !== this.loadSeq) return
      console.error('[KLineChart] init failed:', error)
      this.deps.onStatus('error')
    }
  }

  /**
   * 拉取最新一页历史：请求超时自动重试 1 次（v1.7.2）。
   *  - 背景：history 接口偶发超时（网络抖动 / 后端慢 / 首次冷加载）时，
   *    此前裸 AbortError 直接走 error 路径，图表首载失败无自愈；
   *  - 行为：仅在 RequestTimeoutError（service 层语义化超时）时重试一次；
   *    其他错误（HTTP 状态 / 业务码 / 网络异常）原样抛出，由 init 走 error 路径；
   *  - 竞态：重试同样受 loadSeq 守卫——期间切换周期 / 标的 / dispose
   *    则静默丢弃过期响应（状态由新 init 自己发），不重复请求。
   */
  private fetchHistoryWithRetry = async (seq: number): Promise<ChartDataPoint[]> => {
    const service = this.deps.getService()
    if (!service) return []
    const { symbol, period } = this.currentParams()
    const doFetch = () =>
      service.fetchHistory({ symbol, period, limit: service.fetchLimit })
    try {
      return await doFetch()
    } catch (error) {
      if (seq !== this.loadSeq) return [] // 期间切换 / 销毁 → 静默丢弃
      if (error instanceof RequestTimeoutError) {
        console.warn('[KLineChart] 历史请求超时，自动重试 1 次…')
        return await doFetch()
      }
      throw error
    }
  }

  /** 订阅实时行情（先退订旧订阅保证唯一；回调 = 控制器增量更新最后一根） */
  private startRealtime = (): void => {
    this.realtimeUnsubscribe?.()
    const service = this.deps.getService()
    if (!service) return
    // v1.7.1 节流：订阅回调走 enqueueRealtimePoint（REALTIME_FLUSH_MS 窗口内
    // 批量合并 + trailing 保末点），高频推送不逐点重建指标缓存
    const { symbol, period } = this.currentParams()
    this.realtimeUnsubscribe = service.subscribeRealtime(symbol, period, point =>
      this.deps.onRealtimePoint(point)
    )
  }

  /**
   * 加载更早一页历史（左滑到最左边缘自动触发）：
   * 以当前最早一根 time 为 before 锚点拉取更早页 → onPrepend 前置插入。
   * 停止条件：返回条数 < limit（服务语义：无更早数据）或合并新增 0（重复页）。
   */
  loadEarlier = async (): Promise<void> => {
    if (this.loadingEarlier || !this.hasMoreHistory) return
    const service = this.deps.getService()
    if (!service) return
    const earliest = this.deps.onEarliest()
    if (earliest === undefined) return
    this.loadingEarlier = true
    const seq = this.loadSeq
    // v1.6.20：左滑分页回传 'loading-older'（与首次加载 'loading' 区分）
    this.deps.onStatus('loading-older')
    try {
      const { symbol, period } = this.currentParams()
      const points = await service.fetchHistory({
        symbol,
        period,
        before: earliest,
        limit: service.fetchLimit,
      })
      if (seq !== this.loadSeq) return // 期间重新 init（周期 / 标的切换）→ 丢弃，状态由新 init 自己发
      const added = this.deps.onPrepend(points)
      if (added === 0 || points.length < service.fetchLimit) this.hasMoreHistory = false
      this.deps.onStatus('ready')
    } catch (error) {
      if (seq !== this.loadSeq) return
      console.error('[KLineChart] loadEarlier failed:', error)
      this.deps.onStatus('error')
    } finally {
      this.loadingEarlier = false
    }
  }

  /** 数据回填后同步"是否还有更早历史"（controller.setKlineData 调用：满页 = 有） */
  setHasMoreHistory = (value: boolean): void => {
    this.hasMoreHistory = value
  }

  /** 解除实时订阅（外部周期 / 标的切换前调用，保证订阅唯一） */
  unsubscribe = (): void => {
    this.realtimeUnsubscribe?.()
    this.realtimeUnsubscribe = null
  }

  /** 销毁：使在途 init / loadEarlier 请求全部失效（代际递增）+ 解除订阅 */
  dispose = (): void => {
    this.loadSeq++
    this.unsubscribe()
  }

  /** 当前拉取参数快照（symbol / period 惰性取最新值） */
  private currentParams = (): { symbol: string; period: PeriodValueOrEmpty } => ({
    symbol: this.deps.getSymbol(),
    period: this.deps.getPeriod(),
  })
}
