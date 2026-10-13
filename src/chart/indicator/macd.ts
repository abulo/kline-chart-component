/**
 * macd.ts —— MACD 指标计算（东方财富算法，纯函数可单测）（v1.4.14）
 *
 * 算法（与东方财富 / 通达信一致）：
 *   EMA(X, N)：alpha = 2 / (N + 1)，EMA[i] = alpha × X[i] + (1 - alpha) × EMA[i-1]，
 *              初值 EMA[0] = X[0]
 *   DIF  = EMA(close, 12) - EMA(close, 26)
 *   DEA  = EMA(DIF, 9)
 *   MACD = 2 × (DIF - DEA)          （东财显示柱值 = 2 倍差值）
 *
 * 输出与输入 bars 逐根对齐（同索引），时间戳取 bars[i].time。
 */

/** MACD 指标数据点（与 bars 对齐） */
export interface MacdPoint {
  /** 秒级时间戳（同 bars[i].time） */
  time: number
  /** DIF = EMA12 - EMA26 */
  dif: number
  /** DEA = EMA(DIF, 9) */
  dea: number
  /** MACD 柱值 = 2 × (DIF - DEA) */
  macd: number
}

/**
 * 指数移动平均（东方财富算法）
 * @param values 输入序列
 * @param period 周期 N（alpha = 2/(N+1)）
 * @returns 与输入等长的 EMA 序列
 */
export const ema = (values: readonly number[], period: number): number[] => {
  const alpha = 2 / (period + 1)
  const result: number[] = new Array(values.length)
  if (values.length === 0) return result
  result[0] = values[0]
  for (let index = 1; index < values.length; index++) {
    result[index] = alpha * values[index] + (1 - alpha) * result[index - 1]
  }
  return result
}

/**
 * 计算 MACD 指标（与 bars 逐根对齐）
 * @param bars K 线数据（至少含 time / close）
 * @returns MACD 指标点数组（长度与 bars 一致）
 */
export const calcMacd = (bars: readonly { time: number; close: number }[]): MacdPoint[] => {
  const closes = bars.map((bar) => bar.close)
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  const difs = ema12.map((value, index) => value - ema26[index])
  const deas = ema(difs, 9)
  return bars.map((bar, index) => ({
    time: bar.time,
    dif: difs[index],
    dea: deas[index],
    macd: 2 * (difs[index] - deas[index]),
  }))
}
