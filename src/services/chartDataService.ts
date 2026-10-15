/**
 * 图表数据服务层
 *
 * - ChartDataService：统一的数据访问接口（历史分页拉取 + 实时订阅）。
 *   接入真实行情（HTTP 接口 / WebSocket）时，实现该接口替换 Mock 即可，
 *   组件与控制器无需改动。
 *
 * - MockChartDataService：本地模拟实现，
 *   内置约 3 年日线数据池，支持向左滚动分页加载、模拟实时 tick 与新 K 线推送；
 *   分时周期（1d~5d）按最近 N 个交易日生成 241 分钟分时点/交易日（价格线/均价线/量），
 *   并支持分时实时推送（模拟盘中每分钟刷新）。
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

/* ============================= Mock 实现 ============================= */

/** 模拟网络延迟 */
const NETWORK_DELAY = 220

/** 分钟 K 周期 → 每根 K 线聚合的分钟数（60分/30分/15分/5分/1分） */
/** 分钟 K 基础池覆盖的交易日数（60 日 ≈ 3 个月量级，足够 60/30/15/5/1 分 K 展示） */
const MINUTE_POOL_DAYS = 60

const MINUTE_GRANULARITY: Record<string, number> = {
  '60min': 60,
  '30min': 30,
  '15min': 15,
  '5min': 5,
  '1min': 1,
}

/** 是否为分钟 K 周期 */
const isMinutePeriod = (period: string): boolean =>
  Object.prototype.hasOwnProperty.call(MINUTE_GRANULARITY, period)

/**
 * 把一组「数据点」按桶聚合为 K 线（OHLC + 累计量额）。
 * @param points  升序数据点：分时点（price 口径）或日 K 点（open/high/low/close 口径）
 * @param bucketOf 返回该点所属桶的 key（秒级时间戳，同 key 的点聚合为同一根 K）
 * @param mode    'ts'：分时点聚合（price → OHLC）；'kline'：K 线点聚合（直接取 OHLC）
 */
const aggregateToBars = (
  points: ChartDataPoint[],
  bucketOf: (p: ChartDataPoint) => number,
  mode: 'ts' | 'kline',
): ChartDataPoint[] => {
  const out: ChartDataPoint[] = []
  for (const p of points) {
    const k = bucketOf(p)
    const last = out[out.length - 1]
    const o = mode === 'ts' ? p.price : p.open
    const h = mode === 'ts' ? p.price : p.high
    const l = mode === 'ts' ? p.price : p.low
    const c = mode === 'ts' ? p.price : p.close
    if (!last || last.time !== k) {
      // 新桶：以当前点开新 K（OHLC 起始 = 当前点，后续点更新 high/low/close）
      out.push({
        time: k,
        tradeDate: p.tradeDate,
        preClose: p.preClose,
        pointType: 'kline',
        open: o,
        high: h,
        low: l,
        close: c,
        volume: p.volume ?? 0,
        amount: p.amount ?? 0,
      })
    } else {
      last.high = Math.max(last.high ?? 0, h ?? 0)
      last.low = Math.min(last.low ?? Infinity, l ?? 0)
      last.close = c
      last.volume = (last.volume ?? 0) + (p.volume ?? 0)
      last.amount = (last.amount ?? 0) + (p.amount ?? 0)
      last.tradeDate = p.tradeDate // 桶内最后点的交易日期（周/月 K 落在末交易日）
    }
  }
  // 桶 key 可能为「周/月起点」时间戳：周 K 落在周一 00:00、月 K 落在 1 日 00:00（本地口径），
  // 与库时间轴日/周/月线展示兼容；分钟 K 桶 key 即段首分钟 time。
  return out
}

