/**
 * HttpChartDataService —— 接入真实后端的示例实现（HTTP 历史 + WebSocket 实时 + 历史数据缓存）
 *
 * 组件 / 控制器已通过 ChartDataService 接口解耦，接入后端只需：
 *   1. 本文件按你的后端地址配置 baseUrl / wsUrl（或直接改用你自己的字段名）；
 *   2. 在 App.vue 中把 `new MockChartDataService()` 替换为 `new HttpChartDataService({...})`；
 *   3. 如需鉴权 / 租户 / 版本等上下文，通过外部参数注入：
 *        headers  → 附加请求头（所有 HTTP 请求）；
 *        cookies  → 附加 Cookie（**对象形式**，序列化后注入所有 HTTP 请求的 Cookie 头）；
 *        params   → 附加 URL 查询参数（history / latest / SSE / WS 全部请求）。
 *
 * 后端接口约定（推荐直接对齐，可省去字段映射）：
 *   GET {baseUrl}/kline/history?symbol=<代码>&period=<周期>&before=<秒时间戳>&limit=<条数>
 *     响应：{ code: 200, msg?: "ok", data: [ { time, tradeDate, preClose, open, high, low, close, volume, amount } ] }
 *     - time: 秒级时间戳；tradeDate: 'YYYY-MM-DD'；preClose: 昨收
 *     - 数组按 time 升序返回；返回条数 < limit 表示已无更早数据
 *   WS  {wsUrl}?symbol=<代码>&period=<周期>
 *     推送：单条数据点对象 或 { data: 对象|数组 }
 *     - 与历史同结构；time 与最后一根相同 = 刷新该根，time 更大 = 追加新 K 线
 *
 * 兼容字段缩写：open/high/low/close/volume 也接受 o/h/l/c/v，均会自动映射。
 *
 * 数据缓存（默认开启）：
 *   - 按 `symbol|period` 缓存已拉取的历史数据（含分页前置插入的旧页），
 *     重复滑动回看 / 切回同标的时**零网络请求**，直接命中缓存返回；
 *   - 最新页缓存带 TTL（默认 30s），超时后重新拉取最新快照，保证盘中行情不陈旧；
 *   - 更早的分页历史属于不可变数据，不受 TTL 限制，直到被 LRU 淘汰；
 *   - 缓存条目按 LRU 淘汰（默认最多保留 12 个 symbol|period 组合），控制内存总量；
 *   - 返回给调用方的一律是独立副本，实时更新不会污染缓存。
 */
import type { ChartDataPoint } from '../types/chart'
import type { ChartDataService, HistoryQuery, RealtimeHandler } from './chartDataService'

