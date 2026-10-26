// @vitest-environment jsdom
/**
 * crosshairTooltip.test.ts —— 十字星数据浮层测试（v1.6.35）
 *
 * 覆盖：九行组装（时间/开盘/收盘/最高/最低/涨跌/涨幅/成交量/成交额）、
 * 红涨绿跌着色、涨跌基准（昨收）、缺失昨收兜底、量额格式化。
 */
import { describe, expect, it } from 'vitest'
import { buildTooltipRows, resolveTooltipPosition, clampTooltipPosition, CrosshairTooltip } from '../src/chart/crosshair/crosshairTooltip'
import type { ChartDataPoint } from '../src/types/chart'

const colors = { up: '#FF0000', down: '#008000', avg: '#F4AA0A' }

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

  it('成交量组关闭：K 线 tooltip 隐藏 成交量 / 成交额（9 行 → 7 行，v1.7.3）', () => {
    const rows = buildTooltipRows(makeBar({}), '2024-10-04', colors, false)
    expect(rows).toHaveLength(7)
    expect(rows.map((r) => r.label)).toEqual(['', '开盘', '收盘', '最高', '最低', '涨跌', '涨幅'])
  })
})

describe('buildTooltipRows 分时点（v1.7.0）', () => {
  const makeTs = (partial: Partial<ChartDataPoint>): ChartDataPoint => ({
    time: 1728000000,
    tradeDate: '2024-10-04',
    preClose: 10,
    price: 10.4,
    avgPrice: 10.3,
    volume: 12345678,
    amount: 128000000,
    pointType: 'timeshare',
    ...partial,
  })

  it('七行齐全：时间 / 价格 / 均价 / 涨跌 / 涨幅 / 成交量 / 成交额', () => {
    const rows = buildTooltipRows(makeTs({}), '2024-10-04 09:35', colors)
    expect(rows.map((row) => row.label)).toEqual(['', '价格', '均价', '涨跌', '涨幅', '成交量', '成交额'])
    expect(rows[1].value).toBe('10.40')
    expect(rows[2].value).toBe('10.30')
    expect(rows[3].value).toBe('+0.40')
    expect(rows[4].value).toBe('+4.00%')
  })

  it('价格高于昨收红 / 低于昨收绿 / 平盘不着色', () => {
    expect(buildTooltipRows(makeTs({ price: 10.5 }), 't', colors)[1].color).toBe('#FF0000')
    expect(buildTooltipRows(makeTs({ price: 9.5 }), 't', colors)[1].color).toBe('#008000')
    expect(buildTooltipRows(makeTs({ price: 10 }), 't', colors)[1].color).toBeUndefined()
  })

  it('均价不着色；涨跌 / 涨幅随价格着色', () => {
    const rows = buildTooltipRows(makeTs({ price: 9.5 }), 't', colors)
    expect(rows[2].color).toBe('#F4AA0A') // 均价 = 均价线同色（timeshareAvgColor，v1.7.0）
    expect(rows[3].color).toBe('#008000')
    expect(rows[4].color).toBe('#008000')
  })

  it('成交量 / 成交额格式与 K 线一致（万 / 亿）', () => {
    const rows = buildTooltipRows(makeTs({}), 't', colors)
    expect(rows[5].value).toBe('1234.57万')
    expect(rows[6].value).toBe('1.28亿')
  })

  it('成交量组关闭：分时 tooltip 隐藏 成交量 / 成交额（7 行 → 5 行，v1.7.3）', () => {
    const rows = buildTooltipRows(makeTs({}), 't', colors, false)
    expect(rows).toHaveLength(5)
    expect(rows.map((r) => r.label)).toEqual(['', '价格', '均价', '涨跌', '涨幅'])
  })

  it('均价关闭：分时 tooltip 隐藏均价行（7 行 → 6 行，v1.7.4）', () => {
    const rows = buildTooltipRows(makeTs({}), 't', colors, true, false)
    expect(rows).toHaveLength(6)
    expect(rows.map((r) => r.label)).toEqual(['', '价格', '涨跌', '涨幅', '成交量', '成交额'])
  })

  it('均价 + 成交量双关：分时 tooltip 仅 4 行（v1.7.4）', () => {
    const rows = buildTooltipRows(makeTs({}), 't', colors, false, false)
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.label)).toEqual(['', '价格', '涨跌', '涨幅'])
  })
})

describe('resolveTooltipPosition（v1.6.36 进入方向角落定位 / v1.6.58 限定 pane1~pane5 数据区）', () => {
  // 刻度全关：数据区 = 容器全宽（paneLeft 0 ~ paneRight 1000）
  const base = {
    paneTop: 22,
    tooltipWidth: 180,
    paneLeft: 0,
    paneRight: 1000,
  }

  it('左进入 → pane 右上角（数据区右缘 2px、pane 顶部 2px，v1.6.43）', () => {
    const pos = resolveTooltipPosition({ ...base, entrySide: 'left' })
    expect(pos).toEqual({ left: 1000 - 180 - 2, top: 24 })
  })

  it('右进入 → pane 左上角（数据区左缘 2px、pane 顶部 2px，v1.6.43）', () => {
    const pos = resolveTooltipPosition({ ...base, entrySide: 'right' })
    expect(pos).toEqual({ left: 2, top: 24 })
  })

  it('左进入（右上角）但浮层过宽 → clamp 到数据区左缘 2px（不越界）', () => {
    const pos = resolveTooltipPosition({
      ...base,
      entrySide: 'left',
      tooltipWidth: 1200,
    })
    expect(pos.left).toBe(2)
  })

  it('左右刻度打开：左进入 → 右上角在数据区右缘（不越右刻度区，v1.6.58）', () => {
    const pos = resolveTooltipPosition({
      ...base,
      paneLeft: 72, // 左刻度区宽
      paneRight: 1000 - 72, // 右刻度区宽 72
      entrySide: 'left',
    })
    expect(pos).toEqual({ left: 1000 - 72 - 180 - 2, top: 24 })
  })

  it('左右刻度打开：右进入 → 左上角在数据区左缘（不越左刻度区，v1.6.58）', () => {
    const pos = resolveTooltipPosition({
      ...base,
      paneLeft: 72,
      paneRight: 1000 - 72,
      entrySide: 'right',
    })
    expect(pos).toEqual({ left: 72 + 2, top: 24 })
  })

  it('仅右刻度打开：左进入 → 右上角按数据区右缘定位（v1.6.58）', () => {
    const pos = resolveTooltipPosition({
      ...base,
      paneLeft: 0,
      paneRight: 1000 - 72,
      entrySide: 'left',
    })
    expect(pos).toEqual({ left: 1000 - 72 - 180 - 2, top: 24 })
  })
})

