/**
 * constants.test.ts —— 图表核心常量单测（v1.7.1）
 *
 * 验证：平移步长 / 初始可视条数（用户需求：
 *  左移右移每次移动 30 条；K 线状态初始可视 120 条）。
 */
import { describe, expect, it } from 'vitest'
import { VIEW_SHIFT_STEP, VISIBLE_BAR_COUNT, PRICE_SCALE_MIN_WIDTH, LIBRARY_TIME_AXIS_HEIGHT } from '../src/chart/core/constants'

describe('图表核心常量 constants', () => {
  it('左移 / 右移每次平移 30 条（用户需求 v1.7.1）', () => {
    expect(VIEW_SHIFT_STEP).toBe(30)
  })

  it('K 线状态初始可视 120 条（用户需求 v1.7.1）', () => {
    expect(VISIBLE_BAR_COUNT).toBe(120)
  })

  it('布局常量保持稳定（时间轴高度 / 刻度区最小宽度）', () => {
    expect(LIBRARY_TIME_AXIS_HEIGHT).toBe(28)
    expect(PRICE_SCALE_MIN_WIDTH).toBe(72)
  })
})
