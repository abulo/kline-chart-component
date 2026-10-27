// periods.ts —— K 线周期配置（分时 1~5 日 + 日 / 周 / 月 K + 60/30/15/5/1 分钟 K）。
// 提供周期清单、派生联合类型、O(1) 查询表与分时栅格化份数配置，
// 供周期切换 UI / 数据请求与分时渲染共用。

// 周期清单：value 为后端周期标识，label 为展示文案；数组顺序即周期切换 UI 的展示顺序。
export const Periods = [
  { label: '1日分时', value: '1d' },
  { label: '2日分时', value: '2d' },
  { label: '3日分时', value: '3d' },
  { label: '4日分时', value: '4d' },
  { label: '5日分时', value: '5d' },
  { label: '日K', value: 'day' },
  { label: '周K', value: 'week' },
  { label: '月K', value: 'month' },
  { label: '60分K', value: '60min' },
  { label: '30分K', value: '30min' },
  { label: '15分K', value: '15min' },
  { label: '5分K', value: '5min' },
  { label: '1分K', value: '1min' },
] as const

/** 周期值联合类型（'1d' | '2d' | … | '1min'），供周期状态变量使用。 */
export type PeriodValue = (typeof Periods)[number]['value']

/**
 * 周期值或空值。
 *
 * @remarks
 * '' = 周期未设置（父组件异步加载 / 暂未传入）：组件与控制器对空周期不发起数据请求，
 * 等周期就位后重新 init。用于 props.period / KLineChartOptions.period / 控制器周期字段。
 */
export type PeriodValueOrEmpty = PeriodValue | ''

/** 周期展示文案联合类型（'1日分时' | …），供按钮渲染使用。 */
export type PeriodLabel = (typeof Periods)[number]['label']

/** 周期配置项类型（{ label, value } 字面量）。 */
export type PeriodItem = (typeof Periods)[number]

/**
 * value → 配置项的 O(1) 查询表。
 *
 * @remarks
 * 模块加载时一次性构建，之后只读；避免切换周期时对 Periods 做线性 find。
 */
export const periodMap: ReadonlyMap<PeriodValue, PeriodItem> = new Map(
  Periods.map((period) => [period.value, period]),
)

/**
 * 按 value 取周期展示文案。
 *
 * @param value 周期标识。
 * @returns 展示文案；未知周期返回原值，保证 UI 不显示空文案。
 */
export const getPeriodLabel = (value: string): string =>
  periodMap.get(value as PeriodValue)?.label ?? value

// ============ 分时栅格化（v1.7.0） ============

/**
 * 分时周期 → 栅格化竖线等分数。
 *
 * @remarks
 * 用户指定口径：1d → 4 等分（延续 K 线竖等分 4 份风格）；2d / 3d / 4d / 5d 多日分时
 * 分别 → 2 / 3 / 4 / 5 等分。供分时渲染 GridPrimitive.verticalCount 注入
 * （K 线默认 4，见 grid/gridPrimitive.ts）。
 */
export const timeshareGridVerticalCount: Readonly<
  Partial<Record<'1d' | '2d' | '3d' | '4d' | '5d', number>>
> = {
  '1d': 4,
  '2d': 2,
  '3d': 3,
  '4d': 4,
  '5d': 5,
}

/** 分时周期值集合（'1d' ~ '5d'），供 isTimesharePeriod 等判定复用。 */
export const TIMESHARE_PERIODS: ReadonlySet<string> = new Set(['1d', '2d', '3d', '4d', '5d'])

/**
 * 判断周期是否为分时（1 日 ~ 5 日分时）。
 *
 * @remarks
 * 分时与 K 线在渲染 / 交互上的差异（v1.7.0）：pane1 用 LineSeries 双线（价格 / 均价），
 * 无 K 线主图指标；pane3 成交量用直方图（Histogram）；附图指标无 CR；竖线栅格份数按
 * timeshareGridVerticalCount；App 平移 / 缩放按钮隐藏。
 *
 * @param period 周期标识。
 * @returns true = 分时周期（'1d' ~ '5d'）。
 */
export const isTimesharePeriod = (period: string): boolean =>
  TIMESHARE_PERIODS.has(period)

/**
 * 取分时周期竖向栅格等分数。
 *
 * @remarks
 * 统一收口 timeshareGridVerticalCount 的索引：period 为 PeriodValue 全联合时，
 * 直接索引 Partial<Record<timeshare>> 会触发 TS7053，故先断言为表键类型再索引。
 *
 * @param period 周期标识。
 * @returns 栅格竖线等分数：分时按表（1d=4 / 2d=2 / 3d=3 / 4d=4 / 5d=5），非分时回退 4。
 */
export const timeshareVerticalCount = (period: string): number =>
  timeshareGridVerticalCount[period as keyof typeof timeshareGridVerticalCount] ?? 4
