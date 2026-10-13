/**
 * 图表展示层格式化工具
 */

/** 固定小数位价格，undefined / NaN 安全 */
export const formatPrice = (v?: number | null, digits = 2): string => {
  if (v === undefined || v === null || Number.isNaN(v)) return '--'
  return v.toFixed(digits)
}

/** 带正负号价格 */
export const formatSigned = (v?: number | null, digits = 2): string => {
  if (v === undefined || v === null || Number.isNaN(v)) return '--'
  return (v >= 0 ? '+' : '') + v.toFixed(digits)
}

/** 带正负号百分比 */
export const formatSignedPct = (v?: number | null, digits = 2): string => {
  if (v === undefined || v === null || Number.isNaN(v)) return '--'
  return (v >= 0 ? '+' : '') + v.toFixed(digits) + '%'
}

/**
 * 无符号百分比（价格刻度专用）：只显示幅度绝对值，不输出 '-' 负号（用户口径：
 * 左右**价格**刻度不显示负号，涨跌方向由数值/位置/颜色感知，刻度保持干净；
 * 分时右侧**百分比**刻度 2026-10 起除中间 0% 外改用 formatSignedPct 带正负号）。
 * 浮层 / 十字星标签 / 信息行仍使用 formatSignedPct 保留涨跌语义。
 */
export const formatPctAbs = (v?: number | null, digits = 2): string => {
  if (v === undefined || v === null || Number.isNaN(v)) return '--'
  return Math.abs(v).toFixed(digits) + '%'
}

/**
 * 成交量格式化（单位：股 / 手，由数据源口径决定）
 *  1.23万 / 1.23亿
 */
export const formatVolume = (v?: number | null): string => {
  if (v === undefined || v === null || Number.isNaN(v)) return '--'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return String(Math.round(v))
}

/**
 * 成交额格式化（单位：元）
 *  1.23万 / 1.23亿
 */
export const formatAmount = (v?: number | null): string => {
  if (v === undefined || v === null || Number.isNaN(v)) return '--'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return String(Math.round(v))
}

/**
 * 价格轴大数刻度缩写（OBV 等量级大的附图指标使用）：
 *  123456789 -> 1.23亿；-500000000 -> -5亿；12345 -> 1.23万；1000 -> 1000
 * 刻度标签宽度受 72px 刻度区限制，必须用短格式。
 */
