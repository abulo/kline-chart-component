/**
 * mockDataGenerator.ts —— Mock 行情数据生成与 Mock 服务实现（v1.7.16）
 *
 * 职责（两部分）：
 *  - **纯数据生成函数**（v1.7.1 自 chartDataService.ts 拆分，无 UI / 无服务编排
 *    依赖，全部可单测）：
 *    日 K 池（约 3 年）+ A股情绪形态注入（一字板 1~10 连板 / 厂字板 / 尾盘上板 /
 *    地天板 / 天地天板 / 天底板 / 地天地板，涨跌停按主板 ±10%）；分时（1d~5d）
 *    241 分钟分时点 / 交易日（价格线 / 均价线 / 量），`timesharePatternPath` 为
 *    8 情绪形态确定性路径；分钟 K（60/30/15/5/1 分）按真实交易时段聚合、
 *    布朗桥锚定日 K 开收；周 / 月 K 由日 K 聚合。
 *  - **MockChartDataService**（v1.7.16 自 chartDataService.ts 迁入）：懒生成池 +
 *    分页 / 实时编排，实现 ChartDataService 接口（内存上限 LRU 淘汰见 touchCache）。
 *
 * 调用方：App.vue / KLineChart.vue（默认注入 MockChartDataService）；
 * 接口定义见 chartDataService.ts（本文件仅实现，类型自其导入）。
 */
import type { ChartDataPoint } from '../types/chart'
import { isTimesharePeriod } from '../chart/periods'
import type { ChartDataService, HistoryQuery, RealtimeHandler } from './chartDataService'

export const NETWORK_DELAY = 220

/** 分钟 K 周期 → 每根 K 线聚合的分钟数（60分/30分/15分/5分/1分） */
/** 分钟 K 基础池覆盖的交易日数（250 日 ≈ 1 年，v1.6.34：60分 1000 根 / 30分 2000 /
 * 15分 4000 / 5分 12000 / 1分 6 万根，贴近东财分钟 K 历史量级） */
export const MINUTE_POOL_DAYS = 250

export const MINUTE_GRANULARITY: Record<string, number> = {
  '60min': 60,
  '30min': 30,
  '15min': 15,
  '5min': 5,
  '1min': 1,
}

/** 是否为分钟 K 周期 */
export const isMinutePeriod = (period: string): boolean =>
  Object.prototype.hasOwnProperty.call(MINUTE_GRANULARITY, period)

/**
 * 分钟 K 每日时段槽（[起, 止] 北京时间分钟，闭区间；止点 = 段收盘分钟，东财口径）：
 *  - 60 分：09:30-10:30 / 10:30-11:30 / 13:00-14:00 / 14:00-15:00（4 段，上午 2 段下午 2 段）；
 *  - 30 分：上午 4 段 + 下午 4 段（8 段）；
 *  - 15 分：上午 8 段 + 下午 8 段（16 段）；
 *  - 5 分：上午 24 段 + 下午 24 段（48 段）；
 *  - 1 分：逐分钟一段（241 段，不走本表）。
 * 段间不跨午休（11:30 → 13:00 直接断开）；相邻段 open ≈ 前段 close（分钟路径连续，
 * 13:01 价 = 11:30 价的下一步，无跳空），time 统一取段首分钟（规范时间轴显示）。
 */
export const stepRange = (start: number, end: number, step: number): number[] => {
  const out: number[] = []
  for (let m = start; m <= end; m += step) out.push(m)
  return out
}
export const pairSlots = (minutes: number[]): [number, number][] =>
  minutes.slice(0, -1).map((b, i) => [b, minutes[i + 1]] as [number, number])

export const MINUTE_SESSION_SLOTS: Record<number, [number, number][]> = {
  60: [
    [570, 630],
    [630, 690],
    [780, 840],
    [840, 900],
  ],
  30: [
    [570, 600], [600, 630], [630, 660], [660, 690],
    [780, 810], [810, 840], [840, 870], [870, 900],
  ],
  // 上午 / 下午分别 pairSlots（避免拼接数组在午休 690→780 处生成空档段 [690,780)）
  15: [
    ...pairSlots(stepRange(570, 690, 15)),
    ...pairSlots(stepRange(780, 900, 15)),
  ],
  5: [
    ...pairSlots(stepRange(570, 690, 5)),
    ...pairSlots(stepRange(780, 900, 5)),
  ],
}