describe('clampTooltipPosition（v1.6.59；v1.7.7 容器坐标——浮层 absolute 挂容器内）', () => {
  // 数据区（容器坐标）left 72 / right 928、top 22 / bottom 600
  const base = {
    bounds: { left: 72, right: 928, top: 22, bottom: 600 },
    width: 180,
    height: 185,
  }
  // 容器坐标 minLeft = 72+2 = 74；maxLeft = 928-180-2 = 746
  // minTop = 22+2 = 24；maxTop = 600-185-2 = 413

  it('在数据区内 → 原样返回（不 clamp）', () => {
    expect(clampTooltipPosition({ ...base, left: 400, top: 300 })).toEqual({ left: 400, top: 300 })
  })

  it('越过左刻度区 → clamp 到数据区左缘（74）', () => {
    expect(clampTooltipPosition({ ...base, left: 30, top: 300 }).left).toBe(74)
  })

  it('越过右刻度区 → clamp 到数据区右缘（746）', () => {
    expect(clampTooltipPosition({ ...base, left: 900, top: 300 }).left).toBe(746)
  })

  it('越过 pane1 顶 → clamp 到 pane1 顶（24）', () => {
    expect(clampTooltipPosition({ ...base, left: 400, top: 10 }).top).toBe(24)
  })

  it('越过 pane5 底 → clamp 到 pane5 底（413）', () => {
    expect(clampTooltipPosition({ ...base, left: 400, top: 900 }).top).toBe(413)
  })

  it('数据区比浮层小（极端）→ 取最小边界不出界', () => {
    const tiny = { left: 0, right: 100, top: 0, bottom: 50 }
    const pos = clampTooltipPosition({
      bounds: tiny,
      width: 200,
      height: 185,
      left: 999,
      top: 999,
    })
    expect(pos.left).toBe(2) // max(minLeft=2, maxLeft=-202) → 2
    expect(pos.top).toBe(2)
  })
})

describe('CrosshairTooltip 挂载与定位（v1.7.7：absolute 挂容器内）', () => {
  it('角落定位使用容器坐标（absolute，不再叠加容器视口原点）', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const rect = { left: 100, top: 200, right: 1100, bottom: 900, width: 1000, height: 700 }
    container.getBoundingClientRect = () => rect as DOMRect

    const tooltip = new CrosshairTooltip(
      container,
      { upColor: '#FF0000', downColor: '#008000', timeshareAvgColor: '#F4AA0A' } as unknown as Parameters<typeof CrosshairTooltip.prototype.setTheme>[0],
    )
    try {
      // 挂载在容器内（absolute 子节点）
      expect(container.contains(tooltip['root'])).toBe(true)
      expect(tooltip['root'].style.position).toBe('absolute')
      tooltip.show({
        entrySide: 'right', // 右进入 → 左上角
        paneTop: 20,
        bounds: { left: 72, right: 928, top: 20, bottom: 600 },
        bar: makeBar({}),
        timeText: '2024-10-04',
      })
      const left = parseFloat(tooltip['root'].style.left)
      const top = parseFloat(tooltip['root'].style.top)
      // 容器坐标直用：paneLeft 72 + 2、paneTop 20 + 2（不再加容器原点 100/200）
      expect(left).toBe(74)
      expect(top).toBe(22)
    } finally {
      tooltip.destroy()
      document.body.removeChild(container)
    }
  })

  it('滚动无需手动平移（absolute 随容器天然锚定，无 scroll 补偿逻辑）', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const rect = { left: 100, top: 200, right: 1100, bottom: 900, width: 1000, height: 700 }
    container.getBoundingClientRect = () => rect as DOMRect

    const tooltip = new CrosshairTooltip(
      container,
      { upColor: '#FF0000', downColor: '#008000', timeshareAvgColor: '#F4AA0A' } as unknown as Parameters<typeof CrosshairTooltip.prototype.setTheme>[0],
    )
    try {
      tooltip.show({
        entrySide: 'right',
        paneTop: 20,
        bounds: { left: 72, right: 928, top: 20, bottom: 600 },
        bar: makeBar({}),
        timeText: '2024-10-04',
      })
      const leftBefore = parseFloat(tooltip['root'].style.left)
      const topBefore = parseFloat(tooltip['root'].style.top)
      // 模拟浏览器滚动：窗口 scroll / resize 事件（旧实现会手动平移浮层；absolute 无需）
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('resize'))
      const leftAfter = parseFloat(tooltip['root'].style.left)
      const topAfter = parseFloat(tooltip['root'].style.top)
      expect(leftAfter).toBe(leftBefore) // 位置不被滚动事件改写
      expect(topAfter).toBe(topBefore)
    } finally {
      tooltip.destroy()
      document.body.removeChild(container)
    }
  })
})
