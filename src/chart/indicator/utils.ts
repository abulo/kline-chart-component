// utils.ts —— 技术指标共享计算工具（K 线 + 分时共用）。
// 供 indicator/ 下所有指标文件复用：
//  - tdxSMA / ema：通达信（东财同款）SMA 与 EMA 递推公式
//  - runningMax/Min：滚动窗口最值（HHV/LLV，不足 N 根取全部）
//  - tdxSum：前 N 根累加（SUM）
//  - avedev：平均绝对偏差（CCI 使用）
//  - toLines：数组 → 指标线格式
//
// 口径说明（与东财软件输出一致）：
//  - SMA(X,N,M)：Y=(M*X+(N-M)*Y')/N，Y' 为前值，首值=X[0]；
//  - EMA(X,N)：首值=X[0]，k=2/(N+1)；
//  - LLV/HHV：从首根到当根窗口的最值（不足 N 根取全部）。
import type { IndicatorLine } from './types'

/**
 * 通达信 SMA 递推平滑。
 *
 * @remarks
 * 公式：Y = (M × X + (N − M) × Y') / N，Y' 为前值，首值 = X[0]。
 * 与简单移动平均不同：这是带权重 M/N 的递推平滑（RSI / KDJ 使用）。
 *
 * @param x 输入序列（如涨跌幅 / RSV）。
 * @param n 周期 N。
 * @param m 权重分子 M。
 * @returns 与 x 等长的递推平滑序列（从首根起）。
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

/**
 * 指数移动平均 EMA（输入为纯数组）。
 *
 * @remarks
 * 公式：EMA[0] = X[0]，EMA[i] = X[i] × k + EMA[i-1] × (1 − k)，k = 2 / (N + 1)。
 * 与 calcEXPMA 等价（calcEXPMA 直接消费 K 线数组）。
 *
 * @param x 输入序列（如收盘价 / DIF）。
 * @param n 周期 N。
 * @returns 与 x 等长的 EMA 序列（从首根起）。
 */
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

/**
 * 滚动窗口最大值（HHV）。
 *
 * @remarks
 * 从首根到当根窗口的最值，不足 N 根取全部；滑出元素恰为旧最值时
 * 需在新区间内重算（判定对象是「滑出元素」而非 out[i-n]——窗口快照，
 * 两者可能不同值）。
 *
 * @param x 输入序列（如最高价）。
 * @param n 窗口宽度 N。
 * @returns 每根对应的窗口最大值。
 */
export const runningMax = (x: number[], n: number): number[] => {
  const out = new Array<number>(x.length)
  let cur = -Infinity
  for (let i = 0; i < x.length; i++) {
    cur = Math.max(cur, x[i])
    // 滑出窗口的元素（x[i-n]）恰是旧最值时，需在新区间内重算；
    // 注意判定对象是「滑出元素」而非 out[i-n]（窗口快照，两者可能不同值）。
    if (i >= n && x[i - n] === cur) cur = Math.max(...x.slice(i - n + 1, i + 1))
    out[i] = cur
  }
  return out
}

/**
 * 滚动窗口最小值（LLV）。
 *
 * @remarks
 * 与 runningMax 对称（滑出元素恰为旧最小时在新区间内重算）。
 *
 * @param x 输入序列（如最低价）。
 * @param n 窗口宽度 N。
 * @returns 每根对应的窗口最小值。
 */
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

/**
 * 前 N 根累加（SUM，不足 N 根从首根累加）。
 *
 * @param x 输入序列。
 * @param n 累加窗口 N。
 * @returns 每根对应的窗口累加值。
 */
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

/**
 * 平均绝对偏差 AVEDEV(X,N)（CCI 使用）。
 *
 * @remarks
 * 公式：AVEDEV = Σ|X − MA| / N；前 N-1 根为 0（窗口未满无有效均值）。
 *
 * @param x 输入序列（如 TYP 中间价）。
 * @param n 周期 N。
 * @returns 每根对应的平均绝对偏差（前 N-1 根为 0）。
 */
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

/**
 * 数组按 time 前缀输出为指标线格式。
 *
 * @remarks
 * 跳过 NaN / Infinity 值（预热期 / 除零保护的占位），避免画坏线。
 *
 * @param times 与 values 等长的时间序列（升序）。
 * @param values 指标值序列（可能含 NaN / Infinity）。
 * @returns 过滤后的指标线数组（仅有限值）。
 */
export const toLines = (times: number[], values: number[]): IndicatorLine[] => {
  const out: IndicatorLine[] = []
  for (let i = 0; i < times.length; i++) {
    if (Number.isFinite(values[i])) out.push({ time: times[i], value: values[i] })
  }
  return out
}