export const formatAxisSmart = (v: number): string => {
  const sign = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(2)}亿`
  if (a >= 1e4) return `${sign}${(a / 1e4).toFixed(2)}万`
  if (a >= 1) return v.toFixed(2)
  if (a === 0) return '0.00'
  // 0 < |v| < 1：自适应小数位（最多 6 位）——MACD 等量级极小的指标
  // 若固定 2 位会全部显示成 "0.00"，5 个刻度文字雷同无法区分
  const digits = Math.min(6, Math.max(2, Math.ceil(-Math.log10(a)) + 1))
  return v.toFixed(digits)
}

/* ------------------------------ 分时涨跌基准（浮层 / 信息行共用） ------------------------------ */

/**
 * 分时涨跌计算（浮层价格着色与 Pane0 信息行读数共用同一规则，避免两处口径漂移）：
 * 用户规则（2026-10）：**所有分时点（含首根）与第一根分时数据的昨收价比较**
 * ——统一基准 = tsBasePrice（控制器在 applyTsSyncRange 中赋值为 bars[0].preClose，
 * 分时右侧 0% 中间刻度也对应该基准；首根也可能高/低开 → 首根涨幅非恒 0）。
 * 颜色判定由调用方按 rise 正负取主题色（>0 红 / <0 绿 / =0 平）。
 * @param price        当前成交价
 * @param _isFirst     是否首根分时点（保留仅为调用点兼容，不再参与基准选择）
 * @param preClose     昨收价（tsBasePrice 缺失时的回退基准）
 * @param tsBasePrice  第一根分时数据的昨收价（统一比较基准）
 * @returns rise（涨跌额，基准为 0 时恒 0）、base（实际基准）、riseRate（涨幅 %）
 */
export const calcTsRise = (
  price: number,
  _isFirst: boolean,
  preClose: number,
  tsBasePrice: number,
): { rise: number; base: number; riseRate: number } => {
  const base = tsBasePrice || preClose || 0
  const rise = base === 0 ? 0 : price - base
  const riseRate = base === 0 ? 0 : (rise / base) * 100
  return { rise, base, riseRate }
}

/**
 * 刻度范围上下对称拉伸（用户 StretchRangeA 公式，K 线 Pane0 左刻度用）：
 * 以中间值 vmid 为锚，上下各放大 k（默认 25%）：dNew = d×(1+k)，
 * newMax = vmid+dNew、newMin = vmid-dNew、newMid = vmid 不变。
 * 例：stretchRange(10, 5, 0, 0.25) → { newMax: 11.25, newMid: 5, newMin: -1.25 }
 * （d = 10-5 = 5 → dNew = 6.25 → 11.25 / -1.25）。
 * @param vmax 原始最大值
 * @param vmid 中间值（K 线 = 可视数据 (max+min)/2；分时 = 首根昨收基准）
 * @param _vmin 原始最小值（保留仅为对齐用户公式签名，拉伸只依赖 vmax-vmid）
 * @param k    放大系数（K 线 0.25；分时 R×1.25 由调用方直接处理）
 */
export const stretchRange = (
  vmax: number,
  vmid: number,
  _vmin: number,
  k = 0.25,
): { newMax: number; newMid: number; newMin: number } => {
  const d = vmax - vmid
  const dNew = d * (1 + k)
  return { newMax: vmid + dNew, newMid: vmid, newMin: vmid - dNew }
}

/**
 * 周期 → 展示时间模板（dateFormat）映射：
 *  - 1d/2d/3d/4d/5d（1~5 日分时）：'YYYY-MM-DD HH:mm'（分钟级时刻，含日期）；
 *  - day/week/month（日/周/月 K）：'YYYY-MM-DD'（无时分）；
 *  - 60min/30min/15min/5min/1min（分钟 K）：'YYYY-MM-DD HH:mm'（含日期与时刻）。
 * 当 period 变化时，dateFormat 按此映射随之变化（组件 / 控制器共用同一规则）。
 */
export const PERIOD_DATE_FORMAT: Record<string, string> = {
  '1d': 'YYYY-MM-DD HH:mm',
  '2d': 'YYYY-MM-DD HH:mm',
  '3d': 'YYYY-MM-DD HH:mm',
  '4d': 'YYYY-MM-DD HH:mm',
  '5d': 'YYYY-MM-DD HH:mm',
  day: 'YYYY-MM-DD',
  week: 'YYYY-MM-DD',
  month: 'YYYY-MM-DD',
  '60min': 'YYYY-MM-DD HH:mm',
  '30min': 'YYYY-MM-DD HH:mm',
  '15min': 'YYYY-MM-DD HH:mm',
  '5min': 'YYYY-MM-DD HH:mm',
  '1min': 'YYYY-MM-DD HH:mm',
}

/** 按周期解析 dateFormat 模板（未列出的周期缺省 'YYYY-MM-DD'） */
export const resolvePeriodDateFormat = (period: string): string =>
  PERIOD_DATE_FORMAT[period] ?? 'YYYY-MM-DD'

/**
 * 按模板格式化日期字符串（tradeDate 口径 'YYYY-MM-DD'，兼容带时间的 'YYYY-MM-DD HH:mm'）。
 * 支持的占位符：
 *   YYYY 四位年 / YY 两位年 / MM 两位月 / M 一位月 / DD 两位日 / D 一位日 /
 *   HH 两位时 / mm 两位分
 * 示例：formatDateStr('2026-10-05', 'YYYY/MM/DD') -> '2026/10/05'
 *       formatDateStr('2026-10-05 09:30', 'MM-DD HH:mm') -> '10-05 09:30'
 * @param dateStr 原始日期字符串（空 / 无法解析时原样返回）
 * @param fmt     输出模板（缺省 'YYYY-MM-DD'）
 */
export const formatDateStr = (dateStr: string, fmt = 'YYYY-MM-DD'): string => {
  if (!dateStr) return '--'
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/.exec(dateStr)
  if (!m) return dateStr
  const [, y, mo, d, h, mi] = m
  const map: Record<string, string> = {
    YYYY: y,
    YY: y.slice(2),
    MM: mo.padStart(2, '0'),
    M: String(+mo),
    DD: d.padStart(2, '0'),
    D: String(+d),
    HH: h !== undefined ? h.padStart(2, '0') : '00',
    mm: mi !== undefined ? mi.padStart(2, '0') : '00',
  }
  return fmt.replace(/YYYY|YY|MM|M|DD|D|HH|mm/g, (k) => map[k])
}

/**
 * 按模板格式化"秒级时间戳"（lightweight-charts time 口径）：
 * 后端返回的 time 已按行情口径转换好，这里直接按本地时区显示，不做 UTC+8 修正。
 * 用于库时间轴 / 十字星时间标签（localization.timeFormatter）。
 * 占位符与 formatDateStr 完全一致：YYYY/YY/MM/M/DD/D/HH/mm。
 * 例：formatTimeByFmt(1728000000, 'YYYY/MM/DD') -> '2024/10/04'
 *     formatTimeByFmt(1728000000, 'MM-DD HH:mm') -> '10-04 09:30'
 * @param ts  秒级时间戳
 * @param fmt 输出模板（缺省 'YYYY-MM-DD HH:mm'）
 */
export const formatTimeByFmt = (ts: number, fmt = 'YYYY-MM-DD HH:mm'): string => {
  // 直接按本地时区读取（time 已由后端转好，前端不做任何时区偏移）
  const d = new Date(ts * 1000)
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    YY: String(d.getFullYear()).slice(2),
    MM: String(d.getMonth() + 1).padStart(2, '0'),
    M: String(d.getMonth() + 1),
    DD: String(d.getDate()).padStart(2, '0'),
    D: String(d.getDate()),
    HH: String(d.getHours()).padStart(2, '0'),
    mm: String(d.getMinutes()).padStart(2, '0'),
    ss: String(d.getSeconds()).padStart(2, '0'),
  }
  return fmt.replace(/YYYY|YY|MM|M|DD|D|HH|mm|ss/g, (k) => map[k])
}

/**
 * 刻度排版公共函数：在纵向区间 [top, bottom] 内均分 N 条刻度线（含首尾防裁切）。
 *
 * 应用场景（用户 2026-10 需求：刻度排版统一抽离，Pane0 / Pane1 / Pane2 共用）：
 *  - Pane0（K 线与分时）：count = 9，自上而下排满 Pane0；
 *  - Pane1（成交量）/ Pane2（附图）：count = 3，均分位置（1/8、1/2、7/8）。
 *
 * 首尾防裁切说明：刻度文字以 textBaseline='middle' 绘制（字体半高约 6px），
 * 若刻度线紧贴区间上/下边界，首尾两条文字会被裁掉一半（用户反馈"第一个刻度和
 * 最后一个刻度看不见"）。因此区间两端各内缩 inset 像素，保证首尾刻度文字完整可见；
 * 区间过小（usable <= 0）时退化为首尾各留 inset/2 的均分，仍保证函数健壮可用。
 *
 * @param count  刻度条数（>1；count=1 时返回区间中点）
 * @param top    区间顶部坐标（px，相对调用方坐标系的 y，如 pane 内坐标 / chart 坐标）
 * @param bottom 区间底部坐标（px）
 * @param inset  首尾内缩量（px）：建议取 7（12px 字体半高 6px + 1px 间距）
 * @returns 升序排列的 N 个刻度 y 坐标
 */
export const layoutTickPositions = (
  count: number,
  top: number,
  bottom: number,
  inset: number,
): number[] => {
  if (bottom <= top || count < 1) return []
  if (count === 1) return [(top + bottom) / 2]
  const usable = bottom - top - 2 * inset
  if (usable <= 0) {
    // 区间过小（如 Pane 高度 < 2*inset）：退化为不加内缩的纯均分
    return Array.from({ length: count }, (_, i) => top + ((bottom - top) * i) / (count - 1))
  }
  return Array.from({ length: count }, (_, i) => top + inset + (usable * i) / (count - 1))
}