/**
 * 分时点 → 桶 key：按「当日分钟点序号」每 N 个点一段（N = 每根 K 聚合分钟数）。
 * 段 key = 当日 00:00（UTC+8 口径） + 段序号 × N × 60（即段内首个分钟点的 time）。
 * 用点序号而非 time 差：sessionMinutes 在午休（11:30→13:01）编号不连续，
 * 按 time 差分段会把午休前后的点错误拆入不同段（跳段）；按序号每 N 个点
 * 聚合则每日恒为 ceil(241/N) 段（60分=4、30分=8、15分=16、5分=48、1分=241）。
 * 注：Mock 简化口径——午休后段起点取「序号对齐」时刻（如 60 分第三段起点 11:30），
 * 与东财按交易时段 13:00 起略有差异，仅影响 Mock 展示不影响接口协议。
 */
const minuteBucketOf = (N: number) => {
  let base = 0
  let idx = 0
  let segKey = 0
  return (p: ChartDataPoint): number => {
    const b = p.time - ((p.time + 8 * 3600) % 86400) // 当日 00:00（UTC+8 口径）
    if (b !== base) {
      base = b
      idx = 0
      segKey = p.time
    }
    // 每段首个点（idx % N === 0）：段 key = 该点实际 time（如 60 分 K 首段 09:30）
    if (idx % N === 0) segKey = p.time
    idx += 1
    return segKey
  }
}

/** 日 K 点 → 桶 key：按自然周（周一 00:00 本地） */
const weekBucketOf = (p: ChartDataPoint): number => {
  const d = new Date(p.time * 1000)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // 周日回退 6 天，其余回退到周一
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
  return Math.round(monday.getTime() / 1000)
}

/** 日 K 点 → 桶 key：按自然月（当月 1 日 00:00 本地） */
const monthBucketOf = (p: ChartDataPoint): number => {
  const d = new Date(p.time * 1000)
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  return Math.round(first.getTime() / 1000)
}


/** 数据池总交易日数量（约 3 年多） */
const POOL_SIZE = 800

/** 数据池截止日期（最近一个交易日：2026-10-02 周五） */
const POOL_END_DATE = new Date(Date.UTC(2026, 9, 2))

/** 实时 tick 间隔（ms） */
const REALTIME_INTERVAL = 1200

/** 每 N 次 tick 产生一根新 K 线 */
const NEW_BAR_EVERY = 8

/** 分时实时 tick 间隔（ms） */
const TS_REALTIME_INTERVAL = 1200
/** 分时每分钟刷新：每 N 次 tick 追加一根新分时分钟点（其余刷新最后一根） */
const TS_NEW_MINUTE_EVERY = 6

/** 判断是否为分时周期（1日~5日分时，多日分时） */
const isTimesharePeriod = (period: string): boolean => /^[1-5]d$/.test(period)

/**
 * 生成一天 241 个分时分钟点（升序，单位分钟，东财口径）：
 *  - 09:30（1 个，开盘点：集合竞价撮合价，即首根分时点）；
 *  - 09:31 ~ 11:30（120 分钟，上午）；
 *  - 13:01 ~ 15:00（120 分钟，下午）。
 * 首分钟（09:30）为集合竞价开盘价所在点，末分钟（15:00）为收盘点。
 */
const sessionMinutes = (): number[] => {
  const out: number[] = []
  const push = (start: number, end: number) => {
    for (let m = start; m <= end; m++) out.push(m)
  }
  push(9 * 60 + 30, 9 * 60 + 30) // 开盘点 09:30
  push(9 * 60 + 31, 11 * 60 + 30) // 上午 09:31~11:30
  push(13 * 60 + 1, 15 * 60) // 下午 13:01~15:00
  return out
}

/** 分时可追加分钟的集合（升序分钟序列，实时仅追加序列内的分钟：
 *  11:30 后不追加（午休）、15:00 后不追加（收盘）） */
const TS_APPEND_MINUTES = new Set(sessionMinutes())

const clone = (p: ChartDataPoint): ChartDataPoint => {
  return { ...p }
}

/** 字符串 → 正整数种子（同 symbol 同数据） */
const hashSeed = (text: string): number => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) || 1
}

