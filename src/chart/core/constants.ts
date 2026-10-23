/**
 * constants.ts —— 图表核心常量（v1.4.73 拆分自 KLineChartController.ts）
 *
 * 集中管理控制器 / 管理器共享的固定数值，避免散落各文件。
 */

/**
 * 库系统默认时间轴高度（px）。
 * 非用户参数：lightweight-charts v5.2.1 时间轴为库内部固定渲染（无公开配置），
 * 高度 = borderSize(1) + tickLength(5) + fontSize(12) + paddingTop(3) +
 * paddingBottom(3) + labelBottomOffset(4) = 28（fontSize=12 时，偶数化后不变）。
 * 布局换算必须扣除该高度，否则固定 Pane 的实际像素高度与目标不符。
 */
export const LIBRARY_TIME_AXIS_HEIGHT = 28

/** 左移 / 右移每次平移的 K 线条数（v1.7.1，固定 30 条） */
export const VIEW_SHIFT_STEP = 30

/** K 线状态初始可视 K 线条数（v1.7.1：加载后视口仅展示最近 120 根，右边缘对齐；
 *  分时周期为整日全量展示，不使用本常量） */
export const VISIBLE_BAR_COUNT = 120

/** 周期 / 标的快速切换的数据请求防抖时间（ms，v1.7.1：连续切换只发最后一次请求，
 *  避免并发 fetchHistory 数据争抢；loadSeq 丢弃过期响应为兜底，防抖从源头减少请求） */
export const SWITCH_DEBOUNCE_MS = 200

/** 实时推送更新节流窗口（ms，v1.7.1：WS / SSE / 轮询高频回调合并为窗口内一次批量
 *  重建指标缓存，trailing 保留末次点不丢数据；60ms ≈ 1 渲染帧） */
export const REALTIME_FLUSH_MS = 60

/** 左右刻度区最小宽度（打开时固定宽度，左右一致；单位 px） */
export const PRICE_SCALE_MIN_WIDTH = 72
