/**
 * format.ts —— 图表展示层数值格式化工具（v1.4.41）
 *
 * 职责：集中提供自绘标签（刻度 / 十字星指示值）使用的格式化函数，
 * 纯函数、无副作用、可单测。
 *
 * 范围说明（v1.4.41 清理）：早期分时 / 浮层 / 信息行功能遗留的
 * formatSigned / formatSignedPct / formatPctAbs / formatAmount / calcTsRise /
 * stretchRange / PERIOD_DATE_FORMAT / resolvePeriodDateFormat / formatDateStr /
 * formatTimeByFmt / layoutTickPositions 均未在当前精简版本中被引用，
 * 已全部删除；后续接入分时 / 后端时按需恢复。
 */

/** 固定小数位价格，undefined / NaN 安全（K 线价格刻度 / 十字星价格指示值） */
export const formatPrice = (v?: number | null, digits = 2): string => {
  if (v === undefined || v === null || Number.isNaN(v)) return '--'
  return v.toFixed(digits)
}

/**
 * 成交量格式化（单位：股 / 手，由数据源口径决定）：
 *  1.23万 / 1.23亿 / 1234（pane3 左刻度标签专用）
 */
export const formatVolume = (v?: number | null): string => {
  if (v === undefined || v === null || Number.isNaN(v)) return '--'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return String(Math.round(v))
}

/**
 * 价格轴大数刻度缩写（OBV 等量级大的附图指标使用）：
 *  123456789 -> 1.23亿；-500000000 -> -5亿；12345 -> 1.23万；1000 -> 1000
 * 刻度标签宽度受刻度区宽度限制，必须用短格式。
 * 0 < |v| < 1 时自适应小数位（最多 6 位）——MACD 等量级极小的指标
 * 若固定 2 位会全部显示成 "0.00"，多个刻度文字雷同无法区分。
 */
export const formatAxisSmart = (v: number): string => {
  const sign = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(2)}亿`
  if (a >= 1e4) return `${sign}${(a / 1e4).toFixed(2)}万`
  if (a >= 1) return v.toFixed(2)
  if (a === 0) return '0.00'
  const digits = Math.min(6, Math.max(2, Math.ceil(-Math.log10(a)) + 1))
  return v.toFixed(digits)
}
