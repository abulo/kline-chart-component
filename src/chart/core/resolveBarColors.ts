/**
 * resolveBarColors.ts —— K 线 / 成交量柱红绿平盘三态颜色（v1.6.57）
 *
 * A 股"红涨绿跌"，判定基准为**昨收（preClose）**而非开收比较：
 *  - close >  preClose → 上涨：空心红柱（柱体填充 = 背景色，边框 / 影线 = 上涨色）
 *  - close <  preClose → 下跌：绿色实心（柱体 / 边框 / 影线均为下跌色）
 *  - close == preClose → 平盘：中性色（深系白 / 浅系黑，由主题 flatColor 提供）
 *
 * 说明：lightweight-charts CandlestickSeries 内置红绿按 close >= open 判定，
 * 一字板（open === close）会被画成上涨红；本函数逐根覆盖
 * color / borderColor / wickColor，彻底改按 preClose 三态（v1.6.57 修复）。
 */
import type { ChartDataPoint } from '../../types/chart'

/** 柱体三色画板（与主题同源） */
export interface BarPalette {
  /** 图表背景色（上涨空心柱的填充） */
  background: string
  /** 上涨色（红） */
  upColor: string
  /** 下跌色（绿） */
  downColor: string
  /** 平盘色（深系白 / 浅系黑） */
  flatColor: string
}

/** K 线数据点颜色三件套（color 柱体 / borderColor 边框 / wickColor 影线） */
export interface BarColors {
  color: string
  borderColor: string
  wickColor: string
}

/** 昨收兜底：preClose 缺失时以开盘价为基准（首根 / 数据不全场景） */
const resolvePreClose = (bar: ChartDataPoint): number => bar.preClose ?? bar.open ?? 0

/** 按 close vs preClose 解析柱体三态颜色（纯函数，可单测） */
export const resolveBarColors = (bar: ChartDataPoint, palette: BarPalette): BarColors => {
  const close = bar.close ?? 0
  const preClose = resolvePreClose(bar)
  if (close > preClose) {
    // 上涨：空心红柱（填充 = 背景，边框 / 影线 = 红）
    return { color: palette.background, borderColor: palette.upColor, wickColor: palette.upColor }
  }
  if (close < preClose) {
    // 下跌：绿色实心
    return { color: palette.downColor, borderColor: palette.downColor, wickColor: palette.downColor }
  }
  // 平盘：中性色（深系白 / 浅系黑）
  return { color: palette.flatColor, borderColor: palette.flatColor, wickColor: palette.flatColor }
}

/**
 * 分时分钟成交量柱颜色（纯函数，可单测；v1.7.0）：
 *  - 每个交易日首根（prevBar 为 undefined 或与当前 tradeDate 不同）：
 *    本分钟价格 VS 昨日收盘 preClose（> 红 / < 绿 / = 平盘色）；
 *  - 其余分钟：本分钟价格 VS 上一分钟价格（> 红 / < 绿 / = 平盘色）。
 * 返回单色（1px 实心细柱），平盘 = 主题 flatColor（深系白 / 浅系黑）。
 */
export const resolveTimeshareVolumeColor = (
  bar: ChartDataPoint,
  prevBar: ChartDataPoint | undefined,
  palette: BarPalette,
): string => {
  const price = bar.price ?? 0
  // 每日首根基准 = 昨收 preClose（分时点必含）；其余 = 上一分钟价
  const isFirstOfDay = prevBar === undefined || prevBar.tradeDate !== bar.tradeDate
  const base = isFirstOfDay ? (bar.preClose ?? bar.price ?? 0) : (prevBar?.price ?? bar.price ?? 0)
  if (price > base) return palette.upColor
  if (price < base) return palette.downColor
  return palette.flatColor
}

/**
 * 数值 vs 基准值三态颜色（纯函数，可单测；v1.7.1）：
 *  > base → upColor（红）；< base → downColor（绿）；= base → flatColor（平盘中色）。
 * 用于分时 pane1 左右刻度标签按值着色（基准 = 首根 preClose）。
 */
export const resolveVsBaseColor = (
  value: number,
  base: number,
  palette: BarPalette,
): string => {
  if (value > base) return palette.upColor
  if (value < base) return palette.downColor
  return palette.flatColor
}
