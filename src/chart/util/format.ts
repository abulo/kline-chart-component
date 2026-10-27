// format.ts —— 图表展示层数值格式化工具。
// 集中提供自绘标签（刻度 / 十字星指示值 / 信息行）使用的格式化函数，
// 全部为纯函数、无副作用、可单测。

/** 固定小数位价格，undefined / NaN 安全（K 线价格刻度 / 十字星价格指示值）。 */
export const formatPrice = (v?: number | null, digits = 2): string => {
  if (v === undefined || v === null || Number.isNaN(v)) return '--'
  return v.toFixed(digits)
}

/**
 * 成交量格式化（单位由数据源口径决定：股 / 手）。
 *
 * @remarks
 * 量级缩写：1.23 万 / 1.23 亿，千级以下保留整数（pane3 左刻度标签专用）。
 *
 * @param v 成交量数值。
 * @returns '--'（非法输入）/ 缩写字符串。
 */
export const formatVolume = (v?: number | null): string => {
  if (v === undefined || v === null || Number.isNaN(v)) return '--'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return String(Math.round(v))
}

/**
 * 价格轴大数刻度缩写（OBV 等量级大的附图指标使用）。
 *
 * @remarks
 * 刻度标签宽度受刻度区宽度限制，必须使用短格式：123456789 → 1.23 亿；
 * 0 < |v| < 1 时自适应小数位（最多 6 位）——MACD 等量级极小的指标若固定 2 位
 * 会全部显示成 '0.00'，多个刻度文字雷同无法区分。
 *
 * @param v 待格式化数值（可正可负）。
 * @returns 带符号缩写字符串，如 '1.23亿' / '-5亿' / '0.00'。
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
 * 涨跌幅百分比格式化（分时 pane1 右刻度专用）。
 *
 * @remarks
 * 公式：(price / preClose - 1) × 100%，保留 2 位小数并带正负号（+1.23% / -0.87%）；
 * 2 位小数下归零的幅度（|pct| < 0.005%）显示平盘 '0.00%'（无符号）；
 * preClose 非法（0 / NaN）返回 ''。颜色三态由调用方 getValueColor
 * （>0 红 / <0 绿 / =0 平盘）按返回值判定。
 *
 * @param price 当前价。
 * @param preClose 昨收价。
 * @returns 百分比字符串；preClose 非法时返回 ''。
 */
export const formatPercent = (price: number, preClose: number): string => {
  if (!Number.isFinite(price) || !Number.isFinite(preClose) || preClose === 0) return ''
  const pct = ((price - preClose) / preClose) * 100
  if (Math.abs(pct) < 0.005) return '0.00%'
  const sign = pct > 0 ? '+' : '-'
  return `${sign}${Math.abs(pct).toFixed(2)}%`
}

/**
 * 秒级时间戳 → 本地日期字符串 YYYY-MM-DD（pane0 顶部信息行最新 bar 时间显示）。
 *
 * @param seconds 秒级时间戳。
 * @returns 'YYYY-MM-DD' 字符串；非法输入（undefined / NaN / Infinity）返回 '--'。
 */
export const formatDate = (seconds?: number | null): string => {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return '--'
  const date = new Date(seconds * 1000)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 秒级时间戳 → 本地 "HH:mm"（分时周期专用，与交易时段一致）。
 *
 * @param seconds 秒级时间戳。
 * @returns 两位补零的 "HH:mm" 本地时间字符串（如 '09:31'）；非法输入返回 '--'。
 */
export const formatClock = (seconds?: number | null): string => {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return '--'
  const date = new Date(seconds * 1000)
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${hour}:${minute}`
}

/**
 * 秒级时间戳 → 本地 "YYYY-MM-DD HH:mm"（分钟 K 周期 / 分时 tooltip 专用）。
 *
 * @remarks
 * 由 {@link formatDate} 与 {@link formatClock} 拼接，供同时需要日期与时间的场景复用。
 *
 * @param seconds 秒级时间戳。
 * @returns 'YYYY-MM-DD HH:mm' 字符串；非法输入返回 '--'。
 */
export const formatDateTime = (seconds?: number | null): string => {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return '--'
  return `${formatDate(seconds)} ${formatClock(seconds)}`
}

/**
 * 按周期格式化时间（pane0 信息行 / 十字星时间轴指示值）。
 *
 * @remarks
 * - 日 K / 周 K / 月 K → YYYY-MM-DD；
 * - 分时（1d~5d）→ YYYY-MM-DD HH:mm（跨多交易日分时需区分日期，由 HH:mm
 *   调整为日期 + 时间）；60/30/15/5/1 分钟 K → YYYY-MM-DD HH:mm；
 * - 未知周期默认按日 K 格式，容错外部传入非常用周期值。
 *
 * @param seconds 秒级时间戳。
 * @param period 周期标识（分时 / 分钟 K → 日期 + 时间；日 / 周 / 月 K → 仅日期）。
 * @returns 按周期格式化的时间字符串；非法输入返回 '--'。
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
 * 秒级时间戳 → 按格式模板输出（透传 KLineChart.vue 的 format 参数）。
 *
 * @remarks
 * 支持标记：YYYY / MM / DD / HH / mm / ss；模板中未识别的标记原样保留。
 * 例：formatTimeByFmt(1728000000, 'YYYY-MM-DD') → '2024-10-04'。
 *
 * @param ts 秒级时间戳（必传）。
 * @param fmt 格式模板，默认 'YYYY-MM-DD HH:mm'。
 * @returns 按模板替换后的字符串。
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
 * 时间归一化：任意来源 time → 秒级数字时间戳（UTCTimestamp）。
 *
 * @remarks
 * 周期切换 / 实时推送时若混入非数字 time（BusinessDay 对象 / Date / ISO 字符串）
 * 或越界 time，会导致 series.update 报
 * "Cannot update oldest data, last time=[object Object]"。
 * 规则：number 且有限 → 原值；BusinessDay { year, month, day } → Date.UTC 秒；
 * Date / ISO 字符串 → getTime / Date.parse 秒；其余 → null（调用方跳过该条）。
 *
 * @param time 任意来源的时间值（number / BusinessDay / Date / ISO 字符串 / 其他）。
 * @returns 归一化后的秒级整数时间戳；无法解析时返回 null。
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
