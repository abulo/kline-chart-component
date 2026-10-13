/**
 * utils.ts —— 技术指标共享计算工具（K 线 + 分时共用）
 *
 * 供 indicators/ 下所有指标文件复用：
 *  - tdxSMA / ema    ：通达信（东财同款）SMA 与 EMA 递推公式
 *  - runningMax/Min  ：滚动窗口最值（HHV/LLV，不足 N 根取全部）
 *  - tdxSum          ：前 N 根累加（SUM）
 *  - avedev          ：平均绝对偏差（CCI 使用）
 *  - toLines / closes：数组 → 指标线格式 / 收盘价序列
 *
 * 口径说明（与东财软件输出一致）：
 *  - SMA(X,N,M)：Y=(M*X+(N-M)*Y')/N，Y' 为前值，首值=X[0]；
 *  - EMA(X,N)：首值=X[0]，k=2/(N+1)；
 *  - LLV/HHV：从首根到当根窗口的最值（不足 N 根取全部）。
 */
import type { IndicatorLine, K } from './types'
import type { ChartDataPoint } from '../../types/chart'

/** 取收盘价序列（指标默认输入） */
export const closes = (bars: K[]): number[] => bars.map((b) => b.close!)

/**
 * 通达信 SMA：Y=(M*X+(N-M)*Y')/N，首值=X[0]（RSI/KDJ 使用）。
 * 与简单移动平均不同：这是带权重 M/N 的递推平滑。
 */
export const tdxSMA = (x: number[], n: number, m: number): number[] => {
  const out = new Array<number>(x.length)
  if (x.length === 0) return out
  let y = x[0]
  out[0] = y
  for (let i = 1; i < x.length; i++) {
    y = (m * x[i] + (n - m) * y) / n
    out[i] = y
  }
  return out
}

/** EMA：首值=X[0]，k=2/(N+1)（与 calcEXPMA 等价，输入为纯数组） */
export const ema = (x: number[], n: number): number[] => {
  const k = 2 / (n + 1)
  const out = new Array<number>(x.length)
  if (x.length === 0) return out
  let e = x[0]
  out[0] = e
  for (let i = 1; i < x.length; i++) {
    e = x[i] * k + e * (1 - k)
    out[i] = e
  }
  return out
}

/** 滚动窗口最大值（HHV）：从首根到当根窗口的最值，不足 N 根取全部 */
export const runningMax = (x: number[], n: number): number[] => {
  const out = new Array<number>(x.length)
  let cur = -Infinity
  for (let i = 0; i < x.length; i++) {
    cur = Math.max(cur, x[i])
    // 滑出窗口的元素（x[i-n]）恰是旧最值时，需在新区间内重算；
    // 注意判定对象是「滑出元素」而非 out[i-n]（窗口快照，两者可能不同值）
    if (i >= n && x[i - n] === cur) cur = Math.max(...x.slice(i - n + 1, i + 1))
    out[i] = cur
  }
  return out
}

/** 滚动窗口最小值（LLV）：与 runningMax 对称 */
export const runningMin = (x: number[], n: number): number[] => {
  const out = new Array<number>(x.length)
  let cur = Infinity
  for (let i = 0; i < x.length; i++) {
    cur = Math.min(cur, x[i])
    if (i >= n && x[i - n] === cur) cur = Math.min(...x.slice(i - n + 1, i + 1))
    out[i] = cur
  }
  return out
}

/** 前 N 根累加（SUM，不足 N 根从首根累加） */
export const tdxSum = (x: number[], n: number): number[] => {
  const out = new Array<number>(x.length)
  let sum = 0
  for (let i = 0; i < x.length; i++) {
    sum += x[i]
    if (i >= n) sum -= x[i - n]
    out[i] = sum
  }
  return out
}

/** 平均绝对偏差 AVEDEV(X,N)：Σ|X-MA|/N（CCI 使用），前 N-1 根为 0 */
export const avedev = (x: number[], n: number): number[] => {
  const out = new Array<number>(x.length).fill(0)
  for (let i = n - 1; i < x.length; i++) {
    let sum = 0
    for (let j = i - n + 1; j <= i; j++) sum += x[j]
    const mean = sum / n
    let dev = 0
    for (let j = i - n + 1; j <= i; j++) dev += Math.abs(x[j] - mean)
    out[i] = dev / n
  }
  return out
}

/** 数组按 time 前缀输出为指标线格式（跳过 NaN/Infinity，避免画坏线） */
export const toLines = (times: number[], values: number[]): IndicatorLine[] => {
  const out: IndicatorLine[] = []
  for (let i = 0; i < times.length; i++) {
    if (Number.isFinite(values[i])) out.push({ time: times[i], value: values[i] })
  }
  return out
}

/* ===================== 分时输入适配（price 充当 OHLC） ===================== */
/**
 * utils.ts —— 分时指标输入适配
 *
 * 分时点（pointType='timeshare'）只有 price / avgPrice / volume，
 * 没有 open/high/low/close。技术指标公式（RSI/KDJ/MACD/...）以 OHLC 为输入，
 * 因此把 price 同时充当 open/high/low/close 映射为标准指标输入 K：
 *  - 分时成交量柱 / OBV 直接用 volume；
 *  - 涨跌方向由指标公式对 price 序列自行判定（相对前一分钟）。
 *
 * 这样每个指标文件只需一行映射 + 调用 K 线同名函数，
 * 算法口径与 K 线附图完全一致（东财），不产生第二套公式。
 */

/** 单个分时点 → 指标输入 K（price 充当 OHLC） */
export const toK = (p: ChartDataPoint): K => ({
  time: p.time,
  open: p.price,
  high: p.price,
  low: p.price,
  close: p.price,
  volume: p.volume,
})

/** 分时数组 → 指标输入 K 数组（跳过无 price 的点） */
export const toKBars = (bars: ChartDataPoint[]): K[] =>
  bars.filter((b) => b.price !== undefined).map(toK)

