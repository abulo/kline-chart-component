// timeshareArea.test.ts —— 分时价格区渐变背景（v1.7.33）。
// 覆盖：多边形构造（点数 / 闭合 / 视口裁剪 / y 钳制 / 非法值）、主题配色口径。
import { describe, expect, it } from 'vitest'
import { buildTimeshareAreaPolygon } from '../src/chart/overlay/timeshareAreaPrimitive'
import { themeColors } from '../src/chart/core/theme'

const WIDTH = 500
const HEIGHT = 300

describe('分时渐变背景：多边形构造', () => {
  it('正常折线 → 折线点 + 右下角 + 左下角（闭合到底边）', () => {
    const polygon = buildTimeshareAreaPolygon(
      [
        { x: 0, y: 120 },
        { x: 100, y: 80 },
        { x: 200, y: 150 },
      ],
      WIDTH,
      HEIGHT,
    )
    expect(polygon).not.toBeNull()
    // 3 个折线点 + 2 个底边角点
    expect(polygon!.length).toBe(5)
    expect(polygon![3]).toEqual({ x: 200, y: HEIGHT })
    expect(polygon![4]).toEqual({ x: 0, y: HEIGHT })
  })

  it('不足 2 个有效点 → null（无法成面）', () => {
    expect(buildTimeshareAreaPolygon([], WIDTH, HEIGHT)).toBeNull()
    expect(buildTimeshareAreaPolygon([{ x: 10, y: 100 }], WIDTH, HEIGHT)).toBeNull()
  })

  it('视口外的 x 被剔除（左 -1 / 右 width + 1）', () => {
    const polygon = buildTimeshareAreaPolygon(
      [
        { x: -1, y: 100 },
        { x: 10, y: 90 },
        { x: 300, y: 140 },
        { x: WIDTH + 1, y: 160 },
      ],
      WIDTH,
      HEIGHT,
    )
    expect(polygon!.length).toBe(4) // 2 个有效点 + 2 个底边角点
    expect(polygon![0]).toEqual({ x: 10, y: 90 })
    expect(polygon![1]).toEqual({ x: 300, y: 140 })
  })

  it('y 钳制到 [0, height]（高出 pane 顶 / 低过底边）', () => {
    const polygon = buildTimeshareAreaPolygon(
      [
        { x: 20, y: -30 },
        { x: 200, y: HEIGHT + 40 },
      ],
      WIDTH,
      HEIGHT,
    )
    expect(polygon![0]).toEqual({ x: 20, y: 0 })
    expect(polygon![1]).toEqual({ x: 200, y: HEIGHT })
  })

  it('非法坐标（NaN / Infinity）被跳过', () => {
    const polygon = buildTimeshareAreaPolygon(
      [
        { x: Number.NaN, y: 100 },
        { x: 50, y: Number.POSITIVE_INFINITY },
        { x: 80, y: 100 },
        { x: 160, y: 120 },
      ],
      WIDTH,
      HEIGHT,
    )
    expect(polygon!.length).toBe(4)
    expect(polygon![0]).toEqual({ x: 80, y: 100 })
  })

  it('全部点在视口外 → null', () => {
    expect(
      buildTimeshareAreaPolygon(
        [
          { x: -5, y: 100 },
          { x: WIDTH + 10, y: 110 },
        ],
        WIDTH,
        HEIGHT,
      ),
    ).toBeNull()
  })
})

describe('分时渐变背景：主题配色', () => {
  it('深浅系各自存在顶部 / 底部颜色，且互不相同', () => {
    const dark = themeColors('dark')
    const light = themeColors('light')
    expect(dark.timeshareAreaTop).toBeTypeOf('string')
    expect(dark.timeshareAreaBottom).toBeTypeOf('string')
    expect(light.timeshareAreaTop).toBeTypeOf('string')
    expect(light.timeshareAreaBottom).toBeTypeOf('string')
    expect(dark.timeshareAreaTop).not.toBe(light.timeshareAreaTop)
    expect(dark.timeshareAreaBottom).not.toBe(light.timeshareAreaBottom)
  })

  it('底部比顶部浓（不透明度更高，实现"由深到浅"）', () => {
    const opacity = (color: string): number => {
      const match = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(color)
      expect(match).not.toBeNull()
      return Number(match![1])
    }
    const dark = themeColors('dark')
    const light = themeColors('light')
    expect(opacity(dark.timeshareAreaBottom)).toBeGreaterThan(opacity(dark.timeshareAreaTop))
    expect(opacity(light.timeshareAreaBottom)).toBeGreaterThan(opacity(light.timeshareAreaTop))
  })

  it('低不透明度（≤ 0.2）：只当底色，不压线体 / 栅格', () => {
    const opacity = (color: string): number => Number(/,\s*([\d.]+)\)$/.exec(color)![1])
    for (const theme of [themeColors('dark'), themeColors('light')]) {
      expect(opacity(theme.timeshareAreaTop)).toBeLessThanOrEqual(0.2)
      expect(opacity(theme.timeshareAreaBottom)).toBeLessThanOrEqual(0.2)
    }
  })
})
