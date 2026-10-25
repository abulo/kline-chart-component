/**
 * crosshairSync.test.ts —— 键盘移动十字星全链路同步（v1.7.1）
 *
 * 修复两个同源问题（`chart.setCrosshairPosition` 触发的 crosshairMove 事件经 rAF
 * 节流在**下一帧**才处理）：
 *  1. "两条竖线"：同帧内 CrosshairLineCapPrimitive 竖线仍以旧 overlayTime 绘制，
 *     与库竖线（已到键盘目标）错位 —— 需同步 overlayTime；
 *  2. "tooltip 数据更新延迟"：数据浮层仍显示旧 bar —— 需同步 tooltip.show。
 *
 * 覆盖 CrosshairManager.syncKeyboardMove：
 *  - overlayTime 立即同步（cap 竖线同帧对齐）；
 *  - tooltip 立即收到目标 bar / 时间文本（无 rAF 延迟）；
 *  - 左刻度指示值：仅 pane1 注入（键盘横线在主 series 的 close/price 价），其余 pane 清除；
 *  - 从无十字星状态键盘激活：默认左进入方向。
 *
 * 注：v1.7.1 曾为"两条竖线"修复在 CrosshairManager 增加 window mousemove /
 * 拖拽状态跟踪与键盘 x 注入，随 cap 竖线（CrosshairLineCapPrimitive）删除，
 * 相关用例一并移除（见 README "竖线清理"）。
 */
import { describe, expect, it, vi } from 'vitest'
import { CrosshairManager } from '../src/chart/core/crosshairManager'
import type { ChartDataPoint } from '../src/types/chart'

/** 构造最小 K 线点 */
const makeBar = (time: number, close: number): ChartDataPoint =>
  ({
    time,
    tradeDate: '2026-01-01',
    preClose: 10,
    pointType: 'kline',
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
    amount: 10000,
  }) as ChartDataPoint

/** 最小 chart mock（subscribeCrosshairMove 构造期调用；返回退订函数） */
const makeChartMock = () => ({
  subscribeCrosshairMove: () => () => undefined,
  setCrosshairPosition: () => undefined,
  clearCrosshairPosition: () => undefined,
  unsubscribeCrosshairMove: () => undefined,
})

/** mock 十字星指示值 primitive（记录注入的 y，模拟 pane1 / pane3 / pane5） */
const makePrimitiveMock = (paneIndex: number) => {
  const injected = { y: undefined as number | null | undefined }
  const primitive = {
    config: { getPaneIndex: () => paneIndex },
    setCrosshairY: vi.fn((y: number | null) => {
      injected.y = y
    }),
  }
  return { primitive, injected }
}

interface ManagerWithProbe {
  manager: CrosshairManager
  tooltip: { show: ReturnType<typeof vi.fn> }
}

const makeManager = (): ManagerWithProbe => {
  const tooltip = { show: vi.fn(), hide: vi.fn(), isHovered: false }
  const manager = new CrosshairManager({
    chart: makeChartMock() as never,
    tooltip: tooltip as never,
    getBarByTime: (_time: number): ChartDataPoint | undefined => undefined,
    getPaneTop: (_paneIndex: number): number => 0,
    getTimeText: (time: number): string => String(time),
    getWidth: (): number => 800,
    getTooltipBounds: () => ({
      left: 20,
      top: 20,
      right: 780,
      bottom: 480,
    }),
  } as never)
  return { manager, tooltip: tooltip as never }
}

describe('CrosshairManager.syncKeyboardMove（键盘移动十字星全链路同步）', () => {
  it('overlayTime 立即同步：cap 竖线与库竖线同帧对齐（消除两条竖线）', () => {
    const { manager } = makeManager()
    const bar = makeBar(100, 10.5)
    manager.syncKeyboardMove(bar, 100, 50)
    expect(manager.getOverlayTime()).toBe(100)

    // 键盘左移 → 目标 time=99：同步立即生效
    manager.syncKeyboardMove(makeBar(99, 10.4), 99, 51)
    expect(manager.getOverlayTime()).toBe(99)
  })

  it('tooltip 立即收到目标 bar 与时间文本（无 rAF 延迟）', () => {
    const { manager, tooltip } = makeManager()
    const bar = makeBar(20260710, 12.3)
    manager.syncKeyboardMove(bar, 20260710, 50)
    expect(tooltip.show).toHaveBeenCalledTimes(1)
    const params = tooltip.show.mock.calls[0][0]
    expect(params.bar).toBe(bar)
    expect(params.timeText).toBe('20260710')
    expect(params.entrySide).toBe('left') // 从无十字星状态键盘激活：默认左进入
  })

  it('左刻度指示值：仅 pane1 注入，其余 pane 清除', () => {
    const { manager } = makeManager()
    const p1 = makePrimitiveMock(1)
    const p3 = makePrimitiveMock(3)
    const p5 = makePrimitiveMock(5)
    manager.registerPrimitive(p1.primitive as never)
    manager.registerPrimitive(p3.primitive as never)
    manager.registerPrimitive(p5.primitive as never)

    manager.syncKeyboardMove(makeBar(100, 10.5), 100, 64)
    expect(p1.injected.y).toBe(64)
    expect(p3.injected.y).toBeNull()
    expect(p5.injected.y).toBeNull()
  })

  it('随后 rAF 事件写入相同值无副作用（值保持不变）', () => {
    const { manager } = makeManager()
    manager.syncKeyboardMove(makeBar(77, 10), 77, 30)
    // 模拟下一帧 applyCrosshairMove 再次写入相同数据
    manager.syncKeyboardMove(makeBar(77, 10), 77, 30)
    expect(manager.getOverlayTime()).toBe(77)
  })

})
