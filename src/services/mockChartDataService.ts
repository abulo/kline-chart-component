/**
 * mockChartDataService.ts —— Mock 行情服务实现层（v1.7.16）
 *
 * 职责：实现 ChartDataService 接口的本地模拟服务（懒生成池 + 分页 / 实时编排）。
 *  - 数据生成函数（日 K / 分时 / 分钟 K / 周 / 月 K / A股情绪形态）见 mockDataGenerator.ts；
 *  - 接口定义（HistoryQuery / RealtimeHandler / ChartDataService）见 chartDataService.ts。
 *  - 内存管理：pools / periodPools / timers 统一走 `touchCache` LRU 淘汰（见下），
 *    防多 symbol / 多周期切换时派生池无限增长导致内存溢出。
 *
 * 调用方：App.vue / KLineChart.vue（默认注入本服务）。
 */
import type { ChartDataPoint } from '../types/chart'
import { isTimesharePeriod } from '../chart/periods'
import type { ChartDataService, HistoryQuery, RealtimeHandler } from './chartDataService'
import {
  NETWORK_DELAY,
  MINUTE_POOL_DAYS,
  MINUTE_GRANULARITY,
  isMinutePeriod,
  MINUTE_SESSION_SLOTS,
  aggregateToBars,
  minuteToTime,
  weekBucketOf,
  monthBucketOf,
  REALTIME_INTERVAL,
  NEW_BAR_EVERY,
  TS_REALTIME_INTERVAL,
  TS_NEW_MINUTE_EVERY,
  sessionMinutes,
  TS_APPEND_MINUTES,
  clone,
  hashSeed,
  createRandom,
  buildTradingDates,
  nextTradingDay,
  toTradeDate,
  patternBar,
  PATTERN_SEQUENCE,
  timesharePatternPath,
  TS_PATTERN_SEQUENCE,
  type LimitPattern,
} from './mockDataGenerator'

/* ============================ Mock 服务实现（v1.7.16 自 chartDataService.ts 迁入） ============================ */


/**
 * 内存管理上限（v1.7.1）：各缓存采用 LRU 淘汰——超限删除最久未使用，
 * 防止多 symbol / 多周期切换时派生池（1 分 K 每 symbol 上万根）无限增长导致内存溢出。
 *  - 日 K / 分时池：最多保留 4 个 symbol（日 K 每 symbol 约 400 根，分时 241*5）
 *  - 派生周期池：最多保留 8 个 key（week/month/分钟 K，1 分 K 每 symbol 约 1.4 万根）
 *  - 实时定时器：最多保留 8 个订阅（unsubscribe 时正常清理，此处仅防异常堆积）
 */
const CACHE_MAX_SYMBOL_POOLS = 4
const CACHE_MAX_PERIOD_POOLS = 8
const CACHE_MAX_REALTIME_TIMERS = 8

/**
 * LRU 缓存访问（v1.7.1，模块级纯函数可单测）：命中时刷新顺序
 * （delete + 重插使遍历序 = 最近使用序）；未命中时由 factory 生成并写入；
 * 超 maxSize 淘汰最久未使用（遍历序第一个）。
 * 用于 MockChartDataService 的 pools / tsPools / periodPools / timers 统一入口，
 * 防止多 symbol / 多周期切换时派生池无限增长导致内存溢出。
 * @param map 目标缓存（Map 实例，调用方持有）
 * @param key 缓存键
 * @param maxSize 上限（超出即淘汰最久未使用的一项）
 * @param factory 未命中时的生成函数（返回要缓存的值）
 * @returns 命中的缓存值，或 factory 新生成并写入的值（类型 V）
 */
export const touchCache = <V>(
  map: Map<string, V>,
  key: string,
  maxSize: number,
  factory: () => V,
): V => {
  const existed = map.get(key)
  if (existed !== undefined) {
    map.delete(key)
    map.set(key, existed)
    return existed
  }
  const value = factory()
  map.set(key, value)
  if (map.size > maxSize) {
    const oldestKey = map.keys().next().value as string | undefined
    if (oldestKey !== undefined) map.delete(oldestKey)
  }
  return value
}

/** MockChartDataService 构造参数 */
export interface MockChartDataServiceOptions {
  /** 每页拉取条数（构造必填，如 200） */
  fetchLimit: number
}

export class MockChartDataService implements ChartDataService {
  /** 每页拉取条数（v1.6.27：构造必填） */
  readonly fetchLimit: number

