/**
 * util.test.ts —— 通用格式化工具单测（v1.4.41）
 * 覆盖 src/chart/util/format.ts：
 *  - formatVolume（pane3 左刻度标签专用）；
 *  - formatPrice（pane1 K 线刻度 / 十字星指示值）；
 *  - formatAxisSmart（pane5 指标刻度大数缩写 / 小数自适应）；
 *  - formatDate（pane0 顶部信息行最新 bar 时间，YYYY-MM-DD）。
 */
import { describe, it, expect } from 'vitest'
import { normalizeChartTime, formatTimeByFmt, formatVolume, formatPrice, formatAxisSmart, formatDate, formatClock, formatDateTime, formatAxisTime } from '../src/chart/util/format'

describe('formatVolume 成交量格式化（util/format.ts）', () => {
  it('亿级：两位小数 + 亿', () => {
    expect(formatVolume(1.5e8)).toBe('1.50亿')
    expect(formatVolume(3.26e8)).toBe('3.26亿')
  })

  it('万级：两位小数 + 万', () => {
    expect(formatVolume(1e4)).toBe('1.00万')
    expect(formatVolume(123456)).toBe('12.35万')
  })

  it('万以下：取整原样', () => {
    expect(formatVolume(0)).toBe('0')
    expect(formatVolume(999)).toBe('999')
    expect(formatVolume(1234)).toBe('1234')
  })

  it('边界与空值：9999 / 10000 临界；null / NaN 返回 --', () => {
    expect(formatVolume(9999)).toBe('9999')
    expect(formatVolume(10000)).toBe('1.00万')
    expect(formatVolume(null)).toBe('--')
    expect(formatVolume(Number.NaN)).toBe('--')
  })
})

describe('formatPrice 价格格式化（pane1 刻度 / 十字星指示值）', () => {
  it('两位小数默认位', () => {
    expect(formatPrice(10.123)).toBe('10.12')
    expect(formatPrice(9.5)).toBe('9.50')
    expect(formatPrice(0)).toBe('0.00')
  })

  it('自定义小数位', () => {
    expect(formatPrice(1.2346, 3)).toBe('1.235')
    expect(formatPrice(1.2, 0)).toBe('1')
  })

  it('空值 / NaN 返回 --', () => {
    expect(formatPrice(null)).toBe('--')
    expect(formatPrice(undefined)).toBe('--')
    expect(formatPrice(Number.NaN)).toBe('--')
  })
})

describe('formatAxisSmart 指标刻度缩写（pane5 指标刻度）', () => {
  it('亿级：1.23亿', () => {
    expect(formatAxisSmart(123456789)).toBe('1.23亿')
  })

  it('负值带负号：-5亿', () => {
    expect(formatAxisSmart(-500000000)).toBe('-5.00亿')
  })

  it('万级：1.23万', () => {
    expect(formatAxisSmart(12345)).toBe('1.23万')
  })

  it('普通值：两位小数', () => {
    expect(formatAxisSmart(1000)).toBe('1000.00')
    expect(formatAxisSmart(1)).toBe('1.00')
    expect(formatAxisSmart(0)).toBe('0.00')
  })

  it('极小值：自适应小数位（避免全部显示 0.00）', () => {
    // 0.123 → -log10 ≈ 0.9 → ceil(0.9)+1 = 2 → 两位
    expect(formatAxisSmart(0.123)).toBe('0.12')
    // 0.0123 → -log10 ≈ 1.9 → ceil(1.9)+1 = 3 → 三位
    expect(formatAxisSmart(0.0123)).toBe('0.012')
    // 0.00123 → -log10 ≈ 2.9 → ceil(2.9)+1 = 4 → 四位
    expect(formatAxisSmart(0.00123)).toBe('0.0012')
  })

  it('负极小值：保留负号', () => {
    expect(formatAxisSmart(-0.0123)).toBe('-0.012')
  })
})

