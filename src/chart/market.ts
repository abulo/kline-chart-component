// market.ts —— 分时市场口径（v1.7.20）。
// 不同市场每个交易日返回的分时点数不同：A 股 241 / 港股 331 / 美股 391 /
// 日股 331 / 韩股 391。分时渲染按"每交易日固定槽位"对齐（每天等宽、
// 竖线落在交易日分界），故把映射集中在此，组件通过 market 参数声明市场。

/** 分时市场标识（组件 market 参数取值）。 */
export type MarketProfile = 'cn' | 'hk' | 'us' | 'jp' | 'kr'

/** 市场口径配置：显示名 + 每个交易日分时点数。 */
export interface MarketProfileConfig {
  /** 市场显示名（文档 / 调试用）。 */
  label: string
  /** 每个交易日分时点数（含开盘首个点）。 */
  dayPoints: number
}

/**
 * 市场 → 每天分时点数映射。
 *
 * @remarks
 * 口径来源（用户定版）：A 股 241、港股 331、美股 391、日股 331、韩股 391。
 * 分时渲染以该值为每个交易日的固定槽位数：数据不足一日时补占位点，
 * 使多日分时每天等宽、竖线栅格落在交易日分界。
 */
export const MARKET_PROFILES: Readonly<Record<MarketProfile, MarketProfileConfig>> = {
  cn: { label: 'A 股', dayPoints: 241 },
  hk: { label: '港股', dayPoints: 331 },
  us: { label: '美股', dayPoints: 391 },
  jp: { label: '日股', dayPoints: 331 },
  kr: { label: '韩股', dayPoints: 391 },
}

/** 默认市场（A 股口径，与既有 241 点行为一致）。 */
export const DEFAULT_MARKET: MarketProfile = 'cn'

/**
 * 按市场取每天分时点数。
 *
 * @param market 市场标识；未知值（含 undefined）回退默认 A 股口径。
 * @returns 每个交易日分时点数（默认 241）。
 */
export const getMarketDayPoints = (market?: string): number =>
  MARKET_PROFILES[market as MarketProfile]?.dayPoints ??
  MARKET_PROFILES[DEFAULT_MARKET].dayPoints
