// constants.ts —— 图表核心常量（自 KLineChartController.ts 拆分）。
// 集中管理控制器 / 管理器共享的固定数值，避免散落各文件。

/**
 * 库系统默认时间轴高度（px）。
 *
 * @remarks
 * 非用户参数：lightweight-charts v5.2.1 时间轴为库内部固定渲染（无公开配置），
 * 高度 = borderSize(1) + tickLength(5) + fontSize(12) + paddingTop(3) +
 * paddingBottom(3) + labelBottomOffset(4) = 28（fontSize=12 时，偶数化后不变）。
 * 布局换算必须扣除该高度，否则固定 Pane 的实际像素高度与目标不符。
 */
export const LIBRARY_TIME_AXIS_HEIGHT = 28

/** 左移 / 右移每次平移的 K 线条数（左右对称）。 */
export const VIEW_SHIFT_STEP = 60

/** K 线状态初始可视 K 线条数（加载后视口仅展示最近 120 根，右边缘对齐；
 *  分时周期为整日全量展示，不使用本常量）。 */
export const VISIBLE_BAR_COUNT = 120

/** 周期 / 标的快速切换的数据请求防抖时间（ms）：连续切换只发最后一次请求，
 *  避免并发 fetchHistory 数据争抢；loadSeq 丢弃过期响应为兜底，防抖从源头减少请求。 */
export const SWITCH_DEBOUNCE_MS = 200

/** 实时推送更新节流窗口（ms）：WS / SSE / 轮询高频回调合并为窗口内一次批量
 *  重建指标缓存，trailing 保留末次点不丢数据；60ms ≈ 1 渲染帧。 */
export const REALTIME_FLUSH_MS = 60

/** 分时每交易日默认点数（A 股口径 241；组件未传 / 传非法值时使用）。 */
export const DEFAULT_TIMESHARE_DAY_POINTS = 241

/**
 * 归一化分时每交易日点数。
 *
 * @remarks
 * 只接受正数（向下取整）；0 / 负数 / NaN / Infinity / 空串一律回退默认 241。
 * 避免非法入参导致渲染行无限补齐或除零。市场差异（A 股 241 / 港股 331 /
 * 美股 391 …）由调用方直接传数字，不再维护市场映射表。
 *
 * 接受数字与数字字符串：模板里写成静态属性（day-points="240"）时拿到的是
 * 字符串，若不转换会静默回退默认值，调用方会误以为「传了却不生效」。
 *
 * @param value 用户传入的每交易日分时点数（数字或数字字符串）。
 * @returns 有效点数（≥ 1，默认 241）。
 */
export const normalizeDayPoints = (value?: number | string): number => {
  const num = typeof value === 'string' ? Number(value.trim()) : value
  return typeof num === 'number' && Number.isFinite(num) && num > 0
    ? Math.max(1, Math.floor(num))
    : DEFAULT_TIMESHARE_DAY_POINTS
}

/** 左右刻度区最小宽度（打开时固定宽度，左右一致；单位 px）。 */
export const PRICE_SCALE_MIN_WIDTH = 72
