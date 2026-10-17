/**
 * crosshairTooltip.test.ts —— 十字星数据浮层测试（v1.6.35）
 *
 * 覆盖：九行组装（时间/开盘/收盘/最高/最低/涨跌/涨幅/成交量/成交额）、
 * 红涨绿跌着色、涨跌基准（昨收）、缺失昨收兜底、量额格式化。
 */
import { describe, expect, it } from 'vitest'
import { buildTooltipRows, resolveTooltipPosition } from '../src/chart/crosshair/crosshairTooltip'
import type { ChartDataPoint } from '../src/types/chart'

const colors = { up: '#FF0000', down: '#008000' }

const makeBar = (partial: Partial<ChartDataPoint>): ChartDataPoint => ({
  time: 1728000000,
  tradeDate: '2024-10-04',
  preClose: 10,
  open: 10.2,
  high: 10.5,
  low: 10.1,
  close: 10.4,
  volume: 12345678,
  amount: 128000000,
  pointType: 'kline',
  ...partial,
})

describe('buildTooltipRows', () => {
  it('九行齐全且顺序正确', () => {
    const rows = buildTooltipRows(makeBar({}), '2024-10-04', colors)
    // v1.6.44：第一行时间直显，label 为空（不显示"时间"汉字）
    expect(rows.map((r) => r.label)).toEqual([
      '', '开盘', '收盘', '最高', '最低', '涨跌', '涨幅', '成交量', '成交额',
    ])
  })

  it('时间文本按 pane0 格式原样透传', () => {
    const rows = buildTooltipRows(makeBar({}), '2024-10-04 10:30', colors)
    expect(rows[0].value).toBe('2024-10-04 10:30')
  })

  it('涨红：close > preClose 时涨跌/涨幅为正并着上涨色', () => {
    const rows = buildTooltipRows(makeBar({ preClose: 10, close: 10.4 }), 't', colors)
    expect(rows[5].value).toBe('+0.40')
    expect(rows[5].color).toBe('#FF0000')
    expect(rows[6].value).toBe('+4.00%')
    expect(rows[6].color).toBe('#FF0000')
  })

  it('跌绿：close < preClose 时涨跌/涨幅为负并着下跌色', () => {
    const rows = buildTooltipRows(makeBar({ preClose: 10, close: 9.6 }), 't', colors)
    expect(rows[5].value).toBe('-0.40')
    expect(rows[5].color).toBe('#008000')
    expect(rows[6].value).toBe('-4.00%')
    expect(rows[6].color).toBe('#008000')
  })

  it('平盘：close == preClose 时不带符号不着色', () => {
    const rows = buildTooltipRows(makeBar({ preClose: 10, close: 10 }), 't', colors)
    expect(rows[5].value).toBe('0.00')
    expect(rows[5].color).toBeUndefined()
    expect(rows[6].value).toBe('0.00%')
  })

  it('开盘/收盘/最高/最低：高于昨收着上涨色（红）', () => {
    const rows = buildTooltipRows(makeBar({}), 't', colors) // preClose 10：open 10.2 / close 10.4 / high 10.5 / low 10.1
    expect(rows[1].color).toBe('#FF0000')
    expect(rows[2].color).toBe('#FF0000')
    expect(rows[3].color).toBe('#FF0000')
    expect(rows[4].color).toBe('#FF0000')
  })

  it('开盘/收盘/最高/最低：低于昨收着下跌色（绿）', () => {
    const rows = buildTooltipRows(makeBar({ open: 9.8, high: 9.9, low: 9.5, close: 9.6 }), 't', colors)
    expect(rows[1].color).toBe('#008000')
    expect(rows[2].color).toBe('#008000')
    expect(rows[3].color).toBe('#008000')
    expect(rows[4].color).toBe('#008000')
  })

  it('开盘/收盘/最高/最低：等于昨收不着色', () => {
    const rows = buildTooltipRows(makeBar({ open: 10, high: 10, low: 10, close: 10 }), 't', colors)
    expect(rows[1].color).toBeUndefined()
    expect(rows[2].color).toBeUndefined()
    expect(rows[3].color).toBeUndefined()
    expect(rows[4].color).toBeUndefined()
  })

  it('缺失昨收时以开盘点兜底（不抛错）', () => {
    const rows = buildTooltipRows(makeBar({ preClose: undefined, open: 10, close: 10.5 }), 't', colors)
    expect(rows[5].value).toBe('+0.50')
    expect(rows[6].value).toBe('+5.00%')
  })

  it('量额格式化：万 / 亿', () => {
    const rows = buildTooltipRows(
      makeBar({ volume: 12345678, amount: 128000000 }),
      't', colors,
    )
    expect(rows[7].value).toBe('1234.57万')
    expect(rows[8].value).toBe('1.28亿')
  })

  it('OHLC 缺失安全（undefined → --）', () => {
    const rows = buildTooltipRows(
      makeBar({ open: undefined, high: undefined, low: undefined }),
      't', colors,
    )
    expect(rows[1].value).toBe('--')
    expect(rows[3].value).toBe('--')
    expect(rows[4].value).toBe('--')
  })
})

describe('resolveTooltipPosition（v1.6.36 进入方向角落定位）', () => {
  const base = {
    paneTop: 22,
    tooltipWidth: 180,
    tooltipHeight: 185,
    containerWidth: 1000,
    containerHeight: 600,
  }

  it('左进入 → pane 右上角（右缘 2px、pane 顶部 2px，v1.6.43）', () => {
    const pos = resolveTooltipPosition({ ...base, entrySide: 'left' })
    expect(pos).toEqual({ left: 1000 - 180 - 2, top: 24 })
  })

  it('右进入 → pane 左上角（距左缘 2px、pane 顶部 2px，v1.6.43）', () => {
    const pos = resolveTooltipPosition({ ...base, entrySide: 'right' })
    expect(pos).toEqual({ left: 2, top: 24 })
  })

  it('左进入（右上角）但浮层过宽 → clamp 到容器左缘 2px（不越界）', () => {
    const pos = resolveTooltipPosition({
      ...base,
      entrySide: 'left',
      tooltipWidth: 1200,
      containerWidth: 1000,
    })
    expect(pos.left).toBe(2)
  })
})