/** HttpChartDataService 构造参数（baseUrl 必填，其余可选） */
export interface HttpChartDataServiceOptions {
  /** 后端 HTTP 地址，如 '/api'（开发走 vite proxy）或 'http://10.0.0.8:8080/api' */
  baseUrl: string
  /** 实时行情 WebSocket 地址（realtimeTransport='ws' 时使用）；不传则不做实时订阅 */
  wsUrl?: string
  /** SSE 实时地址（realtimeTransport='sse' 时使用）；缺省为 {baseUrl}/kline/stream */
  sseUrl?: string
  /** SSE 事件名，默认 'message'（部分后端用自定义事件名，如 'quote'） */
  sseEventName?: string
  /** 实时传输方式：'ws' WebSocket 推送（默认）/ 'poll' HTTP 轮询 / 'sse' Server-Sent Events */
  realtimeTransport?: 'ws' | 'poll' | 'sse'
  /** HTTP 轮询专用实时接口（realtimeTransport='poll' 时使用）；缺省为 {baseUrl}/kline/latest */
  pollUrl?: string
  /** HTTP 轮询频率 ms（realtimeTransport='poll' 时生效），默认 3000 */
  pollIntervalMs?: number
  /** 每次轮询拉取的最新根数（pollLimit），默认 1（增量过滤后回调，同根刷新也回调） */
  pollLimit?: number
  /** fetch 超时 ms，默认 8000 */
  timeoutMs?: number
  /**
   * 附加请求头（外部参数）：注入到**所有 HTTP 请求**（history / latest 轮询）的 fetch 头中，
   * 与默认的 Accept 合并（同名以这里的值为准）。示例：
   *   headers: { Authorization: 'Bearer <token>', 'X-App-Version': '1.0.0' }
   * 注意：SSE（EventSource）与 WebSocket 因浏览器安全限制**无法自定义请求头**，
   * 若鉴权依赖自定义头，请改用 realtimeTransport='poll'。
   */
  headers?: Record<string, string>
  /**
   * 附加 Cookie（外部参数）：**对象形式**，例如 { session: 'abc123', theme: 'dark' }，
   * 内部序列化为 `session=abc123; theme=dark` 注入到**所有 HTTP 请求**的 `Cookie` 头。
   * 注意：SSE/WebSocket 由浏览器自动携带当前域名 Cookie（同源），
   * 本参数**不会**注入到 SSE/WS（浏览器禁止自定义该头）；跨域时请配合后端 CORS credentials 或改用 poll。
   */
  cookies?: Record<string, string>
  /**
   * 附加 URL 查询参数（外部参数）：附加到**所有请求**（history / latest / SSE / WS）的
   * 查询字符串中，例如 { lang: 'zh-CN', market: 'SH' } → &lang=zh-CN&market=SH。
   * 同名冲突时 symbol/period/before/limit 等核心参数优先（外部 params 不会覆盖它们）。
   */
  params?: Record<string, string | number | boolean>
  /** 历史数据缓存开关，默认 true */
  cache?: boolean
  /** 缓存条目上限（LRU 淘汰），默认 12 */
  maxCacheEntries?: number
  /**
   * 「已知总条数」记录上限（knownTotals，独立于历史缓存、**缓存淘汰不清除**，
   * 表示该 key 目前有多少条数据、包括已被缓存淘汰的）。默认 64。
   * 仅当已知 key 数量超过该上限时，才按 LRU 淘汰最旧的 total 记录（防内存无限增长）。
   */
  maxKnownTotals?: number
  /** 最新页缓存有效期 ms（更早分页历史不受限），默认 30_000 */
  cacheTtlMs?: number
}

/**
 * 后端返回的最外层包裹（{ code, data, msg? }），兼容直接返回数组。
 * **业务码约定：code === 200 表示返回成功**；code 非 200 时视为失败，
 * 请求层会抛错（错误信息取 msg 字段）；直接返回数组视为成功。
 */
type BackendResponse = { code?: number; data?: unknown; msg?: string } | unknown[]

/** 单 key 缓存条目 */
interface CacheEntry {
  /** 已缓存数据（按 time 升序、去重；分页前置累积 + 最新页覆盖合并） */
  points: ChartDataPoint[]
  /** 最近一次"最新页"网络拉取时间（ms），用于最新页 TTL 判定 */
  fetchedAt: number
  /** LRU 最近使用时间（ms） */
  lastUsed: number
}

/**
 * HttpChartDataService —— 真实后端数据服务实现
 *
 *  - fetchHistory：HTTP GET {baseUrl}/kline/history（fetch + AbortController 超时）；
 *  - subscribeRealtime：三种实时模式（realtimeTransport 切换）：
 *      'ws'  ：WebSocket {wsUrl}?symbol=&period=（返回 () => ws.close() 清理函数）；
 *      'poll'：HTTP 轮询（默认 3000ms 一次，独立实时接口 {pollUrl ?? baseUrl}/kline/latest
 *              拉最新 pollLimit 根；增量过滤 + 同根刷新回调；防重入；
 *              返回 () => clearInterval 清理函数）；
 *      'sse' ：Server-Sent Events {sseUrl}?symbol=&period=（默认监听 message 事件，
 *              浏览器内建自动重连；返回 () => es.close() 清理函数）；
 *  - 历史数据 LRU 缓存（Map + 容量上限，命中/未命中都会更新时间戳，防内存无限增长）；
 *  - normalizePoint：兼容 open/high/low/close/volume 与 o/h/l/c/v 缩写字段。
 */
