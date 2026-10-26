/**
 * mockDataGenerator.ts —— Mock 行情数据生成层（v1.7.1 自 chartDataService.ts 拆分）
 *
 * 纯数据生成函数（无 UI / 无服务编排依赖，全部可单测）：
 *  - 日 K 池（约 3 年）+ A股情绪形态注入（一字板 1~10 连板 / 厂字板 / 尾盘上板 /
 *    地天板 / 天地天板 / 天底板 / 地天地板，涨跌停按主板 ±10%）；
 *  - 分时（1d~5d）按最近 N 个交易日生成 241 分钟分时点 / 交易日
 *    （价格线 / 均价线 / 量），`timesharePatternPath` 为 8 情绪形态确定性路径；
 *  - 分钟 K（60/30/15/5/1 分）按真实交易时段聚合、布朗桥锚定日 K 开收；
 *  - 周 / 月 K 由日 K 聚合。
 *
 * 调用方：MockChartDataService（mockChartDataService.ts，v1.7.16 拆出）——
 * 懒生成池 + 分页 / 实时编排。
 */
import type { ChartDataPoint } from '../types/chart'

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