describe('formatDate 日期格式化（pane0 顶部信息行时间）', () => {
  it('秒级时间戳 → YYYY-MM-DD（本地时区）', () => {
    // 2026-10-14 00:00:00 UTC+8 = 1789315200 秒（本地时区日界）
    expect(formatDate(1789315200)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // 具体日期断言：用 Date 构造本地时间，避免测试环境时区差异
    const local = new Date(2026, 9, 14) // 2026-10-14（本地时区）
    const seconds = Math.floor(local.getTime() / 1000)
    expect(formatDate(seconds)).toBe('2026-10-14')
  })

  it('月 / 日补零', () => {
    const local = new Date(2026, 0, 5) // 2026-01-05
    expect(formatDate(Math.floor(local.getTime() / 1000))).toBe('2026-01-05')
  })

  it('非法输入返回 --', () => {
    expect(formatDate(undefined)).toBe('--')
    expect(formatDate(null)).toBe('--')
    expect(formatDate(NaN)).toBe('--')
  })
})


describe('formatAxisTime 按周期格式化时间（pane0 信息行 / 十字星时间轴指示值，v1.5.10）', () => {
  const t0 = Math.floor(new Date(2026, 9, 14, 9, 35, 0).getTime() / 1000)

  it('日 K / 周 K / 月 K → YYYY-MM-DD', () => {
    expect(formatAxisTime(t0, 'day')).toBe('2026-10-14')
    expect(formatAxisTime(t0, 'week')).toBe('2026-10-14')
    expect(formatAxisTime(t0, 'month')).toBe('2026-10-14')
  })

  it('分时（1d~5d）→ YYYY-MM-DD HH:mm（v1.7.0 调整：跨多交易日需区分日期）', () => {
    expect(formatAxisTime(t0, '1d')).toBe('2026-10-14 09:35')
    expect(formatAxisTime(t0, '5d')).toBe('2026-10-14 09:35')
  })

  it('分钟 K（60/30/15/5/1 分）→ YYYY-MM-DD HH:mm', () => {
    expect(formatAxisTime(t0, '60min')).toBe('2026-10-14 09:35')
    expect(formatAxisTime(t0, '30min')).toBe('2026-10-14 09:35')
    expect(formatAxisTime(t0, '15min')).toBe('2026-10-14 09:35')
    expect(formatAxisTime(t0, '5min')).toBe('2026-10-14 09:35')
    expect(formatAxisTime(t0, '1min')).toBe('2026-10-14 09:35')
  })

  it('未知周期默认按日 K（YYYY-MM-DD）容错', () => {
    expect(formatAxisTime(t0, 'unknown')).toBe('2026-10-14')
    expect(formatAxisTime(t0)).toBe('2026-10-14')
  })

  it('非法输入返回 --', () => {
    expect(formatAxisTime(undefined, 'day')).toBe('--')
    expect(formatAxisTime(null, '1min')).toBe('--')
    expect(formatAxisTime(NaN, '60min')).toBe('--')
  })


  it('formatTimeByFmt：YYYY-MM-DD', () => {
    // 2026-10-14 09:35（Asia/Shanghai）秒级时间戳
    const ts = Math.floor(new Date(2026, 9, 14, 9, 35).getTime() / 1000)
    expect(formatTimeByFmt(ts, 'YYYY-MM-DD')).toBe('2026-10-14')
  })

  it('formatTimeByFmt：YYYY-MM-DD HH:mm', () => {
    const ts = Math.floor(new Date(2026, 9, 14, 9, 35).getTime() / 1000)
    expect(formatTimeByFmt(ts, 'YYYY-MM-DD HH:mm')).toBe('2026-10-14 09:35')
  })

  it('formatTimeByFmt：MM-DD HH:mm 与默认模板', () => {
    const ts = Math.floor(new Date(2026, 9, 14, 9, 35).getTime() / 1000)
    expect(formatTimeByFmt(ts, 'MM-DD HH:mm')).toBe('10-14 09:35')
    expect(formatTimeByFmt(ts)).toBe('2026-10-14 09:35')
  })


  it('normalizeChartTime：number 原样返回', () => {
    expect(normalizeChartTime(1728000000)).toBe(1728000000)
    expect(normalizeChartTime(0)).toBe(0)
  })

  it('normalizeChartTime：BusinessDay 对象 → UTC 秒', () => {
    expect(normalizeChartTime({ year: 2024, month: 10, day: 4 })).toBe(
      Math.floor(Date.UTC(2024, 9, 4) / 1000),
    )
  })

  it('normalizeChartTime：Date / ISO 字符串 / 非法值', () => {
    expect(normalizeChartTime(new Date(Date.UTC(2024, 9, 4)))).toBe(
      Math.floor(Date.UTC(2024, 9, 4) / 1000),
    )
    expect(normalizeChartTime('2024-10-04T00:00:00Z')).toBe(
      Math.floor(Date.UTC(2024, 9, 4) / 1000),
    )
    expect(normalizeChartTime(null)).toBeNull()
    expect(normalizeChartTime(undefined)).toBeNull()
    expect(normalizeChartTime(NaN)).toBeNull()
  })
})