export class HttpChartDataService implements ChartDataService {
  private readonly opts: {
    baseUrl: string
    wsUrl?: string
    sseUrl?: string
    sseEventName: string
    realtimeTransport: 'ws' | 'poll' | 'sse'
    pollUrl?: string
    pollIntervalMs: number
    pollLimit: number
    timeoutMs: number
    /** 外部附加请求头（注入所有 HTTP fetch；SSE/WS 无法注入，见接口注释） */
    headers?: Record<string, string>
    /** 外部附加 Cookie（对象 → 序列化为 Cookie 头注入所有 HTTP fetch） */
    cookies?: Record<string, string>
    /** 外部附加 URL 查询参数（history/latest/SSE/WS 全部附加） */
    params?: Record<string, string | number | boolean>
    cache: boolean
    maxCacheEntries: number
    maxKnownTotals: number
    cacheTtlMs: number
  }

  /** 历史数据缓存：key = `${symbol}|${period}` */
  private cache = new Map<string, CacheEntry>()

  /**
   * 「已知总条数」knownTotals（key = `${symbol}|${period}`）：
   * 该 key **目前有多少条数据** = **累计拉取并去重后的数据条数**（后端不返回 total 字段，
   * 纯前端自动计算），**包含已被缓存（LRU）淘汰的数据**。
   * 与历史缓存**解耦**：缓存条目被 LRU 淘汰时不清除 total 记录（满足
   * "包括缓存淘汰的"语义）；自身按 maxKnownTotals 独立 LRU 淘汰，防内存无限增长。
   */
  private knownTotals = new Map<string, number>()

  constructor(options: HttpChartDataServiceOptions) {
    this.opts = {
      baseUrl: options.baseUrl,
      wsUrl: options.wsUrl,
      sseUrl: options.sseUrl,
      sseEventName: options.sseEventName ?? 'message',
      realtimeTransport: options.realtimeTransport ?? 'ws',
      pollUrl: options.pollUrl,
      pollIntervalMs: options.pollIntervalMs ?? 3000,
      pollLimit: options.pollLimit ?? 1,
      timeoutMs: options.timeoutMs ?? 8000,
      headers: options.headers,
      cookies: options.cookies,
      params: options.params,
      cache: options.cache ?? true,
      maxCacheEntries: options.maxCacheEntries ?? 12,
      maxKnownTotals: options.maxKnownTotals ?? 64,
      cacheTtlMs: options.cacheTtlMs ?? 30_000,
    }
  }

  /* ============================== 历史（HTTP + 缓存） ============================== */