/**
 * 把一组「数据点」按桶聚合为 K 线（OHLC + 累计量额）。
 * @param points  升序数据点：分时点（price 口径）或日 K 点（open/high/low/close 口径）
 * @param bucketOf 返回该点所属桶的 key（秒级时间戳，同 key 的点聚合为同一根 K）
 * @param mode    'ts'：分时点聚合（price → OHLC）；'kline'：K 线点聚合（直接取 OHLC）
 */
export const aggregateToBars = (
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

/** 北京时间分钟（段首分钟）→ 当日 UTC 秒级 time（与分时点口径一致：UTC 00:00 − 8h + 分钟×60） */
export const minuteToTime = (day: ChartDataPoint, minuteOfDay: number): number => {
  const dayUtc0 = new Date(day.time * 1000)
  dayUtc0.setUTCHours(0, 0, 0, 0)
  return Math.round(dayUtc0.getTime() / 1000) - 8 * 3600 + minuteOfDay * 60
}

/** 日 K 点 → 桶 key：按自然周（周一 00:00 本地） */
export const weekBucketOf = (p: ChartDataPoint): number => {
  const d = new Date(p.time * 1000)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // 周日回退 6 天，其余回退到周一
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
  return Math.round(monday.getTime() / 1000)
}

/** 日 K 点 → 桶 key：按自然月（当月 1 日 00:00 本地） */
export const monthBucketOf = (p: ChartDataPoint): number => {
  const d = new Date(p.time * 1000)
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  return Math.round(first.getTime() / 1000)
}


/** 数据池总交易日数量（约 3 年多） */
export const POOL_SIZE = 800

/** 数据池截止日期（最近一个交易日：2026-10-02 周五） */
export const POOL_END_DATE = new Date(Date.UTC(2026, 9, 2))

/** 实时 tick 间隔（ms） */
export const REALTIME_INTERVAL = 1200

/** 每 N 次 tick 产生一根新 K 线 */
export const NEW_BAR_EVERY = 8

/** 分时实时 tick 间隔（ms） */
export const TS_REALTIME_INTERVAL = 1200
/** 分时每分钟刷新：每 N 次 tick 追加一根新分时分钟点（其余刷新最后一根） */
export const TS_NEW_MINUTE_EVERY = 6

/** 判断是否为分时周期（1日~5日分时，多日分时）——公共判定见 ../chart/periods（v1.7.0 统一） */

/**
 * 生成一天 241 个分时分钟点（升序，单位分钟，东财口径）：
 *  - 09:30（1 个，开盘点：集合竞价撮合价，即首根分时点）；
 *  - 09:31 ~ 11:30（120 分钟，上午）；
 *  - 13:01 ~ 15:00（120 分钟，下午）。
 * 首分钟（09:30）为集合竞价开盘价所在点，末分钟（15:00）为收盘点。
 */
export const sessionMinutes = (): number[] => {
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
export const TS_APPEND_MINUTES = new Set(sessionMinutes())

export const clone = (p: ChartDataPoint): ChartDataPoint => {
  return { ...p }
}

/** 字符串 → 正整数种子（同 symbol 同数据） */
export const hashSeed = (text: string): number => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) || 1
}

