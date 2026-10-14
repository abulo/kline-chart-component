/**
 * indicatorMeta.ts —— 附图指标元信息（v1.4.73 拆分自 KLineChartController.ts）
 *
 * 线名集中管理：下标顺序与各指标 calc 返回线序一致，
 * 颜色见 theme.subIndicatorColors（全部颜色集中在公共文件）。
 */
import type { SubIndicatorType } from '../indicator'

/**
 * 附图指标线名（pane4 指标信息行标签；下标顺序与各指标 calc 返回线序一致）。
 * 例：rsi → ['RSI6', 'RSI12', 'RSI24'] 对应 calcRSI 返回的三条线。
 */
export const subIndicatorLabels: Record<SubIndicatorType, string[]> = {
  rsi: ['RSI6', 'RSI12', 'RSI24'],
  kdj: ['K', 'D', 'J'],
  macd: ['DIF', 'DEA', 'MACD'],
  wr: ['WR10', 'WR6'],
  dmi: ['PDI', 'MDI', 'ADX', 'ADXR'],
  bias: ['BIAS6', 'BIAS12', 'BIAS24'],
  obv: ['OBV', 'OBVMA'],
  cci: ['CCI'],
  roc: ['ROC', 'ROCMA'],
  cr: ['CR', 'MA5', 'MA10', 'MA20'],
}