  /** symbol → 该标的的完整数据池（懒生成） */
  private pools = new Map<string, ChartDataPoint[]>()
  /** symbol → 该标的的最近 5 日分时数据池（懒生成，1d~5d 周期共用） */
  private tsPools = new Map<string, ChartDataPoint[]>()
  /** `${symbol}|${period}` → 按周期聚合后的 K 线池（week/month/分钟 K 懒生成，day 直接用 pools） */
  private periodPools = new Map<string, ChartDataPoint[]>()
  /** 实时定时器：key = `${symbol}|${period}` */
  private timers = new Map<string, ReturnType<typeof setInterval>>()

  constructor(options: MockChartDataServiceOptions) {
    this.fetchLimit = options.fetchLimit
  }

  /**
   * 生成（或获取）某标的的完整日 K 池（懒生成 + LRU 缓存，v1.6.34 起东财口径真实化）：
   * 趋势波段状态机 + GARCH 波动聚集 + 开盘跳空 + 价量联动 + A股情绪形态注入
   * （一字板 1~10 连板 / 厂字板 / 天地天 / 地天地等，涨跌停按主板 ±10%）。
   * 周 K / 月 K / 分钟 K（60/30/15/5/1 分）全部由本池派生，跨周期价格自洽。
   * @param symbol 证券代码（池缓存键；随机种子由 symbol 哈希决定，同标的数据确定）
   * @returns 该标的按 time 升序的日 K 池（约 3 年，每根含 open/high/low/close/volume/amount）
   */
  private ensurePool = (symbol: string): ChartDataPoint[] =>
    touchCache(this.pools, symbol, CACHE_MAX_SYMBOL_POOLS, () => {
      const rand = createRandom(hashSeed(symbol))
    const dates = buildTradingDates()
    const pool: ChartDataPoint[] = []

    const startPrice = 8 + rand() * 20 // 8 ~ 28 元
    let preClose = startPrice
    // 趋势状态机（'up' | 'down' | 'flat'）：上涨 / 下跌波段 + 震荡整理，
    // 仿东财日 K 形态（波段延续、避免单边到顶/到底后仍持续）
    let trend: 'up' | 'down' | 'flat' = 'flat'
    let trendLen = 0
    let prevRet = 0 // 昨收涨跌幅（波动聚集：|prevRet| 大 → 今日波动放大，GARCH 式）
    // —— A股情绪形态段状态（v1.6.56）：pattern 非 none 时逐根消耗 patternLeft ——
    let pattern: LimitPattern | 'none' = 'none'
    let patternLeft = 0
    // 已出现过的形态（覆盖保证：9 种形态各至少出现一次后再恢复随机）
    const seenPatterns = new Set<LimitPattern>()

    for (let i = 0; i < dates.length; i++) {
      // —— 形态段结束：恢复常态（重置趋势状态，避免与脱节价格冲突）——
      if (pattern !== 'none' && patternLeft <= 0) {
        pattern = 'none'
        trend = 'flat'
        trendLen = 0
      }
      // —— 形态段启动：价格未过高（<120 元）时 3.5% 概率触发一段情绪形态 ——
      if (pattern === 'none' && preClose < 120 && rand() < 0.035) {
        let chosen: LimitPattern
        // 覆盖保证：优先选择尚未出现过的形态（前 9 次启动依次补齐 9 种，确定性齐全）
        const missing = PATTERN_SEQUENCE.filter((p) => !seenPatterns.has(p))
        if (missing.length > 0) {
          chosen = missing[Math.floor(rand() * missing.length)]
        } else {
          // 9 种已齐全：恢复真实随机分布（涨跌各半 + 连板/单板权重）
          const isUp = rand() < 0.5
          const roll = rand()
          if (isUp) {
            // 上涨族：一字板（1~10 连板）| 厂字板 | 尾盘上板 | 地天板 | 天地天板
            if (roll < 0.5) { chosen = 'limit-up' }
            else if (roll < 0.62) { chosen = 'factory-up' }
            else if (roll < 0.74) { chosen = 'tail-up' }
            else if (roll < 0.87) { chosen = 'ground-sky' }
            else { chosen = 'sky-ground-sky' }
          } else {
            // 下跌族：一字跌停（1~10 连板）| 尾盘下板 | 天底板 | 地天地板
            if (roll < 0.5) { chosen = 'limit-down' }
            else if (roll < 0.62) { chosen = 'tail-down' }
            else if (roll < 0.74) { chosen = 'sky-ground' }
            else if (roll < 0.87) { chosen = 'ground-sky-ground' }
            else { chosen = 'limit-down' }
          }
        }
        seenPatterns.add(chosen)
        pattern = chosen
        // 一字板/一字跌停支持 1~10 连板，其余单根形态
        patternLeft = chosen === 'limit-up' || chosen === 'limit-down'
          ? 1 + Math.floor(rand() * 10)
          : 1
      }

      // —— 单根 K 生成：形态段内走形态模板，常态走随机游走 ——
      let open: number
      let close: number
      let high: number
      let low: number
      let volume: number
      if (pattern !== 'none') {
        patternLeft -= 1
        const pb = patternBar(pattern, preClose, rand)
        open = pb.open
        high = pb.high
        low = pb.low
        close = pb.close
        volume = pb.volume
      } else {
        // —— 趋势状态机：每根 12% 概率切换；同向连续 ≥6~10 根强制切换（波段回调）——
        trendLen++
        if (rand() < 0.12 || trendLen >= 6 + Math.floor(rand() * 4)) {
          const r = rand()
          trend = r < 0.4 ? 'up' : r < 0.8 ? 'down' : 'flat'
          trendLen = 0
        }
        const drift = trend === 'up' ? 0.0016 : trend === 'down' ? -0.0016 : 0

        // —— 波动率（GARCH 式聚集）：基础波动 × 昨日波动放大 × 消息面冲击 ——
        const baseVol = 0.014 * (0.6 + 0.8 * rand())
        const cluster = 1 + Math.min(Math.abs(prevRet) / 0.02, 1) * 0.9
        const shock = rand() < 0.07 ? 2.4 : 1
        const vol = Math.min(baseVol * cluster * shock, 0.09)

        // —— 跳空：常态小（±0.3%）、消息大（±1.4%）；趋势中开盘同向微偏（东财口径）——
        const gapBias = trend === 'up' ? 0.0008 : trend === 'down' ? -0.0008 : 0
        const gap = (rand() < 0.07 ? (rand() - 0.4) * 0.028 : (rand() - 0.5) * 0.006) + gapBias
        open = Math.max(preClose * (1 + gap), 0.01)

        // —— 收盘：漂移 + 噪声（趋势中噪声同向偏置，阳线更易延续）——
        const noiseBias = trend === 'up' ? 0.3 : trend === 'down' ? -0.3 : 0
        close = Math.max(
          open * (1 + drift + (rand() - 0.5 + noiseBias * 0.5) * 2 * vol),
          0.01,
        )
        const body = Math.abs(close - open) / open

        // —— 影线：波动越大影线越长（真实 K 线常态带影线）——
        high = Math.max(open, close) * (1 + rand() * vol * 0.6)
        low = Math.max(Math.min(open, close) * (1 - rand() * vol * 0.6), 0.01)

        // —— 价量联动：涨放量（阳线量 1.15 倍）、跌缩量、大波动恐慌放量 ——
        const volK = 1 + body * 22 * (close >= open ? 1.15 : 0.85)
        volume = Math.round((5_000_000 + rand() * 40_000_000) * Math.min(volK, 3.2))
      }
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
      const ret = (close - preClose) / preClose
      prevRet = ret
      // 昨收口径统一：取整到分，与 pool 记录的 close 严格一致（形态涨停/跌停价
      // 基于同一口径计算，避免临界舍入差 0.01 导致形态检测/展示不一致，v1.6.56）
      preClose = +close.toFixed(2)
    }

      this.pools.set(symbol, pool)
      return pool
    })

