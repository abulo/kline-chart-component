/**
 * index.ts —— 技术指标统一出口（indicators/）
 *
 * 目录规划（K 线 + 分时共用同一套指标文件，每个指标一个 ts 文件）：
 *   src/chart/indicators/
 *   ├── index.ts     ← 本文件：统一出口（K 线主图/附图 + 分时附图全部从这里导入）
 *   ├── types.ts     ← 公共类型（IndicatorLine/K/MainIndicators/SubIndicatorType/分时类型）
 *   ├── utils.ts     ← 共享计算工具（SMA/EMA/滚动最值 + 分时输入适配 toK/toKBars）
 *   ├── ma.ts expma.ts boll.ts sar.ts bbi.ts volumeMa.ts cr.ts   ← K 线专属
 *   └── rsi.ts kdj.ts macd.ts wr.ts dmi.ts bias.ts obv.ts cci.ts roc.ts
 *       └── 每文件同时导出 K 线版（calcX）与分时版（calcTSX，复用算法 + toKBars 映射）
 *
 * 分时版与 K 线版共享同一套算法（东财口径），差异只在输入：
 * 分时点用 price 充当 OHLC（见 utils.ts toKBars）；集合差异：分时附图 9 个（无 CR）。
 *
 * 新增指标步骤：
 *   1. 在 indicators/ 下新建 <name>.ts（K 线版导出 calc<Name>；若需分时版再导出 calcTS<Name>）；
 *   2. 附图指标：扩展 types.ts 的 SubIndicatorType / TimeshareSubIndicatorType 联合类型；
 *   3. 本文件 import + 加入对应组合函数 + re-export。
 */
import type { ChartDataPoint } from '../../types/chart'

// ---- 类型 ----
export type {
  IndicatorLine,
  K,
  MainIndicators,
  SubIndicatorType,
  SubIndicators,
  TimeshareSubIndicatorType,
  TimeshareIndicators,
} from './types'
export type { SarPoint, SarOptions } from './sar'

// ---- 工具 ----
export { tdxSMA, ema, runningMax, runningMin, tdxSum, avedev, toLines, closes } from './utils'
export { toK, toKBars } from './utils'

// ---- K 线主图五指标 ----
export { calcMA } from './ma'
export { calcEXPMA } from './expma'
export { calcBOLL } from './boll'
export { calcSAR } from './sar'
export { calcBBI } from './bbi'
export { calcVolMA } from './volumeMa'

// ---- K 线附图十指标（含 CR） ----
export { calcRSI } from './rsi'
export { calcKDJ } from './kdj'
export { calcMACD } from './macd'
export { calcWR } from './wr'
export { calcDMI } from './dmi'
export { calcBIAS } from './bias'
export { calcOBV } from './obv'
export { calcCCI } from './cci'
export { calcROC } from './roc'
export { calcCR } from './cr'

// ---- 分时附图九指标（无 CR，复用上方 K 线算法 + toKBars 输入映射） ----
export { calcTSRSI } from './rsi'
export { calcTSKDJ } from './kdj'
export { calcTSMACD } from './macd'
export { calcTSWR } from './wr'
export { calcTSDMI } from './dmi'
export { calcTSBIAS } from './bias'
export { calcTSOBV } from './obv'
export { calcTSCCI } from './cci'
export { calcTSROC } from './roc'

import type { IndicatorLine, MainIndicators, SubIndicators, TimeshareIndicators } from './types'
import { calcMA } from './ma'
import { calcEXPMA } from './expma'
import { calcBOLL } from './boll'
import { calcSAR } from './sar'
import { calcBBI } from './bbi'
import { calcVolMA } from './volumeMa'
import { calcRSI } from './rsi'
import { calcKDJ } from './kdj'
import { calcMACD } from './macd'
import { calcWR } from './wr'
import { calcDMI } from './dmi'
import { calcBIAS } from './bias'
import { calcOBV } from './obv'
import { calcCCI } from './cci'
import { calcROC } from './roc'
import { calcCR } from './cr'
import { calcTSRSI } from './rsi'
import { calcTSKDJ } from './kdj'
import { calcTSMACD } from './macd'
import { calcTSWR } from './wr'
import { calcTSDMI } from './dmi'
import { calcTSBIAS } from './bias'
import { calcTSOBV } from './obv'
import { calcTSCCI } from './cci'
import { calcTSROC } from './roc'

/**
 * 计算 K 线主图五指标（MA/EXPMA/BOLL/SAR/BBI，东财算法）。
 * @param bars 升序 K 线点数组（pointType='kline'）
 */
export const calcMainIndicators = (bars: ChartDataPoint[]): MainIndicators => {
  return {
    ma: [5, 10, 20, 30, 60].map((p) => calcMA(bars, p)),
    expma: [12, 50].map((p) => calcEXPMA(bars, p)),
    boll: calcBOLL(bars, 20, 2),
    sar: calcSAR(bars),
    bbi: calcBBI(bars),
  }
}

/** 计算 Pane1 成交量均线（VOL MA5/MA10） */
export const calcVolumeMAs = (bars: ChartDataPoint[]): IndicatorLine[][] => {
  return [5, 10].map((p) => calcVolMA(bars, p))
}

/**
 * 计算 K 线附图十指标（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR，东财算法）。
 * @param bars 升序 K 线点数组（pointType='kline'）
 */
export const calcSubIndicators = (bars: ChartDataPoint[]): SubIndicators => {
  return {
    rsi: calcRSI(bars),
    kdj: calcKDJ(bars),
    macd: calcMACD(bars),
    wr: calcWR(bars),
    dmi: calcDMI(bars),
    bias: calcBIAS(bars),
    obv: calcOBV(bars),
    cci: calcCCI(bars),
    roc: calcROC(bars),
    cr: calcCR(bars),
  }
}

/**
 * 计算全部分时附图指标（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC，东财算法）。
 * 输入为分时点数组（price 充当 OHLC，volume 用分时每分钟成交量）。
 * @param bars 升序分时点数组（pointType='timeshare'）
 */
export const calcTimeshareSubIndicators = (bars: ChartDataPoint[]): TimeshareIndicators => {
  return {
    rsi: calcTSRSI(bars),
    kdj: calcTSKDJ(bars),
    macd: calcTSMACD(bars),
    wr: calcTSWR(bars),
    dmi: calcTSDMI(bars),
    bias: calcTSBIAS(bars),
    obv: calcTSOBV(bars),
    cci: calcTSCCI(bars),
    roc: calcTSROC(bars),
  }
}
