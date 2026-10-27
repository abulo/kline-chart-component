// types.ts —— 技术指标公共类型定义（K 线 + 分时共用）。
// 统一在此定义指标线输出格式、主图 / 附图汇总结构与指标类型联合，
// 避免各指标文件重复声明，保持类型单一来源。
import type { ChartDataPoint } from '../../types/chart'

/**
 * 主图指标类型（pane1 叠加线，互斥，同一时刻仅一个）。
 *
 * @remarks
 * MA / EXPMA / BOLL / SAR / BBI，null = 关闭。
 */
export type MainIndicatorType = 'ma' | 'expma' | 'boll' | 'sar' | 'bbi'

/**
 * 指标线数据格式（lightweight-charts LineSeries 直接可用的 data）。
 *
 * @remarks
 * time 为秒级时间戳，与 K 线时间戳一一对应；value 为指标计算值。
 */
export interface IndicatorLine {
  time: number
  value: number
}

/**
 * K 线输入裁剪类型。
 *
 * @remarks
 * 指标计算只依赖 OHLC + volume，通过 Pick 限定输入字段，防止指标误用
 * ChartDataPoint 的扩展字段。
 */
export type K = Pick<ChartDataPoint, 'time' | 'open' | 'high' | 'low' | 'close' | 'volume'>

/**
 * SAR 数据点。
 *
 * @remarks
 * value 为该根 SAR 值，trend 为方向（1 = 多头 / 上涨，-1 = 空头 / 下跌），
 * 供 SarMarkerPrimitive 按涨跌着色；由 sar.ts 计算产出。
 */
export interface SarPoint {
  time: number
  value: number
  trend: 1 | -1
}

/** 主图全部指标计算结果，供控制器一次性分发到 pane1 各 series。 */
export interface MainIndicators {
  /** MA5/10/20/30/60 五条简单均线。 */
  ma: IndicatorLine[][]
  /** EXPMA12/50 两条指数均线。 */
  expma: IndicatorLine[][]
  /** BOLL(20,2) 上轨 / 中轨 / 下轨三条。 */
  boll: [IndicatorLine[], IndicatorLine[], IndicatorLine[]]
  /** SAR 圆点序列（含方向 trend，供红 / 绿着色）。 */
  sar: SarPoint[]
  /** BBI 多空指标线。 */
  bbi: IndicatorLine[]
}

/**
 * 附图指标类型（同时只显示一种）。
 *
 * @remarks
 * 新增附图指标时：在类型联合中加入新值 + 新增同名计算文件 + index.ts 汇总。
 */
export type SubIndicatorType =
  | 'rsi'
  | 'kdj'
  | 'macd'
  | 'wr'
  | 'dmi'
  | 'bias'
  | 'obv'
  | 'cci'
  | 'roc'
  | 'cr'

/** 全部附图指标计算结果（每种为若干条线，下标顺序见各指标文件注释）。 */
export type SubIndicators = Record<SubIndicatorType, IndicatorLine[][]>