  async fetchHistory(query: HistoryQuery): Promise<ChartDataPoint[]> {
    const key = `${query.symbol}|${query.period}`
    // cache=false：仍自动计算并记录 total（供 getTotal / URL 附加），但不缓存数据
    if (!this.opts.cache) {
      const points = await this.fetchNetwork(query, query.total ?? this.knownTotals.get(key))
      // 自动计算 = 本次拉取并去重后的条数（后端不返回 total 字段，纯前端口径）
      this.recordTotal(key, Math.max(this.knownTotals.get(key) ?? 0, points.length))
      return points
    }

    const now = Date.now()
    const entry = this.cache.get(key)

    if (entry && entry.points.length) {
      entry.lastUsed = now // LRU 触碰
      if (query.before === undefined) {
        // —— 最新页请求：缓存命中且未过期 → 直接返回缓存中最新 pageSize 根 ——
        if (now - entry.fetchedAt < this.opts.cacheTtlMs) {
          return clonePoints(entry.points.slice(-query.limit))
        }
        // 已过期：不命中，走网络刷新（保证盘中快照新鲜）
      } else {
        // —— 更早分页请求：历史数据不可变，只要缓存中已有该区间就命中（不受 TTL 限制）——
        const before = query.before // 局部常量：闭包内可被 TS 正确收窄
        const older = entry.points.filter((p) => p.time < before)
        if (older.length) return clonePoints(older.slice(-query.limit))
      }
    }

    // —— 网络拉取 + 写缓存 ——
    // total 自动计算：调用方显式传 query.total > 服务已知 total（knownTotals，含缓存淘汰）。
    // 后端不返回 total 字段 → 纯前端口径：total = 累计拉取并去重后的条数（单调不减，
    // 即使缓存 LRU 淘汰也由 knownTotals 持久记住，满足"包括缓存淘汰的"）。
    const autoTotal = query.total ?? this.knownTotals.get(key)
    const page = await this.fetchNetwork(query, autoTotal)
    const mergedCount = entry ? mergePoints(page, entry.points).length : page.length
    this.recordTotal(key, Math.max(this.knownTotals.get(key) ?? 0, mergedCount))
    if (!this.opts.cache) return page

    if (!entry) {
      this.cache.set(key, {
        points: clonePoints(page),
        fetchedAt: now,
        lastUsed: now,
      })
    } else {
      // 合并去重（新拉取的 page 优先覆盖同 time 的旧根），保持 time 升序
      entry.points = mergePoints(page, entry.points)
      entry.lastUsed = now
      // 只有拉"最新页"才刷新快照时间；更早分页不改变最新快照的有效期
      if (query.before === undefined) entry.fetchedAt = now
    }
    this.evict()

    // 返回独立副本，避免控制器实时更新（push / 替换元素）污染缓存
    return clonePoints(page)
  }

  /**
   * 查询某标的/周期**目前有多少条数据**（自动计算，含已被缓存淘汰的；后端不返回 total 字段）。
   *  - 未请求过该 key 时返回 undefined；
   *  - 计算口径 = **累计拉取并去重后的数据条数**（单调不减：新拉取的 page 与既有缓存
   *    合并去重后取条数最大值），该记录与历史缓存**解耦**（缓存 LRU 淘汰不清除，
   *    仅 knownTotals 自身达到 maxKnownTotals 上限时才按 LRU 淘汰最旧记录）；
   *  - 也可直接给 fetchHistory 传 `query.total` 覆盖自动值。
   * 用途示例：判断该标的在该周期下目前有多少条 K 线，用于"是否还有更早历史"提示。
   */
  getTotal(symbol: string, period: string): number | undefined {
    return this.knownTotals.get(`${symbol}|${period}`)
  }

  /**
   * 记录（刷新）某 key 的已知总条数，并做 knownTotals 独立 LRU：
   *  - 已有 key：先 delete 再 set → 移到 Map 末尾（最近使用）；
   *  - 超过 maxKnownTotals 上限时淘汰最旧（Map 首个）记录。
   * 缓存条目被 LRU 淘汰时**不调用**本方法删除——total 语义"包括缓存淘汰的"。
   */
  private recordTotal(key: string, total: number): void {
    this.knownTotals.delete(key)
    this.knownTotals.set(key, total)
    while (this.knownTotals.size > this.opts.maxKnownTotals) {
      const oldest = this.knownTotals.keys().next().value
      if (oldest === undefined) break
      this.knownTotals.delete(oldest)
    }
  }

  /* ============================== 实时（WS 推送 / HTTP 轮询） ============================== */

