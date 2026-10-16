/**
 * index.ts —— 技术指标统一出口（indicators/）
 *
 * 目录规划（K 线 + 分时共用同一套指标文件，每个指标一个 ts 文件）：
 *   src/chart/indicators/
 *   ├── index.ts     ← 本文件：统一出口（K 线主图/附图 + 分时附图全部从这里导入）
 *   ├── types.ts     ← 公共类型（IndicatorLine/K/MainIndicators/SubIndicatorType/分时类型）
 *   ├── utils.ts     ← 共享计算工具（SMA/EMA/滚动最值等，v1.6.32 起无分时适配）
 *   ├── ma.ts expma.ts boll.ts sar.ts bbi.ts volumeMa.ts cr.ts   ← K 线专属
 *   └── rsi.ts kdj.ts macd.ts wr.ts dmi.ts bias.ts obv.ts cci.ts roc.ts
 *       └── 每文件导出 K 线版（calcX）
 *
 * v1.6.32：分时附图层（calcTS、toK、toKBars）已清理（当前 K 线组件未接线分时指标），
 * 后续接入分时副图时按需恢复。
 *
 * 新增指标步骤：
 *   1. 在 indicators/ 下新建 <name>.ts（导出 calc<Name>）；
 *   2. 附图指标：扩展 types.ts 的 SubIndicatorType 联合类型；
 *   3. 本文件 import + re-export。
 */
import type { ChartDataPoint } from '../../types/chart'

// ---- 类型 ----
export type {
  IndicatorLine,
  K,
  MainIndicators,
  SubIndicatorType,
  SubIndicators,
} from './types'
export type { SarPoint, SarOptions } from './sar'

// ---- 工具 ----
export { tdxSMA, ema, runningMax, runningMin, tdxSum, avedev, toLines, closes } from './utils'

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

import type { SubIndicators } from './types'
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