  /**
   * 生成（或获取）某标的的「最近 N 个交易日」分时数据池（升序，共 N×241 分钟点）。
   * 以 K 线池最近 N 个交易日的收盘价为当日基准：每根分时分钟点从昨收/前收
   * 随机游走产生 price，加权累计均价 avgPrice，volume 为单分钟随机量，
   * amount 为当日累计成交额（东财分时口径）。**仅分时周期（1d~5d）使用**；
   * 分钟 K 由 buildMinuteKPool 独立生成（布朗桥锚定日开/收，见下）。
   * @param days 覆盖的交易日数（分时 1d~5d 用 5）
   */
  private buildTsPool = (symbol: string, days: number): ChartDataPoint[]  => {
    const kpool = this.ensurePool(symbol)
    const rand = createRandom(hashSeed(symbol + '|ts|' + days))
    // 最近 N 个交易日（kpool 升序）
    const lastDays = kpool.slice(-days)
    const out: ChartDataPoint[] = []

    // v1.7.0：按形态序列为每个交易日分配分时形态（symbol 偏移，8 种形态确定性齐全覆盖）：
    // 半日 / 厂字板 / 一字涨停 / 一字跌停 / 天地天 / 地天地 / 连板涨 / 连板跌；
    // 最新交易日完整分钟（半日为 120 条），较久远交易日缺首分钟（模拟历史源不完整）。
    const seedOffset = hashSeed(symbol) % TS_PATTERN_SEQUENCE.length
    for (const [dayIndex, day] of lastDays.entries()) {
      const pattern = TS_PATTERN_SEQUENCE[(seedOffset + dayIndex) % TS_PATTERN_SEQUENCE.length]
      const fullMinutes = sessionMinutes()
      const minutes = pattern === 'half-day'
        ? fullMinutes.slice(1, 1 + 120) // 半日：09:31~11:30 共 120 条
        : dayIndex === lastDays.length - 1
          ? fullMinutes // 最新日完整 241 条
          : fullMinutes.slice(1) // 久远日缺首分钟 240 条
      const path = timesharePatternPath(pattern, day.preClose, minutes, rand)
      const dayStart = day.preClose
      const dayT = new Date(day.time * 1000)
      let volSum = 0
      let amtSum = 0
      let priceVolSum = 0
      for (const step of path) {
        const m = step.minute
        const price = step.price
        const volume = step.volume
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
          price,
          avgPrice: volSum === 0 ? price : +(priceVolSum / volSum).toFixed(2),
          // 单分钟成交量（分时量柱 / OBV 口径），非累计
          volume,
          // 当日累计成交额（浮层展示口径）
          amount: amtSum,
        })
      }
    }


    return out
  }

  /**
   * 分时周期数据池（最近 5 交易日，1d~5d 共用；懒生成 + LRU 缓存于 tsPools）。
   * @param symbol 证券代码（缓存键）
   * @returns 按 time 升序的最近 5 交易日分时点数组（每根含 price / avgPrice / volume / amount）
   */
  private ensureTsPool = (symbol: string): ChartDataPoint[] =>
    touchCache(this.tsPools, symbol, CACHE_MAX_SYMBOL_POOLS, () =>
      this.buildTsPool(symbol, 5),
    )

  /**
   * 生成当日 241 个分钟路径点（升序，价格口径）：
   *  - 首点（09:30 集合竞价）= 日 K 开盘价，末点（15:00）= 日 K 收盘价（**与日/周/月 K 自洽**）；
   *  - 中间点 = 线性锚点（open→close 插值）+ 布朗桥噪声（随机游走累计项做终值归零，
   *    保证 15:00 精确收在日 close）；午休（11:30→13:01）价格连续（无跳空）；
   *  - 单分钟成交量：开盘（09:30-09:45）/ 尾盘（14:45-15:00）放量（U 型），
   *    其余均匀随机，偶尔放大（消息面冲击）。
   */
  private buildIntradayPath = (
    day: ChartDataPoint,
    rand: () => number,
  ): { minute: number; price: number; volume: number }[] => {
    const open = day.open!
    const close = day.close!
    const minutes = sessionMinutes()
    const n = minutes.length // 241
    // 随机游走累计项（walk[0]=0）：step 带日内方向偏置（涨日分钟偏涨 / 跌日偏跌，
    // 趋势延续），偶尔 ×2.5 放大（消息面冲击）；尾盘（14:30 后）波动放大（真实尾盘活跃）。
    const dayBias = (close - open) / open // 日涨跌幅 → 分钟同向偏置
    const walk: number[] = [0]
    for (let i = 1; i < n; i++) {
      const shock = rand() < 0.04 ? 2.5 : 1
      const tail = minutes[i] >= 14 * 60 + 30 ? 1.4 : 1
      walk.push(walk[i - 1] + ((rand() - 0.5) + dayBias * 0.4) * 0.006 * shock * tail)
    }
    // 日内波动幅度 ≈ 日振幅的 1/3（分钟级波动远小于日线振幅，路径不"离谱"）
    const intradayRange = Math.max(day.high! - day.low!, close * 0.01)
    const out: { minute: number; price: number; volume: number }[] = []
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const anchor = open + (close - open) * t
      const bridge = walk[i] - t * walk[n - 1] // 终值归零 → 末点 = 日 close
      const price = Math.max(anchor + bridge * intradayRange * 0.3, 0.01)
      const m = minutes[i]
      const uK = m <= 9 * 60 + 45 || m >= 14 * 60 + 45 ? 3 : 1 // U 型放量
      const volume = Math.round((20_000 + rand() * 280_000) * uK)
      out.push({ minute: m, price, volume })
    }
    return out
  }

  /**
   * 分钟 K 池（symbol × 粒度，懒生成 + 缓存）：最近 MINUTE_POOL_DAYS 交易日，
   * 逐日生成 241 分钟路径 → 按真实交易时段槽聚合为 K 线（60分/30分/15分/5分）
   * 或逐分钟成 K（1 分）。聚合自洽：open ≈ 前根 close、high ≥ max(open,close)、
   * low ≤ min(open,close)、时间轴按段首分钟（09:30 / 10:30 / 13:00 …）。
   */
  private buildMinuteKPool = (symbol: string, granularity: number): ChartDataPoint[]  => {
    const kpool = this.ensurePool(symbol)
    const rand = createRandom(hashSeed(symbol + '|min|' + granularity))
    const lastDays = kpool.slice(-MINUTE_POOL_DAYS)
    const slots = granularity === 1 ? null : MINUTE_SESSION_SLOTS[granularity]
    const out: ChartDataPoint[] = []
    for (const day of lastDays) {
      const path = this.buildIntradayPath(day, rand)
      if (!slots) {
        // 1 分：逐分钟一根（241 段/日）；影线微扩保证 OHLC 自洽
        for (const point of path) {
          const h = point.price * (1 + rand() * 0.001)
          const l = Math.max(point.price * (1 - rand() * 0.001), 0.01)
          out.push({
            time: minuteToTime(day, point.minute),
            tradeDate: day.tradeDate,
            preClose: day.preClose,
            pointType: 'kline',
            open: +point.price.toFixed(2),
            high: +h.toFixed(2),
            low: +l.toFixed(2),
            close: +point.price.toFixed(2),
            volume: point.volume,
            amount: Math.round(point.volume * point.price),
          })
        }
        continue
      }
      for (const [b, e] of slots) {
        const seg = path.filter((p) => p.minute >= b && p.minute <= e)
        if (!seg.length) continue
        const open = seg[0].price
        const close = seg[seg.length - 1].price
        let high = -Infinity
        let low = Infinity
        let volSum = 0
        let amtSum = 0
        for (const p of seg) {
          high = Math.max(high, p.price)
          low = Math.min(low, p.price)
          volSum += p.volume
          amtSum += p.volume * p.price
        }
        // 上下影线微扩（保证 high ≥ max(open,close)、low ≤ min(open,close) 且带影线）
        const h = Math.max(high, open, close) * (1 + rand() * 0.001)
        const l = Math.max(Math.min(low, open, close) * (1 - rand() * 0.001), 0.01)
        out.push({
          time: minuteToTime(day, b),
          tradeDate: day.tradeDate,
          preClose: day.preClose,
          pointType: 'kline',
          open: +open.toFixed(2),
          high: +h.toFixed(2),
          low: +l.toFixed(2),
          close: +close.toFixed(2),
          volume: volSum,
          amount: Math.round(amtSum),
        })
      }
    }
    return out
  }

  /**
   * 生成（或获取）某标的在某 K 线周期下的数据池（懒生成 + 缓存）：
   *  - day：直接复用日 K 池（ensurePool）；
   *  - week / month：从日 K 池按自然周 / 自然月聚合（OHLC 取组内高低收、量额累计、
   *    time 落在周初/月初 00:00、tradeDate 取组内末交易日、preClose 取组内首点昨收近似）；
   *  - 60/30/15/5/1min：分钟 K 池（buildMinuteKPool，布朗桥锚定日开/收 + 真实时段聚合）。
   */
  /**
   * 生成（或获取）按周期聚合后的 K 线池（懒生成 + LRU 缓存于 periodPools）：
   * - day：直接用日 K 池（不复制引用）；week / month：由日 K 池按周 / 月桶聚合；
   * - 分钟周期（60/30/15/5/1min）：由 buildMinuteKPool 布朗桥锚定日 K 开收生成；
   * - 未知周期：回退日 K 池（接口协议未知周期兜底）。
   * @param symbol 证券代码
   * @param period 周期标识（'day' / 'week' / 'month' / 分钟周期）
   * @returns 按 time 升序的该周期 K 线池
   */
  private ensurePeriodPool = (symbol: string, period: string): ChartDataPoint[] => {
    if (period === 'day') return this.ensurePool(symbol)
    const key = `${symbol}|${period}`
    return touchCache(this.periodPools, key, CACHE_MAX_PERIOD_POOLS, () => {
      if (period === 'week') {
        return aggregateToBars(this.ensurePool(symbol), weekBucketOf, 'kline')
      }
      if (period === 'month') {
        return aggregateToBars(this.ensurePool(symbol), monthBucketOf, 'kline')
      }
      if (isMinutePeriod(period)) {
        return this.buildMinuteKPool(symbol, MINUTE_GRANULARITY[period])
      }
      // 未知周期：回退日 K（接口协议未知周期时后端行为由服务端决定，Mock 兜底）
      return this.ensurePool(symbol)
    })
  }

  /**
   * 二分查找：第一个 time >= target 的下标（分页 `before` 锚点定位用）。
   * @param pool 按 time 升序的数据池
   * @param target 目标时间戳（秒）
   * @returns 第一个满足 pool[i].time >= target 的下标；全部小于 target 时返回 pool.length
   */
  private static lowerBound = (pool: ChartDataPoint[], target: number): number  => {
    let lo = 0
    let hi = pool.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (pool[mid].time < target) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  /**
   * 拉取历史数据（实现 ChartDataService.fetchHistory）。
   * - 分时周期（1d~5d）：返回最近 N 个交易日的全部分时点（升序，N = 周期数字；
   *   每日条数随形态变化：半日 120 / 最新日完整 241 / 久远日 240）；
   * - K 线周期：按 `before` 锚点分页——取该时间戳之前的一页（数量 = limit）。
   * @param query 查询入参（symbol / period / before / limit）
   * @returns 按 time 升序的数据点克隆数组（每次返回深拷贝，防调用方污染内部池）；
   *          返回条数 < limit 表示已无更早数据
   */
  async fetchHistory(query: HistoryQuery): Promise<ChartDataPoint[]> {
    // —— 分时周期（1d~5d）：取最近 N 个交易日的分时点（升序，N=周期数字）——
    if (isTimesharePeriod(query.period)) {
      const days = Number(query.period[0])
      const ts = this.ensureTsPool(query.symbol)
      // v1.7.0：按交易日分组取最近 N 日（每日条数随形态变化：半日 120 /
      // 最新日完整 241 / 久远日 240，不再硬编码总数）
      const byDay = new Map<string, ChartDataPoint[]>()
      for (const point of ts) {
        const list = byDay.get(point.tradeDate)
        if (list) list.push(point)
        else byDay.set(point.tradeDate, [point])
      }
      const dayKeys = [...byDay.keys()].slice(-days)
      let start = 0
      if (dayKeys.length > 0) {
        const firstOfFirstDay = byDay.get(dayKeys[0])![0]
        start = ts.findIndex((point) => point.time === firstOfFirstDay.time)
      }
      await new Promise((r) => setTimeout(r, NETWORK_DELAY))
      return ts.slice(start, ts.length).map(clone)
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

  /**
   * 订阅实时数据（实现 ChartDataService.subscribeRealtime）。
   * - 分时周期：模拟盘中每分钟刷新——交易时段内追加新分钟点、其余刷新最后一根；
   * - K 线周期：模拟 tick 刷新最后一根 / 周期性产生新 K 线（NEW_BAR_EVERY）。
   * 同一 symbol|period 重复订阅时先关闭旧定时器（保证唯一）。
   * @param symbol 证券代码
   * @param period 周期标识（分时 '1d'~'5d' / K 线周期）
   * @param handler 实时回调（每个模拟点调用一次）
   * @returns 取消订阅函数：clearInterval 并从 timers 缓存移除（防定时器泄漏）
   */
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
      touchCache(this.timers, key, CACHE_MAX_REALTIME_TIMERS, () => timer)
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

    touchCache(this.timers, key, CACHE_MAX_REALTIME_TIMERS, () => timer)

    return () => {
      clearInterval(timer)
      if (this.timers.get(key) === timer) this.timers.delete(key)
    }
  }
}