  subscribeRealtime(symbol: string, period: string, handler: RealtimeHandler): () => void {
    // —— HTTP 轮询模式（realtimeTransport='poll'）：复用 history 接口按频率拉最新 ——
    if (this.opts.realtimeTransport === 'poll') {
      return this.startPolling(symbol, period, handler)
    }

    // —— SSE 模式（realtimeTransport='sse'）：{sseUrl}?symbol=&period= ——
    if (this.opts.realtimeTransport === 'sse') {
      return this.startSSE(symbol, period, handler)
    }

    // —— WebSocket 模式（默认）：{wsUrl}?symbol=&period=（+外部 params）——
    if (!this.opts.wsUrl) return () => {}

    const ws = new WebSocket(
      this.withParams(this.opts.wsUrl, {
        symbol: symbol,
        period: period,
      }),
    )

    ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as Record<string, unknown>
        // 三种形态：数组 | { data: 点/数组 } | 裸单点对象（data 缺省时按 msg 本身处理）
        const points = Array.isArray(msg) ? msg : msg.data !== undefined ? msg.data : msg
        const list = Array.isArray(points) ? points : points !== undefined ? [points] : []
        list.forEach((raw) => handler(normalizePoint(raw as Record<string, unknown>)))
      } catch (e) {
        console.error('[HttpChartDataService] 实时消息解析失败：', e)
      }
    }
    ws.onerror = (e) => {
      console.error('[HttpChartDataService] WebSocket 连接错误：', e)
    }

    return () => {
      ws.close()
    }
  }

  /**
   * HTTP 轮询实时模式（startPolling 内部实现）
   *
   * 行为约定：
   *  - 频率：注册后立即拉取一次，之后每 pollIntervalMs 拉取一次（setInterval）；
   *  - 数据源：独立实时接口 fetchLatest（**不复用 history 历史接口**），
   *    GET {pollUrl ?? baseUrl}/kline/latest?symbol=&period=&limit=pollLimit，
   *    直接 fetch 网络（不走历史缓存，保证每次拿到后端最新）；
   *  - 增量过滤：只回调 time >= 已回调最大 time 的点（升序；同根盘中刷新也回调，
   *    控制器 series.update() 对同 time 是覆盖语义，无重复副作用）；
   *  - 防重入：上一次请求未返回时跳过本轮（慢接口不叠加请求、不并发）；
   *  - 缓存同步：每次成功拉取后 merge 进历史缓存（保持最新快照一致，供后续 fetchHistory 命中）；
   *  - 清理：返回 () => { stopped = true; clearInterval(timer) }。
   */
  private startPolling(symbol: string, period: string, handler: RealtimeHandler): () => void {
    let inFlight = false
    let stopped = false
    let lastTime = -Infinity // 已回调的最大 time；>= 它才回调（首次拉取整页最新全回调）

    const tick = async () => {
      if (stopped || inFlight) return
      inFlight = true
      try {
        const key = `${symbol}|${period}`
        const points = await this.fetchLatest(
          {
            symbol,
            period,
            limit: this.opts.pollLimit,
          },
          this.knownTotals.get(key), // 自动计算的已知条数（含缓存淘汰），附加到 latest URL
        )
        // 增量过滤（同根刷新也保留）：仅回调 time >= lastTime 的点
        const fresh = points.filter((p) => p.time >= lastTime)
        if (fresh.length) lastTime = fresh[fresh.length - 1].time
        fresh.forEach((p) => handler(p))
        // 同步进历史缓存（不读取缓存，只写入，保持最新快照一致）
        this.mergeIntoCache(symbol, period, points)
        // 自动计算 knownTotals = max(已知, 累计去重后持有条数)（后端不返回 total）
        this.recordTotal(key, Math.max(this.knownTotals.get(key) ?? 0, points.length))
      } catch (e) {
        // 单次失败不中断轮询（网络抖动自愈），下一轮自动重试
        console.error('[HttpChartDataService] HTTP 轮询失败（下轮自动重试）：', e)
      } finally {
        inFlight = false
      }
    }

    void tick() // 立即拉一次（不等首个间隔）
    const timer = setInterval(tick, this.opts.pollIntervalMs)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }

  /**
   * SSE 实时模式（startSSE 内部实现）
   *
   * 行为约定：
   *  - 端点：{sseUrl ?? baseUrl}/kline/stream?symbol=&period=（EventSource 自动携带 Cookie/凭证）；
   *  - 事件：默认监听 'message' 事件（sseEventName 可改，如后端自定义 'quote'）；
   *    数据格式与 WS 一致：单点对象或 { data: 对象 | 数组 }，经 normalizePoint 规范化；
   *  - 重连：EventSource 浏览器内建自动重连（无需手动处理）；
   *  - 清理：返回 () => es.close()。
   */
  private startSSE(symbol: string, period: string, handler: RealtimeHandler): () => void {
    const url = this.withParams(this.opts.sseUrl ?? `${this.opts.baseUrl}/kline/stream`, {
      symbol,
      period,
    })
    const es = new EventSource(url)

    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as Record<string, unknown>
        // 三种形态：数组 | { data: 点/数组 } | 裸单点对象（data 缺省时按 msg 本身处理）
        const points = Array.isArray(msg) ? msg : msg.data !== undefined ? msg.data : msg
        const list = Array.isArray(points) ? points : points !== undefined ? [points] : []
        list.forEach((raw) => handler(normalizePoint(raw as Record<string, unknown>)))
      } catch (e) {
        console.error('[HttpChartDataService] SSE 消息解析失败：', e)
      }
    }

    if (this.opts.sseEventName === 'message') {
      es.onmessage = onMessage
    } else {
      es.addEventListener(this.opts.sseEventName, onMessage)
    }
    es.onerror = (e) => {
      // EventSource 断开后由浏览器自动重连，这里只记录日志
      console.error('[HttpChartDataService] SSE 连接错误（浏览器将自动重连）：', e)
    }

    return () => {
      es.close()
    }
  }

  /** 将轮询拉到的最新点合并进历史缓存（无缓存条目则创建） */
  private mergeIntoCache(symbol: string, period: string, points: ChartDataPoint[]): void {
    if (!this.opts.cache) return
    const key = `${symbol}|${period}`
    const now = Date.now()
    const entry = this.cache.get(key)
    if (!entry) {
      this.cache.set(key, { points: clonePoints(points), fetchedAt: now, lastUsed: now })
    } else {
      entry.points = mergePoints(points, entry.points)
      entry.fetchedAt = now // 最新快照时间刷新（历史 TTL 判定以最新页为准）
      entry.lastUsed = now
    }
    this.evict()
  }

  /* ============================== 私有工具 ============================== */

  /**
   * 构造带查询参数的请求 URL（history / latest / SSE / WS 统一入口）：
   *  - query 为调用方核心参数（symbol / period / before / limit 等）；
   *  - 外部附加 params（opts.params，外部参数）追加在其后；
   *  - **同名冲突时核心参数优先**：先写入外部 params、再写入核心参数，
   *    因此外部参数不会覆盖 symbol/period 等核心字段。
   */
  private withParams(base: string, query: Record<string, string | number>): string {
    const sp = new URLSearchParams()
    // 外部 params 为空对象时不参与拼接（不产生任何附加查询参数）
    if (this.opts.params && Object.keys(this.opts.params).length > 0) {
      Object.entries(this.opts.params).forEach(([k, v]) => sp.set(k, String(v)))
    }
    Object.entries(query).forEach(([k, v]) => sp.set(k, String(v)))
    return `${base}?${sp.toString()}`
  }

  /** fetch + 超时控制（统一注入外部 headers / Cookie） */
  private async request(url: string): Promise<unknown> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs)
    try {
      // 请求头合并顺序：默认 Accept → 外部附加 headers（同名覆盖）→ 外部附加 Cookie（对象序列化）
      const headers: Record<string, string> = { Accept: 'application/json' }
      // 空对象不参与注入：只有非空 headers / cookies 才合并
      if (this.opts.headers && Object.keys(this.opts.headers).length > 0) {
        Object.assign(headers, this.opts.headers)
      }
      if (this.opts.cookies && Object.keys(this.opts.cookies).length > 0) {
        headers.Cookie = serializeCookies(this.opts.cookies)
      }
      const res = await fetch(url, { signal: ctrl.signal, headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as BackendResponse
      // 业务码校验：对象包裹且带 code 时，**code === 200 表示成功**；非 200 视为失败，
      // 抛出带 msg 的业务错误（便于上层/控制台定位后端拒绝原因）。
      if (!Array.isArray(body) && body.code !== undefined && body.code !== 200) {
        throw new Error(`后端业务错误(code=${body.code})：${body.msg ?? '(无错误信息)'}`)
      }
      return body
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * HTTP 轮询实时专用接口：GET {pollUrl ?? baseUrl}/kline/latest?symbol=&period=&limit=
   *
   * 与 fetchNetwork（history 历史接口）相互独立——实时轮询不经过历史接口，
   * 后端可对 /kline/latest 单独做轻量响应（只回最新 pollLimit 根）。
   * 响应格式与 history 一致：{ code: 200, data: [...] }（兼容数组 / 单点）。
   * @param knownTotal 服务自动计算的已知条数（含缓存淘汰）；已知时以 `total=<n>` 附加 URL
   */
  private async fetchLatest(query: HistoryQuery, knownTotal?: number): Promise<ChartDataPoint[]> {
    const core: Record<string, string> = {
      symbol: query.symbol,
      period: query.period,
      limit: String(query.limit),
    }
    if (knownTotal !== undefined) core.total = String(knownTotal) // 自动计算/显式传入的 total

    const url = this.withParams(this.opts.pollUrl ?? `${this.opts.baseUrl}/kline/latest`, core)
    const res = (await this.request(url)) as BackendResponse

    const body = Array.isArray(res) ? res : ((res as { data?: unknown }).data ?? [])
    if (!Array.isArray(body)) throw new Error('后端实时数据格式异常：期望数组')
    return body.map((raw) => normalizePoint(raw as Record<string, unknown>))
  }

  /**
   * 纯网络拉取（不带缓存读写），返回原始响应标准化后的数组：
   *  - 后端不返回 total 字段（前端纯自动计算口径）；
   *  - knownTotal：服务自动计算的已知条数（含缓存淘汰），以 `total=<n>` 附加到请求 URL，
   *    供后端做增量 / 续传 / 进度判断（未知则不附加）。
   */
  private async fetchNetwork(query: HistoryQuery, knownTotal?: number): Promise<ChartDataPoint[]> {
    const core: Record<string, string> = {
      symbol: query.symbol,
      period: query.period,
      limit: String(query.limit),
    }
    if (query.before !== undefined) core.before = String(query.before)
    if (knownTotal !== undefined) core.total = String(knownTotal) // 自动计算/显式传入的 total

    const url = this.withParams(`${this.opts.baseUrl}/kline/history`, core)
    const res = (await this.request(url)) as BackendResponse

    const body = Array.isArray(res) ? res : ((res as { data?: unknown }).data ?? [])
    if (!Array.isArray(body)) throw new Error('后端历史数据格式异常：期望数组')
    return body.map((raw) => normalizePoint(raw as Record<string, unknown>))
  }

  /** LRU 淘汰：超出 maxCacheEntries 时移除最近未使用（lastUsed 最小）的条目。
   *  **注意**：不删除 knownTotals 记录——total 语义为"包括已被缓存淘汰的数据"，
   *  该记录由 recordTotal 独立 LRU（maxKnownTotals）管理。 */
  private evict(): void {
    if (this.cache.size <= this.opts.maxCacheEntries) return
    let oldestKey: string | null = null
    let oldest = Infinity
    this.cache.forEach((e, k) => {
      if (e.lastUsed < oldest) {
        oldest = e.lastUsed
        oldestKey = k
      }
    })
    if (oldestKey) {
      this.cache.delete(oldestKey)
      // 注意：knownTotals 记录**不随缓存淘汰删除**（total 语义包含已被淘汰的数据），
      // 由 recordTotal 独立 LRU（maxKnownTotals 上限）管理，防内存增长。
    }
  }
}

/* ============================== 缓存合并 / 拷贝工具 ============================== */

/**
 * Cookie 对象 → Cookie 头字符串：
 *   { session: 'abc123', theme: 'dark' } → 'session=abc123; theme=dark'
 * （多组以 `; ` 分隔，与 RFC 6265 Cookie 头格式一致）
 */
const serializeCookies = (cookies: Record<string, string>): string =>
  Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')

/** 独立副本（新数组 + 新元素对象），防止调用方修改污染缓存 */
const clonePoints = (list: ChartDataPoint[]): ChartDataPoint[] => {
  return list.map((p) => ({ ...p }))
}

/**
 * 合并两组数据并按 time 升序去重。
 * 前者（新拉取页）优先：同 time 时以 a 的值为准（最新页刷新旧根 / 分页覆盖）。
 */
const mergePoints = (a: ChartDataPoint[], b: ChartDataPoint[]): ChartDataPoint[] => {
  const map = new Map<number, ChartDataPoint>()
  for (const p of b) map.set(p.time, p)
  for (const p of a) map.set(p.time, p)
  return [...map.values()].sort((x, y) => x.time - y.time)
}

/* ============================== 字段标准化 ============================== */

/** 秒时间戳或 ISO 字符串 → 秒时间戳 */
const toSeconds = (time: unknown): number => {
  if (typeof time === 'number') return Math.floor(time)
  const t = new Date(time as string).getTime()
  return Math.floor(t / 1000)
}

/** 秒时间戳 → 'YYYY-MM-DD'（UTC，交易日归属日线） */
const toTradeDate = (sec: number): string => {
  const d = new Date(sec * 1000)
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

/** 后端点 → ChartDataPoint（兼容 open/high/low/close/volume 与 o/h/l/c/v 缩写） */
export const normalizePoint = (raw: Record<string, unknown>): ChartDataPoint => {
  const time = toSeconds(raw.time ?? raw.t)
  const pointType = (raw.pointType as ChartDataPoint['pointType']) ?? 'kline'

  const p: ChartDataPoint = {
    time,
    tradeDate: (raw.tradeDate as string) ?? toTradeDate(time),
    preClose: Number(raw.preClose ?? raw.pre ?? 0),
    pointType,
  }

  if (pointType === 'kline') {
    p.open = Number(raw.open ?? raw.o ?? 0)
    p.high = Number(raw.high ?? raw.h ?? 0)
    p.low = Number(raw.low ?? raw.l ?? 0)
    p.close = Number(raw.close ?? raw.c ?? 0)
    if (raw.volume !== undefined || raw.v !== undefined) p.volume = Number(raw.volume ?? raw.v)
    if (raw.amount !== undefined || raw.a !== undefined) p.amount = Number(raw.amount ?? raw.a)
  } else if (pointType === 'timeshare') {
    if (raw.price !== undefined) p.price = Number(raw.price)
    if (raw.avgPrice !== undefined) p.avgPrice = Number(raw.avgPrice)
    if (raw.volume !== undefined || raw.v !== undefined) p.volume = Number(raw.volume ?? raw.v)
    if (raw.amount !== undefined || raw.a !== undefined) p.amount = Number(raw.amount ?? raw.a)
  } else if (pointType === 'auction') {
    if (raw.matched !== undefined) p.matched = Number(raw.matched)
    if (raw.unMatched !== undefined) p.unMatched = Number(raw.unMatched)
    if (raw.matchType !== undefined) p.matchType = Number(raw.matchType) as 1 | -1
    if (raw.isAuction !== undefined) p.isAuction = Boolean(raw.isAuction)
  }

  // 其他扩展字段透传
  Object.entries(raw).forEach(([k, v]) => {
    if (!(k in p)) (p as Record<string, unknown>)[k] = v
  })

  return p
}
