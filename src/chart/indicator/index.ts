// index.ts —— 技术指标统一出口。
// K 线主图五指标（MA/EXPMA/BOLL/SAR/BBI）+ 附图十指标（含 CR）+ 类型 / 配置 / 工具
// 全部从这里导出，外部只允许通过本文件导入指标能力。
// 新增指标步骤：1. 新建 <name>.ts（导出 calc<Name>）；2. 附图指标扩展 types.ts 的
// SubIndicatorType 联合；3. 本文件 import + re-export。
import type { ChartDataPoint } from '../../types/chart'

// ---- 类型 ----
export type {
  IndicatorLine,
  K,
  MainIndicatorType,
  MainIndicators,
  SubIndicatorType,
} from './types'
export type { SarPoint, SarOptions } from './sar'

// ---- 指标按钮配置（App 工具栏渲染用） ----
export { MainIndicatorOptions, SubIndicatorOptions } from './options'
export type { IndicatorOption } from './options'

// ---- 工具 ----
export { tdxSMA, ema, runningMax, runningMin, tdxSum, avedev, toLines } from './utils'

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

import type { SubIndicatorType, IndicatorLine } from './types'
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
 * 计算单个附图指标（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR，东财算法）。
 *
 * @remarks
 * 按名分发到对应 calc 函数，避免全量计算十指标：数据变化 / 指标切换时只重算
 * 当前选中指标，长数据（10000 根）下计算量降为 1/10。
 *
 * @param name 指标名，{@link SubIndicatorType} 联合类型之一。
 * @param bars 升序 K 线点数组（pointType = 'kline'）。
 * @returns 按线序的指标线数组，下标顺序见各指标 calc 文件注释。
 */
export const calcSubIndicator = (
  name: SubIndicatorType,
  bars: ChartDataPoint[],
): IndicatorLine[][] => {
  switch (name) {
    case 'rsi': return calcRSI(bars)
    case 'kdj': return calcKDJ(bars)
    case 'macd': return calcMACD(bars)
    case 'wr': return calcWR(bars)
    case 'dmi': return calcDMI(bars)
    case 'bias': return calcBIAS(bars)
    case 'obv': return calcOBV(bars)
    case 'cci': return calcCCI(bars)
    case 'roc': return calcROC(bars)
    case 'cr': return calcCR(bars)
  }
}
