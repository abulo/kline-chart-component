/**
 * mock.ts —— 内置演示数据（v1.2.1，纯函数可单测）
 *
 * 职责：
 *  - genMockBars：生成 n 根日 K（工作日序列 + 随机游走），带 preClose（昨收）供涨跌幅计算。
 *    （v1.2.1 清理：删除 volume 字段与生成逻辑 —— 单 Pane 不渲染成交量；
 *    统一数据模型中的 volume 保留在 types/chart.ts，后续成交量 Pane 恢复时再映射）
 */

/** K 线数据点（内部结构；后续接入后端可映射自 types/chart.ts 的 ChartDataPoint） */
export interface BasicBar {
  /** 秒级时间戳（UTC，lightweight-charts 标准） */
  time: number
  /** 开盘价 */
  open: number
  /** 最高价 */
  high: number
  /** 最低价 */
  low: number
  /** 收盘价 */
  close: number
  /** 昨收价（涨跌幅基准；首根 = open） */
  preClose: number
}

/**
 * 生成 n 根日 K mock（工作日序列 + 随机游走）。
 * 注意：日期游标每次 +1 天、遇周末继续 +1，保证 time 严格递增不重复
 * （按 i×86400000 独立推算再跳周末会在跨周处产生重复日期，库断言报错）。
 */
export const genMockBars = (barCount: number): BasicBar[] => {
  const bars: BasicBar[] = []
  const dateCursor = new Date(2026, 0, 5) // 2026-01-05（周一）
  let price = 10
  for (let index = 0; index < barCount; index++) {
    while (dateCursor.getDay() === 0 || dateCursor.getDay() === 6) dateCursor.setDate(dateCursor.getDate() + 1)
    const open = price
    const close = Math.max(1, open + (Math.random() - 0.48) * 0.4)
    const high = Math.max(open, close) * (1 + Math.random() * 0.012)
    const low = Math.min(open, close) * (1 - Math.random() * 0.012)
    price = close
    bars.push({
      time: Math.floor(dateCursor.getTime() / 1000),
      open,
      high,
      low,
      close,
      preClose: index === 0 ? open : bars[index - 1].close,
    })
    dateCursor.setDate(dateCursor.getDate() + 1)
  }
  return bars
}