/** 线性同余伪随机数发生器 */
export const createRandom = (seed: number): () => number => {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

export const isWeekend = (d: Date): boolean => {
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

/** 生成截止 POOL_END_DATE、长度 POOL_SIZE 的交易日序列（升序） */
export const buildTradingDates = (): Date[] => {
  const dates: Date[] = [new Date(POOL_END_DATE)]
  const cur = new Date(POOL_END_DATE)
  while (dates.length < POOL_SIZE) {
    cur.setUTCDate(cur.getUTCDate() - 1)
    if (!isWeekend(cur)) dates.unshift(new Date(cur))
  }
  return dates
}

/** 某日期之后的下一交易日 */
export const nextTradingDay = (d: Date): Date => {
  const cur = new Date(d)
  do {
    cur.setUTCDate(cur.getUTCDate() + 1)
  } while (isWeekend(cur))
  return cur
}

export const toTradeDate = (d: Date): string => {
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

/* ============================== A股情绪形态（v1.6.56） ============================== */

/** 涨跌停情绪形态（仿东方财富日 K：连板 / 天地板等） */
export type LimitPattern =
  | 'limit-up' // 一字板（涨停）：O=H=L=C=涨停价，1~10 连板
  | 'factory-up' // 厂字板：涨停一字开盘 → 盘中开板（L 回落 2%~5%）→ 尾盘回封
  | 'tail-up' // 尾盘上板：平开/微高开震荡，尾盘拉涨停（长下影大阳）
  | 'ground-sky' // 地天板：跌停开盘 → 涨停收盘（振幅 20%）
  | 'sky-ground-sky' // 天地天板：涨停开盘 → 盘中砸跌停 → 尾盘拉回涨停
  | 'limit-down' // 一字跌停：O=H=L=C=跌停价，1~10 连板
  | 'tail-down' // 尾盘下板：微高开震荡，尾盘砸跌停（长上影大阴）
  | 'sky-ground' // 天底板：涨停开盘 → 跌停收盘（天地反转）
  | 'ground-sky-ground' // 地天地板：跌停开盘 → 盘中拉涨停 → 跌停收盘

/** 主板涨停价（昨收 × 1.10，四舍五入到分） */
export const limitUp = (p: number): number => +Math.round(p * 1.1 * 100) / 100

/** 主板跌停价（昨收 × 0.90，四舍五入到分） */
export const limitDown = (p: number): number => +Math.round(p * 0.9 * 100) / 100

/**
 * 形态 K 线（基于昨收计算涨停/跌停价，OHLC 自洽）：
 *  - 一字板封死缩量（买/卖不到）；开板 / 天地板放量（情绪剧烈）。
 */
export const patternBar = (
  pattern: LimitPattern,
  preClose: number,
  rand: () => number,
): { open: number; high: number; low: number; close: number; volume: number } => {
  const up = limitUp(preClose)
  const down = limitDown(preClose)
  switch (pattern) {
    case 'limit-up':
    case 'limit-down': {
      // 一字板：O=H=L=C=涨/跌停价，封死缩量
      const px = pattern === 'limit-up' ? up : down
      return { open: px, high: px, low: px, close: px, volume: Math.round(200_000 + rand() * 600_000) }
    }
    case 'factory-up': {
      // 厂字板：涨停一字开盘 → 盘中开板（L 回落 2%~5%）→ 尾盘回封
      const low = +Math.max(up * (1 - (0.02 + rand() * 0.03)), 0.01).toFixed(2)
      return { open: up, high: up, low, close: up, volume: Math.round(3_000_000 + rand() * 15_000_000) }
    }
    case 'tail-up': {
      // 尾盘上板：平开/微高开震荡，尾盘拉涨停（长下影大阳）
      const open = +Math.max(preClose * (1 + (rand() - 0.55) * 0.012), 0.01).toFixed(2)
      const low = +Math.max(Math.min(open, up) * (1 - rand() * 0.02), 0.01).toFixed(2)
      return { open, high: up, low, close: up, volume: Math.round(5_000_000 + rand() * 20_000_000) }
    }
    case 'ground-sky': {
      // 地天板：跌停一字开盘 → 尾盘拉涨停
      return { open: down, high: up, low: down, close: up, volume: Math.round(8_000_000 + rand() * 25_000_000) }
    }
    case 'sky-ground-sky': {
      // 天地天板：涨停开盘 → 盘中砸跌停 → 尾盘拉回涨停
      return { open: up, high: up, low: down, close: up, volume: Math.round(10_000_000 + rand() * 30_000_000) }
    }
    case 'tail-down': {
      // 尾盘下板：微高开震荡，尾盘砸跌停（长上影大阴）
      const open = +Math.max(preClose * (1 + (rand() - 0.45) * 0.012), 0.01).toFixed(2)
      const high = +Math.max(open * (1 + rand() * 0.02), 0.01).toFixed(2)
      return { open, high, low: down, close: down, volume: Math.round(5_000_000 + rand() * 20_000_000) }
    }
    case 'sky-ground': {
      // 天底板：涨停一字开盘 → 砸至跌停收盘（天地反转）
      return { open: up, high: up, low: down, close: down, volume: Math.round(8_000_000 + rand() * 25_000_000) }
    }
    case 'ground-sky-ground': {
      // 地天地板：跌停开盘 → 盘中拉涨停 → 收盘再砸跌停
      return { open: down, high: up, low: down, close: down, volume: Math.round(10_000_000 + rand() * 30_000_000) }
    }
  }
}

/** 9 种情绪形态的固定顺序（用于覆盖保证：形态段优先选择未出现过的形态，
 * 确保每个标的的数据池内 9 种形态全部齐全，确定性可测，v1.6.56） */
export const PATTERN_SEQUENCE: LimitPattern[] = [
  'limit-up',
  'factory-up',
  'tail-up',
  'ground-sky',
  'sky-ground-sky',
  'limit-down',
  'tail-down',
  'sky-ground',
  'ground-sky-ground',
]

/* ============================== 分时情绪形态（v1.7.0） ============================== */

/** 分时情绪形态（日 K 情绪形态的分钟路径版，路径围绕昨收的涨停/跌停价自洽） */
export type TimesharePattern =
  | 'half-day'          // 半日数据：仅上午 09:31~11:30 共 120 条（无 09:30 开盘点）
  | 'factory-up'        // 厂字板：涨停一字开盘 → 盘中开板回落 → 尾盘回封涨停
  | 'limit-up'          // 一字板涨停：全天封死涨停价
  | 'limit-down'        // 一字板跌停：全天封死跌停价
  | 'sky-ground-sky'    // 天地天：涨停开盘 → 砸至跌停 → 尾盘拉回涨停
  | 'ground-sky-ground' // 地天地：跌停开盘 → 拉至涨停 → 尾盘砸回跌停
  | 'streak-up'         // 连板涨：高开震荡上行 → 尾盘封涨停
  | 'streak-down'       // 连板跌：高开震荡下行 → 尾盘封跌停

/** 分时形态固定序列（确定性覆盖：不同 symbol 偏移分配不同形态，8 种齐全可测） */
export const TS_PATTERN_SEQUENCE: TimesharePattern[] = [
  'half-day',
  'factory-up',
  'limit-up',
  'limit-down',
  'sky-ground-sky',
  'ground-sky-ground',
  'streak-up',
  'streak-down',
]

/** 形态分钟放量系数（封板缩量 / 开板、天地震荡、尾盘拉升放量） */
export const timeshareVolumeK = (pattern: TimesharePattern, m: number): number => {
  switch (pattern) {
    case 'limit-up':
    case 'limit-down':
      return 0.4 // 一字封死缩量
    case 'factory-up':
      // 开板段（09:46~13:59）放量
      return m >= 9 * 60 + 46 && m <= 13 * 60 + 59 ? 3 : 1
    case 'sky-ground-sky':
    case 'ground-sky-ground':
      return 3 // 天地震荡全程放量
    case 'streak-up':
    case 'streak-down':
      return m >= 14 * 60 + 30 ? 2.2 : 1 // 尾盘拉升 / 砸盘放量
    case 'half-day':
      return 1
  }
}

/**
 * 形态分时分钟路径（纯函数，可单测）：
 *  - 围绕昨收的涨停价 / 跌停价构造阶段关键点（waypoints），逐分钟向目标点
 *    线性逼近 + 小幅噪声（0.3%），命中节点精确对齐（末端无累计误差）；
 *  - 分钟序列由调用方传入（最新日完整 / 久远日缺首分钟 / 半日 120 条）；
 *  - 返回与 minutes 等长的 { minute, price, volume }[]（价格自洽、升序）。
 */
export const timesharePatternPath = (
  pattern: TimesharePattern,
  preClose: number,
  minutes: number[],
  rand: () => number,
): { minute: number; price: number; volume: number }[] => {
  const up = limitUp(preClose)
  const down = limitDown(preClose)
  // 一字板（封死形态）：全天恒为涨停 / 跌停价（无插值，价格精确对齐可断言）
  if (pattern === 'limit-up' || pattern === 'limit-down') {
    const px = pattern === 'limit-up' ? up : down
    const out: { minute: number; price: number; volume: number }[] = []
    for (const m of minutes) {
      const volume = Math.round((20_000 + rand() * 280_000) * timeshareVolumeK(pattern, m))
      out.push({ minute: m, price: px, volume })
    }
    return out
  }
  const node = (m: number, px: number): [number, number] => [m, px]
  let waypoints: [number, number][]
  switch (pattern) {
    case 'factory-up': {
      // 一字涨停开盘（09:30~09:45）→ 开板回落 2%~5% → 尾盘 14:00 后回封涨停
      const dip = +Math.max(up * (1 - (0.02 + rand() * 0.03)), 0.01).toFixed(2)
      waypoints = [
        node(9 * 60 + 30, up), node(9 * 60 + 45, up), node(9 * 60 + 46, dip),
        node(11 * 60 + 30, dip), node(14 * 60, dip), node(15 * 60, up),
      ]
      break
    }
    case 'sky-ground-sky':
      // 涨停开盘 → 上午砸至跌停 → 尾盘拉回涨停
      waypoints = [
        node(9 * 60 + 30, up), node(10 * 60, up), node(11 * 60 + 30, down),
        node(14 * 60, down), node(15 * 60, up),
      ]
      break
    case 'ground-sky-ground':
      // 跌停开盘 → 上午拉至涨停 → 尾盘砸回跌停
      waypoints = [
        node(9 * 60 + 30, down), node(10 * 60, down), node(11 * 60 + 30, up),
        node(14 * 60, up), node(15 * 60, down),
      ]
      break
    case 'streak-up': {
      // 连板涨：高开 +3% → 震荡上行 → 尾盘封涨停
      const open = +Math.max(preClose * 1.03, 0.01).toFixed(2)
      const mid = +((open + up) / 2).toFixed(2)
      waypoints = [
        node(minutes[0], open), node(11 * 60 + 30, mid), node(14 * 60 + 30, mid), node(15 * 60, up),
      ]
      break
    }
    case 'streak-down': {
      // 连板跌：高开 +1% → 震荡下行 → 尾盘封跌停
      const open = +Math.max(preClose * 1.01, 0.01).toFixed(2)
      const mid = +((open + down) / 2).toFixed(2)
      waypoints = [
        node(minutes[0], open), node(11 * 60 + 30, mid), node(14 * 60 + 30, mid), node(15 * 60, down),
      ]
      break
    }
    case 'half-day':
      // 半日：上午小幅高开 → 11:30 收平 / 小涨（120 条）
      waypoints = [
        node(minutes[0], +Math.max(preClose * 1.002, 0.01).toFixed(2)),
        node(minutes[minutes.length - 1], +Math.max(preClose * 1.004, 0.01).toFixed(2)),
      ]
      break
  }
  const out: { minute: number; price: number; volume: number }[] = []
  let price = waypoints[0][1]
  let wi = 0
  for (const m of minutes) {
    // 命中已过节点：推进至对应区间
    while (wi < waypoints.length - 1 && m >= waypoints[wi + 1][0]) {
      wi += 1
    }
    if (wi === waypoints.length - 1) {
      // 已过最后一个节点：价格保持该节点价（回封 / 终点后剩余分钟恒定）
      price = waypoints[wi][1]
    } else {
      const [startM, startP] = waypoints[wi]
      const [endM, endP] = waypoints[wi + 1]
      const span = endM - startM
      const progress = span > 0 ? Math.min((m - startM) / span, 1) : 1
      const target = startP + (endP - startP) * progress
      // 区间起点 / 终点精确对齐节点价（转折点无噪声误差）；中间向目标逼近 40% + 噪声（0.3%）
      if (m === startM) {
        price = startP
      } else if (m === endM) {
        price = endP
      } else {
        price = price + (target - price) * 0.4 + (rand() - 0.5) * target * 0.003
      }
    }
    const volume = Math.round((20_000 + rand() * 280_000) * timeshareVolumeK(pattern, m))
    out.push({ minute: m, price: +Math.max(price, 0.01).toFixed(2), volume })
  }
  return out
}

/**
 * Mock 行情服务
 */

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
 * 用于 MockChartDataService 的 pools / tsPools / periodPools / timers 统一入口。
 * @param map 目标缓存
 * @param key 键
 * @param maxSize 上限（超出即淘汰最旧）
 * @param factory 未命中时的生成函数
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
   * 生成（或获取）某标的的完整日 K 池（v1.6.34 起东财口径真实化）：
   * 趋势波段状态机 + GARCH 波动聚集 + 开盘跳空 + 价量联动，周 K / 月 K /
   * 分钟 K（60/30/15/5/1 分）全部由本池派生，跨周期价格自洽。
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

  /** 分时周期数据池（最近 5 交易日，1d~5d 共用；缓存于 tsPools） */
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

  /** 二分查找：第一个 time >= target 的下标 */
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
