/**
 * mock.ts —— 内置演示数据（v1.4.75，纯函数可单测）
 *
 * 职责：
 *  - genMockBars：生成 n 根日 K（工作日序列 + 随机游走），仅测试 / 数据服务复用；
 *    KLineChartController 不再直接调用（数据统一走 ChartDataService 层，v1.6.16），
 *    直接返回统一数据点类型 ChartDataPoint（types/chart.ts，不再使用内部 BasicBar）：
 *      pointType = 'kline'（K 线类型守卫）；
 *      tradeDate = YYYY-MM-DD（随 time 同步生成，供 pane0 信息行 / 指标库使用）；
 *      preClose（昨收）+ volume（成交量）供 K 线与成交量 Pane 渲染。
 */
import type { ChartDataPoint } from '../../types/chart'

/** 本地日期格式化：秒级时间戳 → 'YYYY-MM-DD'（UTC，与 lightweight-charts 时间一致） */
const formatDateUtc = (timeSeconds: number): string => {
  const date = new Date(timeSeconds * 1000)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 生成 n 根日 K mock（工作日序列 + 随机游走）。
 * 注意：日期游标每次 +1 天、遇周末继续 +1，保证 time 严格递增不重复
 * （按 i×86400000 独立推算再跳周末会在跨周处产生重复日期，库断言报错）。
 */
export const genMockBars = (barCount: number): ChartDataPoint[] => {
  const bars: ChartDataPoint[] = []
  const dateCursor = new Date(2026, 0, 5) // 2026-01-05（周一）
  let price = 10
  for (let index = 0; index < barCount; index++) {
    while (dateCursor.getDay() === 0 || dateCursor.getDay() === 6) dateCursor.setDate(dateCursor.getDate() + 1)
    const open = price
    const close = Math.max(1, open + (Math.random() - 0.48) * 0.4)
    const high = Math.max(open, close) * (1 + Math.random() * 0.012)
    const low = Math.min(open, close) * (1 - Math.random() * 0.012)
    price = close
    const time = Math.floor(dateCursor.getTime() / 1000)
    bars.push({
      time,
      tradeDate: formatDateUtc(time),
      preClose: index === 0 ? open : bars[index - 1].close!, // 前一根 close 必含（pointType='kline'）
      pointType: 'kline',
      open,
      high,
      low,
      close,
      // 成交量：基数 8000 上下波动（最高可达 2 万级，显示层次丰富）
      volume: Math.round(8000 + Math.random() * 12000),
    })
    dateCursor.setDate(dateCursor.getDate() + 1)
  }
  return bars
}