/** 线性同余伪随机数发生器 */
const createRandom = (seed: number): () => number => {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const isWeekend = (d: Date): boolean => {
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

/** 生成截止 POOL_END_DATE、长度 POOL_SIZE 的交易日序列（升序） */
const buildTradingDates = (): Date[] => {
  const dates: Date[] = [new Date(POOL_END_DATE)]
  const cur = new Date(POOL_END_DATE)
  while (dates.length < POOL_SIZE) {
    cur.setUTCDate(cur.getUTCDate() - 1)
    if (!isWeekend(cur)) dates.unshift(new Date(cur))
  }
  return dates
}

/** 某日期之后的下一交易日 */
const nextTradingDay = (d: Date): Date => {
  const cur = new Date(d)
  do {
    cur.setUTCDate(cur.getUTCDate() + 1)
  } while (isWeekend(cur))
  return cur
}

const toTradeDate = (d: Date): string => {
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Mock 行情服务
 */
export class MockChartDataService implements ChartDataService {
  /** symbol → 该标的的完整数据池（懒生成） */
  private pools = new Map<string, ChartDataPoint[]>()
  /** symbol → 该标的的最近 5 日分时数据池（懒生成，1d~5d 周期共用） */
  private tsPools = new Map<string, ChartDataPoint[]>()
  /** `${symbol}|min` → 分钟 K 基础池（最近 60 交易日 × 241 分钟点，懒生成） */
  private minutePools = new Map<string, ChartDataPoint[]>()
  /** `${symbol}|${period}` → 按周期聚合后的 K 线池（week/month/分钟 K 懒生成，day 直接用 pools） */
  private periodPools = new Map<string, ChartDataPoint[]>()
  /** 实时定时器：key = `${symbol}|${period}` */
  private timers = new Map<string, ReturnType<typeof setInterval>>()

  /** 生成（或获取）某标的的完整数据池 */
  private ensurePool(symbol: string): ChartDataPoint[] {
    const existed = this.pools.get(symbol)
    if (existed) return existed

    const rand = createRandom(hashSeed(symbol))
    const dates = buildTradingDates()
    const pool: ChartDataPoint[] = []

    const startPrice = 8 + rand() * 20 // 8 ~ 28 元
    let preClose = startPrice

    for (let i = 0; i < dates.length; i++) {
      // 波动率，偶尔放大（消息面冲击）
      const vol = 0.018 * (rand() < 0.08 ? 2.5 : 1)
      const open = preClose * (1 + (rand() - 0.5) * 0.012)
      const close = Math.max(open * (1 + (rand() - 0.5) * 2 * vol), 0.01)
      const high = Math.max(open, close) * (1 + rand() * vol)
      const low = Math.min(open, close) * (1 - rand() * vol)
      const volume = Math.round(
        (5_000_000 + rand() * 40_000_000) * (1 + (Math.abs(close - open) / open) * 25),
      )
      const amount = Math.round(volume * ((open + close) / 2))

      pool.push({
        time: Math.round(dates[i].getTime() / 1000),
        tradeDate: toTradeDate(dates[i]),
        preClose: +preClose.toFixed(2),
        pointType: 'kline',
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
        volume,
        amount,
      })
      preClose = close
    }

    this.pools.set(symbol, pool)
    return pool
  }

  /**
   * 生成（或获取）某标的的「最近 N 个交易日」分时数据池（升序，共 N×241 分钟点）。
   * 以 K 线池最近 N 个交易日的收盘价为当日基准：每根分时分钟点从昨收/前收
   * 随机游走产生 price，加权累计均价 avgPrice，volume 为单分钟随机量，
   * amount 为当日累计成交额（东财分时口径）。
   * @param days 覆盖的交易日数：分时 1d~5d 用 5；分钟 K 池用 MINUTE_POOL_DAYS（60）
   */
  private buildTsPool(symbol: string, days: number): ChartDataPoint[] {
    const kpool = this.ensurePool(symbol)
    const rand = createRandom(hashSeed(symbol + '|ts|' + days))
    // 最近 N 个交易日（kpool 升序）
    const lastDays = kpool.slice(-days)
    const minutes = sessionMinutes()
    const out: ChartDataPoint[] = []

    // 逐日生成：当日首分钟 price 从昨收出发，跨日 price 从前一日收盘出发（连续）
    for (const day of lastDays) {
      const dayStart = day.preClose
      const dayT = new Date(day.time * 1000)
      let price = dayStart
      let volSum = 0
      let amtSum = 0
      let priceVolSum = 0
      for (const m of minutes) {
        // 分钟级随机游走（±0.2%），偶尔放大波动；并加入「均值回归」项：
        // 向当前累计均价（VWAP）温和靠拢（5% 回归力），避免价格单边下行/上行
        // 导致均价线长期高于/低于价格线（真实分时中价格线围绕均价线波动）。
        // 注：首根（volSum=0）锚点为自身 price → 无回归，首根均价 = 首根价格。
        const shock = rand() < 0.04 ? 3 : 1
        const anchor = volSum === 0 ? price : priceVolSum / volSum
        const regress = (anchor - price) * 0.05
        price = Math.max(
          price + regress + (rand() - 0.5) * 0.004 * price * shock,
          0.01,
        )
        // 单分钟随机量（开盘/尾盘放量）
        const volK = m === 9 * 60 + 30 || m === 15 * 60 ? 3 : 1
        const volume = Math.round((20_000 + rand() * 300_000) * volK)
        volSum += volume
        amtSum += Math.round(volume * price)
        priceVolSum += volume * price
        // 分时 minute 为北京时间口径（09:30~15:00）；time 为「北京时间对应的 UTC 时刻」（服务端口径，前端按本地时区显示）：
        // time = 当日 UTC 00:00 秒 − 8h + 分钟×60（formatTimeByFmt 内部再 +8h 还原北京时间）
        const dayUtc0 = new Date(dayT)
        dayUtc0.setUTCHours(0, 0, 0, 0)
        const time = Math.round(dayUtc0.getTime() / 1000) - 8 * 3600 + m * 60
        out.push({
          time,
          tradeDate: day.tradeDate,
          preClose: dayStart,
          pointType: 'timeshare',
          price: +price.toFixed(2),
          avgPrice: volSum === 0 ? +price.toFixed(2) : +(priceVolSum / volSum).toFixed(2),
          // 单分钟成交量（分时量柱 / OBV 口径），非累计
          volume,
          // 当日累计成交额（浮层展示口径）
          amount: amtSum,
        })
      }
    }


    return out
  }

  /** 分时周期数据池（最近 5 交易日，1d~5d 共用；缓存于 tsPools） */
  private ensureTsPool(symbol: string): ChartDataPoint[] {
    const existed = this.tsPools.get(symbol)
    if (existed) return existed
    const out = this.buildTsPool(symbol, 5)
    this.tsPools.set(symbol, out)
    return out
  }

  /** 分钟 K 基础池（最近 60 交易日 × 241 分钟点，60/30/15/5/1 分 K 共用） */
  private ensureMinutePool(symbol: string): ChartDataPoint[] {
    const key = `${symbol}|min`
    const existed = this.minutePools.get(key)
    if (existed) return existed
    const out = this.buildTsPool(symbol, MINUTE_POOL_DAYS)
    this.minutePools.set(key, out)
    return out
  }

  /**
   * 生成（或获取）某标的在某 K 线周期下的数据池（懒生成 + 缓存）：
   *  - day：直接复用日 K 池（ensurePool）；
   *  - week / month：从日 K 池按自然周 / 自然月聚合（OHLC 取组内高低收、量额累计、
   *    time 落在周初/月初 00:00、tradeDate 取组内末交易日、preClose 取组内首点昨收近似）；
   *  - 60/30/15/5/1min：从分钟 K 基础池（60 交易日 × 241 分钟点）按粒度聚合
   *    （每 N 分钟点一段：price → OHLC，time = 段首分钟 time，preClose = 当日昨收）。
   */
  private ensurePeriodPool(symbol: string, period: string): ChartDataPoint[] {
    if (period === 'day') return this.ensurePool(symbol)
    const key = `${symbol}|${period}`
    const existed = this.periodPools.get(key)
    if (existed) return existed
    let out: ChartDataPoint[]
    if (period === 'week') {
      out = aggregateToBars(this.ensurePool(symbol), weekBucketOf, 'kline')
    } else if (period === 'month') {
      out = aggregateToBars(this.ensurePool(symbol), monthBucketOf, 'kline')
    } else if (isMinutePeriod(period)) {
      out = aggregateToBars(
        this.ensureMinutePool(symbol),
        minuteBucketOf(MINUTE_GRANULARITY[period]),
        'ts',
      )
    } else {
      // 未知周期：回退日 K（接口协议未知周期时后端行为由服务端决定，Mock 兜底）
      return this.ensurePool(symbol)
    }
    this.periodPools.set(key, out)
    return out
  }

  /** 二分查找：第一个 time >= target 的下标 */
  private static lowerBound(pool: ChartDataPoint[], target: number): number {
    let lo = 0
    let hi = pool.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (pool[mid].time < target) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  async fetchHistory(query: HistoryQuery): Promise<ChartDataPoint[]> {
    // —— 分时周期（1d~5d）：取最近 N 个交易日的分时点（升序，N=周期数字）——
    if (isTimesharePeriod(query.period)) {
      const days = Number(query.period[0])
      const ts = this.ensureTsPool(query.symbol)
      // 最近 N 日 = 从末尾往前 N×241 分钟（含 09:30 开盘点）
      const end = ts.length
      const start = Math.max(0, end - days * 241)
      await new Promise((r) => setTimeout(r, NETWORK_DELAY))
      return ts.slice(start, end).map(clone)
    }

    // —— K 线周期：分页拉取（before 语义：该时间戳之前的一页）——
    // day 直接用日 K 池；week/month 周/月聚合池；分钟周期（60/30/15/5/1min）分钟聚合池
    const pool = this.ensurePeriodPool(query.symbol, query.period)

    let end = pool.length
    if (query.before !== undefined) {
      end = MockChartDataService.lowerBound(pool, query.before)
    }
    const start = Math.max(0, end - query.limit)

    await new Promise((r) => setTimeout(r, NETWORK_DELAY))
    return pool.slice(start, end).map(clone)
  }

  subscribeRealtime(symbol: string, period: string, handler: RealtimeHandler): () => void {
    const key = `${symbol}|${period}`
    // 已存在订阅则先关闭，保证唯一
    clearInterval(this.timers.get(key))

    // —— 分时周期：模拟盘中每分钟刷新（最后一根微动 + 周期性地追加新分钟点）——
    if (isTimesharePeriod(period)) {
      const ts = this.ensureTsPool(symbol)
      const rand = createRandom(hashSeed(symbol + period + Math.floor(Date.now() / 1000)))
      let tickCount = 0
      const timer = setInterval(() => {
        tickCount += 1
        const last = ts[ts.length - 1]
        if (!last) return

        if (tickCount % TS_NEW_MINUTE_EVERY === 0) {
          // 仅交易时段内追加新分时分钟点（09:30 为历史首点；实时仅追加 09:31-11:30 / 13:01-15:00，
          // UTC 口径与 ensureTsPool 一致）；收盘后不再追加（只刷新最后一根）
          // 北京时间口径（time 为「北京时间对应的 UTC 时刻」，+8h 后取 UTC 字段即北京时间）
          const bt = new Date((last.time + 8 * 3600) * 1000)
          const m = bt.getUTCHours() * 60 + bt.getUTCMinutes()
          // 仅当「下一分钟」仍属于交易分钟序列时才追加（收盘 15:00 / 午休 11:30 后不再追加）
          if (!TS_APPEND_MINUTES.has(m + 1)) {
            // 收盘后：仅刷新最后一根（与下方 else 分支相同，直接走刷新逻辑）
            const price = Math.max((last.price ?? 10) * (1 + (rand() - 0.5) * 0.002), 0.01)
            const addVolume = Math.round(rand() * 20_000)
            const updated: ChartDataPoint = {
              ...last,
              price: +price.toFixed(2),
              volume: (last.volume ?? 0) + addVolume,
              amount: (last.amount ?? 0) + Math.round(addVolume * price),
            }
            ts[ts.length - 1] = updated
            handler(clone(updated))
            return
          }
          const t = new Date((last.time + 60) * 1000)
          const price = Math.max(
            (last.price ?? 10) * (1 + (rand() - 0.5) * 0.004),
            0.01,
          )
          const volume = Math.round(20_000 + rand() * 300_000)
          const point: ChartDataPoint = {
            time: Math.round(t.getTime() / 1000),
            tradeDate: last.tradeDate,
            preClose: last.preClose,
            pointType: 'timeshare',
            price: +price.toFixed(2),
            avgPrice: last.avgPrice,
            volume,
            amount: (last.amount ?? 0) + Math.round(volume * price),
          }
          ts.push(point)
          handler(clone(point))
        } else {
          // 刷新最后一根（最新价 / 均价 / 量 / 额微动）
          const price = Math.max((last.price ?? 10) * (1 + (rand() - 0.5) * 0.002), 0.01)
          const addVolume = Math.round(rand() * 20_000)
          const updated: ChartDataPoint = {
            ...last,
            price: +price.toFixed(2),
            volume: (last.volume ?? 0) + addVolume,
            amount: (last.amount ?? 0) + Math.round(addVolume * price),
          }
          ts[ts.length - 1] = updated
          handler(clone(updated))
        }
      }, TS_REALTIME_INTERVAL)
      this.timers.set(key, timer)
      return () => {
        clearInterval(timer)
        if (this.timers.get(key) === timer) this.timers.delete(key)
      }
    }

    const pool = this.ensurePool(symbol)
    const rand = createRandom(hashSeed(symbol + Math.floor(Date.now() / 1000)))
    let tickCount = 0

    const timer = setInterval(() => {
      tickCount += 1

      if (tickCount % NEW_BAR_EVERY === 0) {
        // —— 产生一根新 K 线 ——
        const last = pool[pool.length - 1]
        const day = nextTradingDay(new Date((last as any).time * 1000))
        const open = last.close!
        const close = Math.max(open * (1 + (rand() - 0.5) * 0.02), 0.01)
        const high = Math.max(open, close) * (1 + rand() * 0.01)
        const low = Math.min(open, close) * (1 - rand() * 0.01)
        const volume = Math.round(2_000_000 + rand() * 10_000_000)
        const amount = Math.round(volume * ((open + close) / 2))

        const bar: ChartDataPoint = {
          time: Math.round(day.getTime() / 1000),
          tradeDate: toTradeDate(day),
          preClose: +open.toFixed(2),
          pointType: 'kline',
          open: +open.toFixed(2),
          high: +high.toFixed(2),
          low: +low.toFixed(2),
          close: +close.toFixed(2),
          volume,
          amount,
        }
        pool.push(bar)
        handler(clone(bar))
      } else {
        // —— 刷新最后一根（最新价 / 量累加） ——
        const idx = pool.length - 1
        const last = pool[idx]
        const newClose = Math.max(last.close! * (1 + (rand() - 0.5) * 0.006), 0.01)
        const addVolume = Math.round(rand() * 2_000_000)

        const updated: ChartDataPoint = {
          ...last,
          high: +Math.max(last.high!, newClose).toFixed(2),
          low: +Math.min(last.low!, newClose).toFixed(2),
          close: +newClose.toFixed(2),
          volume: (last.volume ?? 0) + addVolume,
          amount: (last.amount ?? 0) + Math.round(addVolume * newClose),
        }
        pool[idx] = updated
        handler(clone(updated))
      }
    }, REALTIME_INTERVAL)

    this.timers.set(key, timer)

    return () => {
      clearInterval(timer)
      if (this.timers.get(key) === timer) this.timers.delete(key)
    }
  }
}
