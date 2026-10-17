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

/**
 * 秒级时间戳 → 本地日期字符串 YYYY-MM-DD（pane0 顶部信息行最新 bar 时间显示）。
 * 非法输入（NaN / Infinity）返回 '--'，避免展示层出现乱码。
 */
export const formatDate = (seconds?: number | null): string => {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return '--'
  const date = new Date(seconds * 1000)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}


/** 秒级时间戳 → 本地 "HH:mm"（分时周期专用，与交易时段一致） */
export const formatClock = (seconds?: number | null): string => {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return '--'
  const date = new Date(seconds * 1000)
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${hour}:${minute}`
}

/** 秒级时间戳 → 本地 "YYYY-MM-DD HH:mm"（分钟 K 周期专用） */
export const formatDateTime = (seconds?: number | null): string => {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return '--'
  return `${formatDate(seconds)} ${formatClock(seconds)}`
}

/**
 * 按周期格式化时间（pane0 信息行 / 十字星时间轴指示值，v1.5.10）：
 *  - 日 K / 周 K / 月 K        → YYYY-MM-DD；
 *  - 分时（1d~5d）              → YYYY-MM-DD HH:mm（v1.7.0 调整：跨多交易日分时
 *    需区分日期，由 HH:mm 改为日期 + 时间）；
 *  - 60/30/15/5/1 分钟 K       → YYYY-MM-DD HH:mm。
 * 未知周期默认按日 K（YYYY-MM-DD），容错外部传入非常用周期值。
 */
export const formatAxisTime = (seconds?: number | null, period?: string): string => {
  if (period === '1d' || period === '2d' || period === '3d' || period === '4d' || period === '5d') {
    return formatDateTime(seconds)
  }
  if (
    period === '60min' ||
    period === '30min' ||
    period === '15min' ||
    period === '5min' ||
    period === '1min'
  ) {
    return formatDateTime(seconds)
  }
  return formatDate(seconds)
}

/**
 * 秒级时间戳 → 按格式模板输出（v1.6.9 透传 KLineChart.vue format 参数）。
 * 支持标记：YYYY / MM / DD / HH / mm / ss。
 * 例：formatTimeByFmt(1728000000, 'YYYY-MM-DD') -> '2024-10-04'
 *     formatTimeByFmt(1728000000, 'YYYY-MM-DD HH:mm') -> '2024-10-04 00:00'
 */
export const formatTimeByFmt = (ts: number, fmt = 'YYYY-MM-DD HH:mm'): string => {
  const date = new Date(ts * 1000)
  const pad = (v: number): string => String(v).padStart(2, '0')
  const map: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  }
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (key) => map[key] ?? key)
}

/**
 * 时间归一化（v1.6.10）：任意来源 time → 秒级数字时间戳（UTCTimestamp）。
 * 周期切换 / 实时推送时混入非数字 time（BusinessDay 对象 / Date / ISO 字符串）
 * 或越界 time 会导致 series.update 报
 * "Cannot update oldest data, last time=[object Object]"。
 *  - number 且有限 → 原值；BusinessDay {year, month, day} → Date.UTC 秒；
 *  - Date / ISO 字符串 → getTime / Date.parse 秒；其余 → null（调用方跳过该条）。
 */
export const normalizeChartTime = (time: unknown): number | null => {
  if (typeof time === 'number') {
    return Number.isFinite(time) ? Math.floor(time) : null
  }
  if (time instanceof Date) {
    return Number.isFinite(time.getTime()) ? Math.floor(time.getTime() / 1000) : null
  }
  if (typeof time === 'string') {
    const parsed = Date.parse(time)
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
  }
  if (time !== null && typeof time === 'object') {
    const obj = time as { year?: unknown; month?: unknown; day?: unknown }
    const year = typeof obj.year === 'number' ? obj.year : Number(obj.year)
    const month = typeof obj.month === 'number' ? obj.month : Number(obj.month)
    const day = typeof obj.day === 'number' ? obj.day : Number(obj.day)
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      const utc = Date.UTC(year, month - 1, day)
      return Number.isFinite(utc) ? Math.floor(utc / 1000) : null
    }
  }
  return null
}
