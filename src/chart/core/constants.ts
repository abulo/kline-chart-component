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
/** 每页拉取条数（内置 Mock 数据量 / 历史分页 limit；原 KLineChartOptions.pageSize 固定为常量） */
export const DEFAULT_FETCH_LIMIT = 120

export const LIBRARY_TIME_AXIS_HEIGHT = 28

/** 左右刻度区最小宽度（打开时固定宽度，左右一致；单位 px） */
export const PRICE_SCALE_MIN_WIDTH = 72
