/**
 * Periods.ts —— K 线周期配置（v1.4.94）
 *
 * 职责：
 *  - 周期清单 Periods（分时 1~5 日 + 日/周/月 K + 60/30/15/5/1 分钟 K），
 *    供周期切换 UI / 数据请求使用：value 为后端周期标识，label 为展示文案；
 *  - 派生联合类型 PeriodValue / PeriodLabel（as const 精确字面量）；
 *  - periodMap：value → 配置的 O(1) 查询 Map（一次性构建，无运行时线性查找）；
 *  - getPeriodLabel：按 value 取展示文案（未命中返回原值，容错后端未知周期）。
 */
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

/** 周期值联合类型（'1d' | '2d' | … | '1min'，供周期状态变量使用） */
export type PeriodValue = (typeof Periods)[number]['value']

/** 周期展示文案联合类型（'1日分时' | …，供按钮渲染使用） */
export type PeriodLabel = (typeof Periods)[number]['label']

/** 周期配置项类型（{ label, value } 字面量） */
export type PeriodItem = (typeof Periods)[number]

/**
 * value → 配置项 O(1) 查询表（模块加载时一次性构建，之后只读；
 * 避免切换周期时对 Periods 做线性 find）。
 */
export const periodMap: ReadonlyMap<PeriodValue, PeriodItem> = new Map(
  Periods.map((period) => [period.value, period]),
)

/**
 * 按 value 取周期展示文案。
 * 未命中（后端返回未知周期）时返回原值，保证 UI 不显示空文案。
 */
export const getPeriodLabel = (value: string): string =>
  periodMap.get(value as PeriodValue)?.label ?? value
